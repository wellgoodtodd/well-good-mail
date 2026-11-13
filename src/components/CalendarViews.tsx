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
import { SelectionBar, clearSelected, selectionMenuItems, setSelected, toggleSelected, useEventSelection } from './EventSelection';
import { changeEvent } from '../lib/eventFlows';
import '../styles/calendar.css';
import { CalendarTask, useCalendarTasks } from './Tasks';
import { isOverdue } from '../lib/tasks';
import { useCalendarBusy } from '../lib/mail/calendar';

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

/** How tall an hour can be: from the whole day on screen down to 5-minute lines. */
export const ZOOMS = [30, 48, 72, 120, 240];
const zoomIndex = (px: number) => { let best = 0; ZOOMS.forEach((z, i) => { if (Math.abs(z - px) < Math.abs(ZOOMS[best] - px)) best = i; }); return best; };
/** Dragging snaps to 15 minutes, or 5 at the closest zoom. */
export const snapFor = (hourPx: number) => (hourPx >= ZOOMS[ZOOMS.length - 1] ? 5 : 15);
/** Lines inside each hour at this zoom: half hours, then quarters, then every 5 minutes. */
const subLines = (hourPx: number) => (hourPx >= 240 ? 12 : hourPx >= 120 ? 4 : hourPx >= 72 ? 2 : 1);

/** Moves an event by whole snaps, so one that starts at 10:05 stays 5 past as it moves (10:20, 10:35). */
export function snapMove(start: number, deltaMins: number, snap: number): number {
  return start + Math.round(deltaMins / snap) * snap * 60000;
}

/** The small zoom slider, for Day and Week. */
function ZoomControl() {
  const zoom = useSettings((s) => s.calendarZoom);
  const set = useSettings((s) => s.set);
  const i = zoomIndex(zoom);
  return (
    <span className="cal-zoom" title="Zoom (Ctrl + mouse wheel)">
      <button className="icon-btn small" aria-label="Zoom out" disabled={i === 0} onClick={() => set({ calendarZoom: ZOOMS[Math.max(0, i - 1)] })}>−</button>
      <input type="range" aria-label="Zoom" min={0} max={ZOOMS.length - 1} step={1} value={i} onChange={(e) => set({ calendarZoom: ZOOMS[Number(e.target.value)] })} />
      <button className="icon-btn small" aria-label="Zoom in" disabled={i === ZOOMS.length - 1} onClick={() => set({ calendarZoom: ZOOMS[Math.min(ZOOMS.length - 1, i + 1)] })}>+</button>
    </span>
  );
}

/** The header both views share: arrows either side of the title with Today next to them, and the views on the right. */
function CalHead({ title, onStep, onToday, prevLabel, nextLabel, modes, zoom }: { title: React.ReactNode; onStep: (n: number) => void; onToday: () => void; prevLabel: string; nextLabel: string; modes?: React.ReactNode; zoom?: boolean }) {
  return (
    <div className="month-head cal-head">
      <span className="cal-nav">
        <button className="icon-btn cal-arrow" aria-label={prevLabel} title={prevLabel} onClick={() => onStep(-1)}><Icon name="chevronLeft" size={16} /></button>
        <strong className="jump-host">{title}</strong>
        <button className="icon-btn cal-arrow" aria-label={nextLabel} title={nextLabel} onClick={() => onStep(1)}><Icon name="chevronRight" size={16} /></button>
        <button className="btn ghost" onClick={onToday}>Today</button>
      </span>
      <span className="grow" />
      {zoom && <ZoomControl />}
      {modes}
      <SavingBar />
    </div>
  );
}

/** A thin moving line under the header while a change is on its way to Google or Outlook. */
function SavingBar() {
  const saving = useCalendarBusy((s) => s.saving);
  return saving ? <div className="cal-saving" role="progressbar" aria-label="Saving the change" /> : null;
}

type Drag = { id: string; kind: 'move' | 'resize'; x0: number; y0: number; day0: number; start: number; end: number; moved: boolean };

/** Events you can drag: ones you made, in a calendar you can write to. */
const draggable = (e: CalendarEvent) => Boolean(e.canEdit);

export function TimeGridView({ mode, onPick, modes }: { mode: 'day' | 'week'; onPick: (e: CalendarEvent) => void; modes?: React.ReactNode }) {
  const near = useMail((s) => s.events);
  const { hidden, only } = useCalendarFilter();
  const sunday = useSettings((s) => s.weekStart) === 'sunday';
  const weekNumbers = useSettings((s) => s.weekNumbers);
  const hideWeekends = useSettings((s) => s.hideWeekends);
  const work = useSettings((s) => s.workHours);
  const HOUR_PX = useSettings((s) => s.calendarZoom) || 48;
  const colour = useColour();
  const picked = useCalDay((c) => c.day);
  const drafting = useNewEvent((s) => s.draft);
  const selected = useEventSelection((s) => s.ids);
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
  // Tasks: ones with no time in a strip under the all-day row (overdue ones on today), ones with a time as markers.
  const calTasks = useCalendarTasks();
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const stripFor = (day: number) => calTasks.filter((t) => !t.hasTime || isOverdue(t)).filter((t) => {
    const d = new Date(t.due!).setHours(0, 0, 0, 0);
    return isOverdue(t) ? day === todayMs : d === day;
  });
  const marksFor = (day: number) => calTasks.filter((t) => t.hasTime && !isOverdue(t) && t.due! >= day && t.due! < day + DAY_MS);
  const anyStrip = days.some((d) => stripFor(d.getTime()).length > 0);

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

  // Ctrl + mouse wheel zooms, keeping the time under the pointer where it is.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const cur = useSettings.getState().calendarZoom || 48;
      const i = zoomIndex(cur);
      const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (ev.deltaY < 0 ? 1 : -1)))];
      if (next === cur) return;
      const y = ev.clientY - el.getBoundingClientRect().top;
      const mins = ((el.scrollTop + y) / cur) * 60;
      useSettings.getState().set({ calendarZoom: next });
      requestAnimationFrame(() => { el.scrollTop = (mins / 60) * next - y; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const [, tick] = useState(0);
  useEffect(() => { const t = () => tick((x) => x + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);

  // ----- dragging an event, its handle, or a box round several -----
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  // The click that ends a drag (or a Ctrl-click) is ignored, and only that one: any later click works as normal.
  const holdClick = () => { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 80); };
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const snap = snapFor(HOUR_PX);
  const dayUnder = (x: number, y: number): number | undefined => {
    const el = document.elementFromPoint(x, y)?.closest('.tg-col') as HTMLElement | null;
    return el?.dataset.day ? Number(el.dataset.day) : undefined;
  };
  const startDrag = (e: CalendarEvent, kind: Drag['kind'], ev: React.PointerEvent, day0: number) => {
    if (ev.button !== 0) return;
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); toggleSelected(e.id); justDragged.current = true; return; }
    if (!draggable(e) || e.allDay) return;
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    const d: Drag = { id: e.id, kind, x0: ev.clientX, y0: ev.clientY, day0, start: e.start, end: e.end, moved: false };
    dragRef.current = d;
    setDrag(d);
  };
  const onDragMove = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = ev.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 4 && Math.abs(ev.clientX - d.x0) < 4) return;
    const e = events.find((x) => x.id === d.id);
    if (!e) return;
    const mins = (dy / HOUR_PX) * 60;
    let next: Drag;
    if (d.kind === 'resize') {
      const end = Math.max(e.start + snap * 60000, snapMove(e.end, mins, snap));
      next = { ...d, moved: true, start: e.start, end };
    } else {
      const day = mode === 'week' ? dayUnder(ev.clientX, ev.clientY) ?? d.day0 : d.day0;
      const shifted = new Date(e.start); shifted.setDate(shifted.getDate() + Math.round((day - d.day0) / DAY_MS));
      const start = snapMove(shifted.getTime(), mins, snap);
      next = { ...d, moved: true, start, end: start + (e.end - e.start) };
    }
    dragRef.current = next;
    setDrag(next);
  };
  const endDrag = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setDrag(null); return; }
    holdClick();
    const e = events.find((x) => x.id === d.id);
    if (!e || (d.start === e.start && d.end === e.end)) { setDrag(null); return; }
    // The event stays where it was dropped while the questions are asked and the change is saved.
    await changeEvent(e, { start: d.start, end: d.end });
    setDrag(null);
  };
  const onBodyDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (ev.button !== 0 || t.closest('.tg-event') || !t.closest('.tg-col')) return;
    const r = body.current!.getBoundingClientRect();
    setLasso({ x0: ev.clientX - r.left, y0: ev.clientY - r.top, x1: ev.clientX - r.left, y1: ev.clientY - r.top, add: ev.ctrlKey || ev.metaKey });
    body.current!.setPointerCapture?.(ev.pointerId);
  };
  const onBodyMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    if (!lasso) return;
    const r = body.current!.getBoundingClientRect();
    setLasso({ ...lasso, x1: ev.clientX - r.left, y1: ev.clientY - r.top });
  };
  const onBodyUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    if (!lasso) return;
    const box = { l: Math.min(lasso.x0, lasso.x1), r: Math.max(lasso.x0, lasso.x1), t: Math.min(lasso.y0, lasso.y1), b: Math.max(lasso.y0, lasso.y1) };
    setLasso(null);
    if (box.r - box.l < 6 && box.b - box.t < 6) {
      // A plain click on empty space lets go of picked events (and in Week view picks that day). The body holds the
      // pointer while a box might be drawn, so the click lands here rather than on the day's column.
      if (!lasso.add) clearSelected();
      const day = dayUnder(ev.clientX, ev.clientY);
      if (mode === 'week' && day !== undefined && !lasso.add) setAnchor(new Date(day));
      return;
    }
    holdClick();
    const base = body.current!.getBoundingClientRect();
    const hit: string[] = [];
    body.current!.querySelectorAll<HTMLElement>('.tg-event[data-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const l = r.left - base.left, t = r.top - base.top;
      if (l < box.r && l + r.width > box.l && t < box.b && t + r.height > box.t) hit.push(el.dataset.id!);
    });
    setSelected(hit, lasso.add);
  };

  // ----- dragging an all-day event to another day, in the all-day row -----
  const [dayDrag, setDayDrag] = useState<{ id: string; day0: number; day: number; x0: number; moved: boolean } | null>(null);
  const dayDragRef = useRef<typeof dayDrag>(null);
  const dayDragging = Boolean(dayDrag);
  useEffect(() => {
    if (!dayDragging) return;
    const move = (ev: PointerEvent) => {
      const d = dayDragRef.current;
      if (!d) return;
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 5) return;
      const cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-allday], .tg-col') as HTMLElement | null;
      const day = cell ? Number(cell.dataset.allday || cell.dataset.day) : d.day;
      const next = { ...d, moved: true, day: Number.isFinite(day) ? day : d.day };
      dayDragRef.current = next;
      setDayDrag(next);
    };
    const up = async () => {
      const d = dayDragRef.current;
      dayDragRef.current = null;
      if (!d || !d.moved) { setDayDrag(null); return; }
      holdClick();
      const e = events.find((x) => x.id === d.id);
      const days = Math.round((d.day - d.day0) / DAY_MS);
      if (e && days) {
        const s = new Date(e.start); s.setDate(s.getDate() + days);
        const en = new Date(e.end); en.setDate(en.getDate() + days);
        await changeEvent(e, { start: s.getTime(), end: en.getTime() });
      }
      setDayDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dayDragging, events]);

  // While dragging, the window follows the pointer: the event is drawn again in other columns as it moves.
  const live = useRef({ move: onDragMove, end: endDrag });
  live.current = { move: onDragMove, end: endDrag };
  const dragging = Boolean(drag);
  useEffect(() => {
    if (!dragging) return;
    const move = (ev: PointerEvent) => live.current.move(ev as unknown as React.PointerEvent);
    const up = () => { if (dragRef.current) void live.current.end(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

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
    if (useEventSelection.getState().ids.length > 1) { menu.open({ x: ev.clientX, y: ev.clientY }, selectionMenuItems((items) => menu.open({ x: ev.clientX, y: ev.clientY }, items))); return; }
    menu.open({ x: ev.clientX, y: ev.clientY }, [
      { label: 'New event', icon: 'plus', kbd: 'Ctrl+Alt+N', onClick: () => startNewEvent({ start: at }) },
      { label: 'New all-day event', onClick: () => startNewEvent({ day: d.getTime(), allDay: true }) },
      { divider: true },
      ...(mode === 'week' ? [{ label: 'Open day', onClick: () => openDay(d.getTime()) }] : []),
      { label: 'Go to today', onClick: () => { const t = new Date(); t.setHours(0, 0, 0, 0); setAnchor(t); } },
    ]);
  };
  // Right-click an event: the quick edit, or the group's menu when several are picked and it's one of them.
  const eventMenu = (e: CalendarEvent, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const ids = useEventSelection.getState().ids;
    if (ids.length > 1 && ids.includes(e.id)) { menu.open({ x: ev.clientX, y: ev.clientY }, selectionMenuItems((items) => menu.open({ x: ev.clientX, y: ev.clientY }, items))); return; }
    onPick(e);
  };
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;
  const lines = subLines(HOUR_PX);
  const shown = (e: CalendarEvent) => (drag && drag.moved && drag.id === e.id ? { ...e, start: drag.start, end: drag.end } : e);

  return (
    <div className={`card tgrid ${drag?.moved ? 'dragging' : ''}`}>
      <CalHead title={<JumpTitle at={anchor} onPick={(d) => setAnchor(d)} label={<>{weekNumbers && <span className="tg-wk">Week {isoWeek(days[0])}</span>}{title}</>} />}
        onStep={step} onToday={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}
        prevLabel={mode === 'day' ? 'Previous day' : 'Previous week'} nextLabel={mode === 'day' ? 'Next day' : 'Next week'} modes={modes} zoom />
      <SelectionBar />
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
            <div key={d.toISOString()} data-allday={start} className={`tg-allday-cell ${dayDrag?.moved && dayDrag.day === start && dayDrag.day !== dayDrag.day0 ? 'drop' : ''}`}
              onClick={(ev) => { if (ev.target === ev.currentTarget) clearSelected(); }}>
              {list.map((e) => {
                const can = draggable(e) && e.allDay;
                return <button key={e.id} className={`tg-chip ${can ? 'can-drag' : ''} ${dayDrag?.moved && dayDrag.id === e.id ? 'lifted' : ''} ${selected.includes(e.id) ? 'selected' : ''}`} style={{ background: colour(e.accountId) }} title={can ? `${e.title}. Drag to another day to move it.` : e.title}
                  onPointerDown={(ev) => { if (can && ev.button === 0 && !ev.ctrlKey && !ev.metaKey) { const dd = { id: e.id, day0: start, day: start, x0: ev.clientX, moved: false }; dayDragRef.current = dd; setDayDrag(dd); } }}
                  onClick={(ev) => { if (justDragged.current) { justDragged.current = false; return; } if (ev.ctrlKey || ev.metaKey) { toggleSelected(e.id); return; } clearSelected(); onPick(e); }} onContextMenu={(ev) => eventMenu(e, ev)}>{e.title}</button>;
              })}
            </div>
          );
        })}
      </div>
      {anyStrip && (
        <div className="tg-allday tg-tasks" style={{ gridTemplateColumns: cols }}>
          <div className="tg-corner small">tasks</div>
          {days.map((d) => {
            const list = stripFor(d.getTime());
            return (
              <div key={d.toISOString()} className="tg-allday-cell">
                {list.slice(0, 2).map((t) => <CalendarTask key={t.id} task={t} className="cal-task-chip" />)}
                {list.length > 2 && <button className="cal-task-more" onClick={() => useSettings.getState().set({ remindersView: 'tasks', tasksPlace: 'today' })}>+{list.length - 2} more</button>}
              </div>
            );
          })}
        </div>
      )}
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" ref={body} style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}
          onPointerDown={onBodyDown} onPointerMove={onBodyMove} onPointerUp={onBodyUp} onPointerCancel={() => { dragRef.current = null; setDrag(null); setLasso(null); }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="tg-hour-label" style={{ top: h * HOUR_PX }}>{h ? `${pad(h)}:00` : ''}</div>)}
            {lines > 1 && HOUR_PX >= 120 && Array.from({ length: 24 * lines }, (_, i) => i % lines === 0 ? null : <div key={`s${i}`} className="tg-hour-label sub" style={{ top: (i / lines) * HOUR_PX }}>{`${pad(Math.floor(i / lines))}:${pad((i % lines) * (60 / lines))}`}</div>)}
          </div>
          {days.map((d) => {
            const start = d.getTime();
            const timed = events.map(shown).filter((e) => !e.allDay && e.end - e.start < DAY_MS && e.start < start + DAY_MS && e.end > start);
            const lanes = layoutLanes(timed);
            const isToday = d.toDateString() === today;
            const nowTop = ((Date.now() - start) / 3600000) * HOUR_PX;
            const ghostOf = drag?.moved ? events.find((x) => x.id === drag.id && !x.allDay && x.start < start + DAY_MS && x.end > start && (x.start !== drag.start || x.end !== drag.end)) : undefined;
            return (
              <div key={d.toISOString()} data-day={start} className={`tg-col ${mode === 'week' && picked === d.getTime() ? 'picked' : ''}`} title="Double-click to make an event here, or drag across events to pick them"
                onClick={(ev) => { if (justDragged.current) { justDragged.current = false; return; } if (!(ev.target as HTMLElement).closest('.tg-event')) { clearSelected(); if (mode === 'week') setAnchor(d); } }}
                onDoubleClick={(ev) => { if (ev.target === ev.currentTarget || (ev.target as HTMLElement).classList.contains('tg-line') || (ev.target as HTMLElement).classList.contains('tg-work')) startNewEvent({ start: timeAt(d, ev) }); }}
                onContextMenu={(ev) => { if (!(ev.target as HTMLElement).closest('.tg-event')) dayMenu(d, timeAt(d, ev), ev); }}>
                {workDay(d) && <div className="tg-work" style={{ top: (minutesOf(work.from) / 60) * HOUR_PX, height: ((minutesOf(work.to) - minutesOf(work.from)) / 60) * HOUR_PX }} />}
                {Array.from({ length: 24 * lines }, (_, i) => <div key={i} className={`tg-line ${i % lines ? 'sub' : ''}`} style={{ top: (i / lines) * HOUR_PX }} />)}
                {ghostOf && (() => {
                  const s = Math.max(ghostOf.start, start);
                  const en = Math.min(ghostOf.end, start + DAY_MS);
                  return <div className="tg-event tg-was" aria-hidden="true" style={{ top: ((s - start) / 3600000) * HOUR_PX, height: Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2), left: 2, right: 2, background: colour(ghostOf.accountId) }}><b>{ghostOf.title}</b></div>;
                })()}
                {timed.map((e) => {
                  const s = Math.max(e.start, start);
                  const en = Math.min(e.end, start + DAY_MS);
                  const top = ((s - start) / 3600000) * HOUR_PX;
                  const height = Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2);
                  const l = lanes.get(e.id) || { lane: 0, lanes: 1 };
                  const moving = drag?.moved && drag.id === e.id;
                  const can = draggable(e);
                  return (
                    <div key={e.id} role="button" tabIndex={0} data-id={e.id} className={`tg-event ${can ? 'can-drag' : ''} ${moving ? 'moving' : ''} ${selected.includes(e.id) ? 'selected' : ''}`}
                      title={`${e.title}, ${timeText(e.start)} to ${timeText(e.end)}${can ? '. Drag to move it, or drag its bottom edge to change how long it is.' : ''}`}
                      style={{ top, height, left: moving ? 2 : `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: moving ? 'calc(100% - 4px)' : `calc(${100 / l.lanes}% - 4px)`, background: colour(e.accountId) }}
                      onPointerDown={(ev) => startDrag(e, 'move', ev, start)}
                      onClick={() => { if (justDragged.current) { justDragged.current = false; return; } clearSelected(); onPick(e); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(e); } }}
                      onContextMenu={(ev) => eventMenu(e, ev)}>
                      <b>{e.title}</b>{height > 34 && <span>{timeText(e.start)} to {timeText(e.end)}</span>}
                      {can && e.end <= start + DAY_MS && <span className="tg-handle" aria-hidden="true" onPointerDown={(ev) => startDrag(e, 'resize', ev, start)} />}
                      {moving && <span className="tg-drag-time">{timeText(e.start)} to {timeText(e.end)}</span>}
                    </div>
                  );
                })}
                {marksFor(start).map((t) => <CalendarTask key={t.id} task={t} className="cal-task-mark" style={{ top: ((t.due! - start) / 3600000) * HOUR_PX - 10 }} />)}
                {isToday && nowTop >= 0 && nowTop <= 24 * HOUR_PX && <div className="tg-now" style={{ top: nowTop }} aria-label={`Now, ${timeText(Date.now())}`} />}
                {drafting && !drafting.allDay && drafting.start < start + DAY_MS && drafting.end > start && (() => {
                  const s = Math.max(drafting.start, start);
                  const en = Math.min(drafting.end, start + DAY_MS);
                  return <div className="tg-ghost" aria-hidden="true" style={{ top: ((s - start) / 3600000) * HOUR_PX, height: Math.max(20, ((en - s) / 3600000) * HOUR_PX - 2) }}><b>New event</b><span>{timeText(drafting.start)} to {timeText(drafting.end)}</span></div>;
                })()}
              </div>
            );
          })}
          {lasso && <div className="tg-lasso" style={{ left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0) }} />}
        </div>
      </div>
      {menu.node}
    </div>
  );
}

/** A month at a time, each event a coloured chip. Chips can be dragged to another day. */
export function MonthView({ onPick, modes }: { onPick: (e: CalendarEvent) => void; modes?: React.ReactNode }) {
  const nearEvents = useMail((s) => s.events);
  const { hidden, only } = useCalendarFilter();
  const sunday = useSettings((s) => s.weekStart) === 'sunday';
  const weekNumbers = useSettings((s) => s.weekNumbers);
  const hideWeekends = useSettings((s) => s.hideWeekends);
  const colour = useColour();
  const picked = useCalDay((c) => c.day);
  const drafting = useNewEvent((s) => s.draft);
  const selected = useEventSelection((s) => s.ids);
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

  // Dragging a chip: it lifts and follows the pointer, and the day under it is outlined. Only the day changes.
  const [drag, setDrag] = useState<{ id: string; day0: number; x: number; y: number; x0: number; y0: number; over?: number; moved: boolean } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const justDragged = useRef(false);
  // The click that ends a drag (or a Ctrl-click) is ignored, and only that one: any later click works as normal.
  const holdClick = () => { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 80); };
  const shiftDays = (ms: number, n: number) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
  const dragging = drag?.moved ? events.find((e) => e.id === drag.id) : undefined;
  const moveTo = dragging && drag?.over !== undefined ? Math.round((drag.over - drag.day0) / DAY_MS) : 0;

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e0 of dedupeEvents(events)) {
      const e = dragging && e0.id === dragging.id && moveTo ? { ...e0, start: shiftDays(e0.start, moveTo), end: shiftDays(e0.end, moveTo) } : e0;
      // An event that runs over several days shows on each of them.
      const last = Math.max(e.start, e.end - (e.allDay ? 1 : 0));
      for (let t = new Date(e.start).setHours(0, 0, 0, 0); t <= last && t < e.start + 14 * 86400000; t += 86400000) {
        const k = new Date(t).toDateString();
        m.set(k, [...(m.get(k) || []), e]);
      }
    }
    for (const list of m.values()) list.sort((a, b) => a.start - b.start);
    return m;
  }, [events, dragging, moveTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (n: number) => { const d = new Date(month); d.setMonth(d.getMonth() + n); setMonth(d); };
  const today = new Date().toDateString();
  const monthTasks = useCalendarTasks();
  const tasksOn = (day: number) => monthTasks.filter((t) => new Date(t.due!).setHours(0, 0, 0, 0) === day && !t.done).length;

  const chipDown = (e: CalendarEvent, ev: React.PointerEvent, day0: number) => {
    if (ev.button !== 0) return;
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); toggleSelected(e.id); justDragged.current = true; return; }
    if (!draggable(e)) return;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    const d = { id: e.id, day0, x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, moved: false };
    dragRef.current = d;
    setDrag(d);
  };
  const chipMove = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(ev.clientX - d.x0) < 5 && Math.abs(ev.clientY - d.y0) < 5) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.month-day') as HTMLElement | null;
    const next = { ...d, moved: true, x: ev.clientX, y: ev.clientY, over: el?.dataset.day ? Number(el.dataset.day) : d.over };
    dragRef.current = next;
    setDrag(next);
  };
  const chipUp = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setDrag(null); return; }
    holdClick();
    const e = events.find((x) => x.id === d.id);
    const n = d.over !== undefined ? Math.round((d.over - d.day0) / DAY_MS) : 0;
    if (!e || !n) { setDrag(null); return; }
    await changeEvent(e, { start: shiftDays(e.start, n), end: shiftDays(e.end, n) });
    setDrag(null);
  };
  const liveM = useRef({ move: chipMove, end: chipUp });
  liveM.current = { move: chipMove, end: chipUp };
  const holding = Boolean(drag);
  useEffect(() => {
    if (!holding) return;
    const move = (ev: PointerEvent) => liveM.current.move(ev as unknown as React.PointerEvent);
    const up = () => { if (dragRef.current) void liveM.current.end(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [holding]);
  const chipMenu = (e: CalendarEvent, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const ids = useEventSelection.getState().ids;
    if (ids.length > 1 && ids.includes(e.id)) { menu.open({ x: ev.clientX, y: ev.clientY }, selectionMenuItems((items) => menu.open({ x: ev.clientX, y: ev.clientY }, items))); return; }
    onPick(e);
  };

  return (
    <div className="month-wrap">
    <div className={`card month ${drag?.moved ? 'dragging' : ''}`}>
      <CalHead title={<JumpTitle at={month} onPick={(d) => setMonth(new Date(d.getFullYear(), d.getMonth(), 1))} label={month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} />}
        onStep={shift} onToday={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonthNow(d); selectDay(undefined); }}
        prevLabel="Previous month" nextLabel="Next month" modes={modes} />
      <SelectionBar />
      <div className="month-grid" role="grid" style={{ gridTemplateColumns: `${weekNumbers ? '34px ' : ''}repeat(${hideWeekends ? 5 : 7}, minmax(0, 1fr))` }}
        onPointerCancel={() => { dragRef.current = null; setDrag(null); }}>
        {weekNumbers && <div className="month-dow">Wk</div>}
        {(sunday ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).filter((n) => !hideWeekends || (n !== 'Sat' && n !== 'Sun')).map((n) => <div key={n} className="month-dow">{n}</div>)}
        {days.flatMap((d, i) => {
          const out: React.ReactNode[] = [];
          // The week number goes first in each row, for the Monday of that row.
          if (weekNumbers && i % 7 === 0) out.push(<div key={`wk${i}`} className="month-wk">{isoWeek(new Date(d.getTime() + (sunday ? 86400000 : 0)))}</div>);
          if (hideWeekends && (d.getDay() === 0 || d.getDay() === 6)) return out;
          const list = byDay.get(d.toDateString()) || [];
          const over = drag?.moved && drag.over === d.getTime();
          out.push(
            <div key={d.toISOString()} data-day={d.getTime()} className={`month-day ${d.getMonth() === month.getMonth() ? '' : 'other'} ${d.toDateString() === today ? 'today' : ''} ${picked === d.getTime() ? 'picked' : ''} ${over ? 'drop' : ''}`}
              role="gridcell" aria-selected={picked === d.getTime()} title="Click to pick this day (click again to put it away), double-click to make an all-day event"
              onClick={() => { if (justDragged.current) { justDragged.current = false; return; } clearSelected(); selectDay(picked === d.getTime() ? undefined : d.getTime()); }} onDoubleClick={() => startNewEvent({ day: d.getTime(), allDay: true })}
              onContextMenu={(ev) => {
                ev.preventDefault();
                if (useEventSelection.getState().ids.length > 1) { menu.open({ x: ev.clientX, y: ev.clientY }, selectionMenuItems((items) => menu.open({ x: ev.clientX, y: ev.clientY }, items))); return; }
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
                <button key={e.id} className={`chip ${draggable(e) ? 'can-drag' : ''} ${drag?.moved && drag.id === e.id ? 'lifted' : ''} ${selected.includes(e.id) ? 'selected' : ''}`} style={{ background: chipBackground(e.accountIds?.length ? e.accountIds : [e.accountId], colour) }} title={draggable(e) ? `${e.title}. Drag to another day to move it.` : e.title}
                  onPointerDown={(ev) => chipDown(e, ev, d.getTime())}
                  onClick={(ev) => { ev.stopPropagation(); if (justDragged.current) { justDragged.current = false; return; } clearSelected(); selectDay(d.getTime()); onPick(e); }}
                  onDoubleClick={(ev) => ev.stopPropagation()} onContextMenu={(ev) => chipMenu(e, ev)}>
                  {!e.allDay && <span>{timeText(e.start)} </span>}{e.title}
                </button>
              ))}
              {list.length > 3 && <button className="more" onClick={(ev) => { ev.stopPropagation(); openDay(d.getTime()); }} title="Show the whole day">+{list.length - 3} more</button>}
              {tasksOn(d.getTime()) > 0 && <span className="cal-task-count">✓ {tasksOn(d.getTime())} {tasksOn(d.getTime()) === 1 ? 'task' : 'tasks'}</span>}
            </div>,
          );
          return out;
        })}
      </div>
      {menu.node}
    </div>
    </div>
  );
}
