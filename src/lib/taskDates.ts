// Plain task date helpers, shared by the desktop app and the web app (no store, no settings).
import { readTaskWords } from './taskWords';
import type { Task } from './types';

export const DAY = 86400000;
export const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfToday = () => midnight(Date.now());

/** Open tasks due today or before: the count beside Tasks in the sidebar and Today in the Tasks view. */
export function todayCount(tasks: Task[], now = Date.now()): number {
  const end = midnight(now) + DAY;
  return tasks.filter((t) => !t.done && t.due !== undefined && t.due < end).length;
}

/** The next round hour: 14:00 at 13:20 (and at 13:00). */
export function nextRoundHour(now = Date.now()): number {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

/** A typed day ("18 Nov", "Wednesday", "next Friday", "tomorrow 3pm"): midnight of that day, and the time if one was given. */
export function readDay(text: string, now = Date.now()): { day: number; minutes?: number } | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) return { day: new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime() };
  if (/^today$/i.test(t)) return { day: midnight(now) };
  const w = readTaskWords(t, now);
  if (w.due === undefined) return undefined;
  const d = new Date(w.due);
  return { day: midnight(w.due), ...(w.hasTime ? { minutes: d.getHours() * 60 + d.getMinutes() } : {}) };
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
