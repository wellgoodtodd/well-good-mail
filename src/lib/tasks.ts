// Tasks: lists and tasks from Google Tasks and Microsoft To Do, kept in step with the phone. Changes show at once
// and go back with a note if the account refuses. Tasks follow Calendar Groups: a group shows the task lists of the
// accounts that have a calendar in it, and each group has a default list for new tasks.
import { create } from 'zustand';
import { providers, toast, useMail } from './mail/store';
import { useSettings, settings, isQuietNow } from './settings';
import { notify } from './platform';
import type { Task, TaskList, TaskMail, TaskPatch } from './types';

export type TaskTrouble = { kind: 'permission' | 'apiOff' | 'other'; text: string };

interface TasksState {
  lists: TaskList[];
  tasks: Task[];
  /** Why an account's tasks didn't load, by account id. */
  trouble: Record<string, TaskTrouble>;
  loaded: boolean;
  refreshing: boolean;
  /** Changes on their way to the account: refreshes started before them are not used. */
  changing: number;
}

export const useTasks = create<TasksState>(() => ({ lists: [], tasks: [], trouble: {}, loaded: false, refreshing: false, changing: 0 }));
const get = useTasks.getState;
const set = useTasks.setState;

const DAY = 86400000;
const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfToday = () => midnight(Date.now());

// ---- Saved on this computer: the last lists and tasks (so they show at once on start) and each task's email link ----

const CACHE = 'wgm.tasks.v1';
const MAIL = 'wgm.taskMail.v1';

function readJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or unavailable */ }
}

let mailLinks: Record<string, TaskMail> = readJson(MAIL, {});
function rememberMail(taskId: string, mail: TaskMail | undefined) {
  if (!mail?.messageId) return;
  mailLinks = { ...mailLinks, [taskId]: mail };
  writeJson(MAIL, mailLinks);
}
function withMail(t: Task): Task {
  const m = mailLinks[t.id];
  return m ? { ...t, mail: m } : t;
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { const s = get(); writeJson(CACHE, { lists: s.lists, tasks: s.tasks }); }, 500);
}
useTasks.subscribe((s, was) => { if (s.tasks !== was.tasks || s.lists !== was.lists) saveSoon(); });

/** Shows the tasks saved last time straight away, then fetches fresh ones. */
export function startTasks() {
  if (get().loaded) return;
  const saved = readJson<{ lists: TaskList[]; tasks: Task[] } | null>(CACHE, null);
  const ids = new Set(useMail.getState().accounts.map((a) => a.id));
  if (saved) set({ lists: saved.lists.filter((l) => ids.has(l.accountId)), tasks: saved.tasks.filter((t) => ids.has(t.accountId)).map(withMail) });
  set({ loaded: true });
  void refreshTasks();
  setInterval(() => void refreshTasks(), 5 * 60000);
  window.addEventListener('focus', () => { if (Date.now() - lastRefresh > 60000) void refreshTasks(); });
}

// ---- Refreshing: each account's tasks show as soon as that account answers ----

let lastRefresh = 0;
let run = 0;

function troubleOf(e: unknown): TaskTrouble {
  const err = e as Error & { needsPermission?: boolean; apiOff?: boolean; needsSignIn?: boolean };
  if (err?.apiOff) return { kind: 'apiOff', text: 'The Google Tasks API needs turning on in your Google Cloud project (see the setup guide).' };
  if (err?.needsPermission || err?.needsSignIn) return { kind: 'permission', text: 'Sign in once more to show this account\'s tasks.' };
  return { kind: 'other', text: err instanceof Error ? err.message.replace(/\s+/g, ' ').slice(0, 140) : 'The tasks could not be reached.' };
}

export function canHaveTasks(accountId: string): boolean {
  return Boolean(providers.get(accountId)?.listTaskLists);
}

export async function refreshTasks(): Promise<void> {
  const mine = ++run;
  lastRefresh = Date.now();
  // Finished tasks from the last week: today's stay crossed out, older ones go under "Completed before today".
  const doneSince = startOfToday() - 7 * DAY;
  const accounts = useMail.getState().accounts.filter((a) => canHaveTasks(a.id));
  set({ refreshing: true });
  await Promise.all(accounts.map(async (a) => {
    const p = providers.get(a.id)!;
    try {
      const lists = await p.listTaskLists!();
      const tasks = (await Promise.all(lists.map((l) => p.listTasks!(l, doneSince)))).flat().map(withMail);
      if (mine !== run || get().changing) return;
      const s = get();
      const trouble = { ...s.trouble };
      delete trouble[a.id];
      set({
        lists: [...s.lists.filter((l) => l.accountId !== a.id), ...lists],
        tasks: [...s.tasks.filter((t) => t.accountId !== a.id || t.id.includes('|new-')), ...tasks],
        trouble,
      });
    } catch (e) {
      if (mine !== run) return;
      set({ trouble: { ...get().trouble, [a.id]: troubleOf(e) } });
    }
  }));
  if (mine === run) set({ refreshing: false });
}

// ---- Groups and default lists ----

/** The accounts in the Calendar Group being looked at (an account with any calendar in it), or null for All. */
export function groupAccounts(groupId: string = settings().calendarGroup): Set<string> | null {
  const g = settings().calendarGroups.find((x) => x.id === groupId);
  if (!g) return null;
  return new Set(g.calendars.map((c) => c.split('|')[0]));
}

/** The group an account belongs to (the first that has one of its calendars), or '' for none. */
export function groupOfAccount(accountId: string): string {
  return settings().calendarGroups.find((g) => g.calendars.some((c) => c.split('|')[0] === accountId))?.id || '';
}

export function listsInGroup(lists: TaskList[], groupId: string): TaskList[] {
  const only = groupAccounts(groupId);
  return only ? lists.filter((l) => only.has(l.accountId)) : lists;
}

export function tasksInGroup(tasks: Task[], groupId: string): Task[] {
  const only = groupAccounts(groupId);
  return only ? tasks.filter((t) => only.has(t.accountId)) : tasks;
}

/** The list new tasks go into for a group: the one picked in Settings, else the group's first account's first list. */
export function defaultList(groupId: string = settings().calendarGroup): TaskList | undefined {
  const lists = get().lists;
  const picked = lists.find((l) => l.id === settings().taskDefaults[groupId]);
  if (picked) return picked;
  const inGroup = listsInGroup(lists, groupId);
  const order = useMail.getState().accounts.map((a) => a.id);
  return [...inGroup].sort((x, y) => order.indexOf(x.accountId) - order.indexOf(y.accountId))[0] || lists[0];
}

/** Where a task from an email goes: the default list of the group the email's account is in. */
export function listForAccount(accountId: string): TaskList | undefined {
  const group = groupOfAccount(accountId);
  const l = defaultList(group);
  if (l) return l;
  return get().lists.find((x) => x.accountId === accountId);
}

/** Where a task from an AI app goes (undefined: ask). */
export function listForAi(): TaskList | undefined {
  const t = settings().aiTaskTarget;
  if (t === 'ask') return undefined;
  if (t.startsWith('group:')) return defaultList(t.slice(6));
  return get().lists.find((l) => l.id === t) || defaultList('');
}

// ---- Changes: shown at once, put back if the account refuses ----

function busy<T>(work: () => Promise<T>): Promise<T> {
  set({ changing: get().changing + 1 });
  return work().finally(() => set({ changing: Math.max(0, get().changing - 1) }));
}

function plain(e: unknown): string {
  const t = troubleOf(e);
  return t.kind === 'other' ? t.text : t.text;
}

export async function addTask(listId: string, p: TaskPatch, opts: { quiet?: boolean } = {}): Promise<Task | undefined> {
  const list = get().lists.find((l) => l.id === listId);
  const prov = list && providers.get(list.accountId);
  if (!list || !prov?.createTask) { toast({ text: 'That list can\'t take new tasks', ttl: 4000 }); return undefined; }
  const temp: Task = { id: `${list.id}|new-${Date.now()}`, accountId: list.accountId, listId: list.id, providerId: '', title: p.title || 'Task', notes: p.notes, due: p.due ?? undefined, hasTime: Boolean(p.due && p.hasTime), done: false, mail: p.mail };
  set({ tasks: [...get().tasks, temp] });
  try {
    const made = await busy(() => prov.createTask!(list, p));
    const t = { ...made, mail: p.mail || made.mail };
    rememberMail(t.id, p.mail);
    set({ tasks: get().tasks.map((x) => (x.id === temp.id ? t : x)) });
    if (!opts.quiet) toast({ text: `Task added to ${list.name}${t.due ? `, due ${dueText(t)}` : ''}`, ttl: 5000, undo: () => void deleteTask(t, { quiet: true }) });
    return t;
  } catch (e) {
    set({ tasks: get().tasks.filter((x) => x.id !== temp.id) });
    toast({ text: `The task couldn't be saved: ${plain(e)}`, ttl: 7000 });
    return undefined;
  }
}

export async function changeTask(task: Task, p: TaskPatch, opts: { quiet?: boolean } = {}): Promise<void> {
  const prov = providers.get(task.accountId);
  if (!prov?.updateTask) return;
  const was = get().tasks.find((x) => x.id === task.id) || task;
  const shown: Task = {
    ...was,
    ...(p.title !== undefined ? { title: p.title } : {}),
    ...(p.notes !== undefined ? { notes: p.notes } : {}),
    ...(p.due !== undefined ? { due: p.due ?? undefined, hasTime: Boolean(p.due !== null && p.hasTime) } : p.hasTime !== undefined ? { hasTime: p.hasTime } : {}),
    ...(p.done !== undefined ? { done: p.done, completedAt: p.done ? Date.now() : undefined } : {}),
    ...(p.mail ? { mail: p.mail } : {}),
  };
  set({ tasks: get().tasks.map((x) => (x.id === task.id ? shown : x)) });
  try {
    const saved = await busy(() => prov.updateTask!(was, p));
    // Keep what the app knows that the account doesn't (the time it was ticked, the email link).
    set({ tasks: get().tasks.map((x) => (x.id === task.id ? { ...saved, mail: shown.mail, completedAt: saved.completedAt ?? shown.completedAt } : x)) });
    if (p.mail) rememberMail(task.id, p.mail);
  } catch (e) {
    set({ tasks: get().tasks.map((x) => (x.id === task.id ? was : x)) });
    if (!opts.quiet) toast({ text: `The change couldn't be saved: ${plain(e)}`, ttl: 7000 });
  }
}

export function setDone(task: Task, done: boolean) {
  void changeTask(task, { done });
  if (done) toast({ text: `Done: ${task.title}`, ttl: 4000, undo: () => void changeTask({ ...task, done: true }, { done: false }) });
}

export async function deleteTask(task: Task, opts: { quiet?: boolean } = {}): Promise<void> {
  const prov = providers.get(task.accountId);
  if (!prov?.deleteTask) return;
  set({ tasks: get().tasks.filter((x) => x.id !== task.id) });
  try {
    await busy(() => prov.deleteTask!(task));
    if (!opts.quiet) {
      toast({ text: `Deleted: ${task.title}`, ttl: 5000, undo: () => void addTask(task.listId, { title: task.title, notes: task.notes, due: task.due ?? null, hasTime: task.hasTime, done: task.done, mail: task.mail }, { quiet: true }) });
    }
  } catch (e) {
    set({ tasks: [...get().tasks, task] });
    toast({ text: `The task couldn't be deleted: ${plain(e)}`, ttl: 7000 });
  }
}

/** Moves a task to another list (in another account too): made in the new list, then taken out of the old one. */
export async function moveTask(task: Task, listId: string): Promise<void> {
  if (task.listId === listId) return;
  const made = await addTask(listId, { title: task.title, notes: task.notes, due: task.due ?? null, hasTime: task.hasTime, done: task.done, mail: task.mail }, { quiet: true });
  if (made) await deleteTask(task, { quiet: true });
}

export async function newList(accountId: string, name: string): Promise<TaskList | undefined> {
  const prov = providers.get(accountId);
  if (!prov?.createTaskList) return undefined;
  try {
    const l = await prov.createTaskList(name);
    set({ lists: [...get().lists, l] });
    return l;
  } catch (e) {
    toast({ text: `The list couldn't be made: ${plain(e)}`, ttl: 7000 });
    return undefined;
  }
}

// ---- Words ----

export function dueText(t: { due?: number; hasTime?: boolean }, now = Date.now()): string {
  if (t.due === undefined) return '';
  const d = new Date(t.due);
  const today = midnight(now);
  const day = midnight(t.due);
  const time = t.hasTime ? `, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
  if (day === today) return `today${time}`;
  if (day === today + DAY) return `tomorrow${time}`;
  if (day === today - DAY) return `yesterday${time}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}${time}`;
}

/** Not done and due before today (or, with a time, before now). */
export function isOverdue(t: Task, now = Date.now()): boolean {
  if (t.done || t.due === undefined) return false;
  return t.hasTime ? t.due < now - 60000 && midnight(t.due) < midnight(now) : t.due < midnight(now);
}

/** Shown in today's lists: due today or overdue (not done), or done today. */
export function isForToday(t: Task, now = Date.now()): boolean {
  if (t.done) return (t.completedAt ?? 0) >= midnight(now);
  return t.due !== undefined && midnight(t.due) <= midnight(now);
}

export function doneToday(t: Task, now = Date.now()): boolean {
  return t.done && (t.completedAt ?? 0) >= midnight(now);
}

// ---- Alerts: tasks with a time alert like reminders ----

const alerted = new Set<string>(readJson<string[]>('wgm.taskAlerted', []));
export function taskTick(now = Date.now()) {
  if (!get().loaded) return;
  const due = get().tasks.filter((t) => !t.done && t.hasTime && t.due !== undefined && t.due <= now && t.due > now - 10 * 60000 && !alerted.has(`${t.id}@${t.due}`));
  if (!due.length) return;
  for (const t of due) alerted.add(`${t.id}@${t.due}`);
  writeJson('wgm.taskAlerted', [...alerted].slice(-200));
  const s = useSettings.getState();
  if (s.reminderMode === 'never' || isQuietNow(s)) return;
  void notify(due.length === 1 ? 'Task due' : `${due.length} tasks due`, due.map((t) => t.title).join(', '));
}
