// Settings › Updates.
import { useEffect } from 'react';
import { useSettings } from '../../lib/settings';
import { openExternal } from '../../lib/platform';
import { useUpdates, checkForUpdates, installFoundUpdate, restartToUpdate, isBetaVersion } from '../../lib/updater';
import { UpdateLog } from '../WhatsNew';
import { useBetaNotice, checkForBeta, wantsBetaNotices } from '../../lib/betaNotice';
import { Row, Check } from './shared';

export function UpdatesTab() {
  const s = useSettings();
  const u = useUpdates();
  const beta = useBetaNotice();
  const onBeta = isBetaVersion(u.currentVersion);
  useEffect(() => { if (u.status === 'idle') checkForUpdates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (u.currentVersion) checkForBeta(u.currentVersion); }, [u.currentVersion, s.testVersionNotices]);
  return (
    <>
      <h1>Updates</h1>
      <section className="set-section">
        <Row label="Version"><span>{u.currentVersion || '...'}</span></Row>
        <Row label="Status">
          <span>
            {u.status === 'checking' && 'Checking...'}
            {u.status === 'none' && `${onBeta ? (beta.found ? 'A newer test version is out' : beta.status === 'done' && beta.checkedAt ? 'This is the latest test version' : 'No newer full release') : 'Up to date'}${u.checkedAt ? ` (checked ${new Date(u.checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : ''}`}
            {u.status === 'available' && `Version ${u.version} is available`}
            {u.status === 'downloading' && `Downloading ${u.version}...`}
            {u.status === 'ready' && `Version ${u.version} is ready`}
            {u.status === 'error' && <span className="status-bad">Couldn't check ({u.error})</span>}
          </span>
          <span className="upd-actions">
            {u.status === 'available' && <button className="btn primary" onClick={installFoundUpdate}>Download and restart</button>}
            {u.status === 'ready' && <button className="btn primary" onClick={restartToUpdate}>Restart to update</button>}
            <button className="btn" disabled={u.status === 'checking'} onClick={() => { checkForUpdates({ userInitiated: true }); checkForBeta(u.currentVersion, { force: true }); }}>Check now</button>
          </span>
        </Row>
        {wantsBetaNotices(u.currentVersion) && beta.found && (
          <div className={`beta-card ${onBeta ? 'prominent' : ''}`} role="status">
            <div><strong>{onBeta ? `A newer test version is out: ${beta.found.version}` : `A test version is available: ${beta.found.version}`}</strong><span>{onBeta ? 'It does not install by itself. Read what changed, then download it if you want it.' : 'Optional. You stay on the live version, which only updates to the next full release, unless you download this yourself.'}</span></div>
            <div className="beta-actions"><button className="btn" onClick={() => openExternal(beta.found!.notesUrl)}>What's new in it</button><button className="btn" onClick={() => openExternal(beta.found!.downloadUrl)}>Download</button></div>
          </div>
        )}
        <Check checked={s.autoUpdate} onChange={(v) => s.set({ autoUpdate: v })}>Download updates in the background (installs when the app opens, or when you choose Restart)</Check>
        <Check checked={onBeta || s.testVersionNotices} onChange={(v) => { if (!onBeta) s.set({ testVersionNotices: v }); }}>Tell me about test versions{onBeta ? ' (always on while you are on a test version)' : ''}</Check>
      </section>
      <UpdateLog />
      <p className="hint" style={{ marginTop: 18 }}>© 2026 Well Good Media Ltd. Free and open source under the MIT licence. <button className="link-btn" onClick={() => openExternal('https://github.com/wellgoodtodd/well-good-mail/blob/main/LICENSE')}>Read the licence</button></p>
    </>
  );
}
