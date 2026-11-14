// Google Calendar, shared by the desktop app and the web app. Event ids are `account|calendar|event`. Each call goes
// through the `call` it is given (see tasksApi.ts). Permission errors are left for the caller to word.
import type { CalendarEvent, ChangeOptions, EventCopy, EventGuest, EventPatch } from '../types';
import type { Rsvp } from '../invites';
import { findMeetingUrl } from '../meetings';
import { fromRrule, localTimeZone, toRrule } from '../recurrence';
import { htmlToText, ymd } from '../ooo';
import type { GoogleCall } from './tasksApi';

export const CAL = 'https://www.googleapis.com/calendar/v3';

export interface GCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  selected?: boolean;
  primary?: boolean;
  hidden?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  defaultReminders?: { method: string; minutes: number }[];
}

export type GAttendee = { email?: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean; resource?: boolean; comment?: string };

export interface GEvent {
  id: string;
  summary?: string;
  status?: string;
  recurringEventId?: string;
  recurrence?: string[];
  organizer?: { self?: boolean; email?: string; displayName?: string };
  location?: string;
  description?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  htmlLink?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string };
  reminders?: { useDefault: boolean; overrides?: { minutes: number }[] };
  attendees?: GAttendee[];
}

export async function listCalendars(call: GoogleCall): Promise<GCalendar[]> {
  const out: GCalendar[] = [];
  let page: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await call<{ items?: GCalendar[]; nextPageToken?: string }>(`${CAL}/users/me/calendarList${page ? `?pageToken=${encodeURIComponent(page)}` : ''}`);
    out.push(...(r.items || []));
    page = r.nextPageToken;
    if (!page) break;
  }
  return out;
}

export const canWrite = (c: GCalendar) => c.accessRole === 'owner' || c.accessRole === 'writer';

/** The guest list and your own answer, from Google's attendee list. */
export function guestsOf(attendees?: GAttendee[]): Pick<CalendarEvent, 'guests' | 'myResponse'> {
  const people = (attendees || []).filter((a) => a.email && !a.resource);
  if (!people.length) return {};
  const answerOf = (s?: string): EventGuest['answer'] => (s === 'accepted' ? 'yes' : s === 'declined' ? 'no' : s === 'tentative' ? 'maybe' : 'waiting');
  const guests: EventGuest[] = people.slice(0, 60).map((a) => ({ email: a.email!.toLowerCase(), name: a.displayName, answer: answerOf(a.responseStatus), organiser: a.organizer || undefined, self: a.self || undefined }));
  const me = people.find((a) => a.self);
  return { guests, myResponse: me ? answerOf(me.responseStatus) : undefined };
}

/** The guest list with your own answer (and note) changed. A blank note clears an old one. */
export function answered<T extends { self?: boolean; comment?: string }>(list: T[], status: Rsvp, note?: string): T[] {
  return list.map((a) => (a.self ? { ...a, responseStatus: status, ...(note !== undefined ? { comment: note.trim() } : {}) } : a));
}

/** One of Google's events as the app's event. Undefined for a cancelled one. */
export function eventFromGoogle(accountId: string, cal: GCalendar, e: GEvent): CalendarEvent | undefined {
  if (e.status === 'cancelled') return undefined;
  const allDay = !e.start.dateTime;
  const start = new Date(e.start.dateTime || `${e.start.date}T00:00:00`).getTime();
  const end = new Date(e.end.dateTime || `${e.end.date}T00:00:00`).getTime();
  const reminderMinutes = e.reminders?.useDefault
    ? (cal.defaultReminders || []).map((r) => r.minutes)
    : (e.reminders?.overrides || []).map((r) => r.minutes);
  return {
    id: `${accountId}|${cal.id}|${e.id}`,
    accountId,
    calendarName: cal.summary,
    title: e.summary || '(No title)',
    start,
    end,
    allDay,
    location: e.location,
    description: e.description ? e.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : undefined,
    meetingUrl: e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || findMeetingUrl(e.location, e.description),
    reminderMinutes,
    htmlLink: e.htmlLink,
    ...guestsOf(e.attendees),
    canEdit: canWrite(cal) && (e.organizer?.self ?? true),
    recurring: Boolean(e.recurringEventId),
    seriesId: e.recurringEventId ? `${accountId}|${cal.id}|${e.recurringEventId}` : undefined,
    organiser: e.organizer?.email ? { email: e.organizer.email.toLowerCase(), name: e.organizer.displayName, self: e.organizer.self || undefined } : undefined,
  };
}

/** Every event on one calendar between two times, every page (a busy calendar passes 250 within weeks). */
export async function listCalendarEvents(call: GoogleCall, accountId: string, cal: GCalendar, fromMs: number, toMs: number): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const params = new URLSearchParams({
    timeMin: new Date(fromMs).toISOString(),
    timeMax: new Date(toMs).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const { items, nextPageToken } = await call<{ nextPageToken?: string; items?: GEvent[] }>(`${CAL}/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
    for (const e of items || []) {
      const ev = eventFromGoogle(accountId, cal, e);
      if (ev) events.push(ev);
    }
    pageToken = nextPageToken;
  } while (pageToken);
  return events;
}

/** The calendar and event ids inside an app event id (account|calendar|event). */
export function eventParts(accountId: string, ev: { id: string }) {
  const rest = ev.id.slice(accountId.length + 1);
  const cut = rest.lastIndexOf('|');
  return { calId: rest.slice(0, cut), eventId: rest.slice(cut + 1) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const localTime = (ms: number) => { const d = new Date(ms); return `${ymd(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const meetRequest = () => ({ createRequest: { requestId: `wgm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } });

/**
 * Changes one event, or with scope 'all' its whole series (the series' own times move by the same amount).
 * Guests are emailed unless notify is false. "This and following" is done by the app (end the series, make a new one).
 * `calIds` maps calendar names in the account to their ids, for moving to another calendar.
 */
export async function editEvent(call: GoogleCall, accountId: string, calIds: Record<string, string>, ev: CalendarEvent, patch: EventPatch, opts: ChangeOptions = {}): Promise<void> {
  const { calId } = eventParts(accountId, ev);
  let { eventId } = eventParts(accountId, ev);
  const send = opts.notify === false ? 'none' : 'all';
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  // A change to the repeat itself, or to "all events", is made on the series.
  let shift = 0;
  let master: GEvent | undefined;
  const wholeSeries = ev.recurring && (opts.scope === 'all' || patch.repeat !== undefined);
  if (wholeSeries) {
    const one = await call<GEvent>(`${base}/${encodeURIComponent(eventId)}`);
    if (one.recurringEventId) {
      master = await call<GEvent>(`${base}/${encodeURIComponent(one.recurringEventId)}`);
      eventId = master.id;
      if (patch.start !== undefined) shift = patch.start - ev.start;
    }
  }
  const allDay = patch.allDay ?? ev.allDay;
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.description !== undefined) body.description = patch.description;
  const tz = localTimeZone();
  const when = (ms: number) => (allDay ? { date: ymd(ms), dateTime: null } : { dateTime: localTime(ms), timeZone: tz, date: null });
  if (patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined || patch.repeat !== undefined) {
    let start = patch.start ?? ev.start;
    let end = patch.end ?? ev.end;
    if (master) {
      // The series keeps its own first date; only the time of day and length change.
      const mStart = new Date(master.start.dateTime || `${master.start.date}T00:00:00`).getTime();
      start = mStart + shift;
      end = start + ((patch.end ?? ev.end) - (patch.start ?? ev.start));
    }
    // Google's all-day end is the day after the last day.
    body.start = when(start);
    body.end = when(allDay ? Math.max(end, start + 86400000) : end);
  }
  if (patch.repeat !== undefined) {
    const keep = (master?.recurrence || []).filter((l) => !/^RRULE:/i.test(l));
    body.recurrence = patch.repeat ? [...keep, toRrule(patch.repeat, allDay)] : [];
  }
  if (patch.alerts !== undefined) body.reminders = { useDefault: false, overrides: patch.alerts.slice(0, 5).map((minutes) => ({ method: 'popup', minutes })) };
  if (patch.guests !== undefined) {
    // Keep everyone's answers, and you; only add and take away.
    const now = master || (await call<GEvent>(`${base}/${encodeURIComponent(eventId)}`));
    const old = now.attendees || [];
    const wanted = new Map(patch.guests.map((g) => [g.email.toLowerCase(), g]));
    const kept = old.filter((a) => a.self || a.resource || (a.email && wanted.has(a.email.toLowerCase())));
    const have = new Set(kept.map((a) => (a.email || '').toLowerCase()));
    const added = [...wanted.values()].filter((g) => !have.has(g.email.toLowerCase())).map((g) => ({ email: g.email, displayName: g.name }));
    const list = [...kept, ...added];
    body.attendees = list.length > 1 || added.length ? list : [];
  }
  if (patch.video === true) body.conferenceData = meetRequest();
  if (patch.video === false) body.conferenceData = null;
  if (Object.keys(body).length) {
    await call(`${base}/${encodeURIComponent(eventId)}?sendUpdates=${send}&conferenceDataVersion=1`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  const dest = patch.calendarName && calIds[patch.calendarName];
  if (dest && dest !== calId) {
    await call(`${base}/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(dest)}&sendUpdates=${send}`, { method: 'POST' });
  }
}

/** Deletes one event, or with scope 'all' its whole series. Already gone counts as done. */
export async function deleteEvent(call: GoogleCall, accountId: string, ev: CalendarEvent, opts: ChangeOptions = {}): Promise<void> {
  const { calId } = eventParts(accountId, ev);
  let { eventId } = eventParts(accountId, ev);
  const send = opts.notify === false ? 'none' : 'all';
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  try {
    if (ev.recurring && opts.scope === 'all') {
      const one = await call<{ recurringEventId?: string }>(`${base}/${encodeURIComponent(eventId)}`);
      if (one.recurringEventId) eventId = one.recurringEventId;
    }
    await call(`${base}/${encodeURIComponent(eventId)}?sendUpdates=${send}`, { method: 'DELETE' });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 410) return;
    throw e;
  }
}

/** Everything needed to make the same event elsewhere; with `series`, how it repeats from this one on. */
export async function copyOfEvent(call: GoogleCall, accountId: string, ev: CalendarEvent, opts: { series: boolean }): Promise<EventCopy> {
  const { calId, eventId } = eventParts(accountId, ev);
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  const e = await call<GEvent>(`${base}/${encodeURIComponent(eventId)}`);
  const desc = e.description ? (/<[a-z][sS]*>/i.test(e.description) ? htmlToText(e.description) : e.description) : undefined;
  const copy: EventCopy = {
    title: e.summary || ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    location: e.location,
    description: desc,
    guests: (e.attendees || []).filter((a) => !a.self && !a.resource && a.email).map((a) => ({ email: a.email!, name: a.displayName })),
    video: Boolean(e.hangoutLink || e.conferenceData),
  };
  if (opts.series && e.recurringEventId) {
    const master = await call<GEvent>(`${base}/${encodeURIComponent(e.recurringEventId)}`);
    const line = (master.recurrence || []).find((l) => /^RRULE:/i.test(l));
    const rep = line ? fromRrule(line, ev.start) : undefined;
    if (!rep) copy.repeatUnsupported = true;
    else {
      if (rep.count) {
        // A set number of times: from this one on, that ends on the day of the last one.
        let last = 0;
        let pageToken: string | undefined;
        do {
          const params = new URLSearchParams({ maxResults: '2500', timeMin: new Date(ev.start).toISOString() });
          if (pageToken) params.set('pageToken', pageToken);
          const r = await call<{ items: GEvent[]; nextPageToken?: string }>(`${base}/${encodeURIComponent(e.recurringEventId)}/instances?${params}`);
          for (const i of r.items) last = Math.max(last, new Date(i.start.dateTime || `${i.start.date}T00:00:00`).getTime());
          pageToken = r.nextPageToken;
        } while (pageToken);
        delete rep.count;
        const d = new Date(last || ev.start); d.setHours(0, 0, 0, 0); rep.until = d.getTime();
      }
      copy.repeat = rep;
    }
  }
  return copy;
}

/** The body Google wants for a new event. */
export function newEventBody(copy: EventCopy): Record<string, unknown> {
  const tz = localTimeZone();
  // A repeating event needs its time zone, so it stays at the same time of day through the clock changes.
  const when = (ms: number) => (copy.allDay ? { date: ymd(ms) } : { dateTime: localTime(ms), timeZone: tz });
  return {
    summary: copy.title,
    location: copy.location || undefined,
    description: copy.description || undefined,
    start: when(copy.start),
    end: when(copy.allDay ? Math.max(copy.end, copy.start + 86400000) : copy.end),
    attendees: copy.guests.length ? copy.guests.map((g) => ({ email: g.email, displayName: g.name })) : undefined,
    recurrence: copy.repeat ? [toRrule(copy.repeat, copy.allDay)] : undefined,
    reminders: copy.alerts ? { useDefault: false, overrides: copy.alerts.slice(0, 5).map((minutes) => ({ method: 'popup', minutes })) } : undefined,
    conferenceData: copy.video ? meetRequest() : undefined,
  };
}

/** Makes an event and returns its app id. */
export async function createEvent(call: GoogleCall, accountId: string, calId: string, copy: EventCopy): Promise<string> {
  const made = await call<{ id: string }>(`${CAL}/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all&conferenceDataVersion=1`, { method: 'POST', body: JSON.stringify(newEventBody(copy)) });
  return `${accountId}|${calId}|${made.id}`;
}

/** Ends a series the day before this one: past ones stay, this one and later ones go. */
export async function endSeries(call: GoogleCall, accountId: string, ev: CalendarEvent): Promise<void> {
  const { calId, eventId } = eventParts(accountId, ev);
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  const one = await call<{ recurringEventId?: string }>(`${base}/${encodeURIComponent(eventId)}`);
  if (!one.recurringEventId) { await deleteEvent(call, accountId, ev); return; }
  const masterUrl = `${base}/${encodeURIComponent(one.recurringEventId)}`;
  const master = await call<{ recurrence?: string[]; start: { dateTime?: string; date?: string } }>(masterUrl);
  const first = new Date(master.start.dateTime || `${master.start.date}T00:00:00`).getTime();
  if (ev.start <= first) { await call(`${masterUrl}?sendUpdates=all`, { method: 'DELETE' }); return; }
  const cut = new Date(ev.start); cut.setHours(0, 0, 0, 0);
  const lastDay = new Date(cut.getTime() - 1000);
  const until = master.start.date
    ? `${lastDay.getFullYear()}${pad(lastDay.getMonth() + 1)}${pad(lastDay.getDate())}`
    : `${lastDay.getUTCFullYear()}${pad(lastDay.getUTCMonth() + 1)}${pad(lastDay.getUTCDate())}T${pad(lastDay.getUTCHours())}${pad(lastDay.getUTCMinutes())}${pad(lastDay.getUTCSeconds())}Z`;
  const recurrence = (master.recurrence || []).map((l) => (/^RRULE:/i.test(l) ? `${l.replace(/;(COUNT|UNTIL)=[^;]*/gi, '')};UNTIL=${until}` : l));
  await call(`${masterUrl}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify({ recurrence }) });
}

/** Answers an invitation from the calendar itself: your own line in the guest list gets the answer. */
export async function respondToEvent(call: GoogleCall, accountId: string, event: CalendarEvent, status: Rsvp, note?: string): Promise<void> {
  const { calId, eventId } = eventParts(accountId, event);
  const url = `${CAL}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`;
  const ev = await call<{ attendees?: GAttendee[] }>(url);
  const list = ev.attendees || [];
  if (!list.some((a) => a.self)) throw new Error("You aren't on the guest list for this one");
  await call(`${url}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify({ attendees: answered(list, status, note) }) });
}
