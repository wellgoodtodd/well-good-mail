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
import { useAiDrafts, refreshAiDrafts, setDraftFilter, setDraftGroup, addGroup, renameGroup, deleteGroup, groupCounts } from '../lib/mcp/aiDrafts';

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
    { label: 'No group', icon: 'close', active: !current || !known.has(current), onClick: () => void setDraftGroup(id, undefined) },
    { divider: true },
    { label: 'New group...', icon: 'plus', onClick: async () => { const g = await newGroup(); if (g) await setDraftGroup(id, g); } },
  ]);

  const chip = (value: string, label: string, n: number, id?: string) => (
    <button key={value} className={`ai-chip ${filter === value ? 'on' : ''}`} aria-pressed={filter === value} onClick={() => setDraftFilter(value)}
      onContextMenu={id ? (e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, groupItems(id, label)); } : undefined}>
      {label} <span>{n}</span>
    </button>
  );

  return (
    <div className="screen ai-drafts" role="main">
      <div className="ai-drafts-inner">
        <h1>AI drafts</h1>
        <p className="lead">Drafts written by Claude or another AI app. Nothing here has been sent. Open one to check it, change it and send it yourself.</p>
        {list.length > 0 && (
          <>
            <div className="ai-drafts-search">
              <Icon name="search" size={15} />
              <input type="search" placeholder="Search AI drafts" aria-label="Search AI drafts" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="ai-chips" role="toolbar" aria-label="Filter by group">
              {chip('all', 'All', counts.all)}
              {groups.map((g) => chip(g.id, g.name, counts.byGroup[g.id] || 0, g.id))}
              {counts.none > 0 && chip('none', 'No group', counts.none)}
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
                <div key={d.id} className="ai-draft-item" role="button" tabIndex={0} onClick={() => void openDraft(d.id)} onKeyDown={(e) => { if (e.key === 'Enter') void openDraft(d.id); }}>
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
                    {g ? g.name : 'Add to group'} <Icon name="chevronDown" size={11} />
                  </button>
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); void openDraft(d.id); }}>Open</button>
                  <button className="icon-btn" aria-label={`Delete draft ${d.subject}`} title="Delete draft" onClick={(e) => { e.stopPropagation(); void remove(d.id); }}><Icon name="trash" size={15} /></button>
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
