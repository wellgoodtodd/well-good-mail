// Settings › Alerts & Notifications: new mail, how alerts appear, calendar and task alerts, per account, quiet hours.
import { useMail, editAccount } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { isTauri, notify, openExternal } from '../../lib/platform';
import { showBanner } from '../../lib/banners';
import { Row, Radio, Check } from '../ui';
import { MinutesPicker } from './CalendarTab';

/** Event reminders, video calls, the daily summary and tasks with a time (moved here from Calendar & Reminders in beta 7). */
function CalendarAlerts() {
  const s = useSettings();
  return (
    <section className="set-section" id="settings-calendar-alerts">
      <h2>Calendar and tasks</h2>
      <p className="hint">Reminders always collect in the list on the Calendar screen. These settings only control interruptions.</p>
      <Radio name="remmode" value={s.reminderMode} onChange={(v) => s.set({ reminderMode: v })} options={[
        { value: 'never', label: 'Never pop up', sub: 'Just add them to the list. Check it when you want.' },
        { value: 'daily', label: 'Once a day summary', sub: 'One notification listing what is on today.' },
        { value: 'important', label: 'Important only, plus a daily summary', sub: 'Pop up only for events you star in the list, and follow ups.' },
        { value: 'all', label: 'Every reminder', sub: 'The usual pop up for everything.' },
      ]} />
      {(s.reminderMode === 'daily' || s.reminderMode === 'important') && (
        <Row label="Summary time" htmlFor="sumtime"><input id="sumtime" type="time" value={s.summaryTime} onChange={(e) => s.set({ summaryTime: e.target.value })} /></Row>
      )}
      <p className="hint">Tasks with a time alert you at that time, like reminders, unless reminders are set to Never pop up.</p>
      <h3 className="sub-head">Video meeting notifications</h3>
      <p className="hint">For events that have a Teams, Zoom or Google Meet link. Pick a time from the list, or type your own number of minutes. Other events use the reminder time set in your calendar.</p>
      <div className="min-grid"><div className="min-row"><Check checked={s.meetingAlert1On} onChange={(v) => s.set({ meetingAlert1On: v })}>First notification</Check><MinutesPicker label="First notification" value={s.meetingAlert1Mins} onChange={(n) => s.set({ meetingAlert1Mins: n })} /><span>before</span></div>
      <div className="min-row"><Check checked={s.meetingAlert2On} onChange={(v) => s.set({ meetingAlert2On: v })}>Second notification</Check><MinutesPicker label="Second notification" value={s.meetingAlert2Mins} onChange={(n) => s.set({ meetingAlert2Mins: n })} /><span>before</span></div>
      <div className="min-row"><Check checked={s.meetingBanner} onChange={(v) => s.set({ meetingBanner: v })}>Banner in the app, with a Join button</Check><MinutesPicker label="Banner in the app" value={s.meetingBannerMins} onChange={(n) => s.set({ meetingBannerMins: n })} /><span>before</span></div></div>
      <p className="hint">A <strong>notification</strong> is the Windows pop up. The <strong>banner</strong> is the bar across the top of the app. The banner turns amber as the meeting starts, then coral, and goes by itself 10 minutes after the start. Meetings you have said No to don't alert you.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => notify('Test meeting in 5 minutes', `${new Date(Date.now() + 5 * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Google Meet link in Well Good Mail`)}>Test notification</button>
        <button className="btn" onClick={() => window.dispatchEvent(new Event('wgm-test-meeting-bar'))}>Test banner</button>
      </div>
      <h3 className="sub-head">Alerts from hidden calendars</h3>
      <p className="hint" style={{ marginTop: 0 }}>Calendars are shown or hidden in Settings › Accounts, under each account's Calendars. This is what happens to the alerts of the hidden ones.</p>
      <Radio name="hidalerts" value={s.hiddenCalendarsAlerts} onChange={(v) => s.set({ hiddenCalendarsAlerts: v })} options={[
        { value: 'all', label: 'Keep all their alerts', sub: 'Hiding only tidies the views.' },
        { value: 'meetings', label: 'Mute ordinary reminders, keep video meeting alerts', sub: 'Recommended. You will not miss a call because you hid its calendar.' },
        { value: 'none', label: 'Mute everything from them', sub: 'No reminders, notifications or banner. Meetings you have said No to are always quiet.' },
      ]} />
    </section>
  );
}

export function NotificationsTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const ordered = [...accounts].sort((a, b) => a.order - b.order);
  return (
    <>
      <h1>Alerts &amp; Notifications</h1>
      <section className="set-section">
        <h2>New mail</h2>
        <Radio name="newmail" value={s.newMailAlerts} onChange={(v) => s.set({ newMailAlerts: v })} options={[
          { value: 'important', label: 'Only from important senders' },
          { value: 'all', label: 'All new mail' },
          { value: 'off', label: 'Off' },
        ]} />
      </section>
      <section className="set-section">
        <h2>How alerts appear</h2>
        <p className="hint">While the app is open and in front of you:</p>
        <Radio name="appopen" value={s.appOpenAlerts} onChange={(v) => s.set({ appOpenAlerts: v })} options={[
          { value: 'banner', label: 'A small banner inside the app' },
          { value: 'windows', label: 'A Windows notification' },
          { value: 'off', label: 'Nothing' },
        ]} />
        <p className="hint" style={{ marginTop: 10 }}>When the app is minimised or in the background, new mail always uses a Windows notification. Its sound, and whether it appears at all, are set in Windows. The app plays no sounds of its own.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn" onClick={() => notify('Isla Grant', 'This is how a new email will look. You can ignore this one.')}>Test notification</button>
          <button className="btn" onClick={() => showBanner({ title: 'Isla Grant', body: 'This is how a new email will look in the app.', run: () => {} , actionLabel: 'Open' })}>Test banner</button>
          {isTauri() && <button className="btn" onClick={() => openExternal('ms-settings:notifications')}>Open Windows notification settings</button>}
        </div>
      </section>
      <CalendarAlerts />
      <section className="set-section">
        <h2>Per account</h2>
        {ordered.map((a) => (
          <Row key={a.id} label={a.label}>
            <select aria-label={`Alerts for ${a.email}`} value={a.notify} onChange={(e) => editAccount(a.id, { notify: e.target.value as typeof a.notify }, 'alerts')}>
              <option value="all">Follow the setting above</option>
              <option value="important">Important senders only</option>
              <option value="off">Never</option>
            </select>
          </Row>
        ))}
      </section>
      <section className="set-section">
        <h2>Quiet hours</h2>
        {s.alertsPausedUntil > Date.now() && (
          <p className="hint" style={{ marginTop: 0 }}>Alerts paused until {new Date(s.alertsPausedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · <button className="link-btn" onClick={() => s.set({ alertsPausedUntil: 0 })}>Resume</button></p>
        )}
        <Check checked={s.quietHours.enabled} onChange={(v) => s.set({ quietHours: { ...s.quietHours, enabled: v } })}>No notifications during quiet hours</Check>
        {s.quietHours.enabled && (
          <div className="set-row">
            <span className="label">From</span>
            <input type="time" aria-label="Quiet hours start" value={s.quietHours.from} onChange={(e) => s.set({ quietHours: { ...s.quietHours, from: e.target.value } })} />
            <span>to</span>
            <input type="time" aria-label="Quiet hours end" value={s.quietHours.to} onChange={(e) => s.set({ quietHours: { ...s.quietHours, to: e.target.value } })} />
          </div>
        )}
      </section>
    </>
  );
}
