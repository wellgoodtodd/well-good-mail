// Settings › Offline.
import { useEffect, useState } from 'react';
import { keptAccounts, forgetKeptAccount } from '../../lib/mail';
import { useMail, toast } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { exportCache, importCache } from '../../lib/cacheTransfer';
import { exportKeys, importKeys } from '../../lib/backup';
import { isTauri, previewsSize, clearPreviews, openPreviewsFolder, chooseFolder } from '../../lib/platform';
import { fileSize } from '../ui';
import { RANGE_OPTS, KeepMail } from './shared';
import { Row } from '../ui';

export function AttachmentsSection() {
  const folder = useSettings((st) => st.downloadFolder);
  const [size, setSize] = useState<{ bytes: number; files: number } | null>(null);
  const load = () => { void previewsSize().then(setSize).catch(() => setSize(null)); };
  useEffect(load, []);
  const pick = async () => { const d = await chooseFolder('Choose where attachments are saved'); if (d) useSettings.getState().set({ downloadFolder: d }); };
  return (
    <section className="set-section">
      <h2>Attachments</h2>
      <div className="set-row">
        <label htmlFor="dlfolder">Save attachments to</label>
        <select id="dlfolder" value={folder ? 'folder' : 'ask'} onChange={(e) => { if (e.target.value === 'ask') useSettings.getState().set({ downloadFolder: '' }); else void pick(); }}>
          <option value="ask">Ask each time</option>
          <option value="folder">{folder ? folder : 'Choose a folder...'}</option>
        </select>
        {folder && <button className="link-btn" onClick={pick}>Change</button>}
      </div>
      <p className="hint">Files that can't be previewed here (like Word, Excel or Pages) open straight away in their own app, from a private Previews folder. Changes you make there aren't saved back to the email: use Save to keep a copy. Programs and scripts are never opened straight from an email.</p>
      {isTauri() && (
        <div className="set-row">
          <span className="label">Previews</span>
          <span className="v">{size ? (size.files ? `${fileSize(size.bytes)} in ${size.files} file${size.files === 1 ? '' : 's'}` : 'Empty') : '...'}</span>
          <button className="btn" onClick={() => void openPreviewsFolder()}>Open folder</button>
          <button className="btn" disabled={!size?.files} onClick={async () => { await clearPreviews(); load(); toast({ text: 'Previews cleared.' }); }}>Clear previews</button>
        </div>
      )}
      {isTauri() && <p className="hint" style={{ marginBottom: 0 }}>Previews older than 30 days are cleared by themselves.</p>}
    </section>
  );
}

/** Mail kept from accounts that were removed, so adding them again is instant. Shown only when there is some. */
export function KeptMailSection() {
  const [kept, setKept] = useState<{ id: string; email: string; label: string; count: number }[]>([]);
  const accounts = useMail((st) => st.accounts);
  useEffect(() => { void keptAccounts().then(setKept).catch(() => setKept([])); }, [accounts.length]);
  if (!kept.length) return null;
  return (
    <section className="set-section">
      <h2>Mail kept from removed accounts</h2>
      <p className="hint">Add one of these accounts again and its mail is back at once.</p>
      {kept.map((k) => (
        <div key={k.id} className="set-card">
          <div className="tx"><strong>{k.label}</strong><span>{k.email} · {k.count.toLocaleString()} emails</span></div>
          <button className="btn" onClick={() => void forgetKeptAccount(k.id).then(() => { setKept((x) => x.filter((y) => y.id !== k.id)); toast({ text: `${k.email}'s kept mail is deleted from this computer.` }); })}>Delete from this computer</button>
        </div>
      ))}
    </section>
  );
}

export function OfflineTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const count = useMail((st) => Object.keys(st.messages).length);
  const opts = RANGE_OPTS;
  return (
    <>
      <h1>Storage</h1>
      <AttachmentsSection />
      <KeptMailSection />
      <section className="set-section">
        <h2>Moving to another computer</h2>
        <p className="hint">Export saves the mail kept on this PC into one file (no passwords in it). Import reads that file on another computer so it doesn't have to download everything again. Sign in to your accounts there as usual, then import: each account only fetches what's new.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => exportCache().catch((e) => toast({ text: `Export failed: ${e instanceof Error ? e.message : e}` }))}>Export mail cache...</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Import mail cache...
            <input type="file" accept=".wgmcache,application/gzip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCache(f).catch((err) => toast({ text: `Import failed: ${err instanceof Error ? err.message : err}` })); }} />
          </label>
        </div>
      </section>
      {isTauri() && (
        <section className="set-section">
          <h2>Back up your app keys</h2>
          <p className="hint">The Google key from the setup guide is kept in Windows Credential Manager. If you reinstall Windows or move to a new PC it is gone, and making another takes ten minutes. This saves the keys to a file you choose. It holds no mail and no sign ins, but it does hold your Google secret, so keep it somewhere private such as a password manager.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" onClick={() => exportKeys().catch((e) => toast({ text: `Backup failed: ${e instanceof Error ? e.message : e}` }))}>Back up my keys...</button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Restore keys...
              <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importKeys(f).then((n) => { toast({ text: `${n} key${n === 1 ? '' : 's'} restored. Restart the app, then sign in to your accounts again.`, ttl: 8000 }); }).catch((err) => toast({ text: `Restore failed: ${err instanceof Error ? err.message : err}` })); }} />
            </label>
            <span className="hint" style={{ margin: 0 }}>{s.keysBackedUpAt ? `Last backed up ${new Date(s.keysBackedUpAt).toLocaleDateString('en-GB')}` : 'Not backed up yet'}</span>
          </div>
        </section>
      )}
      <section className="set-section">
        <h2>Mail kept on this computer</h2>
        <p className="hint">Mail in this window is stored on your PC for instant search and offline reading. Recent mail (about 6 weeks) is stored in full; older mail downloads when you open it. Searches also check Google's servers for anything older. {count.toLocaleString('en-GB')} emails stored now.</p>
        {accounts.map((a) => (
          <Row key={a.id} label={a.label}>
            <KeepMail a={a} />
          </Row>
        ))}
        <Row label="New accounts keep" htmlFor="defret">
          <select id="defret" value={String(s.defaultRetentionDays)} onChange={(e) => s.set({ defaultRetentionDays: e.target.value === 'null' ? null : Number(e.target.value) })}>
            {opts.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
          </select>
        </Row>
      </section>
    </>
  );
}

// ---------- templates ----------
