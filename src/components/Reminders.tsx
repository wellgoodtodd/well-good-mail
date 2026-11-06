// Reminders: calendar items and follow ups that wait quietly until you clear them.
import { useEffect, useMemo, useReducer } from 'react';
import { Icon } from './Icon';
import { useMail, dismissReminders, openScreen, refreshEvents, setView, selectThread } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { dueReminders, upcoming } from '../lib/reminders';
import type { ReminderItem } from '../lib/types';

const MODE_TEXT = { never: 'Off', daily: 'Daily summary only', important: 'Important only', all: 'Every reminder' } as const;

export function Reminders() {
  const events = useMail((s) => s.events);
  const followups = useMail((s) => s.followups);
  const dismissed = useMail((s) => s.dismissed);
  const accounts = useMail((s) => s.accounts);
  const s = useSettings();
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const t = () => bump();
    window.addEventListener('wgm-minute', t);
    return () => window.removeEventListener('wgm-minute', t);
  }, []);

  const items = useMemo(() => dueReminders(events, followups, dismissed), [events, followups, dismissed, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => upcoming(events).slice(0, 8), [events, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const colour = (id: string) => accounts.find((a) => a.id === id)?.colour || '#888';
  const label = (id: string) => accounts.find((a) => a.id === id)?.label || '';

  const when = (r: ReminderItem) => {
    const t = r.eventStart ?? r.dueAt;
    const d = new Date(t);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = t < today.getTime() ? (t >= today.getTime() - 86400000 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })) : t < today.getTime() + 86400000 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' });
    return `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const isImportant = (title: string) => s.importantEvents.includes(title.toLowerCase());

  return (
    <div className="screen">
      <div className="split-screen">
        <div className="main-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ flex: 1 }}>Reminders</h1>
            <button className="btn ghost" onClick={() => refreshEvents()}><Icon name="refresh" /> Refresh</button>
            <button className="btn" disabled={!items.length} onClick={() => dismissReminders(items.map((i) => i.id))}>Dismiss all</button>
          </div>
          <p className="lead">Everything from your calendars and follow ups collects here quietly until you clear it. Nothing pops up unless you ask it to.</p>
          {items.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="check" size={26} />
              <div style={{ marginTop: 8, fontSize: '1.1em', color: 'var(--text)' }}>All clear</div>
            </div>
          ) : (
            <div className="card">
              {items.map((r) => {
                const overdue = r.eventStart !== undefined && r.eventStart < Date.now() - 3600000;
                return (
                  <div className="rem-row" key={r.id}>
                    <span className="bar" style={{ background: colour(r.accountId) }} />
                    <div className="grow">
                      <div className="title">{r.title}</div>
                      <div className="sub">{when(r)} · {r.calendarName || label(r.accountId)}</div>
                    </div>
                    {r.kind === 'followup' && <span className="pill important">Follow up</span>}
                    {overdue && r.kind === 'event' && <span className="pill overdue">Overdue</span>}
                    {r.kind === 'event' && (
                      <button className={`icon-btn ${isImportant(r.title) ? 'active' : ''}`} title={isImportant(r.title) ? 'Important: pops up' : 'Mark as important so it pops up'} aria-label="Important" onClick={() => s.toggleIn('importantEvents', r.title)}>
                        <Icon name="star" />
                      </button>
                    )}
                    {r.kind === 'followup' && r.threadId && (
                      <button className="btn" onClick={() => { setView({ scope: { type: 'account', accountId: r.accountId }, mailbox: { kind: 'system', folder: 'sent' } }); selectThread(`${r.accountId}|${r.threadId}`); }}>Open</button>
                    )}
                    <button className="btn primary" onClick={() => dismissReminders([r.id])}>Done</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <aside className="side-col">
          <div className="card" style={{ padding: 16 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '1em' }}>How you get alerted</h2>
            <div className="kv"><span className="k">Pop ups</span><span>{MODE_TEXT[s.reminderMode]}</span></div>
            {(s.reminderMode === 'daily' || s.reminderMode === 'important') && <div className="kv"><span className="k">Daily summary</span><span>{s.summaryTime}</span></div>}
            <div className="kv"><span className="k">Taskbar flashing</span><span>{s.flashTaskbar ? 'On' : 'Never'}</span></div>
            <button className="btn ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => openScreen('settings', 'reminders')}>Change in Settings</button>
          </div>
          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '1em' }}>Coming up</h2>
            {next.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Nothing in the next week</div>}
            {next.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
                <span className="dot" style={{ background: colour(e.accountId), marginTop: 6 }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{e.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88em' }}>
                    {new Date(e.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {!e.allDay && `, ${new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`} · {e.calendarName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
