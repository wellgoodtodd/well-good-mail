// Google Tasks, shared by the desktop app and the web app. Each call goes through the `call` it is given, which
// adds the account's access token (and, on the desktop, the pacing and retries). Google Tasks keeps a due date but
// not a time, so a time goes on the first line of the notes ("Due 14:00"), through taskNotes.ts.
import { readNotes, writeNotes } from '../taskNotes';
import type { Task, TaskList, TaskPatch } from '../types';

/** Fetches a Google API URL as the account and returns the JSON. Errors carry `status`. */
export type GoogleCall = <T>(url: string, init?: RequestInit) => Promise<T>;

export interface GoogleAccountRef { id: string; email: string }

export interface GTask { id: string; title?: string; notes?: string; status?: string; due?: string; completed?: string; updated?: string; deleted?: boolean }

const TASKS = 'https://tasks.googleapis.com/tasks/v1';

export async function listTaskLists(call: GoogleCall, account: GoogleAccountRef): Promise<TaskList[]> {
  const r = await call<{ items?: { id: string; title: string }[] }>(`${TASKS}/users/@me/lists?maxResults=100`);
  return (r.items || []).map((l) => ({ id: `${account.id}|${l.id}`, accountId: account.id, providerId: l.id, name: l.title }));
}

export function toTask(account: GoogleAccountRef, list: TaskList, g: GTask): Task {
  const read = readNotes(g.notes);
  let due: number | undefined;
  if (g.due) {
    const [y, m, d] = g.due.slice(0, 10).split('-').map(Number);
    due = new Date(y, m - 1, d).getTime() + (read.minutes ?? 0) * 60000;
  }
  return {
    id: `${list.id}|${g.id}`, accountId: account.id, listId: list.id, providerId: g.id,
    title: g.title || '', notes: read.notes || undefined,
    due, hasTime: due !== undefined && read.minutes !== undefined,
    done: g.status === 'completed', completedAt: g.completed ? Date.parse(g.completed) : undefined,
    updatedAt: g.updated ? Date.parse(g.updated) : undefined,
    ...(read.mailSubject ? { mail: { messageId: '', threadId: '', accountId: '', subject: read.mailSubject, ...(read.mailLink ? { link: read.mailLink } : {}) } } : {}),
  };
}

/** Open tasks, and tasks done since `doneSince`. */
export async function listTasks(call: GoogleCall, account: GoogleAccountRef, list: TaskList, doneSince: number): Promise<Task[]> {
  const out: Task[] = [];
  const base = `${TASKS}/lists/${encodeURIComponent(list.providerId)}/tasks?maxResults=100`;
  for (const q of ['&showCompleted=false', `&showCompleted=true&showHidden=true&completedMin=${encodeURIComponent(new Date(doneSince).toISOString())}`]) {
    let page: string | undefined;
    for (let i = 0; i < 10; i++) {
      const r = await call<{ items?: GTask[]; nextPageToken?: string }>(`${base}${q}${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
      for (const g of r.items || []) if (!g.deleted && (q.includes('false') ? g.status !== 'completed' : g.status === 'completed')) out.push(toTask(account, list, g));
      page = r.nextPageToken;
      if (!page) break;
    }
  }
  return out;
}

export function taskBody(account: GoogleAccountRef, p: TaskPatch, was?: Task): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (p.title !== undefined) body.title = p.title;
  if (p.done !== undefined) {
    body.status = p.done ? 'completed' : 'needsAction';
    if (!p.done) body.completed = null;
  }
  const due = p.due === undefined ? was?.due : p.due ?? undefined;
  const hasTime = p.due === undefined && p.hasTime === undefined ? was?.hasTime : Boolean(p.hasTime);
  if (p.due !== undefined) {
    if (p.due === null) body.due = null;
    else { const d = new Date(p.due); body.due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000Z`; }
  }
  if (p.notes !== undefined || p.due !== undefined || p.hasTime !== undefined || p.mail !== undefined) {
    const mail = p.mail || was?.mail;
    const d = due !== undefined ? new Date(due) : undefined;
    body.notes = writeNotes({
      notes: p.notes !== undefined ? p.notes : was?.notes,
      minutes: d && hasTime ? d.getHours() * 60 + d.getMinutes() : undefined,
      mailSubject: mail?.subject,
      mailLink: mail?.threadId && mail.accountId === account.id
        ? `https://mail.google.com/mail/u/${encodeURIComponent(account.email)}/#all/${mail.threadId}`
        : mail?.link,
    });
  }
  return body;
}

const listPath = (task: Task) => encodeURIComponent(task.listId.slice(task.accountId.length + 1));

export async function createTask(call: GoogleCall, account: GoogleAccountRef, list: TaskList, p: TaskPatch): Promise<Task> {
  const g = await call<GTask>(`${TASKS}/lists/${encodeURIComponent(list.providerId)}/tasks`, { method: 'POST', body: JSON.stringify({ title: p.title || '', ...taskBody(account, p) }) });
  return { ...toTask(account, list, g), ...(p.mail ? { mail: p.mail } : {}) };
}

export async function updateTask(call: GoogleCall, account: GoogleAccountRef, task: Task, p: TaskPatch): Promise<Task> {
  const list: TaskList = { id: task.listId, accountId: task.accountId, providerId: task.listId.slice(task.accountId.length + 1), name: '' };
  const g = await call<GTask>(`${TASKS}/lists/${listPath(task)}/tasks/${encodeURIComponent(task.providerId)}`, { method: 'PATCH', body: JSON.stringify(taskBody(account, p, task)) });
  const mail = p.mail || task.mail;
  return { ...toTask(account, list, g), ...(mail ? { mail } : {}) };
}

/** Already gone counts as done. */
export async function deleteTask(call: GoogleCall, task: Task): Promise<void> {
  try {
    await call(`${TASKS}/lists/${listPath(task)}/tasks/${encodeURIComponent(task.providerId)}`, { method: 'DELETE' });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}

export async function createTaskList(call: GoogleCall, account: GoogleAccountRef, name: string): Promise<TaskList> {
  const l = await call<{ id: string; title: string }>(`${TASKS}/users/@me/lists`, { method: 'POST', body: JSON.stringify({ title: name }) });
  return { id: `${account.id}|${l.id}`, accountId: account.id, providerId: l.id, name: l.title };
}

export async function renameTaskList(call: GoogleCall, list: TaskList, name: string): Promise<TaskList> {
  const l = await call<{ id: string; title: string }>(`${TASKS}/users/@me/lists/${encodeURIComponent(list.providerId)}`, { method: 'PATCH', body: JSON.stringify({ title: name }) });
  return { ...list, name: l.title ?? name };
}

export async function deleteTaskList(call: GoogleCall, list: TaskList): Promise<void> {
  try {
    await call(`${TASKS}/users/@me/lists/${encodeURIComponent(list.providerId)}`, { method: 'DELETE' });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}
