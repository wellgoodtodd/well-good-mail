// Calendar: events, refreshing, editing, moving and making events, and answering invitations.
import { create } from 'zustand';
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

/** Changes still on their way to a calendar. While any are, a refresh that comes back is not used (it may predate them). */
let changing = 0;
/** How many changes are on their way, for the thin moving bar under the calendar's header. */
export const useCalendarBusy = create<{ saving: number }>(() => ({ saving: 0 }));
const busyNow = (d: number) => useCalendarBusy.setState((s) => ({ saving: Math.max(0, s.saving + d) }));

/** Same series: by the calendar's series id where it gives one, else same account, calendar, name and time of day. */
export function sameSeries(a: CalendarEvent, b: CalendarEvent): boolean {
  if (!a.recurring || !b.recurring) return a.id === b.id;
  if (a.seriesId || b.seriesId) return a.seriesId === b.seriesId;
  const tod = (t: number) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  return a.accountId === b.accountId && a.calendarName === b.calendarName && a.title === b.title && a.allDay === b.allDay && tod(a.start) === tod(b.start);
}

/** The events a series change touches: this one, this one on, or the whole series. */
export function touched(ev: CalendarEvent, scope: ChangeOptions['scope'], list: CalendarEvent[]): CalendarEvent[] {
  if (!ev.recurring || !scope || scope === 'one') return list.filter((e) => e.id === ev.id);
  return list.filter((e) => e.id === ev.id || (sameSeries(e, ev) && (scope === 'all' || e.start >= ev.start)));
}

/**
 * Shows a change on screen at once, in the near list and the longer copy. Returns a function that puts the events
 * it touched back as they were (for when the calendar refuses), leaving everything else alone.
 */
async function showNow(fn: (list: CalendarEvent[]) => CalendarEvent[]): Promise<() => void> {
  const cal = await import('../calendarCache');
  const near = get().events;
  const copy = cal.useCalCache.getState().events;
  const nextNear = fn(near);
  const nextCopy = fn(copy);
  set({ events: nextNear });
  cal.useCalCache.setState({ events: nextCopy });
  const diff = (before: CalendarEvent[], after: CalendarEvent[]) => {
    const kept = new Set(after);
    const was = new Set(before);
    return { gone: before.filter((e) => !kept.has(e)), added: new Set(after.filter((e) => !was.has(e)).map((e) => e.id)) };
  };
  const a = diff(near, nextNear);
  const b = diff(copy, nextCopy);
  return () => {
    const back = (list: CalendarEvent[], d: { gone: CalendarEvent[]; added: Set<string> }) => {
      const ids = new Set([...d.added, ...d.gone.map((e) => e.id)]);
      return [...list.filter((e) => !ids.has(e.id)), ...d.gone];
    };
    set({ events: back(get().events, a) });
    cal.useCalCache.setState((s) => ({ events: back(s.events, b) }));
    for (const e of [...a.gone, ...b.gone]) goneEvents.delete(e.id);
  };
}

/** Runs the calendar's side of a change, holding back refreshes meanwhile, and puts the screen back if it fails. */
async function sendChange<T>(undo: () => void, work: () => Promise<T>): Promise<T> {
  changing++;
  busyNow(1);
  try {
    return await work();
  } catch (e) {
    undo();
    throw e;
  } finally {
    changing--;
    busyNow(-1);
  }
}

/** The patch's simple fields put onto an event, with a time change moving it by the same amount (for a series). */
export function patched(e: CalendarEvent, ev: CalendarEvent, patch: EventPatch): CalendarEvent {
  const shift = patch.start !== undefined ? patch.start - ev.start : 0;
  const endShift = patch.end !== undefined ? patch.end - ev.end : shift;
  const same = e.id === ev.id;
  return {
    ...e,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.start !== undefined || patch.end !== undefined ? { start: same && patch.start !== undefined ? patch.start : e.start + shift, end: same && patch.end !== undefined ? patch.end : e.end + endShift } : {}),
    ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
    ...(patch.location !== undefined ? { location: patch.location || undefined } : {}),
    ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
    ...(patch.calendarName ? { calendarName: patch.calendarName } : {}),
    ...(patch.alerts !== undefined ? { reminderMinutes: patch.alerts } : {}),
  };
}

/**
 * Changes an event in its own calendar. The change shows here straight away and is put back (the error says why)
 * if the calendar refuses. For a series: scope 'one' (this one), 'all' (the whole series) or 'following' (this one
 * on: the series is ended the day before and made again from here, so guests get a new invitation for that part).
 */
export async function editEvent(ev: CalendarEvent, patch: EventPatch, opts: ChangeOptions = {}): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.editEvent) throw new Error("This calendar can't be changed from here yet");
  const series = Boolean(ev.recurring && (opts.scope === 'all' || opts.scope === 'following'));
  const undo = await showNow((list) => {
    const ids = new Set(touched(ev, opts.scope, list).map((e) => e.id));
    return list.map((e) => (ids.has(e.id) ? patched(e, ev, patch) : e));
  });
  await sendChange(undo, async () => {
    if (series && opts.scope === 'following' && p.copyOfEvent && p.endSeries && p.createEvent) {
      const copy = applyPatch(await p.copyOfEvent(ev, { series: true }), patch);
      if (copy.repeatUnsupported) throw new Error("This series repeats in a way that can't be split here. Change all of them, or just this one.");
      await p.endSeries(ev);
      await p.createEvent(patch.calendarName || ev.calendarName, copy);
    } else await p.editEvent!(ev, patch, opts);
  });
  const cal = await import('../calendarCache');
  void refreshEvents();
  void cal.refreshCalendarCopy();
  refreshSoon();
}

/** Refreshes once more a few seconds after a change, for what the calendar fills in later (guests' answers, repeats). */
/** Guests' answers and the other side of an invitation can take Google or Outlook a few seconds, so it looks twice. */
let soonTimers: ReturnType<typeof setTimeout>[] = [];
export function refreshSoon(): void {
  soonTimers.forEach(clearTimeout);
  soonTimers = [4000, 15000].map((ms) => setTimeout(() => { void refreshEvents(); }, ms));
}

/** Deletes an event you made, from its own calendar and from here, at once. A series: just this one, this one on, or all. */
export async function deleteEvent(ev: CalendarEvent, opts: ChangeOptions = {}): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.deleteEvent) throw new Error("This calendar can't be changed from here yet");
  const undo = await showNow((list) => {
    const ids = new Set(touched(ev, opts.scope, list).map((e) => e.id));
    ids.forEach(forgetEvent);
    return list.filter((e) => !ids.has(e.id));
  });
  await sendChange(undo, async () => {
    if (ev.recurring && opts.scope === 'following' && p.endSeries) await p.endSeries(ev);
    else await p.deleteEvent!(ev, opts);
  });
  const cal = await import('../calendarCache');
  void refreshEvents();
  void cal.refreshCalendarCopy();
  if (opts.notify) refreshSoon();
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
 * the new one is made. Changes from the form go across too. It shows in its new place at once and goes back if the
 * calendar refuses. Returns the new event's id.
 */
export async function moveEventAcross(ev: CalendarEvent, to: { accountId: string; calendarName: string }, opts: { patch?: EventPatch; copy?: EventCopy; removeOriginal: boolean }): Promise<string> {
  const from = providers.get(ev.accountId);
  const dest = providers.get(to.accountId);
  if (!from || !dest?.createEvent) throw new Error("That calendar can't take events from here yet");
  const pt = opts.patch || {};
  const tempId = `moving|${ev.id}|${Date.now()}`;
  const shown: CalendarEvent = { ...patched(ev, ev, pt), id: tempId, accountId: to.accountId, accountIds: undefined, calendarName: to.calendarName, htmlLink: undefined, canEdit: true, seriesId: undefined };
  const cal = await import('../calendarCache');
  const leaving = (list: CalendarEvent[]) => new Set(touched(ev, ev.recurring ? 'following' : 'one', list).map((e) => e.id));
  const undo = await showNow((list) => { const ids = leaving(list); return [...(opts.removeOriginal ? list.filter((e) => !ids.has(e.id)) : list), shown]; });
  let made: CalendarEvent = shown;
  await sendChange(undo, async () => {
    const copy = { ...(opts.copy || (await eventCopy(ev, Boolean(ev.recurring)))) };
    if (copy.repeatUnsupported) throw new Error("This series repeats in a way that can't be copied to another account");
    if (pt.title !== undefined) copy.title = pt.title;
    if (pt.start !== undefined) copy.start = pt.start;
    if (pt.end !== undefined) copy.end = pt.end;
    if (pt.allDay !== undefined) copy.allDay = pt.allDay;
    if (pt.location !== undefined) copy.location = pt.location || undefined;
    if (pt.description !== undefined) copy.description = pt.description || undefined;
    const newId = await dest.createEvent!(to.calendarName, copy);
    made = { ...shown, id: newId, title: copy.title, start: copy.start, end: copy.end, allDay: copy.allDay, location: copy.location, description: copy.description, meetingUrl: copy.video ? undefined : ev.meetingUrl };
  });
  const swap = (list: CalendarEvent[]) => list.map((e) => (e.id === tempId ? made : e));
  set({ events: swap(get().events) });
  cal.useCalCache.setState((s) => ({ events: swap(s.events) }));
  if (opts.removeOriginal) {
    changing++;
    busyNow(1);
    try {
      if (ev.recurring) await from.endSeries!(ev); else await from.deleteEvent!(ev);
      forgetEvent(ev.id);
    } catch (e) {
      set({ events: [...get().events.filter((x) => x.id !== ev.id), ev] });
      void refreshEvents(); void cal.refreshCalendarCopy();
      throw new Error(`It's now in ${accountName(to.accountId)}, but the original couldn't be removed (${e instanceof Error ? e.message : e}). Delete it there by hand.`);
    } finally {
      changing--;
      busyNow(-1);
    }
  }
  void refreshEvents();
  void cal.refreshCalendarCopy();
  return made.id;
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
  refreshSoon();
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
  refreshSoon();
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

/**
 * Fetches every account's calendar again. Each account's events show as soon as that account answers, so one slow
 * account (Outlook having a bad day) doesn't hold up the others. An account that keeps failing is tried less often
 * (its last events stay on screen), unless `everyone` is set, as it is for the Refresh button. Returns the accounts
 * it couldn't reach.
 */
/** Counts refreshes, so only the newest one's answer is used: an older one finishing late can't bring back an event just changed or deleted. */
let eventsRun = 0;
/** Accounts whose calendar keeps failing: how many times in a row, and not to be tried again before when. */
const resting = new Map<string, { fails: number; until: number }>();
export async function refreshEvents(opts: { everyone?: boolean } = {}): Promise<string[]> {
  const run = ++eventsRun;
  eventsFetchedAt = Date.now();
  const from = Date.now() - 3 * 86400000;
  const to = Date.now() + 8 * 86400000;
  const failed: string[] = [];
  const now = Date.now();
  await Promise.all(get().accounts.map(async (a) => {
    const rest = resting.get(a.id);
    if (!opts.everyone && rest && rest.until > now) return;
    try {
      const events = (await providers.get(a.id)!.listEvents(from, to)).filter((e) => !recentlyDeletedEvent(e.id));
      resting.delete(a.id);
      // An older refresh, or one that set off while a change was still on its way, could show things as they were.
      if (run !== eventsRun || changing) return;
      store.replaceEvents(a.id, events);
      const s = get();
      const errors = { ...s.calendarErrors };
      delete errors[a.id];
      const next = keepUnchanged(s.events, [...s.events.filter((e) => e.accountId !== a.id), ...events]);
      set({ ...(next ? { events: next } : {}), calendarErrors: errors, calendarNames: { ...s.calendarNames, [a.id]: providers.get(a.id)!.knownCalendars?.() || [] } });
    } catch (e) {
      // Tried again after 2, 4, 8 then 15 minutes while it keeps failing.
      const fails = (rest?.fails || 0) + 1;
      if (fails >= 2) resting.set(a.id, { fails, until: Date.now() + Math.min(15, 2 ** (fails - 1)) * 60000 });
      else resting.set(a.id, { fails, until: 0 });
      console.warn('Events failed', a.email, e);
      failed.push(`${a.label || a.email}${e instanceof Error ? ` (${e.message.replace(/\s+/g, ' ').slice(0, 90)})` : ''}`);
      if (run !== eventsRun) return;
      set({ calendarErrors: { ...get().calendarErrors, [a.id]: e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 140) : 'The calendar could not be reached.' } });
    }
  }));
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
