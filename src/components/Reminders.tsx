// Reminders: calendar items and follow ups that wait quietly until you clear them.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Icon } from './Icon';
import { useMail, dismissReminders, openScreen, refreshEvents, setView, selectThread, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { dueReminders, eventKey, alertMute } from '../lib/reminders';
import { CalendarPicker, ComingUpList, EventPreview, JoinButton, MonthView } from './ComingUp';
import { TimeGridView, CalendarModes } from './CalendarViews';
import { refreshCalendarCopy, startCalendarCopy } from '../lib/calendarCache';
import type { CalendarEvent, ReminderItem } from '../lib/types';

/** One readable sentence about how reminders reach you. */
function alertSummary(s: ReturnType<typeof useSettings.getState>): string {
  const pop = s.reminderMode === 'never' ? 'No pop ups.' : s.reminderMode === 'daily' ? `A daily summary at ${s.summaryTime}.` : s.reminderMode === 'important' ? `Pop ups for important events only, plus a daily summary at ${s.summaryTime}.` : 'Pop ups for every reminder.';
  const times = [s.meetingAlert1On && s.meetingAlert1Mins, s.meetingAlert2On && s.meetingAlert2Mins].filter(Boolean).sort((x, y) => Number(y) - Number(x));
  const video = times.length ? `Video meetings: notified ${times.join(' and ')} minutes before.` : 'Video meeting notifications are off.';
  return `${pop} ${video}${s.flashTaskbar ? ' The taskbar icon flashes.' : ''}`;
}

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

  const mute = alertMute(s);
  const items = useMemo(() => dueReminders(events, followups, dismissed, Date.now(), mute), [events, followups, dismissed, tick, s.hiddenCalendars, s.hiddenCalendarsAlerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [preview, setPreview] = useState<CalendarEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { startCalendarCopy(); }, []);
  const refresh = async () => {
    void refreshCalendarCopy();
    setRefreshing(true);
    try {
      const failed = await refreshEvents();
      toast({ text: failed.length ? `Couldn't reach the calendar for ${failed.join('; ')}` : 'Calendars updated', ttl: failed.length ? 15000 : 2500 });
    } finally { setRefreshing(false); }
  };
  const eventFor = (r: ReminderItem) => (r.kind === 'event' ? events.find((e) => eventKey(e) === r.id) : undefined);
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
    <div className="screen rem-screen">
      <div className="rem-top">
        <div className="rem-main">
          <div className="rem-head">
            <h1>Calendar &amp; Reminders</h1>
            <div className="seg" role="group" aria-label="View">
              <button className={s.remindersView === 'list' ? 'on' : ''} aria-pressed={s.remindersView === 'list'} onClick={() => s.set({ remindersView: 'list' })}><Icon name="list" size={14} /> List</button>
              <button className={s.remindersView === 'calendar' ? 'on' : ''} aria-pressed={s.remindersView === 'calendar'} onClick={() => s.set({ remindersView: 'calendar' })}><Icon name="calendar" size={14} /> Calendar</button>
            </div>
            <span className="grow" />
            <CalendarPicker />
            <button className="btn ghost" disabled={refreshing} onClick={refresh}><span style={{ display: 'inline-flex', animation: refreshing ? 'spin 1s linear infinite' : undefined }}><Icon name="refresh" /></span> {refreshing ? 'Refreshing' : 'Refresh'}</button>
            {s.remindersView === 'list' && <button className="btn" disabled={!items.length} onClick={() => dismissReminders(items.map((i) => i.id))}>Dismiss all</button>}
          </div>
          <p className="lead">Everything from your calendars and follow ups collects here quietly until you clear it. Nothing pops up unless you ask it to.</p>
          <div className="rem-scroll">
            {s.remindersView === 'calendar' ? (s.calendarMode === 'month' ? <MonthView onPick={setPreview} modes={<CalendarModes />} /> : <TimeGridView key={s.calendarMode} mode={s.calendarMode} onPick={setPreview} modes={<CalendarModes />} />) : items.length === 0 ? (
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
                        <div className="title">{eventFor(r) ? <button className="link-btn" onClick={() => setPreview(eventFor(r)!)}>{r.title}</button> : r.title}</div>
                        <div className="sub">{when(r)} · {r.calendarName || label(r.accountId)}</div>
                        {/* Join and Open sit under the name, so the name keeps its width and the right side never moves. */}
                        {(eventFor(r)?.meetingUrl || (r.kind === 'followup' && r.threadId)) && (
                          <div className="rem-under">
                            {eventFor(r)?.meetingUrl && <JoinButton event={eventFor(r)!} small />}
                            {r.kind === 'followup' && r.threadId && (
                              <button className="btn small" onClick={() => { setView({ scope: { type: 'account', accountId: r.accountId }, mailbox: { kind: 'system', folder: 'sent' } }); selectThread(`${r.accountId}|${r.threadId}`); }}>Open</button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rem-end">
                        {r.kind === 'followup' && <span className="pill important">Follow up</span>}
                        {overdue && r.kind === 'event' && <span className="pill overdue">Overdue</span>}
                        {r.kind === 'event' ? (
                          <button className={`icon-btn ${isImportant(r.title) ? 'active' : ''}`} title={isImportant(r.title) ? 'Important: pops up' : 'Mark as important so it pops up'} aria-label="Important" onClick={() => s.toggleIn('importantEvents', r.title)}>
                            <Icon name="star" />
                          </button>
                        ) : <span className="rem-star-space" aria-hidden />}
                        <button className="btn primary" onClick={() => dismissReminders([r.id])}>Done</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <aside className="rem-side">
          <div className="card rem-coming">
            <h2 style={{ margin: '0 0 10px', fontSize: '1em' }}>Coming up</h2>
            <div className="rem-scroll"><ComingUpList onPick={setPreview} /></div>
          </div>
        </aside>
      </div>
      <footer className="rem-footer">
        <div className="alerts-card">
          <div className="al-text">
            <strong>How you get alerted</strong>
            <span>{alertSummary(s)}</span>
          </div>
          <button className="btn" onClick={() => openScreen('settings', 'reminders')}>Change in Settings</button>
        </div>
      </footer>
      {preview && <EventPreview event={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
