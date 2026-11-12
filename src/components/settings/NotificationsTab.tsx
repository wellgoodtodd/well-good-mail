// Settings › Notifications.
import { useMail, editAccount } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { isTauri, notify, openExternal } from '../../lib/platform';
import { showBanner } from '../../lib/banners';
import { Row, Radio, Check } from '../ui';

export function NotificationsTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  return (
    <>
      <h1>Notifications</h1>
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
      <section className="set-section">
        <h2>Per account</h2>
        {accounts.map((a) => (
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

// ---------- privacy ----------
