// Settings › Calendar.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useSettings } from '../../lib/settings';
import { openAlertSettings } from '../../lib/settingsNav';
import { Row, Check } from '../ui';
import { CalendarGroupsCard } from '../CalendarGroups';
import { TaskDefaults } from './TaskDefaults';

export const MINUTE_CHOICES = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
export const timeLabel = (n: number) => (n >= 120 && n % 60 === 0 ? `${n / 60} hours` : `${n} ${n === 1 ? 'minute' : 'minutes'}`);

/** A time before a meeting. Pick from the list, or type a number and choose minutes or hours. The list opens upwards when it would run off the bottom of the window. */
export function MinutesPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [unit, setUnit] = useState<'minutes' | 'hours'>(value >= 120 && value % 60 === 0 ? 'hours' : 'minutes');
  const per = unit === 'hours' ? 60 : 1;
  const top = unit === 'hours' ? 3 : 180;
  const show = (n: number) => String(Math.max(1, Math.round(n / per)));
  const [text, setText] = useState(show(value));
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setText(show(value)), [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  });
  const choices = unit === 'hours' ? [60, 120, 180] : MINUTE_CHOICES;
  const shown = typed && text ? choices.filter((n) => String(n / per).startsWith(text)) : choices;
  const openList = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) { const below = window.innerHeight - r.bottom; setUp(below < 280 && r.top > below); }
    setOpen(true);
  };
  const close = () => { setOpen(false); setTyped(false); const n = Number(text); if (!(Number.isInteger(n) && n >= 1 && n <= top)) setText(show(value)); };
  const pick = (n: number) => { if (n >= 120 && n % 60 === 0) setUnit('hours'); else if (unit === 'hours' && n < 120) setUnit('minutes'); onChange(n); setText(show(n)); setOpen(false); setTyped(false); };
  const changeUnit = (u: 'minutes' | 'hours') => {
    setUnit(u);
    if (u === 'hours') onChange(Math.min(3, Math.max(1, Math.round(value / 60))) * 60);
  };
  return (
    <>
      <div className="mins-box" ref={box}>
        <input
          className="mins-input" type="text" inputMode="numeric" role="combobox" aria-expanded={open} aria-label={`${label}: time before`} aria-autocomplete="list"
          value={text}
          onFocus={(e) => { openList(); e.target.select(); }}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setText(v); setTyped(true); openList(); setActive(0); const n = Number(v); if (v && n >= 1 && n <= top) onChange(n * per); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); openList(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[active] !== undefined && typed) pick(shown[active]); else close(); }
            else if (e.key === 'Escape') close();
          }}
        />
        <button type="button" className="mins-arrow" tabIndex={-1} aria-label="Show common times" onClick={() => { setTyped(false); if (open) setOpen(false); else openList(); }}><Icon name="chevronDown" size={14} /></button>
        {open && (
          <ul className={`mins-list ${up ? 'up' : ''}`} role="listbox" aria-label="Time before the meeting">
            {shown.length === 0 && <li className="none">No match. Up to {top} {unit} is fine.</li>}
            {shown.map((n, i) => (
              <li key={n} role="option" aria-selected={n === value} className={`${n === value ? 'sel' : ''} ${typed && i === active ? 'act' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(n); }}>{timeLabel(n)}</li>
            ))}
            <li className="none">Or type a number, up to {top} {unit}</li>
          </ul>
        )}
      </div>
      <select className="mins-unit" aria-label={`${label}: minutes or hours`} value={unit} onChange={(e) => changeUnit(e.target.value as 'minutes' | 'hours')}>
        <option value="minutes">{Number(text) === 1 && unit === 'minutes' ? 'minute' : 'minutes'}</option>
        <option value="hours">{Number(text) === 1 && unit === 'hours' ? 'hour' : 'hours'}</option>
      </select>
    </>
  );
}

export function RemindersTab() {
  const s = useSettings();
  return (
    <>
      <h1>Calendar &amp; Reminders</h1>
      <section className="set-section">
        <h2>Calendar</h2>
        <Row label="Week starts on" htmlFor="weekstart">
          <select id="weekstart" value={s.weekStart} onChange={(e) => s.set({ weekStart: e.target.value as 'monday' | 'sunday' })}>
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
        </Row>
        <Check checked={s.weekNumbers} onChange={(v) => s.set({ weekNumbers: v })}>Show week numbers</Check>
        <Check checked={s.hideWeekends} onChange={(v) => s.set({ hideWeekends: v })}>Hide weekends in Week and Month</Check>
        <Check checked={s.workHours.enabled} onChange={(v) => s.set({ workHours: { ...s.workHours, enabled: v } })}>Shade working hours in Day and Week (Monday to Friday)</Check>
        {s.workHours.enabled && (
          <Row label="Working hours" htmlFor="workfrom">
            <span className="work-hours"><input id="workfrom" type="time" value={s.workHours.from} onChange={(e) => s.set({ workHours: { ...s.workHours, from: e.target.value } })} /> to <input type="time" aria-label="Working hours end" value={s.workHours.to} onChange={(e) => s.set({ workHours: { ...s.workHours, to: e.target.value } })} /></span>
          </Row>
        )}
        <Check checked={s.suggestEvents} onChange={(v) => s.set({ suggestEvents: v })}>Offer to add dates and times from emails to my calendar</Check>
        <p className="hint" style={{ margin: '4px 0 0' }}>Only for emails from people, with a clear day and time. Read on this computer, with no AI.{s.suggestMuted.length > 0 && <> {s.suggestMuted.length} sender{s.suggestMuted.length === 1 ? '' : 's'} never suggested: <button className="link-btn" onClick={() => s.set({ suggestMuted: [] })}>Allow again</button></>}</p>
        <Check checked={s.oooSuggest} onChange={(v) => s.set({ oooSuggest: v })}>Suggest Out of Office from Holiday and Annual leave in my calendar</Check>
      </section>
      <section className="set-section">
        <h2>Calendar Groups</h2>
        <CalendarGroupsCard />
      </section>
      <section className="set-section" id="settings-tasks">
        <h2>Tasks</h2>
        <TaskDefaults />
      </section>
      <section className="set-section">
        <h2>Alerts</h2>
        <p className="hint" style={{ marginTop: 0 }}>Event reminders, video call notifications, the daily summary, tasks with a time and alerts from hidden calendars are now in Settings › Alerts &amp; Notifications, with the rest of your alerts. <button className="link-btn" onClick={() => openAlertSettings({ calendar: true })}>Open Alerts &amp; Notifications</button></p>
      </section>
    </>
  );
}

// ---------- notifications ----------
