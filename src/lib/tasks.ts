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
import { startOfToday, dueText } from './taskDates';
export { startOfToday, dueText, isOverdue, isForToday, doneToday, todayCount, nextRoundHour, readDay } from './taskDates';

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
  // Google Tasks and To Do have no push, so look again about every minute while tasks are on screen, every five
  // minutes otherwise, and straight away when the window comes back.
  setInterval(() => {
    if (refreshDue(Date.now(), lastRefresh, tasksOnScreen(), get().refreshing)) void refreshTasks({ auto: true });
  }, 15000);
  const back = () => {
    if (document.visibilityState === 'hidden' || get().refreshing || Date.now() - lastRefresh < BACK_GAP) return;
    void refreshTasks({ auto: true });
  };
  window.addEventListener('focus', back);
  document.addEventListener('visibilitychange', back);
}

// ---- Refreshing: each account's tasks show as soon as that account answers ----

let lastRefresh = 0;
let run = 0;

/** How often to look for changes made on the phone. */
export const QUICK_REFRESH = 60000;
export const SLOW_REFRESH = 5 * 60000;
/** Coming back to the window refreshes, unless it did so in the last few seconds. */
const BACK_GAP = 10000;

/** True while something showing tasks is on screen: Calendar & Reminders (Tasks, the calendar, List) or Coming up. */
export function tasksOnScreen(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  return useMail.getState().screen === 'reminders' || Boolean(settings().comingUpOpen);
}

/** Whether the timer should refresh now. Never while a refresh is already running. */
export function refreshDue(now: number, last: number, onScreen: boolean, running: boolean): boolean {
  if (running) return false;
  return now - last >= (onScreen ? QUICK_REFRESH : SLOW_REFRESH) - 1000;
}

// An account that keeps failing rests a while (2, 4, 8, then 15 minutes) before the timer tries it again. The Refresh
// button and Sign in try everyone.
const failures: Record<string, number> = {};
const restUntil: Record<string, number> = {};
export function restFor(fails: number): number {
  return [2, 4, 8, 15][Math.min(Math.max(fails, 1), 4) - 1] * 60000;
}

function troubleOf(e: unknown): TaskTrouble {
  const err = e as Error & { needsPermission?: boolean; apiOff?: boolean; needsSignIn?: boolean };
  if (err?.apiOff) return { kind: 'apiOff', text: 'The Google Tasks API needs turning on in your Google Cloud project (see the setup guide).' };
  if (err?.needsPermission || err?.needsSignIn) return { kind: 'permission', text: 'Sign in once more to show this account\'s tasks.' };
  return { kind: 'other', text: err instanceof Error ? err.message.replace(/\s+/g, ' ').slice(0, 140) : 'The tasks could not be reached.' };
}

export function canHaveTasks(accountId: string): boolean {
  return Boolean(providers.get(accountId)?.listTaskLists);
}

export async function refreshTasks(opts: { auto?: boolean } = {}): Promise<void> {
  const mine = ++run;
  lastRefresh = Date.now();
  // Finished tasks from the last week: today's stay crossed out, older ones go under "Completed before today".
  const doneSince = startOfToday() - 7 * DAY;
  const accounts = useMail.getState().accounts.filter((a) => canHaveTasks(a.id) && !(opts.auto && (restUntil[a.id] ?? 0) > lastRefresh));
  set({ refreshing: true });
  await Promise.all(accounts.map(async (a) => {
    const p = providers.get(a.id)!;
    try {
      const lists = await p.listTaskLists!();
      const tasks = (await Promise.all(lists.map((l) => p.listTasks!(l, doneSince)))).flat().map(withMail);
      delete failures[a.id];
      delete restUntil[a.id];
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
      failures[a.id] = (failures[a.id] || 0) + 1;
      restUntil[a.id] = Date.now() + restFor(failures[a.id]);
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
  const order = accountOrder();
  return [...inGroup].sort((x, y) => order.indexOf(x.accountId) - order.indexOf(y.accountId))[0] || lists[0];
}

/** Account ids in the order set in Settings › Accounts (the mail sidebar's order). */
export function accountOrder(): string[] {
  return [...useMail.getState().accounts].sort((a, b) => a.order - b.order).map((a) => a.id);
}

/** Makes a list the default for a Calendar Group ('' is All calendars). */
export function setDefaultList(groupId: string, listId: string) {
  const s = useSettings.getState();
  s.set({ taskDefaults: { ...s.taskDefaults, [groupId]: listId } });
}

/** The name of a Calendar Group, for "Set as default for Work". */
export function groupName(groupId: string): string {
  return settings().calendarGroups.find((g) => g.id === groupId)?.name || 'All calendars';
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

/** Renames a list in Google Tasks or To Do. Shown at once, put back with a note if the account refuses. */
export async function renameList(list: TaskList, name: string): Promise<boolean> {
  const t = name.trim();
  if (!t || t === list.name) return false;
  const prov = providers.get(list.accountId);
  if (!prov?.renameTaskList) { toast({ text: 'This list can\'t be renamed from here', ttl: 4000 }); return false; }
  const put = (n: string) => set({ lists: get().lists.map((l) => (l.id === list.id ? { ...l, name: n } : l)) });
  put(t);
  try {
    const saved = await busy(() => prov.renameTaskList!(list, t));
    put(saved?.name || t);
    return true;
  } catch (e) {
    put(list.name);
    toast({ text: `${list.name} couldn't be renamed: ${plain(e)}`, ttl: 7000 });
    return false;
  }
}

/** Deletes a list and its tasks in Google Tasks or To Do. Gone at once, back with a note if the account refuses. */
export async function deleteList(list: TaskList): Promise<boolean> {
  const prov = providers.get(list.accountId);
  if (!prov?.deleteTaskList) { toast({ text: 'This list can\'t be deleted from here', ttl: 4000 }); return false; }
  const before = get();
  const at = before.lists.findIndex((l) => l.id === list.id);
  const itsTasks = before.tasks.filter((t) => t.listId === list.id);
  set({ lists: before.lists.filter((l) => l.id !== list.id), tasks: before.tasks.filter((t) => t.listId !== list.id) });
  try {
    await busy(() => prov.deleteTaskList!(list));
    toast({ text: `Deleted ${list.name}`, ttl: 4000 });
    return true;
  } catch (e) {
    const s = get();
    const lists = s.lists.filter((l) => l.id !== list.id);
    lists.splice(Math.max(0, Math.min(at, lists.length)), 0, list);
    set({ lists, tasks: [...s.tasks.filter((t) => t.listId !== list.id), ...itsTasks] });
    toast({ text: `${list.name} couldn't be deleted: ${plain(e)}`, ttl: 7000 });
    return false;
  }
}

// ---- The Tasks sidebar: the order of All Tasks, Today and Scheduled, and lists with completed tasks hidden ----
// Kept on this computer with the other Tasks things (the account rows follow Settings › Accounts).

export type SmartPlace = 'all' | 'today' | 'scheduled';
export const SMART_PLACES: SmartPlace[] = ['all', 'today', 'scheduled'];
const PREFS = 'wgm.taskPrefs.v1';
interface TaskPrefs { smartOrder: SmartPlace[]; hideDone: string[] }

/** Your order, with any place it leaves out in its usual spot. */
export function smartOrder(saved: unknown): SmartPlace[] {
  const mine = (Array.isArray(saved) ? saved : []).filter((x, i, a): x is SmartPlace => SMART_PLACES.includes(x) && a.indexOf(x) === i);
  const out = [...mine];
  SMART_PLACES.forEach((p, i) => { if (!out.includes(p)) out.splice(Math.min(i, out.length), 0, p); });
  return out;
}

const savedPrefs = readJson<Partial<TaskPrefs>>(PREFS, {});
export const useTaskPrefs = create<TaskPrefs>(() => ({ smartOrder: smartOrder(savedPrefs.smartOrder), hideDone: Array.isArray(savedPrefs.hideDone) ? savedPrefs.hideDone : [] }));
useTaskPrefs.subscribe((p) => writeJson(PREFS, p));

/** Drops `from` just before `target` (or after it). */
export function moveSmart(from: SmartPlace, target: SmartPlace, after = false) {
  if (from === target) return;
  const cur = useTaskPrefs.getState().smartOrder.filter((x) => x !== from);
  cur.splice(cur.indexOf(target) + (after ? 1 : 0), 0, from);
  useTaskPrefs.setState({ smartOrder: cur });
}

export function toggleHideDone(listId: string) {
  const h = useTaskPrefs.getState().hideDone;
  useTaskPrefs.setState({ hideDone: h.includes(listId) ? h.filter((x) => x !== listId) : [...h, listId] });
}

/** Moves account `from` to just before `target` (or after it), everywhere: the order in Settings › Accounts. */
export function accountOrderAfterDrop(order: string[], from: string, target: string, after = false): string[] {
  if (from === target || !order.includes(from) || !order.includes(target)) return order;
  const rest = order.filter((x) => x !== from);
  rest.splice(rest.indexOf(target) + (after ? 1 : 0), 0, from);
  return rest;
}

// ---- Counts, words and typed dates: in taskDates.ts ----

// ---- Emails and the tasks made from them (kept in the app only, never written to the email) ----

export interface EmailTaskIndex {
  byMessage: Map<string, Task[]>;
  /** By `${accountId}|${threadId}`, the message list's key. */
  byThread: Map<string, Task[]>;
}

export function emailTaskIndex(tasks: Task[]): EmailTaskIndex {
  const byMessage = new Map<string, Task[]>();
  const byThread = new Map<string, Task[]>();
  const add = (m: Map<string, Task[]>, k: string, t: Task) => { const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); };
  for (const t of tasks) {
    const m = t.mail;
    if (!m?.messageId) continue;
    add(byMessage, m.messageId, t);
    if (m.accountId && m.threadId) add(byThread, `${m.accountId}|${m.threadId}`, t);
  }
  return { byMessage, byThread };
}

let indexFor: Task[] | null = null;
let index: EmailTaskIndex = { byMessage: new Map(), byThread: new Map() };
/** The index for the tasks in the store, worked out once per change. */
export function emailTasks(tasks: Task[] = get().tasks): EmailTaskIndex {
  if (tasks !== indexFor) { indexFor = tasks; index = emailTaskIndex(tasks); }
  return index;
}

/** For the mark in the message list: 'open' while any task from the conversation is still to do, 'done' when all are ticked. */
export function threadTaskMark(tasks: Task[], key: string): 'open' | 'done' | undefined {
  const ts = emailTasks(tasks).byThread.get(key);
  if (!ts?.length) return undefined;
  return ts.some((t) => !t.done) ? 'open' : 'done';
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
