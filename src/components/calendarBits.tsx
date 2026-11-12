// Small calendar pieces shared by the Coming up list, the event pop-up and the calendar views.
import { useEffect, useReducer } from 'react';
import { Icon } from './Icon';
import { useMail } from '../lib/mail';
import { meetingService, guestTally, guestAnswerWord } from '../lib/meetings';
import { startCompose } from '../lib/composeActions';
import { openExternal } from '../lib/platform';
import type { CalendarEvent, EventGuest, GuestAnswer } from '../lib/types';

/** Re-renders every minute so "soon" and "coming up" stay current. */
export function useMinute() {
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const t = () => bump();
    window.addEventListener('wgm-minute', t);
    return () => window.removeEventListener('wgm-minute', t);
  }, []);
  return tick;
}

export const timeText = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function useColour() {
  const accounts = useMail((s) => s.accounts);
  return (id: string) => accounts.find((a) => a.id === id)?.colour || '#888';
}

/** Which accounts an event is on: one dot each, in the account's colour. */
export function AccountDots({ event }: { event: CalendarEvent }) {
  const colour = useColour();
  const accounts = useMail((s) => s.accounts);
  const ids = event.accountIds?.length ? event.accountIds : [event.accountId];
  const names = ids.map((id) => accounts.find((a) => a.id === id)?.label || accounts.find((a) => a.id === id)?.email || '').filter(Boolean).join(', ');
  return (
    <span className="acc-dots" title={names ? `On: ${names}` : undefined} aria-label={names ? `On: ${names}` : undefined}>
      {ids.map((id) => <span key={id} className="dot" style={{ background: colour(id) }} />)}
    </span>
  );
}

/** A chip background: one colour, or bands of each account's colour when the event is on several. */
export function chipBackground(ids: string[], colour: (id: string) => string): string {
  if (ids.length < 2) return colour(ids[0]);
  const step = 100 / ids.length;
  return `linear-gradient(90deg, ${ids.map((id, i) => `${colour(id)} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

/** A switch that reads as an on/off control and works with the keyboard. `mixed` shows a half-lit switch when only some of what it controls is on; clicking it turns everything on. */
export function Switch({ on, onChange, label, mixed }: { on: boolean; onChange: (v: boolean) => void; label: string; mixed?: boolean }) {
  return (
    <input
      type="checkbox" role="switch" className="switch" checked={on && !mixed} aria-label={label} aria-checked={mixed ? 'mixed' : on}
      ref={(el) => { if (el) el.indeterminate = Boolean(mixed); }}
      onChange={(e) => onChange(mixed ? true : e.target.checked)}
    />
  );
}

export const GLYPH: Record<GuestAnswer, string> = { yes: '✓', no: '✕', maybe: '?', waiting: '…' };

/** Who is invited and what they said: a tally you can read at a glance, then one list. Click a name to write to them. */
export function GuestList({ guests, subject, actions = true, startOpen = false }: { guests: EventGuest[]; subject?: string; actions?: boolean; startOpen?: boolean }) {
  const order: Record<GuestAnswer, number> = { yes: 0, maybe: 1, no: 2, waiting: 3 };
  const sorted = [...guests].sort((a, b) => order[a.answer] - order[b.answer] || (a.name || a.email).localeCompare(b.name || b.email));
  const write = (to: EventGuest[]) => { void startCompose('new', undefined, { extra: { to: to.map((g) => ({ email: g.email, name: g.name })), subject: subject || '' } }); };
  const others = guests.filter((g) => !g.self);
  return (
    <details className="guests" open={startOpen}>
      <summary>
        <Icon name="chevronDown" size={14} className="g-chev" />
        <span className="g-title">Guests ({guests.length})</span>
        {guestTally(guests).map((t) => <span key={t.answer} className={`g-tally ${t.answer}`}><span className="g-dot" aria-hidden="true" />{t.n} {guestAnswerWord(t.answer).toLowerCase()}</span>)}
      </summary>
      <ul>
        {sorted.map((g) => (
          <li key={g.email} className={g.answer}>
            <span className={`g-chip ${g.answer}`} aria-hidden="true">{GLYPH[g.answer]}</span>
            {g.self ? <span className="g-name">{g.name || g.email} (you)</span> : <button className="g-name link-btn" title={`Write to ${g.email}`} onClick={() => write([g])}>{g.name || g.email}</button>}
            <span className="g-word">{guestAnswerWord(g.answer)}{g.organiser ? ' · organiser' : ''}</span>
          </li>
        ))}
      </ul>
      {actions && others.length > 1 && (
        <div className="g-actions">
          <button className="btn small" onClick={() => write(others)}>Email everyone</button>
          {others.some((g) => g.answer === 'waiting') && <button className="btn small" onClick={() => write(others.filter((g) => g.answer === 'waiting'))}>Email those waiting</button>}
        </div>
      )}
    </details>
  );
}

export function JoinButton({ event, small, onJoin }: { event: CalendarEvent; small?: boolean; onJoin?: () => void }) {
  if (!event.meetingUrl) return null;
  return (
    <button className={`btn primary ${small ? 'small' : ''}`} onClick={(e) => { e.stopPropagation(); openExternal(event.meetingUrl!); onJoin?.(); }} title={`Join the ${meetingService(event.meetingUrl)} call`}>
      <Icon name="link" size={14} /> Join {meetingService(event.meetingUrl)}
    </button>
  );
}
