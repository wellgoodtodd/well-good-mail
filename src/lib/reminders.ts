// Calendar reminders that collect quietly in a list until you clear them,
// with alerts only as often as you choose.
import { store } from './db';
import { notify, flashTaskbar } from './platform';
import { isQuietNow, settings } from './settings';
import { meetingService } from './meetings';
import type { CalendarEvent, FollowUp, ReminderItem } from './types';

export function eventReminderTime(e: CalendarEvent): number {
  const lead = e.reminderMinutes.length ? Math.max(...e.reminderMinutes) : 0;
  return e.start - lead * 60000;
}

export const eventKey = (e: CalendarEvent) => `ev|${e.id}|${e.start}`;

/** Everything that's come due and hasn't been dismissed, newest first. */
export function dueReminders(events: CalendarEvent[], followups: FollowUp[], dismissed: Set<string>, now = Date.now()): ReminderItem[] {
  const items: ReminderItem[] = [];
  for (const e of events) {
    const due = e.allDay ? e.start : eventReminderTime(e);
    // Only things that are due now, and not ones that ended days ago.
    if (due > now || e.end < now - 3 * 86400000) continue;
    const id = eventKey(e);
    if (dismissed.has(id)) continue;
    items.push({ id, kind: 'event', title: e.title, dueAt: due, eventStart: e.start, accountId: e.accountId, calendarName: e.calendarName });
  }
  for (const f of followups) {
    const id = `fu|${f.id}`;
    if (f.dueAt > now || dismissed.has(id)) continue;
    items.push({ id, kind: 'followup', title: `No reply yet: ${f.subject}`, dueAt: f.dueAt, accountId: f.accountId, threadId: f.threadId });
  }
  return items.sort((a, b) => b.dueAt - a.dueAt);
}

/** Everything that hasn't finished yet and starts within the next few days, including a meeting whose reminder time has passed. */
export function upcoming(events: CalendarEvent[], now = Date.now(), days = 7): CalendarEvent[] {
  return events
    .filter((e) => e.end > now && e.start < now + days * 86400000)
    .sort((a, b) => a.start - b.start);
}

const notified = new Set<string>();
let loaded = false;

/** Call every minute. Decides whether anything should pop up. */
export async function checkReminderAlerts(events: CalendarEvent[], followups: FollowUp[], dismissed: Set<string>) {
  const s = settings();
  if (!loaded) {
    (await store.kvGet<string[]>('notifiedReminders'))?.forEach((id) => notified.add(id));
    loaded = true;
  }
  const now = Date.now();
  const due = dueReminders(events, followups, dismissed, now).filter((r) => now - r.dueAt < 15 * 60000);
  const important = new Set(s.importantEvents);

  if (!isQuietNow(s)) {
    for (const r of due) {
      if (notified.has(r.id)) continue;
      const isImportant = important.has(r.title.toLowerCase()) || r.kind === 'followup';
      const shouldPop = s.reminderMode === 'all' || (s.reminderMode === 'important' && isImportant);
      notified.add(r.id);
      if (shouldPop && s.flashTaskbar) flashTaskbar();
      if (shouldPop) {
        const when = r.eventStart ? new Date(r.eventStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
        await notify(r.title, r.kind === 'event' ? `${when} · ${r.calendarName || ''}` : 'Reminder');
      }
    }
    await maybeDailySummary(events, now);
    await meetingAlerts(events, now);
  }
  await store.kvSet('notifiedReminders', [...notified].slice(-500));
}

/** A notification 15 minutes and again 5 minutes before any meeting that has a video link. */
export function meetingAlertsDue(events: CalendarEvent[], now: number, times: number[] = [15, 5]): { key: string; event: CalendarEvent; minutes: number }[] {
  const out: { key: string; event: CalendarEvent; minutes: number }[] = [];
  const mins = [...new Set(times.filter((m) => Number.isInteger(m) && m > 0))].sort((a, b) => b - a);
  for (const e of events) {
    if (!e.meetingUrl || e.allDay) continue;
    const until = e.start - now;
    if (until <= 0) continue;
    // Each time covers the stretch back to the next smaller one, so an app opened late doesn't fire stale alerts.
    mins.forEach((m, i) => {
      if (until <= m * 60000 && (i === mins.length - 1 || until > mins[i + 1] * 60000)) out.push({ key: `mt|${e.id}|${e.start}|${m}`, event: e, minutes: m });
    });
  }
  return out;
}

async function meetingAlerts(events: CalendarEvent[], now: number) {
  const s = settings();
  const times = [s.meetingAlert1On ? s.meetingAlert1Mins : 0, s.meetingAlert2On ? s.meetingAlert2Mins : 0];
  for (const a of meetingAlertsDue(events, now, times)) {
    if (notified.has(a.key)) continue;
    notified.add(a.key);
    const when = new Date(a.event.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const left = Math.max(1, Math.min(a.minutes, Math.ceil((a.event.start - now) / 60000)));
    await notify(`${a.event.title} in ${left} ${left === 1 ? 'minute' : 'minutes'}`, `${when} · ${meetingService(a.event.meetingUrl!)} link in Well Good Mail`);
  }
}

async function maybeDailySummary(events: CalendarEvent[], now: number) {
  const s = settings();
  if (s.reminderMode !== 'daily' && s.reminderMode !== 'important') return;
  const [h, m] = s.summaryTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now < target.getTime()) return;
  const today = new Date(now).toDateString();
  if ((await store.kvGet<string>('lastSummary')) === today) return;
  await store.kvSet('lastSummary', today);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const todays = events
    .filter((e) => e.start >= start.getTime() && e.start < start.getTime() + 86400000)
    .sort((a, b) => a.start - b.start);
  if (!todays.length) return;
  const lines = todays.slice(0, 6).map((e) => `${e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ${e.title}`);
  if (todays.length > 6) lines.push(`and ${todays.length - 6} more`);
  await notify(`Today: ${todays.length} ${todays.length === 1 ? 'thing' : 'things'} on`, lines.join('\n'));
}
