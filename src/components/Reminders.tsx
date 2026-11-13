// Reminders: calendar items and follow ups that wait quietly until you clear them.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Icon } from './Icon';
import { useMail, dismissReminders, openScreen, refreshEvents, reconnectAccount, setView, selectThread, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { calendarFailureToast } from '../lib/plainErrors';
import { dueReminders, eventKey, alertMute } from '../lib/reminders';
import { inGroupView } from '../lib/meetings';
import { startNewEvent } from './NewEvent';
import { CalendarPicker, ComingUpList, PickedDay } from './ComingUp';
import { EventPreview } from './EventPopup';
import { InvitationsButton } from './Invitations';
import { JoinButton } from './calendarBits';
import { MonthView, TimeGridView, CalendarModes } from './CalendarViews';
import { SelectionBar, clearSelected, toggleSelected, useEventSelection } from './EventSelection';
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
  // The List view follows the Calendar Group you're looking at, like the calendar.
  const items = useMemo(() => dueReminders(inGroupView(events, s), followups, dismissed, Date.now(), mute), [events, followups, dismissed, tick, s.hiddenCalendars, s.hiddenCalendarsAlerts, s.calendarGroups, s.calendarGroup]); // eslint-disable-line react-hooks/exhaustive-deps
  const [preview, setPreview] = useState<CalendarEvent | null>(null);
  // Ticked rows in the List view: the same picking as in the calendar.
  const picked = useEventSelection((x) => x.ids);
  useEffect(() => () => clearSelected(), []);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { startCalendarCopy(); }, []);
  const refresh = async () => {
    void refreshCalendarCopy();
    setRefreshing(true);
    try {
      const failed = await refreshEvents();
      toast(failed.length ? calendarFailureToast(failed, useMail.getState().accounts, () => void refresh(), (id) => void reconnectAccount(id)) : { text: 'Calendars updated', ttl: 2500 });
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
            {/* Kept together, so on a narrow window they move to the next line as one row. */}
            <div className="rem-actions">
              <InvitationsButton />
              <CalendarPicker />
              <button className="icon-btn rem-refresh" disabled={refreshing} title={refreshing ? 'Refreshing the calendars' : 'Refresh the calendars'} aria-label={refreshing ? 'Refreshing the calendars' : 'Refresh the calendars'} onClick={refresh}><span style={{ display: 'inline-flex', animation: refreshing ? 'spin 1s linear infinite' : undefined }}><Icon name="refresh" /></span></button>
              {s.remindersView === 'list' && <button className="btn" disabled={!items.length} onClick={() => dismissReminders(items.map((i) => i.id))}>Dismiss all</button>}
              <button className="btn primary" title="New event (Ctrl+Alt+N)" onClick={() => startNewEvent()}><Icon name="plus" size={14} /> New event</button>
            </div>
          </div>
          <p className="lead">Everything from your calendars and follow ups collects here quietly until you clear it. Nothing pops up unless you ask it to.</p>
          <div className="rem-scroll">
            {s.remindersView === 'calendar' ? (s.calendarMode === 'month' ? <MonthView onPick={setPreview} modes={<CalendarModes />} /> : <TimeGridView key={s.calendarMode} mode={s.calendarMode} onPick={setPreview} modes={<CalendarModes />} />) : items.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Icon name="check" size={26} />
                <div style={{ marginTop: 8, fontSize: '1.1em', color: 'var(--text)' }}>All clear</div>
              </div>
            ) : (
              <>
              {picked.length > 0 && <SelectionBar extra={<button className="btn primary" onClick={() => { const ids = items.filter((r) => { const e = eventFor(r); return e && picked.includes(e.id); }).map((r) => r.id); void dismissReminders(ids); clearSelected(); }}>Done for {picked.length}</button>} />}
              <div className={`card ${picked.length ? 'rem-picking' : ''}`}>
                {items.map((r) => {
                  const overdue = r.eventStart !== undefined && r.eventStart < Date.now() - 3600000;
                  return (
                    <div className={`rem-row ${eventFor(r) && picked.includes(eventFor(r)!.id) ? 'picked' : ''}`} key={r.id}>
                      {eventFor(r) ? <input type="checkbox" className="rem-tick" aria-label={`Pick ${r.title}`} checked={picked.includes(eventFor(r)!.id)} onChange={() => toggleSelected(eventFor(r)!.id)} /> : <span className="rem-tick-space" aria-hidden />}
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
              </>
            )}
          </div>
        </div>
        <aside className="rem-side">
          <div className="card rem-coming">
            <h2 style={{ margin: '0 0 10px', fontSize: '1em' }}>Coming up</h2>
            <div className="rem-scroll"><ComingUpList onPick={setPreview} /></div>
          </div>
          {s.remindersView === 'calendar' && <PickedDay onPick={setPreview} />}
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
