// Settings › Privacy.
import { useState } from 'react';
import { Icon } from '../Icon';
import { useSettings } from '../../lib/settings';
import { Radio, Check } from '../ui';

export function PrivacyTab() {
  const s = useSettings();
  return (
    <>
      <h1>Images &amp; privacy</h1>
      <section className="set-section">
        <h2>Images in emails</h2>
        <Radio name="img" value={s.imagePolicy} onChange={(v) => s.set({ imagePolicy: v })} options={[
          { value: 'block', label: 'Hide images until I load them', sub: 'Recommended. Senders can\'t tell when you open their email.' },
          { value: 'known', label: 'Load images from people in my contacts' },
          { value: 'always', label: 'Always load images' },
        ]} />
        <Check checked={s.blockTrackers} onChange={(v) => s.set({ blockTrackers: v })}>Block tracking pixels, even when images are loaded</Check>
        <Check checked={s.darkEmails} onChange={(v) => s.set({ darkEmails: v })}>Show emails in dark mode when the app is dark</Check>
      </section>
      <section className="set-section">
        <h2>Trusted senders ({s.trustedSenders.length})</h2>
        <p className="hint">Images always load from these addresses.</p>
        <div className="tag-list">
          {s.trustedSenders.map((t) => <span key={t} className="chip">{t}<button aria-label={`Remove ${t}`} onClick={() => s.toggleIn('trustedSenders', t)}><Icon name="close" size={12} /></button></span>)}
          {!s.trustedSenders.length && <span style={{ color: 'var(--text-muted)' }}>None yet</span>}
        </div>
      </section>
    </>
  );
}

// ---------- offline ----------

export function PeopleTab() {
  const s = useSettings();
  const [add, setAdd] = useState('');
  const [blockAdd, setBlockAdd] = useState('');
  return (
    <>
      <h1>Important senders</h1>
      <section className="set-section">
        <p className="hint">Emails from these people get their own Important mailbox and can alert you when everything else is quiet.</p>
        <div className="tag-list">
          {s.vips.map((v) => <span key={v} className="chip">{v}<button aria-label={`Remove ${v}`} onClick={() => s.toggleIn('vips', v)}><Icon name="close" size={12} /></button></span>)}
        </div>
        <form className="set-row" onSubmit={(e) => { e.preventDefault(); if (add.includes('@')) { s.toggleIn('vips', add.trim()); setAdd(''); } }}>
          <input type="email" placeholder="name@example.com" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add important sender" />
          <button className="btn" type="submit">Add</button>
        </form>
      </section>
      <section className="set-section">
        <h2>Blocked senders ({s.blockedSenders.length})</h2>
        <p className="hint">Emails from these addresses go straight to Junk, and never alert you. Block someone from the More menu on any of their emails.</p>
        <div className="tag-list">
          {s.blockedSenders.map((v) => <span key={v} className="chip">{v}<button aria-label={`Unblock ${v}`} onClick={() => s.toggleIn('blockedSenders', v)}><Icon name="close" size={12} /></button></span>)}
        </div>
        <form className="set-row" onSubmit={(e) => { e.preventDefault(); if (blockAdd.includes('@')) { s.toggleIn('blockedSenders', blockAdd.trim()); setBlockAdd(''); } }}>
          <input type="email" placeholder="name@example.com" value={blockAdd} onChange={(e) => setBlockAdd(e.target.value)} aria-label="Block a sender" />
          <button className="btn" type="submit">Block</button>
        </form>
      </section>
      <section className="set-section">
        <h2>Muted conversations ({s.mutedThreads.length})</h2>
        <p className="hint">New replies in muted conversations skip your inbox. Unmute from the conversation's menu.</p>
        {s.mutedThreads.length > 0 && <button className="btn ghost" onClick={() => s.set({ mutedThreads: [] })}>Unmute all</button>}
      </section>
    </>
  );
}

// ---------- shortcuts ----------
