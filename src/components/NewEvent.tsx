// Making a new event: a quick pop-up (title, when, calendar) that grows into the full form with More options. Started
// from the + New event button, the picked day, a double-click or right-click on the calendar, or Ctrl+Alt+N.
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { en } from 'chrono-node';
import { Icon } from './Icon';
import { useDialogFocus, useMenu, type MenuItem } from './ui';
import { RecipientField } from './RecipientField';
import { useMail, calendarChoices, createNewEvent, deleteEvent, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { groupCalendars, calendarKey } from '../lib/meetings';
import { describeRepeat } from '../lib/recurrence';
import type { Address, EventCopy, Repeat } from '../lib/types';
import { useCalDay } from './CalendarViews';

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
  return <NewEventPopup key={seq} draft={draft} />;
}

type Target = { accountId: string; calendarName: string };

/** Calendars a new event can go in: writable ones, leaving out hidden calendars (unless they're in the group you're looking at). */
function choices(): { account: { id: string; label?: string; email: string; colour: string; kind: string }; calendars: string[] }[] {
  const s = useSettings.getState();
  const only = groupCalendars(s);
  const hidden = new Set(s.hiddenCalendars);
  return calendarChoices()
    .map((c) => ({ ...c, calendars: c.calendars.filter((n) => only?.has(`${c.account.id}|${n}`) || !hidden.has(`${c.account.id}|${n}`)) }))
    .filter((c) => c.calendars.length);
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

/** Words like "at 1pm" or "tomorrow" in the title: when they say, and the title without them. */
function readTitle(title: string, ref: number): { start?: number; hasTime: boolean; rest: string } | undefined {
  const r = en.GB.parse(title, new Date(ref), { forwardDate: true })[0];
  if (!r) return undefined;
  const hasTime = r.start.isCertain('hour');
  if (!hasTime && !r.start.isCertain('day') && !r.start.isCertain('weekday')) return undefined;
  const rest = (title.slice(0, r.index) + title.slice(r.index + r.text.length)).replace(/\s+(at|on|from)\s*$/i, '').replace(/\s{2,}/g, ' ').trim();
  return { start: r.start.date().getTime(), hasTime, rest };
}

function NewEventPopup({ draft }: { draft: NewEventDraft }) {
  const focusRef = useDialogFocus();
  const accounts = useMail((s) => s.accounts);
  const contacts = useMail((s) => s.contacts);
  const [expanded, setExpanded] = useState(false);
  const [to, setTo] = useState<Target | undefined>(() => defaultTarget());
  const toAcc = accounts.find((a) => a.id === to?.accountId);
  const calMenu = useMenu();
  const [busy, setBusy] = useState(false);
  // Once the time has been changed by hand, words in the title no longer move it.
  const timeTouched = useRef(false);
  const titleRead = useRef<{ rest: string } | undefined>(undefined);
  const [f, setF] = useState<Form>(() => ({
    title: '', day: ymdOf(draft.start), endDay: ymdOf(draft.allDay ? draft.end - 1 : draft.end), from: draft.allDay ? '09:00' : hmOf(draft.start), to: draft.allDay ? '10:00' : hmOf(draft.end), allDay: draft.allDay,
    // No days picked yet means the start's own day, so it follows the date.
    repeat: 'never', custom: { freq: 'weekly', interval: 1, days: [], monthBy: 'date' }, endRepeat: 'never', until: ymdOf(draft.start + 30 * DAY), count: 10,
    alert1: 'default', alert2: null, guests: [], location: '', video: false, notes: '',
  }));
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const start = f.allDay ? msAt(f.day) : msAt(f.day, f.from);
  const end = f.allDay ? msAt(f.endDay < f.day ? f.day : f.endDay) + DAY : msAt(f.endDay <= f.day ? f.day : f.endDay, f.to);
  const title = (titleRead.current?.rest ?? f.title).trim();
  const bad = !to ? 'There is no calendar this can go in yet.' : !title ? '' : end <= start ? 'It ends before it starts.' : f.endRepeat === 'on' && f.repeat !== 'never' && msAt(f.until) < midnight(start) ? 'The repeat ends before it starts.' : '';
  const rep = useMemo(() => repeatOf(f, start), [f, start]);
  const lengthWords = useMemo(() => { const m = Math.round((end - start) / 60000); if (f.allDay || m <= 0) return ''; return m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} ${m === 60 ? 'hour' : 'hours'}`; }, [start, end, f.allDay]);
  const videoName = toAcc?.kind === 'microsoft' ? 'Teams meeting' : toAcc?.kind === 'gmail' || toAcc?.kind === 'demo' ? 'Google Meet' : '';

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  // The placeholder in the calendar follows the time in the form.
  useEffect(() => { if (end > start) useNewEvent.setState({ draft: { start, end, allDay: f.allDay } }); }, [start, end, f.allDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTitle = (v: string) => {
    const patch: Partial<Form> = { title: v };
    titleRead.current = undefined;
    if (!timeTouched.current) {
      const r = readTitle(v, midnight(draft.start) + 12 * 3600000);
      if (r?.start !== undefined) {
        titleRead.current = { rest: r.rest };
        const len = Math.max(15 * 60000, msAt(f.endDay, f.to) - msAt(f.day, f.from));
        if (r.hasTime) { patch.day = ymdOf(r.start); patch.from = hmOf(r.start); patch.to = hmOf(r.start + len); patch.endDay = ymdOf(r.start + len); patch.allDay = false; }
        else { const keepFrom = f.from; const s = msAt(ymdOf(r.start), keepFrom); patch.day = ymdOf(s); patch.endDay = ymdOf(s + len); }
      }
    }
    set(patch);
  };
  const touch = (patch: Partial<Form>) => { timeTouched.current = true; titleRead.current = undefined; set(patch); };

  const pickCalendar = (el: HTMLElement) => {
    const items: MenuItem[] = [];
    for (const { account, calendars } of choices()) {
      items.push({ heading: account.label || account.email });
      for (const c of calendars) items.push({ label: c, dot: account.colour, active: to?.accountId === account.id && to.calendarName === c, onClick: () => { setTo({ accountId: account.id, calendarName: c }); if (account.kind !== toAcc?.kind) set({ video: false }); } });
    }
    calMenu.open(el.getBoundingClientRect(), items);
  };

  const save = async () => {
    if (bad || !title || busy || !to) return;
    const alerts = f.alert1 === 'default' ? undefined : f.alert1 === 'none' ? [] : [f.alert1, ...(f.alert2 !== null && f.alert2 !== f.alert1 ? [f.alert2] : [])];
    const copy: EventCopy = {
      title, start, end, allDay: f.allDay, location: f.location.trim() || undefined, description: f.notes.trim() || undefined,
      guests: f.guests.map((g) => ({ email: g.email, name: g.name })), video: Boolean(f.video && videoName), repeat: rep, alerts,
    };
    setBusy(true);
    try {
      const made = await createNewEvent(to, copy);
      useSettings.getState().set({ lastEventCalendar: calendarKey(to) }, { quiet: true });
      close();
      const accWords = toAcc ? toAcc.label || toAcc.email : '';
      const where = !accWords || [accWords.toLowerCase(), toAcc?.email.toLowerCase()].includes(to.calendarName.toLowerCase()) ? to.calendarName : `${to.calendarName} (${accWords})`;
      if (copy.guests.length) toast({ text: `"${title}" added to ${where}. Invitations are on their way.`, ttl: 6000 });
      else toast({ text: `"${title}" added to ${where}.`, ttl: 7000, undo: () => { void deleteEvent(made).catch((e) => toast({ text: `Couldn't take it out: ${e instanceof Error ? e.message : e}`, ttl: 8000 })); } });
    } catch (e) {
      setBusy(false);
      toast({ text: `Couldn't add it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    }
  };

  const alertList = f.allDay ? ALLDAY_ALERTS : TIMED_ALERTS;
  const custom = f.custom;
  const setCustom = (patch: Partial<Custom>) => set({ custom: { ...custom, ...patch } });
  const wd = new Date(start).getDay();

  return (
    <div className="ev-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !f.title.trim()) close(); }}>
      <div className={`ev-pop new-ev ${expanded ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label="New event" ref={focusRef}>
        <form className="ev-edit" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="ev-head">
            <span className="ev-bar" style={{ background: toAcc?.colour }} />
            <input className="ev-title-in" aria-label="Title" placeholder="New event" value={f.title} autoFocus onChange={(e) => onTitle(e.target.value)} />
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
                <select id="ne-repeat" className="ne-sel" value={f.repeat} onChange={(e) => set({ repeat: e.target.value as RepeatChoice })}>
                  {REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {rep && f.repeat !== 'custom' && <span className="ev-to">{describeRepeat({ ...rep, until: undefined, count: undefined })}</span>}
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
                  <select id="ne-endrep" className="ne-sel" value={f.endRepeat} onChange={(e) => set({ endRepeat: e.target.value as Form['endRepeat'] })}>
                    <option value="never">Never</option>
                    <option value="on">On date</option>
                    <option value="after">After</option>
                  </select>
                  {f.endRepeat === 'on' && <input type="date" aria-label="Last repeat" value={f.until} min={f.day} onChange={(e) => set({ until: e.target.value })} />}
                  {f.endRepeat === 'after' && <><input type="number" className="ne-count" aria-label="How many times" min={1} max={999} value={f.count} onChange={(e) => set({ count: Number(e.target.value) })} /><span className="ev-to">times</span></>}
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
                  <option value="default">Calendar's own default</option>
                  <option value="none">None</option>
                  {alertList.map((a) => <option key={a.mins} value={a.mins}>{a.label}</option>)}
                </select>
                {typeof f.alert1 === 'number' && f.alert2 === null && <button type="button" className="btn ghost small" aria-label="Add a second alert" title="Add a second alert" onClick={() => set({ alert2: alertList.find((a) => a.mins !== f.alert1)?.mins ?? 0 })}><Icon name="plus" size={13} /></button>}
              </div>
              {f.alert2 !== null && <>
                <span>Second alert</span>
                <div className="ev-when">
                  <select aria-label="Second alert" className="ne-sel" value={f.alert2} onChange={(e) => set({ alert2: Number(e.target.value) })}>
                    {alertList.map((a) => <option key={a.mins} value={a.mins}>{a.label}</option>)}
                  </select>
                  <button type="button" className="btn ghost small" aria-label="Remove the second alert" onClick={() => set({ alert2: null })}><Icon name="close" size={12} /></button>
                </div>
              </>}
              {toAcc?.kind === 'microsoft' && f.alert2 !== null && <><span /><span className="hint">Outlook keeps one alert, so only the earlier one is used.</span></>}
              <span>Invitees</span>
              <div className="ne-guests"><RecipientField label="Invitees" value={f.guests} contacts={contacts} onAdd={(list) => set({ guests: [...f.guests, ...list.filter((a) => !f.guests.some((g) => g.email.toLowerCase() === a.email.toLowerCase()))] })} onRemove={(email) => set({ guests: f.guests.filter((g) => g.email !== email) })} /></div>
              <label htmlFor="ne-where">Location</label>
              <input id="ne-where" placeholder="Add a place" value={f.location} onChange={(e) => set({ location: e.target.value })} />
              {videoName && <><span>Video call</span>
                <div className="ev-when">
                  <button type="button" className={`btn small ${f.video ? 'on' : 'ghost'}`} aria-pressed={f.video} onClick={() => set({ video: !f.video })}><Icon name={f.video ? 'check' : 'plus'} size={13} /> {f.video ? `${videoName} added` : `Add ${videoName}`}</button>
                  {f.video && toAcc?.kind === 'microsoft' && <span className="ev-to">Work accounts only</span>}
                </div></>}
              <label htmlFor="ne-notes">Notes</label>
              <textarea id="ne-notes" rows={3} placeholder="Add notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
            </>}
          </div>
          {bad && <p className="hint ev-note bad">{bad}</p>}
          <div className="ev-actions">
            {!expanded && <button type="button" className="btn ghost" onClick={() => setExpanded(true)}>More options…</button>}
            <span className="grow" />
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" disabled={Boolean(bad) || !title || busy}>{busy ? 'Adding…' : f.guests.length ? 'Add and send invitations' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
