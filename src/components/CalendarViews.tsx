// Day and Week calendar views: times down the side, all-day events across the top, working hours shaded, a line
// for now, and the month view, each event a coloured chip. Reminders switches between all three.
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { useMail } from '../lib/mail';
import { useCalCache, ensureCalendarRange, cachedBetween } from '../lib/calendarCache';
import { useSettings } from '../lib/settings';
import { dedupeEvents, visibleEvents } from '../lib/meetings';
import type { CalendarEvent } from '../lib/types';
import { chipBackground, useCalendarFilter } from './calendarBits';
import { useMenu } from './ui';
import { startNewEvent, useNewEvent } from './NewEvent';

const HOUR_PX = 48;
const DAY_MS = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const timeText = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const minutesOf = (hm: string) => { const [h, m] = hm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * The day you picked, shared by Day, Week and Month (and shown in the side panel), so switching view stays on it.
 * Undefined until you pick one: the views then start at today.
 */
export const useCalDay = create<{ day?: number }>(() => ({}));
export const selectDay = (ms: number | undefined) => useCalDay.setState({ day: ms === undefined ? undefined : midnight(ms) });
export const selectedOrToday = () => useCalDay.getState().day ?? midnight(Date.now());
/** Opens a day on its own, in Day view. */
export const openDay = (ms: number) => { selectDay(ms); useSettings.getState().set({ calendarMode: 'day' }); };

/** The ISO week number (weeks start on Monday; week 1 holds the first Thursday of the year). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

/** The first day of the week holding this day, at midnight. */
export function weekStartOf(d: Date, sunday: boolean): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - (sunday ? s.getDay() : (s.getDay() + 6) % 7));
  return s;
}

/** Side-by-side columns for events that overlap: each gets its lane and how many lanes its group needs. */
export function layoutLanes(events: { id: string; start: number; end: number }[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; end: number; lane: number }[] = [];
  let groupEnd = -Infinity;
  const close = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); for (const g of group) out.set(g.id, { lane: g.lane, lanes: n }); group = []; };
  for (const e of sorted) {
    const end = Math.max(e.end, e.start + 20 * 60000);
    if (e.start >= groupEnd) { close(); groupEnd = -Infinity; }
    const used = new Set(group.filter((g) => g.end > e.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ id: e.id, end, lane });
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return out;
}

function useColour() {
  const accounts = useMail((s) => s.accounts);
  return (id: string) => accounts.find((a) => a.id === id)?.colour || '#888';
}

/** One day or a week of times. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The calendar's title, which opens a quick way to jump: the year with arrows, its twelve months, a date box and
 * Today. Clicking away just closes it.
 */
export function JumpTitle({ label, at, onPick }: { label: React.ReactNode; at: Date; onPick: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(at.getFullYear());
  useEffect(() => { if (open) setYear(at.getFullYear()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const pick = (d: Date) => { onPick(d); setOpen(false); };
  const now = new Date();
  return (
    <span className="jump-wrap">
      <button className="jump-title" aria-expanded={open} title="Jump to a month or date" onClick={() => setOpen(!open)}>{label} <Icon name="chevronDown" size={13} /></button>
      {open && (
        <>
          <div className="click-away" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }} />
          <div className="jump-pop" role="dialog" aria-label="Jump to">
            <div className="jump-year">
              <button className="icon-btn" aria-label="Previous year" onClick={() => setYear(year - 1)}><Icon name="chevronLeft" size={15} /></button>
              <strong>{year}</strong>
              <button className="icon-btn" aria-label="Next year" onClick={() => setYear(year + 1)}><Icon name="chevronRight" size={15} /></button>
            </div>
            <div className="jump-months">
              {MONTHS.map((m, i) => (
                <button key={m} className={`${year === at.getFullYear() && i === at.getMonth() ? 'on' : ''} ${year === now.getFullYear() && i === now.getMonth() ? 'now' : ''}`} onClick={() => pick(new Date(year, i, 1))}>{m}</button>
              ))}
            </div>
            <div className="jump-date">
              <label htmlFor="jump-date">Go to date</label>
              <input id="jump-date" type="date" defaultValue={ymdOf(at)} onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v) { const [y, mo, d] = v.split('-').map(Number); pick(new Date(y, mo - 1, d)); } } }} onChange={(e) => { const v = e.target.value; if (v && v.length === 10) { const [y, mo, d] = v.split('-').map(Number); if (y > 1900) pick(new Date(y, mo - 1, d)); } }} />
              <button className="btn small" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); pick(d); }}>Today</button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/** Day, Week or Month: sits in the calendar's own header, so it's clearly for the calendar only. */
export function CalendarModes() {
  const mode = useSettings((s) => s.calendarMode);
  const set = useSettings((s) => s.set);
  return (
    <div className="seg cal-modes" role="group" aria-label="Calendar view">
      {(['day', 'week', 'month'] as const).map((m) => <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => set({ calendarMode: m })}>{m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Month'}</button>)}
    </div>
  );
}

export function TimeGridView({ mode, onPick, modes }: { mode: 'day' | 'week'; onPick: (e: CalendarEvent) => void; modes?: React.ReactNode }) {
  const near = useMail((s) => s.events);
  const { hidden, only } = useCalendarFilter();
  const sunday = useSettings((s) => s.weekStart) === 'sunday';
  const weekNumbers = useSettings((s) => s.weekNumbers);
  const hideWeekends = useSettings((s) => s.hideWeekends);
  const work = useSettings((s) => s.workHours);
  const colour = useColour();
  const picked = useCalDay((c) => c.day);
  const drafting = useNewEvent((s) => s.draft);
  const menu = useMenu();
  const [anchor, setAnchorNow] = useState(() => new Date(selectedOrToday()));
  // Moving in Day or Week moves the picked day with it, so Month and the side panel follow.
  const setAnchor = (d: Date) => { setAnchorNow(d); selectDay(d.getTime()); };
  const days = useMemo(() => {
    if (mode === 'day') return [anchor];
    const first = weekStartOf(anchor, sunday);
    const all = Array.from({ length: 7 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
    return hideWeekends ? all.filter((d) => d.getDay() !== 0 && d.getDay() !== 6) : all;
  }, [mode, anchor, sunday, hideWeekends]);
  const from = days[0].getTime();
  const to = days[days.length - 1].getTime() + DAY_MS;

  // The calendar copy on this computer shows these days at once; anything it lacks is fetched and kept.
  const copy = useCalCache((c) => c.events);
  useEffect(() => { void ensureCalendarRange(from, to); }, [from, to]);
  const events = useMemo(() => {
    const seen = new Set(near.map((e) => e.id));
    return dedupeEvents(visibleEvents([...near, ...cachedBetween(copy, from, to).filter((e) => !seen.has(e.id))], hidden, only)).filter((e) => e.end > from && e.start < to);
  }, [near, copy, hidden, only, from, to]);

  // Starts scrolled to the working day (or an hour before now, when that's later).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const now = new Date();
    const startMin = Math.max(minutesOf(work.from) - 30, now.getHours() * 60 - 60);
    const top = Math.max(0, Math.min(startMin, 15 * 60) / 60 * HOUR_PX);
    // After layout, so the grid has its height.
    requestAnimationFrame(() => { el.scrollTop = top; });
    setTimeout(() => { if (el.scrollTop < 1) el.scrollTop = top; }, 150);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const [, tick] = useState(0);
  useEffect(() => { const t = () => tick((x) => x + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);

  const step = (n: number) => { const d = new Date(anchor); d.setDate(d.getDate() + n * (mode === 'day' ? 1 : 7)); setAnchor(d); };
  const today = new Date().toDateString();
  const title = mode === 'day'
    ? anchor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${days[days.length - 1].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const workDay = (d: Date) => work.enabled && d.getDay() !== 0 && d.getDay() !== 6;
  // The half hour under the pointer, in a day's column.
  const timeAt = (d: Date, ev: React.MouseEvent<HTMLDivElement>) => {
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor((y / HOUR_PX) * 2) * 30));
    return d.getTime() + mins * 60000;
  };
  const dayMenu = (d: Date, at: number, ev: React.MouseEvent) => {
    ev.preventDefault();
    menu.open({ x: ev.clientX, y: ev.clientY }, [
      { label: 'New event', icon: 'plus', kbd: 'Ctrl+Alt+N', onClick: () => startNewEvent({ start: at }) },
      { label: 'New all-day event', onClick: () => startNewEvent({ day: d.getTime(), allDay: true }) },
      { divider: true },
      ...(mode === 'week' ? [{ label: 'Open day', onClick: () => openDay(d.getTime()) }] : []),
      { label: 'Go to today', onClick: () => { const t = new Date(); t.setHours(0, 0, 0, 0); setAnchor(t); } },
    ]);
  };
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="card tgrid">
      <div className="month-head">
        <button className="icon-btn" aria-label={mode === 'day' ? 'Previous day' : 'Previous week'} onClick={() => step(-1)}><Icon name="chevronLeft" size={16} /></button>
        <strong className="jump-host"><JumpTitle at={anchor} onPick={(d) => setAnchor(d)} label={<>{weekNumbers && <span className="tg-wk">Week {isoWeek(days[0])}</span>}{title}</>} /></strong>
        <button className="icon-btn" aria-label={mode === 'day' ? 'Next day' : 'Next week'} onClick={() => step(1)}><Icon name="chevronRight" size={16} /></button>
        {modes}
        <button className="btn ghost" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}>Today</button>
      </div>
      <div className="tg-head" style={{ gridTemplateColumns: cols }}>
        <div className="tg-corner">{weekNumbers && mode === 'week' ? `W${isoWeek(days[0])}` : ''}</div>
        {days.map((d) => (
          <button key={d.toISOString()} className={`tg-day ${d.toDateString() === today ? 'today' : ''} ${mode === 'week' && picked === d.getTime() ? 'picked' : ''}`} aria-pressed={mode === 'week' ? picked === d.getTime() : undefined}
            onClick={() => mode === 'week' && setAnchor(d)} onDoubleClick={() => mode === 'week' && openDay(d.getTime())} title={mode === 'week' ? 'Click to pick this day, double-click to open it' : undefined}>
            <span>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span> <b>{d.getDate()}</b>
          </button>
        ))}
      </div>
      <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
        <div className="tg-corner small">all day</div>
        {days.map((d) => {
          const start = d.getTime();
          const list = events.filter((e) => (e.allDay || e.end - e.start >= DAY_MS) && e.start < start + DAY_MS && e.end > start);
          return (
            <div key={d.toISOString()} className="tg-allday-cell">
              {list.map((e) => <button key={e.id} className="tg-chip" style={{ background: colour(e.accountId) }} title={e.title} onClick={() => onPick(e)}>{e.title}</button>)}
            </div>
          );
        })}
      </div>
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-hour-label" style={{ top: h * HOUR_PX }}>{h ? `${pad(h)}:00` : ''}</div>)}
          </div>
          {days.map((d) => {
            const start = d.getTime();
            const timed = events.filter((e) => !e.allDay && e.end - e.start < DAY_MS && e.start < start + DAY_MS && e.end > start);
            const lanes = layoutLanes(timed);
            const isToday = d.toDateString() === today;
            const nowTop = ((Date.now() - start) / 3600000) * HOUR_PX;
            return (
              <div key={d.toISOString()} className={`tg-col ${mode === 'week' && picked === d.getTime() ? 'picked' : ''}`} title="Double-click to make an event here"
                onClick={(ev) => { if (mode === 'week' && ev.target === ev.currentTarget) setAnchor(d); }}
                onDoubleClick={(ev) => { if (ev.target === ev.currentTarget || (ev.target as HTMLElement).classList.contains('tg-line') || (ev.target as HTMLElement).classList.contains('tg-work')) startNewEvent({ start: timeAt(d, ev) }); }}
                onContextMenu={(ev) => { if (!(ev.target as HTMLElement).closest('.tg-event')) dayMenu(d, timeAt(d, ev), ev); }}>
                {workDay(d) && <div className="tg-work" style={{ top: (minutesOf(work.from) / 60) * HOUR_PX, height: ((minutesOf(work.to) - minutesOf(work.from)) / 60) * HOUR_PX }} />}
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-line" style={{ top: h * HOUR_PX }} />)}
                {timed.map((e) => {
                  const s = Math.max(e.start, start);
                  const en = Math.min(e.end, start + DAY_MS);
                  const top = ((s - start) / 3600000) * HOUR_PX;
                  const height = Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2);
                  const l = lanes.get(e.id) || { lane: 0, lanes: 1 };
                  return (
                    <button key={e.id} className="tg-event" title={`${e.title}, ${timeText(e.start)} to ${timeText(e.end)}`}
                      style={{ top, height, left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)`, background: colour(e.accountId) }}
                      onClick={() => onPick(e)}>
                      <b>{e.title}</b>{height > 34 && <span>{timeText(e.start)} to {timeText(e.end)}</span>}
                    </button>
                  );
                })}
                {isToday && nowTop >= 0 && nowTop <= 24 * HOUR_PX && <div className="tg-now" style={{ top: nowTop }} aria-label={`Now, ${timeText(Date.now())}`} />}
                {drafting && !drafting.allDay && drafting.start < start + DAY_MS && drafting.end > start && (() => {
                  const s = Math.max(drafting.start, start);
                  const en = Math.min(drafting.end, start + DAY_MS);
                  return <div className="tg-ghost" aria-hidden="true" style={{ top: ((s - start) / 3600000) * HOUR_PX, height: Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2) }}><b>New event</b><span>{timeText(drafting.start)} to {timeText(drafting.end)}</span></div>;
                })()}
              </div>
            );
          })}
        </div>
      </div>
      {menu.node}
    </div>
  );
}

/** A month at a time, each event a coloured chip. */
export function MonthView({ onPick, modes }: { onPick: (e: CalendarEvent) => void; modes?: React.ReactNode }) {
  const nearEvents = useMail((s) => s.events);
  const { hidden, only } = useCalendarFilter();
  const sunday = useSettings((s) => s.weekStart) === 'sunday';
  const weekNumbers = useSettings((s) => s.weekNumbers);
  const hideWeekends = useSettings((s) => s.hideWeekends);
  const colour = useColour();
  const picked = useCalDay((c) => c.day);
  const drafting = useNewEvent((s) => s.draft);
  const menu = useMenu();
  const [month, setMonthNow] = useState(() => { const d = new Date(selectedOrToday()); d.setDate(1); return d; });
  // Moving month keeps the picked day on the same date in the new month (or its last day).
  const setMonth = (d: Date) => {
    setMonthNow(d);
    const was = useCalDay.getState().day;
    if (was === undefined) return;
    const day = Math.min(new Date(was).getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
    selectDay(new Date(d.getFullYear(), d.getMonth(), day).getTime());
  };
  const first = new Date(month);
  const offset = sunday ? first.getDay() : (first.getDay() + 6) % 7;
  const gridStart = new Date(first); gridStart.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  // The calendar copy on this computer covers the month at once; anything it lacks is fetched and kept.
  const copy = useCalCache((c) => c.events);
  const gridEnd = gridStart.getTime() + 42 * 86400000;
  useEffect(() => { void ensureCalendarRange(gridStart.getTime(), gridEnd); }, [month.getTime(), sunday]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => {
    const seen = new Set(nearEvents.map((e) => e.id));
    return visibleEvents([...nearEvents, ...cachedBetween(copy, gridStart.getTime(), gridEnd).filter((e) => !seen.has(e.id))], hidden, only);
  }, [nearEvents, copy, hidden, only, gridStart.getTime(), gridEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of dedupeEvents(events)) {
      // An event that runs over several days shows on each of them.
      const last = Math.max(e.start, e.end - (e.allDay ? 1 : 0));
      for (let t = new Date(e.start).setHours(0, 0, 0, 0); t <= last && t < e.start + 14 * 86400000; t += 86400000) {
        const k = new Date(t).toDateString();
        m.set(k, [...(m.get(k) || []), e]);
      }
    }
    for (const list of m.values()) list.sort((a, b) => a.start - b.start);
    return m;
  }, [events]);
  const shift = (n: number) => { const d = new Date(month); d.setMonth(d.getMonth() + n); setMonth(d); };
  const today = new Date().toDateString();
  return (
    <div className="card month">
      <div className="month-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="chevronLeft" size={16} /></button>
        <strong className="jump-host"><JumpTitle at={month} onPick={(d) => setMonth(new Date(d.getFullYear(), d.getMonth(), 1))} label={month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} /></strong>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><Icon name="chevronRight" size={16} /></button>
        {modes}
        <button className="btn ghost" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonthNow(d); selectDay(Date.now()); }}>Today</button>
      </div>
      <div className="month-grid" role="grid" style={{ gridTemplateColumns: `${weekNumbers ? '34px ' : ''}repeat(${hideWeekends ? 5 : 7}, minmax(0, 1fr))` }}>
        {weekNumbers && <div className="month-dow">Wk</div>}
        {(sunday ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).filter((n) => !hideWeekends || (n !== 'Sat' && n !== 'Sun')).map((n) => <div key={n} className="month-dow">{n}</div>)}
        {days.flatMap((d, i) => {
          const out: React.ReactNode[] = [];
          // The week number goes first in each row, for the Monday of that row.
          if (weekNumbers && i % 7 === 0) out.push(<div key={`wk${i}`} className="month-wk">{isoWeek(new Date(d.getTime() + (sunday ? 86400000 : 0)))}</div>);
          if (hideWeekends && (d.getDay() === 0 || d.getDay() === 6)) return out;
          const list = byDay.get(d.toDateString()) || [];
          out.push(
            <div key={d.toISOString()} className={`month-day ${d.getMonth() === month.getMonth() ? '' : 'other'} ${d.toDateString() === today ? 'today' : ''} ${picked === d.getTime() ? 'picked' : ''}`}
              role="gridcell" aria-selected={picked === d.getTime()} title="Click to pick this day, double-click to make an all-day event"
              onClick={() => selectDay(d.getTime())} onDoubleClick={() => startNewEvent({ day: d.getTime(), allDay: true })}
              onContextMenu={(ev) => {
                ev.preventDefault();
                selectDay(d.getTime());
                menu.open({ x: ev.clientX, y: ev.clientY }, [
                  { label: 'New event', icon: 'plus', kbd: 'Ctrl+Alt+N', onClick: () => startNewEvent({ day: d.getTime() }) },
                  { label: 'New all-day event', onClick: () => startNewEvent({ day: d.getTime(), allDay: true }) },
                  { divider: true },
                  { label: 'Open day', onClick: () => openDay(d.getTime()) },
                  { label: 'Go to today', onClick: () => { const t = new Date(); t.setDate(1); t.setHours(0, 0, 0, 0); setMonthNow(t); selectDay(Date.now()); } },
                ]);
              }}>
              <span className="n">{d.getDate()}</span>
              {drafting?.allDay && drafting.start <= d.getTime() && drafting.end > d.getTime() && <span className="chip month-ghost" aria-hidden="true">New event</span>}
              {list.slice(0, 3).map((e) => (
                <button key={e.id} className="chip" style={{ background: chipBackground(e.accountIds?.length ? e.accountIds : [e.accountId], colour) }} title={e.title} onClick={(ev) => { ev.stopPropagation(); selectDay(d.getTime()); onPick(e); }} onDoubleClick={(ev) => ev.stopPropagation()}>
                  {!e.allDay && <span>{timeText(e.start)} </span>}{e.title}
                </button>
              ))}
              {list.length > 3 && <button className="more" onClick={(ev) => { ev.stopPropagation(); openDay(d.getTime()); }} title="Show the whole day">+{list.length - 3} more</button>}
            </div>,
          );
          return out;
        })}
      </div>
      {menu.node}
    </div>
  );
}
