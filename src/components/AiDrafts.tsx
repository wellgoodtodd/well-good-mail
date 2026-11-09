// AI drafts: every draft an AI app wrote, in one place, so they're easy to find, check and send (or bin).
// Search box and group chips at the top; each draft shows its group and can be moved to another.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useMenu, type MenuItem } from './ui';
import { useMail, providerFor, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { store } from '../lib/db';
import { openDraft } from '../lib/composeActions';
import { askConfirm, askText } from '../lib/dialogs';
import { useAiDrafts, refreshAiDrafts, setDraftFilter, setDraftGroup, addGroup, renameGroup, deleteGroup, groupCounts, groupColour, nextGroupColour, htmlToText, isSimple, quickSave, quickSend } from '../lib/mcp/aiDrafts';
import type { Draft } from '../lib/types';

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/** Asks for a name and makes a new group. Returns its id. */
export async function newGroup(): Promise<string | undefined> {
  const name = await askText('New group', '', 'Add group');
  return name ? addGroup(name) : undefined;
}

/** The choices for one group (in the sidebar and on its chip). */
export function groupItems(id: string, name: string): MenuItem[] {
  return [
    { heading: name },
    { label: 'Change colour', icon: 'tag', onClick: () => nextGroupColour(id) },
    { label: 'Rename', icon: 'compose', onClick: async () => { const v = await askText('Rename group', name, 'Rename'); if (v) renameGroup(id, v); } },
    { label: 'Delete group', icon: 'trash', onClick: async () => { if (await askConfirm(`Delete the group ${name}?`, 'The drafts in it stay, in no group.', 'Delete group')) await deleteGroup(id); } },
  ];
}

export function AiDrafts() {
  const list = useAiDrafts((s) => s.list);
  const filter = useAiDrafts((s) => s.filter);
  const groups = useSettings((s) => s.draftGroups) || [];
  const accounts = useMail((s) => s.accounts);
  const menu = useMenu();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { void refreshAiDrafts(); }, []);

  const counts = groupCounts(list, groups);
  const known = new Set(groups.map((g) => g.id));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((d) => {
      if (filter === 'none' ? d.group && known.has(d.group) : filter !== 'all' && d.group !== filter) return false;
      if (!q) return true;
      return [d.subject, plain(d.html), ...d.to.map((t) => `${t.name || ''} ${t.email}`)].join(' ').toLowerCase().includes(q);
    });
  }, [list, filter, query, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id: string) => {
    const d = list.find((x) => x.id === id);
    if (!d || !(await askConfirm('Delete this draft?', `"${d.subject || '(no subject)'}" will be removed from Well Good Mail and from the account's Drafts folder.`, 'Delete draft'))) return;
    try { if (d.serverDraftId && d.serverAccountId) await providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId); } catch { /* it may already be gone */ }
    await store.deleteDraft(id);
    await refreshAiDrafts();
    toast({ text: 'Draft deleted', ttl: 2500 });
  };

  const moveMenu = (r: DOMRect, id: string, current?: string) => menu.open(r, [
    { heading: 'Move to group' },
    ...groups.map((g) => ({ label: g.name, icon: 'tag' as const, active: g.id === current, onClick: () => void setDraftGroup(id, g.id) })),
    { label: 'No Group', icon: 'close', active: !current || !known.has(current), onClick: () => void setDraftGroup(id, undefined) },
    { divider: true },
    { label: 'New group...', icon: 'plus', onClick: async () => { const g = await newGroup(); if (g) await setDraftGroup(id, g); } },
  ]);

  const chip = (value: string, label: string, n: number, id?: string) => (
    <button key={value} className={`ai-chip ${filter === value ? 'on' : ''}`} aria-pressed={filter === value} onClick={() => setDraftFilter(value)}
      onContextMenu={id ? (e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, groupItems(id, label)); } : undefined}>
      {id && <i className="ai-dot" style={{ background: groupColour(groups.find((g) => g.id === id)) }} />}{label} <span>{n}</span>
    </button>
  );

  return (
    <div className="screen ai-drafts" role="main">
      <div className="ai-drafts-inner">
        <h1>AI Drafts</h1>
        <p className="lead">Drafts written by Claude or another AI app. Nothing here has been sent. Open one to check it, change it and send it yourself.</p>
        {list.length > 0 && (
          <>
            <div className="ai-drafts-search">
              <Icon name="search" size={15} />
              <input type="search" placeholder="Search AI Drafts" aria-label="Search AI Drafts" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="ai-chips" role="toolbar" aria-label="Filter by group">
              {chip('all', 'All', counts.all)}
              {groups.map((g) => chip(g.id, g.name, counts.byGroup[g.id] || 0, g.id))}
              {counts.none > 0 && chip('none', 'No Group', counts.none)}
              <button className="ai-chip add" onClick={() => void newGroup()} title="Add a group"><Icon name="plus" size={13} /> New group</button>
            </div>
          </>
        )}
        {list.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon name="sparkle" size={24} />
            <div style={{ marginTop: 8 }}>No AI drafts yet. When an AI app writes one, it appears here.</div>
          </div>
        ) : shown.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            {query ? `No AI drafts match "${query}".` : 'No drafts in this group yet.'}
          </div>
        ) : (
          <div className="card">
            {shown.map((d) => {
              const acc = accounts.find((a) => a.id === d.fromAccountId);
              const g = groups.find((x) => x.id === d.group);
              return (
                <div key={d.id} className={`ai-draft-wrap ${openId === d.id ? 'open' : ''}`}>
                <div className="ai-draft-item" role="button" tabIndex={0} aria-expanded={openId === d.id} onClick={() => setOpenId(openId === d.id ? null : d.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(openId === d.id ? null : d.id); }}>
                  <span className="bar" style={{ background: acc?.colour || 'var(--border)' }} title={acc?.label} />
                  <div className="grow">
                    <div className="ai-draft-top">
                      <strong>{d.subject || '(no subject)'}</strong>
                      <time>{new Date(d.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                    </div>
                    <div className="ai-draft-meta">To {d.to.map((t) => t.name || t.email).join(', ') || 'nobody yet'} · from {acc?.label || d.fromEmail} · by {d.byAi}</div>
                    <div className="ai-draft-snip">{plain(d.html).slice(0, 160)}</div>
                  </div>
                  <button className={`ai-group-pill ${g ? '' : 'empty'}`} title="Move to another group" onClick={(e) => { e.stopPropagation(); moveMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), d.id, d.group); }}>
                    <span className="ai-pill-name">{g && <i className="ai-dot" style={{ background: groupColour(g) }} />}{g ? g.name : 'Add to group'}</span> <Icon name="chevronDown" size={11} />
                  </button>
                  <Icon name={openId === d.id ? 'chevronDown' : 'chevronRight'} size={14} className="ai-draft-chev" />
                </div>
                {openId === d.id && <DraftDetail d={d} onDelete={() => void remove(d.id)} onDone={() => setOpenId(null)} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menu.node}
    </div>
  );
}

/** A draft folded open: read it in full, make quick text changes, then send it or open the full editor. */
function DraftDetail({ d, onDelete, onDone }: { d: Draft; onDelete: () => void; onDone: () => void }) {
  const simple = isSimple(d.html);
  const startText = useMemo(() => htmlToText(d.html), [d.html]);
  const [subject, setSubject] = useState(d.subject);
  const [text, setText] = useState(startText);
  const [busy, setBusy] = useState(false);
  const changed = subject !== d.subject || text !== startText;
  const noOne = d.to.length + d.cc.length + d.bcc.length === 0;
  const who = (list: { email: string; name?: string }[]) => list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');
  const send = async () => {
    setBusy(true);
    try { await quickSend(d.id, changed ? subject : undefined, changed ? text : undefined); onDone(); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try { await quickSave(d.id, subject, text); toast({ text: 'Draft saved', ttl: 2000 }); } finally { setBusy(false); }
  };
  return (
    <div className="ai-draft-detail" onClick={(e) => e.stopPropagation()}>
      <div className="ai-draft-row"><b>To</b><span>{who(d.to) || 'Nobody yet'}</span></div>
      {d.cc.length > 0 && <div className="ai-draft-row"><b>Cc</b><span>{who(d.cc)}</span></div>}
      {simple ? (
        <>
          <input className="ai-quick-subject" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <textarea className="ai-quick-text" aria-label="Email text" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(16, Math.max(6, text.split('\n').length + 1))} />
          <div className="ai-quick-note">Your signature is added when it is sent. For attachments or formatting, use Open in editor.</div>
        </>
      ) : (
        <>
          <div className="ai-draft-row"><b>Subject</b><span>{d.subject || '(no subject)'}</span></div>
          <div className="ai-quick-read">{startText}</div>
          <div className="ai-quick-note">This draft has formatting, so change it in the editor.</div>
        </>
      )}
      <div className="ai-quick-actions">
        <button className="icon-btn" aria-label="Delete draft" title="Delete draft" onClick={onDelete}><Icon name="trash" size={15} /></button>
        <span className="grow" />
        <button className="btn" onClick={() => void openDraft(d.id)}>Open in editor</button>
        {simple && changed && <button className="btn" disabled={busy} onClick={() => void save()}>Save changes</button>}
        <button className="btn primary" disabled={busy || noOne} title={noOne ? 'Add who it goes to in the editor first' : undefined} onClick={() => void send()}><Icon name="send" size={14} /> Send</button>
      </div>
    </div>
  );
}
