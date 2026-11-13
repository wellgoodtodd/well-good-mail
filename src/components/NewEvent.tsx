// Making and changing events. New: a quick pop-up (title, when, calendar) that grows into the full form with More
// options, started from the + New event button, the picked day, a double-click or right-click on the calendar, or
// Ctrl+Alt+N. Changing: the same full form, from More options in an event's pop-up.
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { en } from 'chrono-node';
import { Icon } from './Icon';
import { useDialogFocus, useMenu, type MenuItem } from './ui';
import { RecipientField } from './RecipientField';
import { useMail, calendarChoices, createNewEvent, deleteEvent, toast, eventCopy, canMoveAcross, moveEventAcross, writableCalendars, refreshEvents } from '../lib/mail';
import { record, undoEntry } from '../lib/history';
import { useSettings } from '../lib/settings';
import { groupCalendars, calendarKey, meetingService } from '../lib/meetings';
import { describeRepeat } from '../lib/recurrence';
import { changeEvent, guestsToTell, removeEvent } from '../lib/eventFlows';
import { openExternal } from '../lib/platform';
import type { Address, CalendarEvent, EventCopy, EventPatch, Repeat } from '../lib/types';
import { useCalDay } from './CalendarViews';
import { useCalCache } from '../lib/calendarCache';
import { placesFromEvents, suggestPlaces } from '../lib/places';

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hmOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const msAt = (day: string, time = '00:00') => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };
const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface NewEventDraft { start: number; end: number; allDay: boolean }

/** The new event being made, if any. The calendar views show a placeholder where it will go. */
export const useNewEvent = create<{ draft?: NewEventDraft; seq: number }>(() => ({ seq: 0 }));

/**
 * Opens the quick pop-up. With a time it starts there (an hour long); with a day, at 09:00 that day (or the next
 * hour, today); with neither, the picked day in the calendar, or the next hour today.
 */
export function startNewEvent(at: { day?: number; start?: number; end?: number; allDay?: boolean } = {}) {
  if (at.allDay) {
    const d = midnight(at.day ?? at.start ?? Date.now());
    useNewEvent.setState((s) => ({ draft: { start: d, end: d + DAY, allDay: true }, seq: s.seq + 1 }));
    return;
  }
  let start = at.start;
  if (start === undefined) {
    const day = at.day ?? useCalDay.getState().day ?? midnight(Date.now());
    const now = new Date();
    start = midnight(day) === midnight(now.getTime()) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).getTime() : day + 9 * 3600000;
  }
  useNewEvent.setState((s) => ({ draft: { start, end: at.end ?? start + 3600000, allDay: false }, seq: s.seq + 1 }));
}
const close = () => useNewEvent.setState({ draft: undefined });

/** Rendered once by the app: the pop-up, whenever a new event is being made. */
export function NewEventHost() {
  const draft = useNewEvent((s) => s.draft);
  // A fresh form for each New event, not each change of time (the time changes as the form is filled in).
  const seq = useNewEvent((s) => s.seq);
  if (!draft) return null;
  return <EventForm key={seq} draft={draft} onClose={close} />;
}

type Target = { accountId: string; calendarName: string };
type Choices = { account: { id: string; label?: string; email: string; colour: string; kind: string }; calendars: string[] }[];

/** Calendars a new event can go in: writable ones, leaving out hidden calendars (unless they're in the group you're looking at). */
function choices(): Choices {
  const s = useSettings.getState();
  const only = groupCalendars(s);
  const hidden = new Set(s.hiddenCalendars);
  return calendarChoices()
    .map((c) => ({ ...c, calendars: c.calendars.filter((n) => only?.has(`${c.account.id}|${n}`) || !hidden.has(`${c.account.id}|${n}`)) }))
    .filter((c) => c.calendars.length);
}

/** For an event being changed: its own account's calendars first (with its current one), then others it can move to. */
function choicesFor(ev: CalendarEvent): Choices {
  const accounts = useMail.getState().accounts;
  const own = accounts.find((a) => a.id === ev.accountId);
  const ownCals = writableCalendars(ev.accountId);
  const list: Choices = own ? [{ account: own, calendars: ownCals.includes(ev.calendarName) ? ownCals : [ev.calendarName, ...ownCals] }] : [];
  if (canMoveAcross(ev)) list.push(...choices().filter((c) => c.account.id !== ev.accountId));
  return list;
}

/** First the group you're looking at, then the calendar you used last time, then the first account's own calendar. */
function defaultTarget(): Target | undefined {
  const list = choices();
  const all = list.flatMap((c) => c.calendars.map((n) => ({ accountId: c.account.id, calendarName: n })));
  const s = useSettings.getState();
  const only = groupCalendars(s);
  if (only) { const inGroup = all.find((t) => only.has(calendarKey(t))); if (inGroup) return inGroup; }
  const last = all.find((t) => calendarKey(t) === s.lastEventCalendar);
  if (last) return last;
  const first = list[0];
  if (!first) return undefined;
  return { accountId: first.account.id, calendarName: first.calendars.find((n) => n.toLowerCase() === first.account.email.toLowerCase()) || first.calendars[0] };
}

type RepeatChoice = 'never' | 'daily' | 'weekdays' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | 'custom';
const REPEATS: { id: RepeatChoice; label: string }[] = [
  { id: 'never', label: 'Never' }, { id: 'daily', label: 'Every day' }, { id: 'weekdays', label: 'Every weekday' }, { id: 'weekly', label: 'Every week' },
  { id: 'fortnightly', label: 'Every 2 weeks' }, { id: 'monthly', label: 'Every month' }, { id: 'yearly', label: 'Every year' }, { id: 'custom', label: 'Custom…' },
];
const TIMED_ALERTS: { mins: number; label: string }[] = [
  { mins: 0, label: 'At the time of the event' }, { mins: 5, label: '5 minutes before' }, { mins: 10, label: '10 minutes before' }, { mins: 15, label: '15 minutes before' },
  { mins: 30, label: '30 minutes before' }, { mins: 60, label: '1 hour before' }, { mins: 120, label: '2 hours before' }, { mins: 1440, label: '1 day before' },
  { mins: 2880, label: '2 days before' }, { mins: 10080, label: '1 week before' },
];
// All-day events start at midnight, so "the day before at 09:00" is 15 hours before.
const ALLDAY_ALERTS: { mins: number; label: string }[] = [
  { mins: 900, label: 'The day before at 09:00' }, { mins: 2340, label: '2 days before at 09:00' }, { mins: 9540, label: 'A week before at 09:00' },
];
/** Words for any number of minutes before, for alerts set elsewhere that aren't in the lists. */
const minsWords = (m: number) => (m % 1440 === 0 ? `${m / 1440} ${m === 1440 ? 'day' : 'days'} before` : m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'} before` : `${m} minutes before`);

/** "The 2nd Tuesday" of its month, or the last one when it's in the final week. */
const nthOf = (ms: number) => { const d = new Date(ms); const n = Math.ceil(d.getDate() / 7); const last = d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return last && n >= 4 ? -1 : n; };
const th = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const ORD: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

interface Custom { freq: Repeat['freq']; interval: number; days: string[]; monthBy: 'date' | 'weekday' }
interface Form {
  title: string; day: string; endDay: string; from: string; to: string; allDay: boolean;
  repeat: RepeatChoice; custom: Custom; endRepeat: 'never' | 'on' | 'after'; until: string; count: number;
  alert1: 'default' | 'none' | number; alert2: number | null;
  guests: Address[]; location: string; video: boolean; notes: string;
}
type RepeatFields = Pick<Form, 'repeat' | 'custom' | 'endRepeat' | 'until' | 'count'>;

/** The repeat rule the form describes, from the first day on. */
function repeatOf(f: Form, start: number): Repeat | undefined {
  const d = new Date(start);
  const code = CODES[d.getDay()];
  let r: Repeat | undefined;
  switch (f.repeat) {
    case 'never': return undefined;
    case 'daily': r = { freq: 'daily', interval: 1 }; break;
    case 'weekdays': r = { freq: 'weekly', interval: 1, days: ['MO', 'TU', 'WE', 'TH', 'FR'] }; break;
    case 'weekly': r = { freq: 'weekly', interval: 1, days: [code] }; break;
    case 'fortnightly': r = { freq: 'weekly', interval: 2, days: [code] }; break;
    case 'monthly': r = { freq: 'monthly', interval: 1, monthDay: d.getDate() }; break;
    case 'yearly': r = { freq: 'yearly', interval: 1, monthDay: d.getDate(), month: d.getMonth() + 1 }; break;
    case 'custom': {
      const c = f.custom;
      const interval = Math.max(1, Math.min(99, Math.round(c.interval) || 1));
      if (c.freq === 'weekly') r = { freq: 'weekly', interval, days: c.days.length ? CODES.filter((x) => c.days.includes(x)) : [code] };
      else if (c.freq === 'monthly') r = c.monthBy === 'weekday' ? { freq: 'monthly', interval, nth: nthOf(start), days: [code] } : { freq: 'monthly', interval, monthDay: d.getDate() };
      else if (c.freq === 'yearly') r = c.monthBy === 'weekday' ? { freq: 'yearly', interval, nth: nthOf(start), days: [code], month: d.getMonth() + 1 } : { freq: 'yearly', interval, monthDay: d.getDate(), month: d.getMonth() + 1 };
      else r = { freq: 'daily', interval };
    }
  }
  if (f.endRepeat === 'on' && f.until) r.until = msAt(f.until);
  if (f.endRepeat === 'after') r.count = Math.max(1, Math.min(999, Math.round(f.count) || 1));
  return r;
}

/** The form's repeat fields for a rule read from the calendar: a preset when it is one, otherwise Custom. */
export function repeatFields(r: Repeat | undefined, start: number): RepeatFields {
  const code = CODES[new Date(start).getDay()];
  const base: RepeatFields = { repeat: 'never', custom: { freq: 'weekly', interval: 1, days: [], monthBy: 'date' }, endRepeat: 'never', until: ymdOf(start + 30 * DAY), count: 10 };
  if (!r) return base;
  const days = r.days || [];
  let repeat: RepeatChoice = 'custom';
  if (r.freq === 'daily' && r.interval === 1) repeat = 'daily';
  else if (r.freq === 'weekly' && r.interval === 1 && days.join() === 'MO,TU,WE,TH,FR') repeat = 'weekdays';
  else if (r.freq === 'weekly' && days.length === 1 && days[0] === code && r.interval <= 2) repeat = r.interval === 1 ? 'weekly' : 'fortnightly';
  else if (r.freq === 'monthly' && r.interval === 1 && !r.nth) repeat = 'monthly';
  else if (r.freq === 'yearly' && r.interval === 1 && !r.nth) repeat = 'yearly';
  return {
    repeat,
    custom: { freq: r.freq, interval: r.interval, days: r.freq === 'weekly' ? days : [], monthBy: r.nth ? 'weekday' : 'date' },
    endRepeat: r.until ? 'on' : r.count ? 'after' : 'never',
    until: r.until ? ymdOf(r.until) : base.until,
    count: r.count || 10,
  };
}

/**
 * Words like "at 1pm", "today" or "tomorrow" in the title: when they say, and the title without them. Days are
 * read from today; a time on its own stays on the day the event started on.
 */
export function readTitle(title: string, onDay: number, now = Date.now()): { start?: number; hasTime: boolean; hasDay: boolean; rest: string } | undefined {
  const r = en.GB.parse(title, new Date(now), { forwardDate: true })[0];
  if (!r) return undefined;
  const hasTime = r.start.isCertain('hour');
  const hasDay = r.start.isCertain('day') || r.start.isCertain('weekday');
  if (!hasTime && !hasDay) return undefined;
  const rest = (title.slice(0, r.index) + title.slice(r.index + r.text.length)).replace(/\s+(at|on|from)\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  let start = r.start.date().getTime();
  if (!hasDay) { const t = new Date(start); start = midnight(onDay) + t.getHours() * 3600000 + t.getMinutes() * 60000; }
  return { start, hasTime, hasDay, rest };
}

function formFromEvent(ev: CalendarEvent): Form {
  const alerts = [...(ev.reminderMinutes || [])].sort((a, b) => b - a);
  return {
    title: ev.title, day: ymdOf(ev.start), endDay: ymdOf(ev.allDay ? ev.end - 1 : ev.end), from: ev.allDay ? '09:00' : hmOf(ev.start), to: ev.allDay ? '10:00' : hmOf(ev.end), allDay: ev.allDay,
    ...repeatFields(undefined, ev.start),
    alert1: alerts.length ? alerts[0] : 'none', alert2: alerts.length > 1 ? alerts[1] : null,
    guests: (ev.guests || []).filter((g) => !g.self).map((g) => ({ email: g.email, name: g.name })),
    location: ev.location && !ev.location.startsWith('http') ? ev.location : '', video: Boolean(ev.meetingUrl), notes: ev.description || '',
  };
}

const sameGuests = (a: Address[], b: Address[]) => a.map((g) => g.email.toLowerCase()).sort().join() === b.map((g) => g.email.toLowerCase()).sort().join();
const alertsOf = (f: Form) => (f.alert1 === 'default' ? undefined : f.alert1 === 'none' ? [] : [f.alert1, ...(f.alert2 !== null && f.alert2 !== f.alert1 ? [f.alert2] : [])]);
const accountName = (id: string) => { const a = useMail.getState().accounts.find((x) => x.id === id); return a ? a.label || a.email : ''; };

/** Opens the event in Google Calendar or Outlook on the web, where its meeting settings are. */
export async function openMeetingSettings(id: string, link?: string) {
  let url = link || useMail.getState().events.find((e) => e.id === id)?.htmlLink;
  if (!url) { await refreshEvents(); url = useMail.getState().events.find((e) => e.id === id)?.htmlLink; }
  if (url) void openExternal(url);
  else toast({ text: 'The calendar has not given a link for it yet. Try again in a moment.', ttl: 5000 });
}

/** The new event form (with `draft`) or the full form for changing an event (with `event`). */
export function EventForm({ draft, event, onClose, expanded: startExpanded = false }: { draft?: NewEventDraft; event?: CalendarEvent; onClose: (closeAll?: boolean) => void; expanded?: boolean }) {
  const editing = Boolean(event);
  const focusRef = useDialogFocus();
  const accounts = useMail((s) => s.accounts);
  const contacts = useMail((s) => s.contacts);
  const [expanded, setExpanded] = useState(startExpanded || editing);
  const [to, setTo] = useState<Target | undefined>(() => (event ? { accountId: event.accountId, calendarName: event.calendarName } : defaultTarget()));
  const toAcc = accounts.find((a) => a.id === to?.accountId);
  const calMenu = useMenu();
  const [busy, setBusy] = useState(false);
  // Once the time has been changed by hand, words in the title no longer move it. Editing never reads the title.
  const timeTouched = useRef(editing);
  const titleRead = useRef<{ rest: string } | undefined>(undefined);
  const first = useMemo<Form>(() => (event ? formFromEvent(event) : {
    title: '', day: ymdOf(draft!.start), endDay: ymdOf(draft!.allDay ? draft!.end - 1 : draft!.end), from: draft!.allDay ? '09:00' : hmOf(draft!.start), to: draft!.allDay ? '10:00' : hmOf(draft!.end), allDay: draft!.allDay,
    // No days picked yet means the start's own day, so it follows the date.
    ...repeatFields(undefined, draft!.start),
    alert1: 'default', alert2: null, guests: [], location: '', video: false, notes: '',
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState<Form>(first);
  // Changing an event: how its series repeats is read from the calendar, and only sent back if it's changed.
  const [series, setSeries] = useState<{ copy?: EventCopy; error?: boolean } | undefined>(event?.recurring ? undefined : { });
  const repeatTouched = useRef(false);
  useEffect(() => {
    if (!event?.recurring) return;
    let live = true;
    eventCopy(event, true).then((copy) => {
      if (!live) return;
      setSeries({ copy });
      if (!repeatTouched.current) setF((x) => ({ ...x, ...repeatFields(copy.repeat, event.start) }));
    }, () => { if (live) setSeries({ error: true }); });
    return () => { live = false; };
  }, [event]);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const setRepeat = (patch: Partial<Form>) => { repeatTouched.current = true; set(patch); };
  const start = f.allDay ? msAt(f.day) : msAt(f.day, f.from);
  const end = f.allDay ? msAt(f.endDay < f.day ? f.day : f.endDay) + DAY : msAt(f.endDay <= f.day ? f.day : f.endDay, f.to);
  const title = (titleRead.current?.rest ?? f.title).trim();
  const bad = !to ? 'There is no calendar this can go in yet.' : !title ? '' : end <= start ? 'It ends before it starts.' : f.endRepeat === 'on' && f.repeat !== 'never' && msAt(f.until) < midnight(start) ? 'The repeat ends before it starts.' : '';
  const rep = useMemo(() => repeatOf(f, start), [f, start]);
  const lengthWords = useMemo(() => { const m = Math.round((end - start) / 60000); if (f.allDay || m <= 0) return ''; return m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`; }, [start, end, f.allDay]);
  const videoName = toAcc?.kind === 'microsoft' ? 'Teams meeting' : toAcc?.kind === 'gmail' || toAcc?.kind === 'demo' ? 'Google Meet' : '';
  const across = Boolean(event && to && to.accountId !== event.accountId);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // The placeholder in the calendar follows the time in the form.
  useEffect(() => { if (!editing && end > start) useNewEvent.setState({ draft: { start, end, allDay: f.allDay } }); }, [start, end, f.allDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTitle = (v: string) => {
    const patch: Partial<Form> = { title: v };
    const hadRead = Boolean(titleRead.current);
    titleRead.current = undefined;
    if (!timeTouched.current) {
      const r = readTitle(v, draft!.start);
      const len = Math.max(15 * 60000, msAt(first.endDay, first.to) - msAt(first.day, first.from));
      if (r?.start !== undefined) {
        titleRead.current = { rest: r.rest };
        if (r.hasTime) { patch.day = ymdOf(r.start); patch.from = hmOf(r.start); patch.to = hmOf(r.start + len); patch.endDay = ymdOf(r.start + len); patch.allDay = false; }
        else { const s = msAt(ymdOf(r.start), first.from); patch.day = ymdOf(s); patch.endDay = ymdOf(s + (first.allDay ? 0 : len)); patch.allDay = first.allDay; }
      } else if (hadRead) {
        // The words have gone: back to where the event started.
        Object.assign(patch, { day: first.day, endDay: first.endDay, from: first.from, to: first.to, allDay: first.allDay });
      }
    }
    set(patch);
  };
  const touch = (patch: Partial<Form>) => { timeTouched.current = true; titleRead.current = undefined; set(patch); };

  const pickCalendar = (el: HTMLElement) => {
    const items: MenuItem[] = [];
    const list = event ? choicesFor(event) : choices();
    for (const { account, calendars } of list) {
      items.push({ heading: `${account.label || account.email}${event && account.id === event.accountId && list.length > 1 ? ' · this account' : ''}` });
      for (const c of calendars) items.push({ label: c, dot: account.colour, active: to?.accountId === account.id && to.calendarName === c, onClick: () => { setTo({ accountId: account.id, calendarName: c }); if (account.kind !== toAcc?.kind) set({ video: false }); } });
    }
    calMenu.open(el.getBoundingClientRect(), items);
  };

  /** What the form changes on the event being edited. */
  const patchFor = (ev: CalendarEvent): EventPatch => {
    const p: EventPatch = {};
    if (title !== ev.title) p.title = title;
    if (start !== ev.start || end !== ev.end || f.allDay !== ev.allDay) { p.start = start; p.end = end; p.allDay = f.allDay; }
    if (f.location.trim() !== first.location.trim()) p.location = f.location.trim();
    if (f.notes.trim() !== first.notes.trim()) p.description = f.notes.trim();
    const a = alertsOf(f);
    if (a && JSON.stringify(a) !== JSON.stringify(alertsOf(first))) p.alerts = a;
    if (!sameGuests(f.guests, first.guests)) p.guests = f.guests.map((g) => ({ email: g.email, name: g.name }));
    if (f.video !== first.video) p.video = f.video;
    if (repeatTouched.current && JSON.stringify(rep || null) !== JSON.stringify(series?.copy?.repeat || null)) p.repeat = rep || null;
    if (to && to.calendarName !== ev.calendarName && to.accountId === ev.accountId) p.calendarName = to.calendarName;
    return p;
  };
  const changed = event ? Object.keys(patchFor(event)).length > 0 || across : true;

  const saveEdit = async (ev: CalendarEvent) => {
    const patch = patchFor(ev);
    if (across && to) {
      setBusy(true);
      try {
        const copy = series?.copy || (await eventCopy(ev, Boolean(ev.recurring)));
        const newId = await moveEventAcross(ev, to, { patch, copy: { ...copy, alerts: alertsOf(f), guests: f.guests.map((g) => ({ email: g.email, name: g.name })), video: f.video, repeat: ev.recurring || rep ? rep : undefined }, removeOriginal: true });
        toast({ text: `"${title}" moved to ${accountName(to.accountId)}.`, ttl: 6000 });
        void newId;
        onClose(true);
      } catch (e) { setBusy(false); toast({ text: `Couldn't move it: ${e instanceof Error ? e.message : e}`, ttl: 10000 }); }
      return;
    }
    if (!Object.keys(patch).length) { onClose(false); return; }
    setBusy(true);
    // A new repeat rule is for the whole series, so there's nothing to ask about which ones.
    const ok = await changeEvent(ev, patch, patch.repeat !== undefined && ev.recurring ? { scope: 'all' } : {});
    setBusy(false);
    if (ok) onClose(true);
  };

  const save = async () => {
    if (bad || !title || busy || !to) return;
    if (event) { await saveEdit(event); return; }
    const copy: EventCopy = {
      title, start, end, allDay: f.allDay, location: f.location.trim() || undefined, description: f.notes.trim() || undefined,
      guests: f.guests.map((g) => ({ email: g.email, name: g.name })), video: Boolean(f.video && videoName), repeat: rep, alerts: alertsOf(f),
    };
    setBusy(true);
    try {
      const made = await createNewEvent(to, copy);
      useSettings.getState().set({ lastEventCalendar: calendarKey(to) }, { quiet: true });
      onClose(true);
      const accWords = toAcc ? toAcc.label || toAcc.email : '';
      const where = !accWords || [accWords.toLowerCase(), toAcc?.email.toLowerCase()].includes(to.calendarName.toLowerCase()) ? to.calendarName : `${to.calendarName} (${accWords})`;
      const settings = copy.video ? { action: { label: 'Meeting settings', run: () => void openMeetingSettings(made.id) } } : {};
      if (copy.guests.length) toast({ text: `"${title}" added to ${where}. Invitations are on their way.`, ttl: 8000, ...settings });
      else {
        // Undo (and Ctrl+Z) takes it out; Redo makes it again, as a new event.
        let current = made;
        const fail = (e: unknown) => { toast({ text: `Couldn't change it: ${e instanceof Error ? e.message : e}`, ttl: 8000 }); };
        const step = record(`Add event: ${title}`, () => deleteEvent(current, { notify: false }).catch(fail), async () => { try { current = await createNewEvent(to, copy); } catch (e) { fail(e); } });
        toast({ text: `"${title}" added to ${where}.`, ttl: 8000, undo: () => { void undoEntry(step); }, ...settings });
      }
    } catch (e) {
      setBusy(false);
      toast({ text: `Couldn't add it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    }
  };

  const alertList = f.allDay ? ALLDAY_ALERTS : TIMED_ALERTS;
  // Alerts set elsewhere that aren't in the list still show.
  const alertOptions = [...alertList, ...[f.alert1, f.alert2].filter((m): m is number => typeof m === 'number' && !alertList.some((a) => a.mins === m)).map((mins) => ({ mins, label: minsWords(mins) }))];
  const custom = f.custom;
  const setCustom = (patch: Partial<Custom>) => setRepeat({ custom: { ...custom, ...patch } });
  const wd = new Date(start).getDay();
  const guestCount = event ? guestsToTell(event) : 0;
  const repeatReady = !event?.recurring || Boolean(series);

  return (
    <div className="ev-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && (editing ? !changed : !f.title.trim())) onClose(false); }}>
      <div className={`ev-pop new-ev ${expanded ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={editing ? `Change ${event!.title}` : 'New event'} ref={focusRef}>
        <form className="ev-edit" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="ev-head">
            <span className="ev-bar" style={{ background: toAcc?.colour }} />
            <input className="ev-title-in" aria-label="Title" placeholder="New event" value={f.title} autoFocus={!editing} onChange={(e) => onTitle(e.target.value)} />
          </div>
          {titleRead.current && <p className="hint new-ev-read">Saved as "{titleRead.current.rest || 'New event'}", {f.allDay ? 'all day' : `at ${f.from}`} on {new Date(start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.</p>}
          <div className="ev-form">
            {expanded && <><span>All day</span><div><input type="checkbox" role="switch" className="switch" aria-label="All day" checked={f.allDay} onChange={(e) => touch({ allDay: e.target.checked })} /></div></>}
            <label htmlFor="ne-day">{expanded ? 'Starts' : 'When'}</label>
            <div className="ev-when">
              <input id="ne-day" type="date" value={f.day} onChange={(e) => { const len = msAt(f.endDay) - msAt(f.day); const nd = e.target.value; if (nd) touch({ day: nd, endDay: ymdOf(msAt(nd) + Math.max(0, len)) }); }} />
              {!f.allDay && <input type="time" aria-label="From" value={f.from} onChange={(e) => { const keep = msAt(f.endDay, f.to) - msAt(f.day, f.from); const nf = e.target.value; const ne = msAt(f.day, nf) + Math.max(15 * 60000, keep); touch({ from: nf, to: hmOf(ne), endDay: ymdOf(ne) }); }} />}
              {!expanded && <>
                <span className="ev-to">to</span>
                {(f.allDay || f.endDay !== f.day) && <input type="date" aria-label="Last day" value={f.endDay} min={f.day} onChange={(e) => touch({ endDay: e.target.value })} />}
                {!f.allDay && <input type="time" aria-label="To" value={f.to} onChange={(e) => touch({ to: e.target.value })} />}
              </>}
            </div>
            {expanded && <>
              <label htmlFor="ne-end">Ends</label>
              <div className="ev-when">
                <input id="ne-end" type="date" value={f.endDay} min={f.day} onChange={(e) => touch({ endDay: e.target.value })} />
                {!f.allDay && <input type="time" aria-label="Ends at" value={f.to} onChange={(e) => touch({ to: e.target.value })} />}
                {lengthWords && <span className="ev-to">{lengthWords}</span>}
              </div>
              <label htmlFor="ne-repeat">Repeat</label>
              <div className="ev-when">
                <select id="ne-repeat" className="ne-sel" value={f.repeat} disabled={!repeatReady || series?.copy?.repeatUnsupported} onChange={(e) => setRepeat({ repeat: e.target.value as RepeatChoice })}>
                  {REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {!repeatReady ? <span className="ev-to">Reading…</span> : series?.copy?.repeatUnsupported ? <span className="ev-to">Repeats in a way that can only be changed in its own calendar</span> : rep && f.repeat !== 'custom' && <span className="ev-to">{describeRepeat({ ...rep, until: undefined, count: undefined })}</span>}
              </div>
              {f.repeat === 'custom' && <>
                <span>Every</span>
                <div className="ev-when ne-custom">
                  <input type="number" aria-label="How often" min={1} max={99} value={custom.interval} onChange={(e) => setCustom({ interval: Number(e.target.value) })} />
                  <select aria-label="Unit" className="ne-sel" value={custom.freq} onChange={(e) => setCustom({ freq: e.target.value as Repeat['freq'] })}>
                    <option value="daily">{custom.interval === 1 ? 'day' : 'days'}</option>
                    <option value="weekly">{custom.interval === 1 ? 'week' : 'weeks'}</option>
                    <option value="monthly">{custom.interval === 1 ? 'month' : 'months'}</option>
                    <option value="yearly">{custom.interval === 1 ? 'year' : 'years'}</option>
                  </select>
                </div>
                {custom.freq === 'weekly' && <><span>On</span>
                  <div className="ne-days" role="group" aria-label="Days of the week">
                    {CODES.map((c, i) => {
                      const days = custom.days.length ? custom.days : [CODES[wd]];
                      const on = days.includes(c);
                      return <button key={c} type="button" aria-label={DAY_NAMES[i]} aria-pressed={on} className={on ? 'on' : ''} onClick={() => setCustom({ days: on ? days.filter((x) => x !== c) : [...days, c] })}>{DAY_SHORT[i]}</button>;
                    })}
                  </div></>}
                {(custom.freq === 'monthly' || custom.freq === 'yearly') && <><span>On</span>
                  <select aria-label="Which day" className="ne-sel" value={custom.monthBy} onChange={(e) => setCustom({ monthBy: e.target.value as Custom['monthBy'] })}>
                    <option value="date">{`The ${th(new Date(start).getDate())}`}</option>
                    <option value="weekday">{`The ${ORD[nthOf(start)]} ${DAY_NAMES[wd]}`}</option>
                  </select></>}
              </>}
              {f.repeat !== 'never' && <>
                <label htmlFor="ne-endrep">End repeat</label>
                <div className="ev-when">
                  <select id="ne-endrep" className="ne-sel" value={f.endRepeat} onChange={(e) => setRepeat({ endRepeat: e.target.value as Form['endRepeat'] })}>
                    <option value="never">Never</option>
                    <option value="on">On date</option>
                    <option value="after">After</option>
                  </select>
                  {f.endRepeat === 'on' && <input type="date" aria-label="Last repeat" value={f.until} min={f.day} onChange={(e) => setRepeat({ until: e.target.value })} />}
                  {f.endRepeat === 'after' && <><input type="number" className="ne-count" aria-label="How many times" min={1} max={999} value={f.count} onChange={(e) => setRepeat({ count: Number(e.target.value) })} /><span className="ev-to">times</span></>}
                </div>
              </>}
            </>}
            <label htmlFor="ne-cal">Calendar</label>
            <button type="button" id="ne-cal" className="ev-cal-btn" aria-haspopup="menu" disabled={!to} onClick={(e) => pickCalendar(e.currentTarget)}>
              <span className="menu-dot" style={{ background: toAcc?.colour }} /><span className="grow">{to ? to.calendarName : 'No calendar to use'}{toAcc ? <small> · {toAcc.label || toAcc.email}</small> : null}</span><Icon name="chevronDown" size={12} />
            </button>
            {calMenu.node}
            {expanded && <>
              <label htmlFor="ne-alert">Alert</label>
              <div className="ev-when">
                <select id="ne-alert" className="ne-sel" value={String(f.alert1)} onChange={(e) => { const v = e.target.value; set({ alert1: v === 'default' || v === 'none' ? v : Number(v), ...(v === 'default' || v === 'none' ? { alert2: null } : {}) }); }}>
                  {!editing && <option value="default">Calendar's own default</option>}
                  <option value="none">None</option>
                  {alertOptions.map((a) => <option key={a.mins} value={a.mins}>{a.label}</option>)}
                </select>
                {typeof f.alert1 === 'number' && f.alert2 === null && <button type="button" className="btn ghost small" onClick={() => set({ alert2: alertOptions.find((a) => a.mins !== f.alert1)?.mins ?? 0 })}>+ Add alert</button>}
              </div>
              {f.alert2 !== null && <>
                <span>Second alert</span>
                <div className="ev-when">
                  <select aria-label="Second alert" className="ne-sel" value={f.alert2} onChange={(e) => set({ alert2: Number(e.target.value) })}>
                    {alertOptions.map((a) => <option key={a.mins} value={a.mins}>{a.label}</option>)}
                  </select>
                  <button type="button" className="btn ghost small" aria-label="Remove the second alert" onClick={() => set({ alert2: null })}><Icon name="close" size={12} /></button>
                </div>
              </>}
              {toAcc?.kind === 'microsoft' && f.alert2 !== null && <><span /><span className="hint">Outlook keeps one alert, so only the earlier one is used.</span></>}
              <span>Invitees</span>
              <div className="ne-guests"><RecipientField label="Invitees" value={f.guests} contacts={contacts} onAdd={(list) => set({ guests: [...f.guests, ...list.filter((a) => !f.guests.some((g) => g.email.toLowerCase() === a.email.toLowerCase()))] })} onRemove={(email) => set({ guests: f.guests.filter((g) => g.email !== email) })} /></div>
              <label htmlFor="ne-where">Location</label>
              <LocationField value={f.location} onChange={(location) => set({ location })} />
              {(videoName || (event?.meetingUrl && !f.video)) && <><span>Video call</span>
                <div className="ev-when">
                  {f.video
                    ? <><span className="ne-video-on"><Icon name="check" size={13} /> {event?.meetingUrl && first.video ? `${meetingService(event.meetingUrl)} call` : `${videoName} added`}</span>
                      {event?.meetingUrl && first.video && event.htmlLink && <button type="button" className="btn ghost small" onClick={() => void openMeetingSettings(event.id, event.htmlLink)}>Meeting settings</button>}
                      <button type="button" className="btn ghost small" onClick={() => set({ video: false })}>Remove</button></>
                    : videoName && <button type="button" className="btn small ghost" onClick={() => set({ video: true })}><Icon name="plus" size={13} /> Add {videoName}</button>}
                  {!f.video && first.video && <span className="ev-to">The call will be removed</span>}
                  {f.video && !first.video && toAcc?.kind === 'microsoft' && <span className="ev-to">Work accounts only</span>}
                </div></>}
              <label htmlFor="ne-notes">Notes</label>
              <textarea id="ne-notes" rows={3} placeholder="Add notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
            </>}
          </div>
          {across && event && <p className="hint ev-note">Moves it to {accountName(to!.accountId)}: it's made there and taken out of {accountName(event.accountId)}.{guestCount ? ` Your ${guestCount === 1 ? 'guest gets' : `${guestCount} guests get`} a new invitation.` : ''}{event.recurring ? ' The series is copied from this one on.' : ''}</p>}
          {bad && <p className="hint ev-note bad">{bad}</p>}
          <div className="ev-actions">
            {!expanded && <button type="button" className="btn ghost" onClick={() => setExpanded(true)}>More options…</button>}
            {editing && <button type="button" className="btn ghost danger" onClick={async () => { if (await removeEvent(event!)) onClose(true); }}>Delete event</button>}
            <span className="grow" />
            <button type="button" className="btn" onClick={() => onClose(false)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={Boolean(bad) || !title || busy || !changed}>{busy ? (editing ? 'Saving…' : 'Adding…') : editing ? (across ? `Move to ${accountName(to!.accountId)}` : 'Save') : f.guests.length ? 'Add and send invitations' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * The Location box, with places used before in the person's own events offered as they type (and a few recent ones
 * when it's empty). Arrow keys move, Enter picks, Escape closes the list but not the form, Tab moves on.
 */
function LocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const storeEvents = useMail((s) => s.events);
  const copyEvents = useCalCache((s) => s.events);
  const contacts = useMail((s) => s.contacts);
  const places = useMemo(() => placesFromEvents([...storeEvents, ...copyEvents]), [storeEvents, copyEvents]);
  // Contacts' addresses only once something is typed, so the empty list stays your own recent places.
  const contactPlaces = useMemo(() => contacts.filter((c) => c.address).map((c) => ({ place: c.address!, name: c.name || c.email })), [contacts]);
  const list = useMemo(() => (open ? suggestPlaces(value, places, value.trim() ? contactPlaces : []) : []), [open, value, places, contactPlaces]);
  const showing = open && list.length > 0;
  const pick = (place: string) => { onChange(place); setOpen(false); setActive(-1); };

  return (
    <div className="ne-where">
      <input id="ne-where" placeholder="Add a place" autoComplete="off" value={value}
        role="combobox" aria-expanded={showing} aria-controls="ne-where-list" aria-autocomplete="list"
        aria-activedescendant={showing && active >= 0 ? `ne-where-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!showing) { setOpen(true); return; }
            e.preventDefault();
            const n = list.length;
            setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a <= 0 ? n - 1 : a - 1)));
          } else if (e.key === 'Enter' && showing && active >= 0) {
            e.preventDefault();
            pick(list[active].place);
          } else if (e.key === 'Escape' && showing) {
            // Closes the list only: the form listens for Escape on the window to close itself.
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setOpen(false);
            setActive(-1);
          } else if (e.key === 'Tab') {
            setOpen(false);
          }
        }} />
      {showing && (
        <div className="suggest" role="listbox" id="ne-where-list" aria-label="Places">
          {list.map((p, i) => (
            <button type="button" key={p.place} id={`ne-where-${i}`} role="option" aria-selected={i === active} tabIndex={-1}
              className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p.place); }}>
              <span>{p.place}</span>
              {p.name && <span className="sub"> {p.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
