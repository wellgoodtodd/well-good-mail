// Calendar pieces shared by the Reminders screen and the mail screen: the Coming up list, a small event
// preview with a Join button, a month view, and the bar that appears just before a video meeting.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Icon } from './Icon';
import { useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { upcoming } from '../lib/reminders';
import { meetingService, meetingsSoon } from '../lib/meetings';
import { openExternal } from '../lib/platform';
import type { CalendarEvent } from '../lib/types';

/** Re-renders every minute so "soon" and "coming up" stay current. */
function useMinute() {
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const t = () => bump();
    window.addEventListener('wgm-minute', t);
    return () => window.removeEventListener('wgm-minute', t);
  }, []);
  return tick;
}

const timeText = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function useColour() {
  const accounts = useMail((s) => s.accounts);
  return (id: string) => accounts.find((a) => a.id === id)?.colour || '#888';
}

export function JoinButton({ event, small }: { event: CalendarEvent; small?: boolean }) {
  if (!event.meetingUrl) return null;
  return (
    <button className={`btn primary ${small ? 'small' : ''}`} onClick={(e) => { e.stopPropagation(); openExternal(event.meetingUrl!); }} title={`Join the ${meetingService(event.meetingUrl)} call`}>
      <Icon name="link" size={14} /> Join {meetingService(event.meetingUrl)}
    </button>
  );
}

/** A small window with the details of one event. */
export function EventPreview({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const colour = useColour();
  const label = useMail((s) => s.accounts.find((a) => a.id === event.accountId)?.label || '');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const sameDay = new Date(event.start).toDateString() === new Date(event.end).toDateString();
  return (
    <div className="ev-scrim" onClick={onClose}>
      <div className="ev-pop" role="dialog" aria-modal="true" aria-label={event.title} onClick={(e) => e.stopPropagation()}>
        <div className="ev-head">
          <span className="ev-bar" style={{ background: colour(event.accountId) }} />
          <h2>{event.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="ev-line"><Icon name="clock" size={15} /> {event.allDay ? `${dayText(event.start)}, all day` : `${dayText(event.start)}, ${timeText(event.start)} to ${sameDay ? '' : `${dayText(event.end)}, `}${timeText(event.end)}`}</div>
        <div className="ev-line"><Icon name="calendar" size={15} /> {event.calendarName}{label ? ` · ${label}` : ''}</div>
        {event.location && !event.location.startsWith('http') && <div className="ev-line"><Icon name="folder" size={15} /> {event.location}</div>}
        {event.meetingUrl && <div className="ev-line"><Icon name="link" size={15} /> {meetingService(event.meetingUrl)} call</div>}
        {event.description && <p className="ev-notes">{event.description}</p>}
        <div className="ev-actions">
          <JoinButton event={event} />
          {event.htmlLink && <button className="btn" onClick={() => openExternal(event.htmlLink!)}>Open in calendar</button>}
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** The next week, as a list. Click one for its details. */
export function ComingUpList({ limit = 8, onPick }: { limit?: number; onPick: (e: CalendarEvent) => void }) {
  const events = useMail((s) => s.events);
  const tick = useMinute();
  const colour = useColour();
  const next = useMemo(() => upcoming(events).slice(0, limit), [events, tick, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!next.length) return <div style={{ color: 'var(--text-muted)' }}>Nothing in the next week</div>;
  return (
    <>
      {next.map((e) => (
        <div key={e.id} className="coming-row" role="button" tabIndex={0} onClick={() => onPick(e)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); onPick(e); } }}>
          <span className="dot" style={{ background: colour(e.accountId), marginTop: 6 }} />
          <div className="grow">
            <div style={{ fontWeight: 500 }}>{e.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88em' }}>{dayText(e.start)}{!e.allDay && `, ${timeText(e.start)}`} · {e.calendarName}</div>
          </div>
          {e.meetingUrl && <JoinButton event={e} small />}
        </div>
      ))}
    </>
  );
}

/** The column beside the mail list, opened from the toolbar. */
export function ComingUpPanel() {
  const set = useSettings((s) => s.set);
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  return (
    <aside className="coming-panel" aria-label="Coming up">
      <div className="coming-head">
        <strong>Coming up</strong>
        <button className="icon-btn" aria-label="Close Coming up" onClick={() => set({ comingUpOpen: false })}><Icon name="close" size={14} /></button>
      </div>
      <ComingUpList limit={12} onPick={setOpen} />
      {open && <EventPreview event={open} onClose={() => setOpen(null)} />}
    </aside>
  );
}

/** A month at a time, each event a coloured chip. */
export function MonthView({ onPick }: { onPick: (e: CalendarEvent) => void }) {
  const events = useMail((s) => s.events);
  const colour = useColour();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7; // weeks start on Monday
  const gridStart = new Date(first); gridStart.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
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
        <strong>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><Icon name="chevronRight" size={16} /></button>
        <button className="btn ghost" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonth(d); }}>Today</button>
      </div>
      <div className="month-grid" role="grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => <div key={n} className="month-dow">{n}</div>)}
        {days.map((d) => {
          const list = byDay.get(d.toDateString()) || [];
          return (
            <div key={d.toISOString()} className={`month-day ${d.getMonth() === month.getMonth() ? '' : 'other'} ${d.toDateString() === today ? 'today' : ''}`}>
              <span className="n">{d.getDate()}</span>
              {list.slice(0, 3).map((e) => (
                <button key={e.id} className="chip" style={{ background: colour(e.accountId) }} title={e.title} onClick={() => onPick(e)}>
                  {!e.allDay && <span>{timeText(e.start)} </span>}{e.title}
                </button>
              ))}
              {list.length > 3 && <span className="more">+{list.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Appears over the mail 5 minutes before a meeting that has a video link, and stays until dismissed. */
export function MeetingBanner() {
  const events = useMail((s) => s.events);
  const enabled = useSettings((s) => s.meetingBanner);
  const lead = useSettings((s) => s.meetingBannerMins);
  const tick = useMinute();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const soon = useMemo(() => (enabled ? meetingsSoon(events, Date.now(), lead).filter((e) => !gone.has(`${e.id}|${e.start}`)) : []), [events, enabled, lead, gone, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!soon.length) return null;
  return (
    <>
      {soon.slice(0, 2).map((e) => {
        const mins = Math.round((e.start - Date.now()) / 60000);
        return (
          <div className="meeting-bar" key={e.id} role="status">
            <div className="mb-left">
              <Icon name="calendar" size={16} />
              <button className="meeting-text" onClick={() => setOpen(e)}>
                <strong>{e.title}</strong> <span>{mins > 0 ? `starts in ${mins} ${mins === 1 ? 'minute' : 'minutes'}` : mins === 0 ? 'is starting now' : 'has started'}</span>
              </button>
            </div>
            <JoinButton event={e} />
            <div className="mb-right">
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setGone(new Set(gone).add(`${e.id}|${e.start}`))}><Icon name="close" size={14} /></button>
            </div>
          </div>
        );
      })}
      {open && <EventPreview event={open} onClose={() => setOpen(null)} />}
    </>
  );
}
