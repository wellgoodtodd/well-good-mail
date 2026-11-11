// Picking when a scheduled email goes: it starts filled in (an hour from now), the calendar is open straight away,
// the date and time can be typed or picked, and the time scrolls past a fixed highlight. Schedule sets it.
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from './ui';
import { Icon } from './Icon';
import { useSettings } from '../lib/settings';
import { openScreen } from '../lib/mail';

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** An hour from now, moved on to the next five minutes. */
export function defaultSendTime(now = Date.now()): number {
  const d = new Date(now + 3600000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return d.getTime();
}

/** "10/11/2026" and "00:05" back to a time, or undefined if it doesn't read as one. */
export function parseDateTime(date: string, time: string): number | undefined {
  const dm = date.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  const tm = time.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!dm || !tm) return undefined;
  const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
  const d = new Date(year, Number(dm[2]) - 1, Number(dm[1]), Number(tm[1]), Number(tm[2]), 0, 0);
  if (d.getDate() !== Number(dm[1]) || Number(tm[1]) > 23 || Number(tm[2]) > 59) return undefined;
  return d.getTime();
}

/** One column of the time: the chosen number sits in the highlight, the others scroll past it. */
function Wheel({ value, max, label, onChange, onStep }: { value: number; max: number; label: string; onChange: (v: number) => void; onStep: (by: number) => void }) {
  const wrap = (v: number) => ((v % (max + 1)) + (max + 1)) % (max + 1);
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <div className="slp-wheel" aria-label={label} onWheel={(e) => { e.preventDefault(); onStep(e.deltaY > 0 ? 1 : -1); }}>
      <button className="slp-step" aria-label={`Earlier ${label}`} onClick={() => onStep(-1)}><Icon name="chevronDown" size={12} className="rot180" /></button>
      {[-2, -1].map((o) => <button key={o} className="slp-near" tabIndex={-1} onClick={() => onStep(o)}>{pad(wrap(value + o))}</button>)}
      <input
        className="slp-now"
        aria-label={label}
        inputMode="numeric"
        value={typed ?? pad(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={() => { if (typed !== null && typed !== '' && Number(typed) <= max) onChange(Number(typed)); setTyped(null); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onStep(-1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onStep(1); }
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
      />
      {[1, 2].map((o) => <button key={o} className="slp-near" tabIndex={-1} onClick={() => onStep(o)}>{pad(wrap(value + o))}</button>)}
      <button className="slp-step" aria-label={`Later ${label}`} onClick={() => onStep(1)}><Icon name="chevronDown" size={12} /></button>
    </div>
  );
}

export function SendLaterPicker({ initial, title = 'Send later', confirmLabel = 'Schedule', onPick, onClose }: {
  initial?: number;
  title?: string;
  confirmLabel?: string;
  onPick: (at: number) => void;
  onClose: () => void;
}) {
  const wake = useSettings((s) => s.wakeToSend);
  const [at, setAt] = useState(() => initial && initial > Date.now() ? initial : defaultSendTime());
  const d = new Date(at);
  const [month, setMonth] = useState(() => new Date(d.getFullYear(), d.getMonth(), 1));
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  // The typed fields follow the picked time.
  useEffect(() => {
    const x = new Date(at);
    setDateText(`${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`);
    setTimeText(`${pad(x.getHours())}:${pad(x.getMinutes())}`);
  }, [at]);
  const setPart = (fn: (x: Date) => void) => { const x = new Date(at); fn(x); setAt(x.getTime()); };
  const typedOk = parseDateTime(dateText, timeText);
  const applyTyped = (date: string, time: string) => {
    const t = parseDateTime(date, time);
    if (t === undefined) return;
    setAt(t);
    const x = new Date(t);
    setMonth(new Date(x.getFullYear(), x.getMonth(), 1));
  };
  const commitTyped = () => applyTyped(dateText, timeText);
  const moveBy = (ms: number) => { const t = at + ms; setAt(t); const x = new Date(t); setMonth(new Date(x.getFullYear(), x.getMonth(), 1)); };

  const cells = useMemo(() => {
    const first = new Date(month);
    const lead = useSettings.getState().weekStart === 'sunday' ? first.getDay() : (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - lead + i));
  }, [month]);
  const today = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // A little leeway: anything more than about a minute away can be scheduled.
  const past = at < Date.now() + 45000;

  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={past} onClick={() => onPick(at)}>{confirmLabel}</button>
      </>}
    >
      <div className="slp">
        <div className="slp-typed">
          <label><span>Date</span><input aria-label="Date" value={dateText} placeholder="dd/mm/yyyy" onChange={(e) => { setDateText(e.target.value); applyTyped(e.target.value, timeText); }} onBlur={commitTyped} onKeyDown={(e) => { if (e.key === 'Enter') commitTyped(); }} aria-invalid={typedOk === undefined} /></label>
          <label><span>Time</span><input aria-label="Time" value={timeText} placeholder="hh:mm" onChange={(e) => { setTimeText(e.target.value); applyTyped(dateText, e.target.value); }} onBlur={commitTyped} onKeyDown={(e) => { if (e.key === 'Enter') commitTyped(); }} aria-invalid={typedOk === undefined} /></label>
          <span className={`slp-when ${past ? 'warn' : ''}`}>{past ? 'Pick a time in the future' : new Date(at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="slp-body">
          <div className="slp-cal">
            <div className="slp-month">
              <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronLeft" size={14} /></button>
              <b>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
              <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" size={14} /></button>
            </div>
            <div className="slp-grid">
              {(useSettings.getState().weekStart === 'sunday' ? ['Su', ...DAYS.slice(0, 6)] : DAYS).map((x) => <span key={x} className="slp-dow">{x}</span>)}
              {cells.map((c) => {
                const before = c.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                return (
                  <button key={c.toISOString()} disabled={before}
                    className={`slp-day ${c.getMonth() !== month.getMonth() ? 'other' : ''} ${same(c, d) ? 'on' : ''} ${same(c, today) ? 'today' : ''}`}
                    onClick={() => setPart((x) => x.setFullYear(c.getFullYear(), c.getMonth(), c.getDate()))}>{c.getDate()}</button>
                );
              })}
            </div>
          </div>
          <div className="slp-time">
            <Wheel label="hour" value={d.getHours()} max={23} onChange={(v) => setPart((x) => x.setHours(v))} onStep={(by) => moveBy(by * 3600000)} />
            <span className="slp-colon">:</span>
            <Wheel label="minute" value={d.getMinutes()} max={59} onChange={(v) => setPart((x) => x.setMinutes(v))} onStep={(by) => moveBy(by * 60000)} />
          </div>
        </div>
        <p className="slp-note">
          {wake
            ? 'It goes at this time even if Well Good Mail is closed: Windows starts it, and wakes the PC from sleep if needed. It can\'t send while the PC is switched off.'
            : 'Well Good Mail needs to be running at this time (it can sit in the tray). If it isn\'t, it sends as soon as it opens.'}
          {' '}<button className="link-btn" onClick={() => { onClose(); openScreen('settings', 'writing'); }}>Change this</button>
        </p>
      </div>
    </Dialog>
  );
}
