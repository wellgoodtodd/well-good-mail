// Calendar: events, refreshing, editing, moving and making events, and answering invitations.
import { store } from '../db';
import { buildReply, RSVP_WORDS, whichIsMe, type Invite, type Rsvp } from '../invites';
import type { Account, CalendarEvent, ChangeOptions, EventCopy, EventPatch, EventGuest, Message } from '../types';
import { providers, useMail } from './store';

const get = useMail.getState;
const set = useMail.setState;

function inviteAddresses(accountId: string, m: Message): string[] {
  const a = get().accounts.find((x) => x.id === accountId);
  return [a?.email, ...(a?.aliases || []).map((x) => x.email), m.deliveredTo, ...m.to.map((x) => x.email)].filter(Boolean) as string[];
}

/** Whether the invitation is in the person's calendar yet, and what they answered. Undefined when this account can't tell. */
export async function inviteStatus(messageId: string, invite: Invite): Promise<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] } | undefined> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p?.inviteStatus) return undefined;
  try { return await p.inviteStatus(invite.uid); } catch { return undefined; }
}

export function canAddToCalendar(messageId: string): boolean {
  const m = get().messages[messageId];
  return Boolean(m && providers.get(m.accountId)?.addInviteToCalendar);
}

export async function addInviteToCalendar(messageId: string, invite: Invite): Promise<string | void> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p?.addInviteToCalendar) throw new Error("This account type can't add to a calendar from here yet");
  const ref = await p.addInviteToCalendar(invite);
  refreshEvents();
  return ref;
}

/** Changes an event added from an email: by the calendar's own id where it gave one, else by adding again (same uid). */
export async function updateAddedEvent(messageId: string, ref: string | void, invite: Invite): Promise<void> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p) throw new Error('Email not found');
  if (ref && p.updateAddedEvent) await p.updateAddedEvent(ref, invite);
  else if (p.addInviteToCalendar) await p.addInviteToCalendar(invite);
  refreshEvents();
  void import('../calendarCache').then((c) => c.refreshCalendarCopy());
}

/** Calendars in an account that events can be written to. */
export function writableCalendars(accountId: string): string[] {
  return providers.get(accountId)?.writableCalendars?.() || [];
}

/** Puts the form's changes onto a copy of an event, for making it again. */
export function applyPatch(copy: EventCopy, pt: EventPatch): EventCopy {
  const c = { ...copy };
  if (pt.title !== undefined) c.title = pt.title;
  if (pt.start !== undefined) c.start = pt.start;
  if (pt.end !== undefined) c.end = pt.end;
  if (pt.allDay !== undefined) c.allDay = pt.allDay;
  if (pt.location !== undefined) c.location = pt.location || undefined;
  if (pt.description !== undefined) c.description = pt.description || undefined;
  if (pt.alerts !== undefined) c.alerts = pt.alerts;
  if (pt.guests !== undefined) c.guests = pt.guests;
  if (pt.video !== undefined) c.video = pt.video;
  if (pt.repeat !== undefined) { c.repeat = pt.repeat || undefined; c.repeatUnsupported = false; }
  return c;
}

/**
 * Changes an event in its own calendar, then shows the change here straight away and refreshes the copy.
 * For a series: scope 'one' (this one), 'all' (the whole series) or 'following' (this one on: the series is ended
 * the day before and made again from here, so guests get a new invitation for that part).
 */
export async function editEvent(ev: CalendarEvent, patch: EventPatch, opts: ChangeOptions = {}): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.editEvent) throw new Error("This calendar can't be changed from here yet");
  if (ev.recurring && opts.scope === 'following' && p.copyOfEvent && p.endSeries && p.createEvent) {
    const copy = applyPatch(await p.copyOfEvent(ev, { series: true }), patch);
    if (copy.repeatUnsupported) throw new Error("This series repeats in a way that can't be split here. Change all of them, or just this one.");
    await p.endSeries(ev);
    await p.createEvent(patch.calendarName || ev.calendarName, copy);
    await afterCalendarChange();
    return;
  }
  await p.editEvent(ev, patch, opts);
  if (ev.recurring && (opts.scope === 'all' || patch.repeat !== undefined)) { await afterCalendarChange(); return; }
  const changed = (e: CalendarEvent): CalendarEvent => (e.id === ev.id ? { ...e, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.start !== undefined ? { start: patch.start } : {}), ...(patch.end !== undefined ? { end: patch.end } : {}), ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}), ...(patch.location !== undefined ? { location: patch.location || undefined } : {}), ...(patch.description !== undefined ? { description: patch.description || undefined } : {}), ...(patch.calendarName ? { calendarName: patch.calendarName } : {}) } : e);
  set({ events: get().events.map(changed) });
  const cal = await import('../calendarCache');
  cal.useCalCache.setState((s) => ({ events: s.events.map(changed) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
}

/** Refreshes the calendar here and the long copy after a change that touches more than one event. */
async function afterCalendarChange(): Promise<void> {
  const cal = await import('../calendarCache');
  await refreshEvents();
  void cal.refreshCalendarCopy();
}

/** Deletes an event you made, from its own calendar and from here. A series: just this one, this one on, or all. */
export async function deleteEvent(ev: CalendarEvent, opts: ChangeOptions = {}): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.deleteEvent) throw new Error("This calendar can't be changed from here yet");
  if (ev.recurring && opts.scope === 'following' && p.endSeries) { await p.endSeries(ev); await afterCalendarChange(); return; }
  await p.deleteEvent(ev, opts);
  forgetEvent(ev.id);
  if (ev.recurring && opts.scope === 'all') { await afterCalendarChange(); return; }
  set({ events: get().events.filter((e) => e.id !== ev.id) });
  const cal = await import('../calendarCache');
  cal.useCalCache.setState((s) => ({ events: s.events.filter((e) => e.id !== ev.id) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
}

/** Every calendar events can be put in, account by account, in the order the accounts are listed. */
export function calendarChoices(): { account: Account; calendars: string[] }[] {
  return [...get().accounts].sort((x, y) => x.order - y.order)
    .map((account) => ({ account, calendars: providers.get(account.id)?.createEvent ? writableCalendars(account.id) : [] }))
    .filter((x) => x.calendars.length);
}

/** Can this event go to another account from here? Repeating ones go as a whole series. */
export function canMoveAcross(ev: CalendarEvent): boolean {
  const p = providers.get(ev.accountId);
  return Boolean(ev.canEdit && p?.copyOfEvent && (ev.recurring ? p.endSeries : p.deleteEvent));
}

/** Everything about the event (or its series from this one on), read fresh from its calendar. */
export async function eventCopy(ev: CalendarEvent, series: boolean): Promise<EventCopy> {
  const p = providers.get(ev.accountId);
  if (!p?.copyOfEvent) throw new Error("This calendar can't be copied from here yet");
  return p.copyOfEvent(ev, { series });
}

/**
 * Puts an event in another account's calendar, then takes it out of the first (a series from this one on), only once
 * the new one is made. Changes from the form go across too. Returns the new event's id.
 */
export async function moveEventAcross(ev: CalendarEvent, to: { accountId: string; calendarName: string }, opts: { patch?: EventPatch; copy?: EventCopy; removeOriginal: boolean }): Promise<string> {
  const from = providers.get(ev.accountId);
  const dest = providers.get(to.accountId);
  if (!from || !dest?.createEvent) throw new Error("That calendar can't take events from here yet");
  const copy = { ...(opts.copy || (await eventCopy(ev, Boolean(ev.recurring)))) };
  if (copy.repeatUnsupported) throw new Error("This series repeats in a way that can't be copied to another account");
  const pt = opts.patch || {};
  if (pt.title !== undefined) copy.title = pt.title;
  if (pt.start !== undefined) copy.start = pt.start;
  if (pt.end !== undefined) copy.end = pt.end;
  if (pt.allDay !== undefined) copy.allDay = pt.allDay;
  if (pt.location !== undefined) copy.location = pt.location || undefined;
  if (pt.description !== undefined) copy.description = pt.description || undefined;
  const newId = await dest.createEvent(to.calendarName, copy);
  const made: CalendarEvent = { ...ev, id: newId, accountId: to.accountId, accountIds: undefined, calendarName: to.calendarName, title: copy.title, start: copy.start, end: copy.end, allDay: copy.allDay, location: copy.location, description: copy.description, htmlLink: undefined, canEdit: true, meetingUrl: copy.video ? undefined : ev.meetingUrl };
  const cal = await import('../calendarCache');
  const swap = (list: CalendarEvent[]) => [...(opts.removeOriginal ? list.filter((e) => e.id !== ev.id) : list), made];
  if (opts.removeOriginal) {
    try {
      if (ev.recurring) await from.endSeries!(ev); else await from.deleteEvent!(ev);
    } catch (e) {
      void refreshEvents(); void cal.refreshCalendarCopy();
      throw new Error(`It's now in ${accountName(to.accountId)}, but the original couldn't be removed (${e instanceof Error ? e.message : e}). Delete it there by hand.`);
    }
  }
  set({ events: swap(get().events) });
  cal.useCalCache.setState((s) => ({ events: swap(s.events) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
  return newId;
}

/** Makes a new event in any account's calendar (guests are invited by the account itself), and shows it here at once. */
export async function createNewEvent(to: { accountId: string; calendarName: string }, copy: EventCopy): Promise<CalendarEvent> {
  const dest = providers.get(to.accountId);
  if (!dest?.createEvent) throw new Error("That calendar can't take events from here yet");
  const id = await dest.createEvent(to.calendarName, copy);
  const acc = get().accounts.find((a) => a.id === to.accountId);
  const made: CalendarEvent = {
    id, accountId: to.accountId, calendarName: to.calendarName, title: copy.title, start: copy.start, end: copy.end, allDay: copy.allDay,
    location: copy.location, description: copy.description, reminderMinutes: copy.alerts || [], recurring: Boolean(copy.repeat), canEdit: true,
    guests: copy.guests.length ? [{ email: acc?.email || '', self: true, organiser: true, answer: 'yes' }, ...copy.guests.map((g) => ({ ...g, answer: 'waiting' as const }))] : undefined,
  };
  set({ events: [...get().events, made] });
  const cal = await import('../calendarCache');
  cal.useCalCache.setState((s) => ({ events: [...s.events, made] }));
  // The calendar gives the real details (the video link, each repeat) on the next refresh.
  void refreshEvents();
  void cal.refreshCalendarCopy();
  return made;
}

const accountName = (id: string) => { const a = get().accounts.find((x) => x.id === id); return a ? a.label || a.email : 'the other account'; };

/** Answers an invitation. In the calendar itself where the account allows it, otherwise by emailing the organiser. */
export async function answerInvite(messageId: string, invite: Invite, status: Rsvp, opts: { byEmail?: boolean; note?: string } = {}): Promise<'calendar' | 'email'> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  const account = m && get().accounts.find((a) => a.id === m.accountId);
  if (!m || !p || !account) throw new Error('Email not found');
  if (!opts.byEmail && p.respondToInvite && (await p.respondToInvite(invite.uid, status, opts.note))) { refreshEvents(); return 'calendar'; }
  if (!invite.organizer) throw new Error("This invitation doesn't say who to reply to");
  const senderName = account.aliases.find((a) => a.isDefault)?.name || account.aliases[0]?.name || account.label;
  const me = whichIsMe(invite, inviteAddresses(m.accountId, m)) || { email: account.email.toLowerCase(), name: senderName };
  const words = RSVP_WORDS[status];
  const text = `${me.name || me.email} has ${words.subject.toLowerCase()} "${invite.title}".${opts.note?.trim() ? `\n\n${opts.note.trim()}` : ''}`;
  await p.send({
    from: { email: account.email, name: senderName },
    to: [{ email: invite.organizer.email, name: invite.organizer.name }],
    cc: [], bcc: [],
    subject: `${words.subject}: ${invite.title}`,
    html: text.split('\n\n').map((para) => `<p>${para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join(''),
    text,
    attachments: [{ filename: 'invite.ics', mimeType: 'text/calendar; method=REPLY; charset=UTF-8', data: new TextEncoder().encode(buildReply(invite, me, status)) }],
  });
  return 'email';
}

/** Answers invitations straight from the calendar (Invitations), each copy in its own account, and shows the answer here at once. */
export async function answerEvent(copies: CalendarEvent[], status: Rsvp, note?: string): Promise<void> {
  for (const ev of copies) {
    const p = providers.get(ev.accountId);
    if (!p?.respondToEvent) throw new Error("This calendar can't answer invitations from here yet");
    await p.respondToEvent(ev, status, note);
  }
  const ids = new Set(copies.map((e) => e.id));
  const answer = status === 'accepted' ? 'yes' as const : status === 'declined' ? 'no' as const : 'maybe' as const;
  const changed = (e: CalendarEvent): CalendarEvent => (ids.has(e.id) ? { ...e, myResponse: answer, declined: answer === 'no', guests: e.guests?.map((g) => (g.self ? { ...g, answer } : g)) } : e);
  set({ events: get().events.map(changed) });
  const cal = await import('../calendarCache');
  cal.useCalCache.setState((s) => ({ events: s.events.map(changed) }));
  void refreshEvents();
}

let eventsFetchedAt = 0;

/** Events deleted here in the last minute: a fetch that set off before the delete can't bring them back. */
const goneEvents = new Map<string, number>();
export const recentlyDeletedEvent = (id: string) => (goneEvents.get(id) || 0) > Date.now() - 60000;
function forgetEvent(id: string) { goneEvents.set(id, Date.now()); }

/** Keeps the same object for every event that hasn't changed, so only changed events are drawn again. */
function keepUnchanged(prev: CalendarEvent[], next: CalendarEvent[]): CalendarEvent[] | null {
  const old = new Map(prev.map((e) => [e.id, e]));
  let same = prev.length === next.length;
  const out = next.map((e) => {
    const was = old.get(e.id);
    if (was && JSON.stringify(was) === JSON.stringify(e)) return was;
    same = false;
    return e;
  });
  return same && out.every((e, i) => e === prev[i]) ? null : out;
}
/** When the calendars were last fetched, in milliseconds. */
export const lastEventsRefresh = () => eventsFetchedAt;

/** Fetches every account's calendar again. Returns the accounts it couldn't reach. */
/** Counts refreshes, so only the newest one's answer is used: an older one finishing late can't bring back an event just changed or deleted. */
let eventsRun = 0;
export async function refreshEvents(): Promise<string[]> {
  const run = ++eventsRun;
  eventsFetchedAt = Date.now();
  const from = Date.now() - 3 * 86400000;
  const to = Date.now() + 8 * 86400000;
  const all: CalendarEvent[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  const names: Record<string, string[]> = { ...get().calendarNames };
  const fresh: Record<string, CalendarEvent[]> = {};
  await Promise.all(get().accounts.map(async (a) => {
    try {
      const events = await providers.get(a.id)!.listEvents(from, to);
      all.push(...events);
      fresh[a.id] = events;
      names[a.id] = providers.get(a.id)!.knownCalendars?.() || [];
    } catch (e) {
      errors[a.id] = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 140) : 'The calendar could not be reached.';
      all.push(...get().events.filter((x) => x.accountId === a.id));
      console.warn('Events failed', a.email, e);
      failed.push(`${a.label || a.email}${e instanceof Error ? ` (${e.message.replace(/\s+/g, ' ').slice(0, 90)})` : ''}`);
    }
  }));
  if (run !== eventsRun) return failed;
  const kept = all.filter((e) => !recentlyDeletedEvent(e.id));
  for (const [id, events] of Object.entries(fresh)) store.replaceEvents(id, events.filter((e) => !recentlyDeletedEvent(e.id)));
  const events = keepUnchanged(get().events, kept);
  set({ ...(events ? { events } : {}), calendarErrors: errors, calendarNames: names });
  return failed;
}

/** Events for any stretch of time, straight from each account (the month view). Accounts that fail are skipped. */
export async function eventsBetween(from: number, to: number): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  await Promise.all(get().accounts.map(async (a) => {
    try { out.push(...(await providers.get(a.id)!.listEvents(from, to))); } catch { /* shown elsewhere */ }
  }));
  return out;
}

export async function dismissReminders(ids: string[]) {
  await store.dismiss(ids);
  const next = new Set(get().dismissed);
  ids.forEach((id) => next.add(id));
  set({ dismissed: next });
  const fu = get().followups.filter((f) => ids.includes(`fu|${f.id}`));
  for (const f of fu) await store.deleteFollowup(f.id);
  if (fu.length) set({ followups: get().followups.filter((f) => !fu.includes(f)) });
}
