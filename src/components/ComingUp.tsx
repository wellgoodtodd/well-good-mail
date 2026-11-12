// The Coming up list and panel, the picked day, the calendar list and picker, and the bar that appears just before a
// video meeting. The event pop-up is in EventPopup.tsx, the month, week and day views in CalendarViews.tsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useMail, refreshEvents, openScreen, toast } from '../lib/mail';
import { useCalDay, selectDay, openDay } from './CalendarViews';
import { useCalCache, cachedBetween } from '../lib/calendarCache';
import { useSettings } from '../lib/settings';
import { upcoming, alertMute } from '../lib/reminders';
import { meetingsSoon, dedupeEvents, visibleEvents, inGroupView, meetingPhase, meetingPhaseText, type CalendarGroup } from '../lib/meetings';
import type { CalendarEvent } from '../lib/types';
import { AccountDots, JoinButton, Switch, dayText, timeText, useMinute, useCalendarFilter } from './calendarBits';
import { CalendarGroupsDialog, pickGroup } from './CalendarGroups';
import { startNewEvent } from './NewEvent';
import { EventPreview } from './EventPopup';
import { NotAnsweredTag } from './Invitations';
import { isInvitation } from '../lib/invites';


/** Account types that have a calendar to show (plain IMAP mailboxes don't, but iCloud does). */
const hasCalendar = (a: { kind: string; imap?: { host?: string } }) => a.kind !== 'demo' && (a.kind !== 'imap' || /icloud|me\.com/i.test(a.imap?.host || ''));

/** Every calendar each account has (from its events, the calendars it listed, and ones you hid), its own calendar first. */
export function useCalendarsByAccount() {
  const events = useMail((s) => s.events);
  const accounts = useMail((s) => s.accounts);
  const known = useMail((s) => s.calendarNames);
  const hidden = useSettings((s) => s.hiddenCalendars);
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
  return { ordered, groups };
}

/** Every calendar your accounts show. The pop-up lists the shown calendars first and folds the hidden ones away (it only re-sorts when you open it again, so quick on-and-off checks don't jump about). Settings lists them in a folding card for each account. Both change the same setting. */
export function CalendarList({ variant = 'flat' }: { variant?: 'flat' | 'cards' }) {
  const accounts = useMail((s) => s.accounts);
  const errors = useMail((s) => s.calendarErrors);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const set = useSettings((s) => s.set);
  const [looking, setLooking] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  // What was hidden when this list opened. Rows stay where they are until it is opened again.
  const [hiddenAtOpen] = useState(() => new Set(hidden));
  const { ordered, groups } = useCalendarsByAccount();
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

/**
 * The Calendars button: the Calendar Groups to pick from (All calendars, Work...), Choose calendars for the full list
 * of switches, and Edit groups. With no groups yet it opens straight on the list.
 */
export function CalendarPicker({ iconOnly }: { iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [editGroups, setEditGroups] = useState<CalendarGroup | 'new' | null | undefined>(null);
  const hidden = useSettings((s) => s.hiddenCalendars);
  const groups = useSettings((s) => s.calendarGroups);
  const current = useSettings((s) => s.calendarGroup);
  const active = groups.find((g) => g.id === current);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => { if (open) setChoosing(!groups.length); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = active ? active.name : 'Calendars';
  const edit = (g: CalendarGroup | 'new' | undefined) => { setOpen(false); setEditGroups(g); };
  return (
    <div className="cal-picker" ref={box}>
      {iconOnly
        ? <button className={`icon-btn ${hidden.length || active ? 'active' : ''}`} title={active ? `Calendars: ${active.name}` : label} aria-label={active ? `Calendars: ${active.name}` : label} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="list" size={14} /></button>
        : <button className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="calendar" size={14} /> {label} <Icon name="chevronDown" size={12} /></button>}
      {open && (
        <div className="cal-pop" role="dialog" aria-label="Calendar Groups and calendars">
          {groups.length > 0 && (
            <>
              <div className="cg-pick" role="radiogroup" aria-label="Calendar Groups">
                {[{ id: '', name: 'All calendars', n: -1 }, ...groups.map((g) => ({ id: g.id, name: g.name, n: g.calendars.length }))].map((g) => (
                  <button key={g.id || 'all'} role="radio" aria-checked={current === g.id} className={`cg-pick-row ${current === g.id ? 'on' : ''}`} onClick={() => { pickGroup(g.id); setOpen(false); }}>
                    <span className="cg-tick">{current === g.id ? <Icon name="check" size={13} /> : null}</span>
                    <span className="grow">{g.name}</span>
                    {g.n >= 0 && <small>{g.n} {g.n === 1 ? 'calendar' : 'calendars'}</small>}
                  </button>
                ))}
              </div>
              <div className="cg-links">
                <button className="link-btn" aria-expanded={choosing} onClick={() => { if (active) pickGroup(''); setChoosing(!choosing); }}>Choose calendars…</button>
                <button className="link-btn" onClick={() => edit(undefined)}>Edit groups…</button>
              </div>
            </>
          )}
          {choosing && (
            <>
              <strong>{groups.length ? 'All calendars shows these' : 'Show these calendars'}</strong>
              <CalendarList />
              {!groups.length && <div className="cg-links"><button className="link-btn" onClick={() => edit('new')}>Make a Calendar Group…</button></div>}
              <p className="hint" style={{ margin: '8px 0 0' }}>Alerts from hidden calendars follow your <button className="link-btn" onClick={() => { setOpen(false); openScreen('settings', 'calendar'); }}>calendar settings</button>.</p>
            </>
          )}
        </div>
      )}
      {editGroups !== null && <CalendarGroupsDialog start={editGroups} onClose={() => setEditGroups(null)} />}
    </div>
  );
}

/** The next week, as a list. Click one for its details. */
export function ComingUpList({ limit = 8, onPick }: { limit?: number; onPick: (e: CalendarEvent) => void }) {
  const events = useMail((s) => s.events);
  const { hidden, only } = useCalendarFilter();
  const tick = useMinute();
  const next = useMemo(() => upcoming(visibleEvents(events, hidden, only)).slice(0, limit), [events, hidden, only, tick, limit]); // eslint-disable-line react-hooks/exhaustive-deps
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
          {e.myResponse === 'waiting' && !e.cancelled && isInvitation(e) && <NotAnsweredTag />}
          {e.meetingUrl && <JoinButton event={e} small />}
        </div>
      ))}
    </>
  );
}

/** The day you picked in the calendar, listed in full, under Coming up. */
export function PickedDay({ onPick }: { onPick: (e: CalendarEvent) => void }) {
  const day = useCalDay((c) => c.day);
  const near = useMail((s) => s.events);
  const copy = useCalCache((c) => c.events);
  const { hidden, only } = useCalendarFilter();
  const list = useMemo(() => {
    if (day === undefined) return [];
    const end = day + 86400000;
    const seen = new Set(near.map((e) => e.id));
    return dedupeEvents(visibleEvents([...near, ...cachedBetween(copy, day, end).filter((e) => !seen.has(e.id))], hidden, only))
      .filter((e) => e.start < end && e.end > day)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  }, [day, near, copy, hidden, only]);
  if (day === undefined) return null;
  const title = new Date(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="card rem-coming picked-day">
      <div className="picked-head">
        <h2>{new Date(day).toDateString() === new Date().toDateString() ? `Today, ${title}` : title}</h2>
        <button className="btn small" onClick={() => openDay(day)}>Open day</button>
        <button className="icon-btn" aria-label="Clear the picked day" onClick={() => selectDay(undefined)}><Icon name="close" size={14} /></button>
      </div>
      <div className="rem-scroll">
        <button className="btn ghost small picked-new" onClick={() => startNewEvent({ day })}><Icon name="plus" size={13} /> New event on {new Date(day).toLocaleDateString('en-GB', { weekday: 'long' })}</button>
        {!list.length ? <div style={{ color: 'var(--text-muted)' }}>Nothing on</div> : list.map((e) => (
          <div key={e.id} className="coming-row" role="button" tabIndex={0} onClick={() => onPick(e)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); onPick(e); } }}>
            <span className="acc-dots col" style={{ marginTop: 6 }}><AccountDots event={e} /></span>
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{e.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88em' }}>{e.allDay || e.end - e.start >= 86400000 ? 'All day' : `${timeText(e.start)} to ${timeText(e.end)}`} · {e.calendarName}</div>
            </div>
            {e.meetingUrl && <JoinButton event={e} small />}
          </div>
        ))}
      </div>
    </div>
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

/** Appears over the mail a few minutes before a meeting that has a video link. It turns amber for the first minute, coral once the meeting has started, and goes by itself 10 minutes after the start. */
export function MeetingBanner() {
  const events = useMail((s) => s.events);
  const enabled = useSettings((s) => s.meetingBanner);
  const lead = useSettings((s) => s.meetingBannerMins);
  const hiddenCals = useSettings((s) => s.hiddenCalendars);
  const alertsMode = useSettings((s) => s.hiddenCalendarsAlerts);
  // With "Only alert me from the group I'm looking at", the bar follows the group too.
  const groupOnly = useSettings((s) => s.groupAlertsOnly);
  const calGroups = useSettings((s) => s.calendarGroups);
  const calGroup = useSettings((s) => s.calendarGroup);
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
    const real = enabled ? meetingsSoon(groupOnly ? inGroupView(events, { calendarGroups: calGroups, calendarGroup: calGroup }) : events, now, lead, alertMute({ hiddenCalendars: hiddenCals, hiddenCalendarsAlerts: alertsMode }).all) : [];
    const shown = demo && demo.start + 10 * 60000 > now ? [demo, ...real] : real;
    return shown.filter((e) => !gone.has(`${e.id}|${e.start}`));
  }, [events, enabled, lead, gone, now, demo, hiddenCals, alertsMode, groupOnly, calGroups, calGroup]);
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

