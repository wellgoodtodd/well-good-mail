// Settings › General › Backup & Sync: settings the same on every computer, automatic backups to Google Drive, and
// the Well Good Mail folder in Drive they live in.
import { useEffect, useState } from 'react';
import { toast } from '../../lib/mail';
import { useSettings, type Settings } from '../../lib/settings';
import { driveAccount, enableSettingsSync, useSettingsSyncStatus } from '../../lib/settingsSync';
import { backUpNow, defaultDeviceName, listBackups, readBackup, restoreBackup, useBackupStatus } from '../../lib/driveBackup';
import { cleanFolderName, folderInfo, renameFolder } from '../../lib/driveFolder';
import { askChoice, askText } from '../../lib/dialogs';
import { openExternal } from '../../lib/platform';
import { Row, Check } from '../ui';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function BackupSync() {
  const s = useSettings();
  const busy = useBackupStatus((b) => b.busy);
  const failed = useBackupStatus((b) => b.error);
  const lastSaved = useSettingsSyncStatus((st) => st.lastSaved);
  const email = driveAccount();
  const [folder, setFolder] = useState<{ name: string; link: string } | null>(null);
  const [name, setName] = useState(s.deviceName);
  useEffect(() => setName(s.deviceName), [s.deviceName]);
  const usesDrive = Boolean(email) && (s.syncSettings || s.backupEvery !== 'off');
  useEffect(() => {
    if (!email || !usesDrive) return;
    let live = true;
    folderInfo(email).then((f) => live && setFolder(f)).catch(() => {});
    return () => { live = false; };
  }, [email, usesDrive]);

  const turnSyncOn = (v: boolean) => {
    s.set({ syncSettings: v });
    if (!v) return;
    void enableSettingsSync();
    // The first time, backups come on too, so it's all set up in one go.
    if (s.backupEvery === 'off' && !s.backupLastAt) {
      s.set({ backupEvery: 'week' });
      toast({ text: 'Weekly backups to Google Drive are on too. You can change that under Backup & Sync.', ttl: 8000 });
    }
  };

  const restore = async () => {
    if (!email) return;
    let list;
    try { list = await listBackups(email); } catch (e) { return void toast({ text: `Couldn't look in Google Drive: ${e instanceof Error ? e.message : e}` }); }
    if (!list.length) return void toast({ text: 'There are no backups in Google Drive yet.' });
    const pick = await askChoice('Restore a backup', 'Your settings, rules, signatures and templates go back to how they were then. Undo (Ctrl+Z) puts them back as they are now.',
      list.slice(0, 8).map((b, i) => ({ id: b.id, label: `${when(b.createdAt)}, ${b.device || 'a computer'}`, primary: i === 0 })));
    if (!pick) return;
    try {
      const missing = restoreBackup(await readBackup(pick, email));
      toast({ text: missing.length ? `Restored. ${missing.length === 1 ? "One account isn't" : `${missing.length} accounts aren't`} on this computer yet: they're listed in Settings › Accounts to sign in to.` : 'Restored from the backup', ttl: missing.length ? 12000 : 5000 });
    } catch (e) { toast({ text: `Couldn't restore: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
  };

  const rename = async () => {
    if (!email) return;
    const n = (await askText('Rename the folder in Google Drive', folder?.name || 'Well Good Mail', 'Rename'))?.trim();
    if (!n || n === folder?.name) return;
    try { await renameFolder(email, n); const f = await folderInfo(email); setFolder(f); } catch (e) { toast({ text: `Couldn't rename it: ${e instanceof Error ? e.message : e}` }); }
  };

  const saveName = () => {
    const n = cleanFolderName(name, s.deviceName || defaultDeviceName());
    if (n !== s.deviceName) s.set({ deviceName: n });
    setName(n);
  };

  return (
    <section className="set-section">
      <h2>Backup &amp; Sync</h2>
      {!email && <p className="hint" style={{ margin: '0 0 6px' }}>Backup &amp; Sync uses Google Drive, so it needs a Google account in Settings › Accounts.</p>}
      {email && <p className="backup-home" style={{ margin: '0 0 8px' }}>Kept in the Google Drive of <strong>{email}</strong>. Make a note of it: on a new computer, sign in to this account first and Well Good Mail offers to set itself up from here, then lists your other accounts to sign in to.</p>}
      <Check checked={s.syncSettings} onChange={turnSyncOn}>Keep my settings the same on every computer<span className="check-sub">Uses a small file in your Google Drive. Your keys and mail are never in it.</span></Check>
      {s.syncSettings && <p className="hint" style={{ margin: '2px 0 8px 28px' }}>{lastSaved ? `Last saved to Google Drive: ${when(lastSaved)}` : 'Not saved yet'}</p>}
      <Row label="Back up automatically" htmlFor="backup-every">
        <select id="backup-every" value={s.backupEvery} disabled={!email} onChange={(e) => s.set({ backupEvery: e.target.value as Settings['backupEvery'] })}>
          <option value="off">Off</option>
          <option value="day">Every day</option>
          <option value="week">Every week</option>
          <option value="month">Every month</option>
        </select>
      </Row>
      <Row label="Keep" htmlFor="backup-keep">
        <select id="backup-keep" value={s.backupKeep} disabled={!email} onChange={(e) => s.set({ backupKeep: Number(e.target.value) })}>
          {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} backups for each computer</option>)}
        </select>
      </Row>
      <Row label="This computer's name" htmlFor="device-name">
        <input id="device-name" value={name || ''} placeholder={defaultDeviceName()} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      </Row>
      <p className="hint" style={{ margin: '0 0 8px' }}>
        Backups hold your settings, rules, signatures, templates and the list of accounts. No mail, passwords or keys.{' '}
        {failed ? `The last backup didn't work: ${failed}` : s.backupLastAt ? `Last backup: ${when(s.backupLastAt)}.` : 'No backup from this computer yet.'}
      </p>
      <div className="set-buttons" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className="btn" disabled={!email || busy} onClick={() => void backUpNow()}>{busy ? 'Backing up…' : 'Back up now'}</button>
        <button className="btn" disabled={!email} onClick={() => void restore()}>Restore…</button>
      </div>
      {email && folder && (
        <div className="set-row">
          <label>Folder in Google Drive<span className="check-sub">{folder.name}, in {email}. Settings, backups and files put on events are kept here. You can move it in Drive.</span></label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void openExternal(folder.link)}>Open</button>
            <button className="btn" onClick={() => void rename()}>Rename…</button>
          </span>
        </div>
      )}
    </section>
  );
}
