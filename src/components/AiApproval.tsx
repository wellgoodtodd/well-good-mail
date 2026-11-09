// What the person sees when an AI app wants something: one card for everything waiting (with a tick for each
// account, so any can be left out), the resume question after a pause, and the small sign in the top bar.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useSettings } from '../lib/settings';
import { openScreen } from '../lib/mail';
import { useApprovals, answerAll, toggleTick, answerResume } from '../lib/mcp/approvals';
import { useActivity } from '../lib/mcp/activity';
import { pauseMcp, resumeMcp } from '../lib/mcp/server';
import { useMenu } from './ui';

export function AiApprovalCard() {
  const { asks, resume } = useApprovals();
  if (resume) {
    return (
      <div className="ev-scrim ai-scrim">
        <div className="ev-pop ai-card" role="alertdialog" aria-modal="true" aria-label={`${resume.app} wants to use Well Good Mail again`}>
          <div className="ai-card-head"><Icon name="sparkle" size={18} /><h2>{resume.app} wants to use Well Good Mail again</h2></div>
          <p className="ai-card-sub">The AI connection is paused. If you weren't expecting this, choose Not now and look at Activity in Settings, AI connection.</p>
          <div className="ai-card-actions">
            <button className="btn" onClick={() => answerResume('no')}>Not now</button>
            <span className="grow" />
            <button className="btn" onClick={() => answerResume('today')}>Resume, don't pause today</button>
            <button className="btn primary" onClick={() => answerResume('resume')}>Resume</button>
          </div>
        </div>
      </div>
    );
  }
  if (!asks.length) return null;
  return <AskCard asks={asks} />;
}

const HINT_KEY = 'wgm-ai-remember-hint';
const typingNow = () => {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type))));
};

function AskCard({ asks }: { asks: ReturnType<typeof useApprovals.getState>['asks'] }) {
  // Typing when it arrives: wait as a small notice, so no key or click meant for the draft answers it.
  const [held, setHeld] = useState(typingNow);
  // A short pause before the buttons work, so a click that was already on its way can't answer it.
  const [armed, setArmed] = useState(false);
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(HINT_KEY) !== '1'; } catch { return true; } });
  const first = asks[0].key;
  useEffect(() => {
    if (held) return;
    setArmed(false);
    const t = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(t);
  }, [first, held]);
  const app = asks.every((a) => a.app === asks[0].app) ? asks[0].app : 'Your AI apps';
  if (held) {
    return (
      <button className="ai-held" onClick={() => setHeld(false)}>
        <Icon name="sparkle" size={16} /><span><b>{app} is asking</b><small>Show when you're ready</small></span>
      </button>
    );
  }
  // Clicks in the first moment are ignored, without greying the buttons.
  const go = (k: Parameters<typeof answerAll>[0]) => () => { if (armed) answerAll(k); };
  const later = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* fine */ } setHint(false); };
  const canRemember = asks.every((a) => a.canRemember);
  const nothingTicked = asks.every((a) => a.accounts.length > 0 && a.ticked.length === 0);
  const allDrafts = asks.every((a) => a.draft);
  const oneDraft = asks.length === 1 && asks[0].draft;
  return (
    <div className="ev-scrim ai-scrim">
      <div className="ev-pop ai-card" role="alertdialog" aria-modal="true" aria-label={`${app} is asking`}>
        <div className="ai-card-head"><Icon name="sparkle" size={18} /><h2>{app} {asks.length > 1 ? `is asking for ${asks.length} things` : 'is asking'}</h2></div>
        <ul className="ai-card-list">
          {asks.map((a) => (
            <li key={a.key}>
              <span>It wants to {a.what}.</span>
              {a.draft && (
                <div className="ai-draft">
                  <div className="ai-draft-row"><b>From</b><span>{a.draft.from}</span></div>
                  <div className="ai-draft-row"><b>To</b><span>{a.draft.to.join(', ') || '(nobody yet)'}</span></div>
                  {a.draft.cc.length > 0 && <div className="ai-draft-row"><b>Cc</b><span>{a.draft.cc.join(', ')}</span></div>}
                  <div className="ai-draft-row"><b>Subject</b><span>{a.draft.subject}</span></div>
                  {a.draft.group && <div className="ai-draft-row"><b>Group</b><span>{a.draft.group}</span></div>}
                  {a.draft.replyTo && <div className="ai-draft-row"><b>Replies to</b><span>{a.draft.replyTo}</span></div>}
                  <div className="ai-draft-body">{a.draft.text}</div>
                  <div className="ai-draft-note">Your signature for this account is added. It is saved as a draft and never sent: you send it yourself.</div>
                </div>
              )}
              {a.accounts.length > 1 && (
                <span className="ai-card-ticks">
                  {a.accounts.map((acc) => (
                    <label key={acc.id}><input type="checkbox" checked={a.ticked.includes(acc.id)} onChange={() => toggleTick(a.key, acc.id)} /> {acc.name}</label>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
        {!canRemember && <p className="ai-card-sub">This reaches other people, so it always asks.</p>}
        {canRemember && hint && (
          <p className="ai-card-hint">
            Always allow stops it asking about this. You can change it back any time in Settings, AI connection.
            <button className="link-btn" onClick={later}>Got it, don't show again</button>
          </p>
        )}
        <div className="ai-card-actions">
          <button className="btn" onClick={go('refuse')}>Refuse</button>
          <span className="grow" />
          {oneDraft && <button className="btn" onClick={go('edit')} title="Save it and open it in Well Good Mail to change">Edit first</button>}
          {canRemember && <button className="btn" disabled={nothingTicked} onClick={go('always')} title="Stop asking about this. Change it back in Settings, AI connection.">Always allow</button>}
          {canRemember && <button className="btn" disabled={nothingTicked} onClick={go('hour')}>Allow for 1 hour</button>}
          <button className="btn primary" disabled={nothingTicked} onClick={go('once')}>{allDrafts ? (asks.length > 1 ? 'Save drafts' : 'Save draft') : 'Allow once'}</button>
        </div>
      </div>
    </div>
  );
}

/** The small sign in the top bar while the AI connection is on: lit when an app is connected, dimmed when paused. */
export function AiStatusButton() {
  const enabled = useSettings((s) => s.mcp?.enabled);
  const { connected, paused, client, entries, lastHello, lastCall } = useActivity();
  const { asks, resume } = useApprovals();
  const menu = useMenu();
  const [pulse, setPulse] = useState(false);
  // "Used 3 min ago" moves on by itself.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => setNow(Date.now()), [lastCall, connected, paused]);
  const last = useRef(entries[0]?.at);
  // A short glow when the AI does something.
  useEffect(() => {
    if (entries[0]?.at && entries[0].at !== last.current) {
      last.current = entries[0].at;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1500);
      return () => clearTimeout(t);
    }
  }, [entries]);
  if (!enabled) return null;
  const { text, tone } = aiStatus({ connected, paused, client, lastHello, lastCall, waiting: asks.length > 0 || Boolean(resume) }, now);
  const quick = (r: DOMRect) => menu.open(r, [
    { heading: text },
    paused ? { label: 'Resume', icon: 'check', onClick: () => resumeMcp() } : { label: 'Pause', icon: 'clock', onClick: () => pauseMcp() },
    { label: 'AI connection settings', icon: 'settings', onClick: () => openScreen('settings', 'ai') },
  ], 'right');
  return (
    <>
      {/* Click: settings. Right-click: the quick menu with Pause or Resume. Hover: one line saying where things stand. */}
      <button
        className={`icon-btn ai-status-btn tone-${tone} ${pulse ? 'pulse' : ''}`}
        aria-label={`${text}. Click for AI connection settings, right-click to pause or resume.`}
        onClick={() => openScreen('settings', 'ai')}
        onContextMenu={(e) => { e.preventDefault(); quick((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
      >
        <Icon name="sparkle" />
        <span className="ai-tip" role="tooltip"><i className={`ai-tip-dot tone-${tone}`} />{text}</span>
      </button>
      {menu.node}
    </>
  );
}

type Tone = 'off' | 'live' | 'quiet' | 'attention';
const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** One line for the top bar, and a colour: grey not connected, green in use, soft when quiet, amber when it needs you. */
export function aiStatus(s: { connected: number; paused?: boolean; client?: string; lastHello?: number; lastCall?: number; waiting: boolean }, now: number): { text: string; tone: Tone } {
  if (s.waiting) return { text: 'Waiting for your answer', tone: 'attention' };
  if (s.paused) return { text: 'Paused. Right-click to resume', tone: 'attention' };
  if (!s.lastHello) return { text: 'On, but no AI app is set up yet', tone: 'off' };
  if (!s.connected) return { text: 'On. No AI app is connected right now', tone: 'off' };
  const who = s.client || 'an AI app';
  if (s.lastCall && now - s.lastCall < 5 * 60000) return { text: `Connected: ${who}, used ${ago(now - s.lastCall)}`, tone: 'live' };
  return { text: `Connected: ${who}, quiet${s.lastCall ? ` since ${ago(now - s.lastCall)}` : ''}`, tone: 'quiet' };
}
