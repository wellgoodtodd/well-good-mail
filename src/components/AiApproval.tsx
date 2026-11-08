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
  const app = asks.every((a) => a.app === asks[0].app) ? asks[0].app : 'Your AI apps';
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
        <div className="ai-card-actions">
          <button className="btn" onClick={() => answerAll('refuse')}>Refuse</button>
          <span className="grow" />
          {oneDraft && <button className="btn" onClick={() => answerAll('edit')} title="Save it and open it in Well Good Mail to change">Edit first</button>}
          {canRemember && <button className="btn" disabled={nothingTicked} onClick={() => answerAll('always')} title="Stop asking about this. Change it back in Settings, AI connection.">Always allow</button>}
          {canRemember && <button className="btn" disabled={nothingTicked} onClick={() => answerAll('hour')}>Allow for 1 hour</button>}
          <button className="btn primary" disabled={nothingTicked} onClick={() => answerAll('once')}>{allDrafts ? (asks.length > 1 ? 'Save drafts' : 'Save draft') : 'Allow once'}</button>
        </div>
      </div>
    </div>
  );
}

/** The small sign in the top bar while the AI connection is on: lit when an app is connected, dimmed when paused. */
export function AiStatusButton() {
  const enabled = useSettings((s) => s.mcp?.enabled);
  const { connected, paused, client, entries } = useActivity();
  const menu = useMenu();
  const [pulse, setPulse] = useState(false);
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
  const label = paused ? 'AI connection paused' : connected ? `AI connected${client ? `: ${client}` : ''}` : 'AI connection on, nothing connected';
  return (
    <>
      <button
        className={`icon-btn ai-status-btn ${connected && !paused ? 'on' : ''} ${paused ? 'paused' : ''} ${pulse ? 'pulse' : ''}`}
        title={label}
        aria-label={label}
        onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
          { heading: label },
          paused ? { label: 'Resume', icon: 'check', onClick: () => resumeMcp() } : { label: 'Pause', icon: 'clock', onClick: () => pauseMcp() },
          { label: 'AI connection settings', icon: 'settings', onClick: () => openScreen('settings', 'ai') },
        ], 'right')}
      >
        <Icon name="sparkle" />
      </button>
      {menu.node}
    </>
  );
}
