// Settings › General.
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { restartPolling, toast, refreshTaskbarCount } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { enableSettingsSync } from '../../lib/settingsSync';
import { invoke, isTauri, setAutostart, setCloseQuits, openExternal } from '../../lib/platform';
import { Row, Check } from '../ui';

/** Email links in a browser or another app: open them here. Windows asks you to confirm the choice. */
export function DefaultMailApp() {
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const look = () => { void invoke<boolean>('is_default_mail_app').then(setIsDefault).catch(() => setIsDefault(false)); };
  useEffect(() => {
    look();
    // Back from Windows Settings: look again.
    window.addEventListener('focus', look);
    return () => window.removeEventListener('focus', look);
  }, []);
  const make = async () => {
    try {
      await invoke('register_mail_app');
      await openExternal('ms-settings:defaultapps?registeredAppUser=Well%20Good%20Mail');
      if (!isDefault) toast({ text: 'In Windows Settings, choose Well Good Mail for MAILTO (email links).', ttl: 12000 });
      // Keep looking while Windows Settings is open, so the row changes as soon as the choice is made.
      let n = 0;
      const t = setInterval(() => { look(); if (++n >= 45) clearInterval(t); }, 2000);
    } catch (e) {
      toast({ text: `Couldn't set it up: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    }
  };
  return (
    <div className="set-row">
      <label>Default mail app<span className="check-sub">{isDefault ? 'Email links in your browser and other apps open a new email here.' : 'Make email links in your browser and other apps open a new email here.'}</span></label>
      {isDefault
        ? <span className="default-set"><span className="acct-pill ok"><Icon name="check" size={12} /> Default</span><button className="btn" onClick={make}>Change…</button></span>
        : <button className="btn" onClick={make}>Make default…</button>}
    </div>
  );
}

/** How the app starts, closes and checks for mail. */
export function GeneralTab() {
  const s = useSettings();
  return (
    <>
      <h1>General</h1>
      <section className="set-section">
        <h2>Starting and closing</h2>
        <Check checked={s.startWithWindows} onChange={(v) => { s.set({ startWithWindows: v }); setAutostart(v); }}>Open when Windows starts<span className="check-sub">Starts quietly in the tray, so mail and reminders are ready.</span></Check>
        <Check checked={!s.closeQuits} onChange={(v) => { s.set({ closeQuits: !v }); setCloseQuits(!v); }}>Keep running in the tray when the window is closed<span className="check-sub">So alerts, reminders and scheduled emails still go out. Quit from the tray icon.</span></Check>
      </section>
      <section className="set-section">
        <h2>Mail</h2>
        <Row label="Check for new mail every" htmlFor="poll">
          <select id="poll" value={s.pollSeconds} onChange={(e) => { s.set({ pollSeconds: Number(e.target.value) }); setTimeout(restartPolling); }}>
            {[15, 30, 60, 120, 300].map((n) => <option key={n} value={n}>{n < 60 ? `${n} seconds` : `${n / 60} minute${n > 60 ? 's' : ''}`}</option>)}
          </select>
        </Row>
        <p className="hint" style={{ margin: '0 0 6px' }}>iCloud and other email accounts get new Inbox mail straight away anyway. F5 or the refresh button checks any time.</p>
        {isTauri() && <DefaultMailApp />}
        <Check checked={s.taskbarCount} onChange={(v) => { s.set({ taskbarCount: v }); setTimeout(refreshTaskbarCount); }}>Unread count on the taskbar icon<span className="check-sub">The number of unread emails in your Inboxes.</span></Check>
        <Check checked={s.flashTaskbar} onChange={(v) => s.set({ flashTaskbar: v })}>Flash the taskbar icon<span className="check-sub">For reminders and new mail when the app is in the background.</span></Check>
      </section>
      <section className="set-section">
        <h2>Every computer</h2>
        <Check checked={s.syncSettings} onChange={(v) => { s.set({ syncSettings: v }); if (v) enableSettingsSync(); }}>Keep my settings the same on every computer<span className="check-sub">Uses a small file in your Google Drive. Your keys and mail are never in it.</span></Check>
      </section>
    </>
  );
}
