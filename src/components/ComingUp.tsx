// Calendar pieces shared by the Reminders screen and the mail screen: the Coming up list, a small event
// preview with a Join button, a month view, and the bar that appears just before a video meeting.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useMail, refreshEvents, lastEventsRefresh, openScreen, toast, eventsBetween } from '../lib/mail';
import { isoWeek } from './CalendarViews';
import { useSettings } from '../lib/settings';
import { upcoming, alertMute } from '../lib/reminders';
import { meetingService, meetingsSoon, dedupeEvents, visibleEvents, guestTally, guestAnswerWord, inviteText, meetingPhase, meetingPhaseText } from '../lib/meetings';
import { startCompose } from '../lib/composeActions';
import { openExternal } from '../lib/platform';
import type { CalendarEvent, EventGuest, GuestAnswer } from '../lib/types';

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

/** Which accounts an event is on: one dot each, in the account's colour. */
function AccountDots({ event }: { event: CalendarEvent }) {
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
function chipBackground(ids: string[], colour: (id: string) => string): string {
  if (ids.length < 2) return colour(ids[0]);
  const step = 100 / ids.length;
  return `linear-gradient(90deg, ${ids.map((id, i) => `${colour(id)} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}

/** A switch that reads as an on/off control and works with the keyboard. `mixed` shows a half-lit switch when only some of what it controls is on; clicking it turns everything on. */
function Switch({ on, onChange, label, mixed }: { on: boolean; onChange: (v: boolean) => void; label: string; mixed?: boolean }) {
  return (
    <input
      type="checkbox" role="switch" className="switch" checked={on && !mixed} aria-label={label} aria-checked={mixed ? 'mixed' : on}
      ref={(el) => { if (el) el.indeterminate = Boolean(mixed); }}
      onChange={(e) => onChange(mixed ? true : e.target.checked)}
    />
  );
}

/** Account types that have a calendar to show (plain IMAP mailboxes don't, but iCloud does). */
const hasCalendar = (a: { kind: string; imap?: { host?: string } }) => a.kind !== 'demo' && (a.kind !== 'imap' || /icloud|me\.com/i.test(a.imap?.host || ''));

/** Every calendar your accounts show. The pop-up lists the shown calendars first and folds the hidden ones away (it only re-sorts when you open it again, so quick on-and-off checks don't jump about). Settings lists them in a folding card for each account. Both change the same setting. */
export function CalendarList({ variant = 'flat' }: { variant?: 'flat' | 'cards' }) {
  const events = useMail((s) => s.events);
  const accounts = useMail((s) => s.accounts);
  const errors = useMail((s) => s.calendarErrors);
  const known = useMail((s) => s.calendarNames);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const set = useSettings((s) => s.set);
  const [looking, setLooking] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  // What was hidden when this list opened. Rows stay where they are until it is opened again.
  const [hiddenAtOpen] = useState(() => new Set(hidden));
  const ordered = useMemo(() => [...accounts].sort((a, b) => a.order - b.order), [accounts]);
  const groups = useMemo(() => {
    const names = new Map<string, Set<string>>();
    for (const e of events) { if (!names.has(e.accountId)) names.set(e.accountId, new Set()); names.get(e.accountId)!.add(e.calendarName); }
    for (const [id, list] of Object.entries(known)) for (const n of list) { if (!names.has(id)) names.set(id, new Set()); names.get(id)!.add(n); }
    for (const k of hidden) { const i = k.indexOf('|'); const id = k.slice(0, i); if (!names.has(id)) names.set(id, new Set()); names.get(id)!.add(k.slice(i + 1)); }
    return ordered.map((a) => ({
      account: a,
      // The account's own calendar first, then the rest in A to Z order.
      calendars: [...(names.get(a.id) || [])].sort((x, y) => Number(y.toLowerCase() === a.email.toLowerCase()) - Number(x.toLowerCase() === a.email.toLowerCase()) || x.localeCompare(y)),
    })).filter((g) => g.calendars.length);
  }, [events, known, ordered, hidden]);
  const missing = useMemo(() => ordered.filter((a) => hasCalendar(a) && !groups.some((g) => g.account.id === a.id)), [ordered, groups]);
  const rows = useMemo(() => {
    const byName = new Map<string, { name: string; keys: string[]; accounts: typeof accounts }>();
    for (const g of groups) for (const name of g.calendars) {
      const row = byName.get(name) || { name, keys: [], accounts: [] };
      row.keys.push(`${g.account.id}|${name}`);
      row.accounts.push(g.account);
      byName.set(name, row);
    }
    return [...byName.values()];
  }, [groups]);
  const setKeys = (keys: string[], show: boolean) => set({ hiddenCalendars: show ? hidden.filter((k) => !keys.includes(k)) : [...new Set([...hidden, ...keys])] });
  const lookAgain = async () => {
    setLooking(true);
    try {
      const failed = await refreshEvents();
      toast({ text: failed.length ? `Couldn't reach the calendar for ${failed.join('; ')}` : 'Calendars updated', ttl: failed.length ? 12000 : 2500 });
    } finally { setLooking(false); }
  };
  const why = (id: string) => errors[id] || 'No calendar has come through yet.';
  if (!groups.length && !missing.length) return <p className="hint" style={{ margin: 0 }}>Calendars appear here once your accounts have loaded them.</p>;

  const MissingNote = ({ a }: { a: (typeof accounts)[number] }) => (
    <div className="cal-missing">
      <span>{why(a.id)}</span>
      <button className="btn small" disabled={looking} onClick={lookAgain}>{looking ? 'Looking...' : 'Look again'}</button>
    </div>
  );

  if (variant === 'cards') {
    const toggleCard = (id: string) => setOpenCards((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    return (
      <div className="cal-cards">
        {ordered.filter((a) => groups.some((g) => g.account.id === a.id) || missing.includes(a)).map((a) => {
          const g = groups.find((x) => x.account.id === a.id);
          const open = openCards.has(a.id);
          if (!g) return (
            <div key={a.id} className="cal-card">
              <div className="cal-card-head"><span className="chev-space" /><span className="dot" style={{ background: a.colour }} /><strong>{a.label || a.email}</strong></div>
              <MissingNote a={a} />
            </div>
          );
          const keys = g.calendars.map((n) => `${a.id}|${n}`);
          const shown = keys.filter((k) => !hidden.includes(k)).length;
          const summary = shown === keys.length ? `${shown} of ${keys.length} shown` : shown === 0 ? 'None shown' : `${shown} of ${keys.length} shown`;
          return (
            <div key={a.id} className={`cal-card ${open ? 'open' : ''}`}>
              <div className="cal-card-head">
                <button className="cal-card-toggle" aria-expanded={open} onClick={() => toggleCard(a.id)}>
                  <Icon name="chevronDown" size={14} className="cal-chev" />
                  <span className="dot" style={{ background: a.colour }} />
                  <strong>{a.label || a.email}</strong>
                  <small>{summary}</small>
                </button>
                <Switch on={shown > 0} mixed={shown > 0 && shown < keys.length} label={`Show all calendars for ${a.label || a.email}`} onChange={(v) => setKeys(keys, v)} />
              </div>
              {open && g.calendars.map((name) => {
                const key = `${a.id}|${name}`;
                return (
                  <div key={key} className="cal-card-row">
                    <span title={name}>{name}</span>
                    <Switch on={!hidden.includes(key)} label={`Show ${name} for ${a.label || a.email}`} onChange={(v) => setKeys([key], v)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  const wasHidden = (r: (typeof rows)[number]) => r.keys.every((k) => hiddenAtOpen.has(k));
  const top = rows.filter((r) => !wasHidden(r));
  const folded = rows.filter(wasHidden);
  const Row = ({ r }: { r: (typeof rows)[number] }) => {
    const on = r.keys.some((k) => !hidden.includes(k));
    const sub = r.accounts.length > 1 ? `${r.accounts.length} accounts` : r.accounts[0].label || r.accounts[0].email;
    return (
      <div className="cal-flat-row">
        <span className="acc-dots" aria-hidden="true">{r.accounts.map((a) => <span key={a.id} className="dot" style={{ background: a.colour }} />)}</span>
        <span className="cal-flat-name" title={r.name}><span>{r.name}</span><small>{sub}</small></span>
        <Switch on={on} label={`Show ${r.name}`} onChange={(v) => setKeys(r.keys, v)} />
      </div>
    );
  };
  return (
    <div className="cal-flat">
      <div className="cal-flat-top">
        <button className="link-btn" disabled={!hidden.length} onClick={() => set({ hiddenCalendars: [] })}>Show all</button>
      </div>
      {top.map((r) => <Row key={r.name} r={r} />)}
      {folded.length > 0 && (
        <>
          <button className="cal-hidden-toggle" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>
            <Icon name="chevronDown" size={13} className={showHidden ? '' : 'rot-90'} /> Hidden ({folded.length})
          </button>
          {showHidden && folded.map((r) => <Row key={r.name} r={r} />)}
        </>
      )}
      {missing.length > 0 && (
        <div className="cal-missing">
          <span>No calendar yet for {missing.map((a) => a.label || a.email).join(', ')}.</span>
          <button className="btn small" disabled={looking} onClick={lookAgain}>{looking ? 'Looking...' : 'Look again'}</button>
        </div>
      )}
    </div>
  );
}

/** A "Calendars" button that opens the tick list. */
export function CalendarPicker({ iconOnly }: { iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const label = 'Calendars';
  return (
    <div className="cal-picker" ref={box}>
      {iconOnly
        ? <button className={`icon-btn ${hidden.length ? 'active' : ''}`} title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="list" size={14} /></button>
        : <button className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="calendar" size={14} /> {label}</button>}
      {open && (
        <div className="cal-pop" role="dialog" aria-label="Choose which calendars to show">
          <strong>Show these calendars</strong>
          <CalendarList />
          <p className="hint" style={{ margin: '8px 0 0' }}>Alerts from hidden calendars follow your <button className="link-btn" onClick={() => { setOpen(false); openScreen('settings', 'accounts'); }}>account settings</button>.</p>
        </div>
      )}
    </div>
  );
}

const GLYPH: Record<GuestAnswer, string> = { yes: '✓', no: '✕', maybe: '?', waiting: '…' };

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

/** A small window with the details of one event. */
export function EventPreview({ event: picked, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const colour = useColour();
  const accounts = useMail((s) => s.accounts);
  const all = useMail((s) => s.events);
  // The calendar refreshes in the background, so show the newest copy of this event.
  const event = useMemo(() => dedupeEvents(all).find((x) => x.id === picked.id) || picked, [all, picked]);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await refreshEvents(); } finally { setRefreshing(false); } };
  // Opening an event with guests pulls the latest answers, unless they were fetched in the last minute.
  useEffect(() => { if (picked.guests?.length && Date.now() - lastEventsRefresh() > 60000) void refresh(); }, [picked.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = event.accountIds?.length ? event.accountIds : [event.accountId];
  const labels = ids.map((id) => accounts.find((a) => a.id === id)?.label || accounts.find((a) => a.id === id)?.email || '').filter(Boolean);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const sameDay = new Date(event.start).toDateString() === new Date(event.end).toDateString();
  const guestList = (event.guests || []).map((g) => { if (!g.self || g.name) return g; const acc = accounts.find((x) => x.email.toLowerCase() === g.email || x.aliases.some((al) => al.email.toLowerCase() === g.email)); const name = acc?.aliases.find((al) => al.isDefault)?.name || acc?.aliases[0]?.name; return name ? { ...g, name } : g; });
  const others = guestList.filter((g) => !g.self);
  const writeTo = (to: EventGuest[]) => { void startCompose('new', undefined, { extra: { to: to.map((g) => ({ email: g.email, name: g.name })), subject: event.title } }); };
  return (
    <div className="ev-scrim" onClick={onClose}>
      <div className="ev-pop" role="dialog" aria-modal="true" aria-label={event.title} onClick={(e) => e.stopPropagation()}>
        <div className="ev-head">
          <span className="ev-bar" style={{ background: chipBackground(ids, colour) }} />
          <h2>{event.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="ev-line"><Icon name="clock" size={15} /> {event.allDay ? `${dayText(event.start)}, all day` : `${dayText(event.start)}, ${timeText(event.start)} to ${sameDay ? '' : `${dayText(event.end)}, `}${timeText(event.end)}`}</div>
        <div className="ev-line"><Icon name="calendar" size={15} /> {event.calendarName}{labels.length ? ` · ${labels.join(', ')}` : ''}</div>
        {ids.length > 1 && <div className="ev-line"><AccountDots event={event} /> On {ids.length} of your calendars</div>}
        {event.location && !event.location.startsWith('http') && <div className="ev-line"><Icon name="folder" size={15} /> {event.location}</div>}
        {event.meetingUrl && <div className="ev-line"><Icon name="link" size={15} /> {meetingService(event.meetingUrl)} call</div>}
        {event.description && <p className="ev-notes">{event.description}</p>}
        {event.guests && event.guests.length > 0 && (
          <div className="ev-guests">
            <GuestList guests={guestList} subject={event.title} actions={false} />
          </div>
        )}
        <div className="ev-actions">
          <JoinButton event={event} />
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(inviteText(event)).then(() => toast({ text: 'Invite copied. Paste it anywhere.', ttl: 2500 }), () => toast({ text: "Couldn't copy the invite", ttl: 4000 })); }}>Copy invite</button>
          <span className="cal-picker">
            <button className="btn" aria-expanded={more} onClick={() => setMore(!more)}>More <Icon name="chevronDown" size={12} /></button>
            {more && (
              <div className="cal-pop inv-change up" role="menu">
                {others.length > 0 && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others); }}>Email everyone</button>}
                {others.some((g) => g.answer === 'waiting') && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others.filter((g) => g.answer === 'waiting')); }}>Email those waiting</button>}
                {guestList.length > 0 && <button role="menuitem" className="btn ghost" disabled={refreshing} onClick={() => { setMore(false); void refresh(); }}>{refreshing ? 'Checking...' : 'Refresh answers'}</button>}
                {event.htmlLink && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); openExternal(event.htmlLink!); }}>Open in calendar</button>}
              </div>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The next week, as a list. Click one for its details. */
export function ComingUpList({ limit = 8, onPick }: { limit?: number; onPick: (e: CalendarEvent) => void }) {
  const events = useMail((s) => s.events);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const tick = useMinute();
  const next = useMemo(() => upcoming(visibleEvents(events, hidden)).slice(0, limit), [events, hidden, tick, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!next.length) return <div style={{ color: 'var(--text-muted)' }}>Nothing in the next week</div>;
  return (
    <>
      {next.map((e) => (
        <div key={e.id} className="coming-row" role="button" tabIndex={0} onClick={() => onPick(e)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); onPick(e); } }}>
          <span className="acc-dots col" style={{ marginTop: 6 }}><AccountDots event={e} /></span>
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
        <strong style={{ flex: 1 }}>Coming up</strong>
        <CalendarPicker iconOnly />
        <button className="icon-btn" aria-label="Close Coming up" onClick={() => set({ comingUpOpen: false })}><Icon name="close" size={14} /></button>
      </div>
      <ComingUpList limit={12} onPick={setOpen} />
      {open && <EventPreview event={open} onClose={() => setOpen(null)} />}
    </aside>
  );
}

/** A month at a time, each event a coloured chip. */
export function MonthView({ onPick }: { onPick: (e: CalendarEvent) => void }) {
  const nearEvents = useMail((s) => s.events);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const sunday = useSettings((s) => s.weekStart) === 'sunday';
  const weekNumbers = useSettings((s) => s.weekNumbers);
  const hideWeekends = useSettings((s) => s.hideWeekends);
  const colour = useColour();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const first = new Date(month);
  const offset = sunday ? first.getDay() : (first.getDay() + 6) % 7;
  const gridStart = new Date(first); gridStart.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  // The app keeps only the next week or so of events; the month shown is fetched as well.
  const [far, setFar] = useState<CalendarEvent[]>([]);
  useEffect(() => {
    let gone = false;
    const end = new Date(gridStart); end.setDate(end.getDate() + 42);
    void eventsBetween(gridStart.getTime(), end.getTime()).then((list) => { if (!gone) setFar(list); });
    return () => { gone = true; };
  }, [month.getTime(), sunday]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => {
    const seen = new Set(nearEvents.map((e) => e.id));
    return visibleEvents([...nearEvents, ...far.filter((e) => !seen.has(e.id))], hidden);
  }, [nearEvents, far, hidden]);
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
        <strong>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><Icon name="chevronRight" size={16} /></button>
        <button className="btn ghost" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonth(d); }}>Today</button>
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
            <div key={d.toISOString()} className={`month-day ${d.getMonth() === month.getMonth() ? '' : 'other'} ${d.toDateString() === today ? 'today' : ''}`}>
              <span className="n">{d.getDate()}</span>
              {list.slice(0, 3).map((e) => (
                <button key={e.id} className="chip" style={{ background: chipBackground(e.accountIds?.length ? e.accountIds : [e.accountId], colour) }} title={e.title} onClick={() => onPick(e)}>
                  {!e.allDay && <span>{timeText(e.start)} </span>}{e.title}
                </button>
              ))}
              {list.length > 3 && <span className="more">+{list.length - 3} more</span>}
            </div>,
          );
          return out;
        })}
      </div>
    </div>
  );
}

/** Appears over the mail a few minutes before a meeting that has a video link. It turns amber for the first minute, coral once the meeting has started, and goes by itself 10 minutes after the start. */
export function MeetingBanner() {
  const events = useMail((s) => s.events);
  const enabled = useSettings((s) => s.meetingBanner);
  const lead = useSettings((s) => s.meetingBannerMins);
  const hiddenCals = useSettings((s) => s.hiddenCalendars);
  const alertsMode = useSettings((s) => s.hiddenCalendarsAlerts);
  const [now, setNow] = useState(() => Date.now());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const [demo, setDemo] = useState<CalendarEvent | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  // Settings has a button that shows a pretend meeting five minutes away, so you can see the bar and how it changes.
  useEffect(() => {
    const show = () => { const s = Date.now() + 5 * 60000; setDemo({ id: 'demo-meeting', accountId: '', calendarName: 'Test', title: 'Test meeting', start: s, end: s + 30 * 60000, allDay: false, meetingUrl: 'https://meet.google.com/abc-defg-hij', reminderMinutes: [] }); setNow(Date.now()); };
    window.addEventListener('wgm-test-meeting-bar', show);
    return () => window.removeEventListener('wgm-test-meeting-bar', show);
  }, []);
  const soon = useMemo(() => {
    const real = enabled ? meetingsSoon(events, now, lead, alertMute({ hiddenCalendars: hiddenCals, hiddenCalendarsAlerts: alertsMode }).all) : [];
    const shown = demo && demo.start + 10 * 60000 > now ? [demo, ...real] : real;
    return shown.filter((e) => !gone.has(`${e.id}|${e.start}`));
  }, [events, enabled, lead, gone, now, demo, hiddenCals, alertsMode]);
  if (!soon.length) return null;
  const dismiss = (e: CalendarEvent) => { if (e.id === 'demo-meeting') setDemo(null); setGone((g) => new Set(g).add(`${e.id}|${e.start}`)); };
  return (
    <>
      {soon.slice(0, 2).map((e) => {
        const p = meetingPhase(e.start, now);
        return (
          <div className={`meeting-bar ${p.phase === 'now' ? 'starting' : p.phase === 'late' || p.phase === 'long' ? 'late' : ''}`} key={e.id} role={p.phase === 'before' ? 'status' : 'alert'}>
            <div className="mb-left">
              <Icon name="calendar" size={16} />
              <button className="meeting-text" onClick={() => setOpen(e)}>
                <strong>{e.title}</strong> <span>{meetingPhaseText(p)}</span>
              </button>
            </div>
            <JoinButton event={e} onJoin={() => dismiss(e)} />
            <div className="mb-right">
              <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(e)}><Icon name="close" size={14} /></button>
            </div>
          </div>
        );
      })}
      {open && <EventPreview event={open} onClose={() => setOpen(null)} />}
    </>
  );
}
