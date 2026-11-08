// A small pop-up once after an update, and the update log shown under Settings > Updates.
import { useEffect, useState } from 'react';
import { useMail, openScreen } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { useUpdates } from '../lib/updater';
import { isTauri } from '../lib/platform';
import { baseVersion, releaseFor, RELEASES } from '../lib/whatsNew';
import { Icon } from './Icon';

export function WhatsNew() {
  const version = useUpdates((s) => s.currentVersion);
  const seen = useSettings((s) => s.whatsNewSeen);
  const set = useSettings((s) => s.set);
  const ready = useMail((s) => s.ready);
  const accounts = useMail((s) => s.accounts);
  const [open, setOpen] = useState(false);
  const base = version ? baseVersion(version) : '';

  useEffect(() => {
    if (!ready || !base || !isTauri() || seen === base) return;
    // A brand new install has nothing to catch up on.
    if (!seen && !accounts.length) { set({ whatsNewSeen: base }); return; }
    if (!releaseFor(base)) { set({ whatsNewSeen: base }); return; }
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [ready, base, seen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const release = base ? releaseFor(base) : undefined;
  if (!open || !release) return null;
  const done = (all = false) => {
    set({ whatsNewSeen: base });
    setOpen(false);
    if (all) openScreen('settings', 'updates');
  };
  return (
    <div className="ev-scrim">
      <div className="ev-pop whatsnew" role="dialog" aria-modal="true" aria-label={`What's new in ${release.version}`} onClick={(e) => e.stopPropagation()}>
        <div className="ev-head">
          <h2>What's new in {release.version}</h2>
          <button className="icon-btn" aria-label="Close" onClick={() => done()}><Icon name="close" size={14} /></button>
        </div>
        <ul className="wn-list">{release.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        <div className="ev-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={() => done(true)}>See all updates</button>
          <button className="btn primary" onClick={() => done()}>Got it</button>
        </div>
      </div>
    </div>
  );
}

/** Every main version, newest open and the rest folded away. */
export function UpdateLog() {
  return (
    <section className="set-section">
      <h2 style={{ margin: '0 0 8px' }}>What's new</h2>
      {RELEASES.map((r, i) => (
        <details key={r.version} className="log-item" open={i === 0}>
          <summary><strong>{r.version}</strong> <span className="log-date">{r.date}{i === 0 ? ' · latest' : ''}</span></summary>
          <ul>{r.more.map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      ))}
      <p className="hint">Test versions are folded into the main version they lead to. The full history is on GitHub.</p>
    </section>
  );
}
