// Settings › Diagnostics.
import { useEffect, useState } from 'react';
import { useMail, reconnectAccount, syncAccount, toast } from '../../lib/mail';
import { paceInfo } from '../../lib/providers/gmail';
import { useUpdates } from '../../lib/updater';
import { wantsSignIn } from './shared';
import { Row } from '../ui';

export function DiagnosticsTab() {
  const accounts = useMail((st) => st.accounts);
  const messages = useMail((st) => st.messages);
  const u = useUpdates();
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const rows = accounts.map((a) => {
    const n = Object.values(messages).filter((m) => m.accountId === a.id).length;
    const pace = paceInfo(a.email);
    const waitS = pace?.pausedUntil ? Math.ceil((pace.pausedUntil - Date.now()) / 1000) : 0;
    return { a, n, pace, waitS, last: a.lastSync ? new Date(a.lastSync).toLocaleString('en-GB') : 'never' };
  });
  const report = () => [
    `Well Good Mail ${u.currentVersion || ''}`,
    `Emails stored: ${Object.keys(messages).length}`,
    ...rows.map((r) => `${r.a.email}: ${r.a.status}${r.a.error ? ` (${r.a.error})` : ''}, ${r.n} emails, last checked ${r.last}, request spacing ${r.pace?.gapMs ?? 'n/a'} ms${r.waitS ? `, paused ${r.waitS}s by Google` : ''}`),
  ].join('\n');
  void tick;
  return (
    <>
      <h1>Diagnostics</h1>
      <section className="set-section">
        <p className="hint">If something isn't syncing, this shows why. Google limits how fast mail can be fetched, so the app spaces its requests out and slows down further when Google pushes back.</p>
        <Row label="Version"><span>{u.currentVersion || '...'}</span></Row>
        <Row label="Emails stored"><span>{Object.keys(messages).length.toLocaleString('en-GB')}</span></Row>
      </section>
      {rows.map((r) => (
        <section className="set-section diag-section" key={r.a.id}>
          <h2>{r.a.label} <span className="hint" style={{ fontWeight: 400 }}>{r.a.email}</span></h2>
          <Row label="Status"><span>{r.a.status === 'needs-signin' ? <span className="status-bad">Needs signing in again</span> : r.a.status === 'error' ? <span className="status-bad">{r.a.error || 'Problem syncing'}</span> : r.a.status === 'syncing' ? `Syncing${r.a.syncDone ? `: ${r.a.syncDone.toLocaleString('en-GB')} emails so far` : '...'}` : <span className="status-ok">Connected</span>}</span></Row>
          <Row label="Emails stored"><span>{r.n.toLocaleString('en-GB')}</span></Row>
          <Row label="Last checked"><span>{r.last}</span></Row>
          <Row label="Request spacing"><span>{r.pace ? `${r.pace.gapMs} ms${r.pace.gapMs > 200 ? ' (slowed down)' : ''}` : 'not used yet'}{r.waitS ? `. Paused by Google for ${r.waitS} s` : ''}</span></Row>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn" onClick={() => syncAccount(r.a.id)}>Check this account now</button>
            {wantsSignIn(r.a) && <button className="btn primary" onClick={() => reconnectAccount(r.a.id)}>Sign in again</button>}
          </div>
        </section>
      ))}
      <section className="set-section">
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(report()); toast({ text: 'Report copied' }); }}>Copy report</button>
      </section>
    </>
  );
}

// ---------- updates ----------
