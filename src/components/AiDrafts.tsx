// AI Drafts: every draft an AI app (or Gmail itself) wrote, in one place, to work through and send.
// Search, sort and group chips at the top; tick drafts to move, schedule or delete them together; each row
// folds open to read it in full, make quick changes and send now or later. Keyboard: up and down to move,
// Enter to fold open, E for the editor, X to tick, Delete to delete.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Dialog, sendLaterOptions, useMenu, type MenuItem } from './ui';
import { useMail, providerFor, toast, cancelSend } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { store } from '../lib/db';
import { openDraft } from '../lib/composeActions';
import { askConfirm, askText } from '../lib/dialogs';
import { useAiDrafts, refreshAiDrafts, syncDraftsSoon, setDraftFilter, setDraftGroup, addGroup, renameGroup, deleteGroup, groupCounts, groupColour, nextGroupColour, htmlToText, isSimple, quickSave, quickSend, OUTSIDE_WRITER } from '../lib/mcp/aiDrafts';
import type { Account, Draft } from '../lib/types';

/** One line of plain text for the preview. */
const preview = (html: string) => htmlToText(html.split(/gmail_quote|<blockquote/i)[0]).replace(/\s+/g, ' ').trim();

type SortKey = 'newest' | 'oldest' | 'account' | 'group' | 'recipient';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'account', label: 'By account' },
  { key: 'group', label: 'By group' },
  { key: 'recipient', label: 'By recipient' },
];
const SORT_KEY = 'wgm-aidrafts-sort';
const SEEN_KEY = 'wgm-aidrafts-seen';
const readLocal = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const writeLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };

const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dayTime = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const firstTo = (d: Draft) => d.to[0] ? (d.to[0].name || d.to[0].email) + (d.to.length > 1 ? ` +${d.to.length - 1}` : '') : 'Nobody yet';
const writerText = (d: Draft) => (d.byAi === OUTSIDE_WRITER ? 'Made in Gmail' : `Written by ${d.byAi}`);

/** The account a draft belongs to, even if its link was lost: its own, the one it's saved in, then by address. */
export function draftAccount(d: Draft, accounts: Account[]): Account | undefined {
  return accounts.find((a) => a.id === d.fromAccountId)
    || accounts.find((a) => a.id === d.serverAccountId)
    || accounts.find((a) => a.kind === 'gmail' && a.email === d.fromEmail)
    || accounts.find((a) => a.email === d.fromEmail || a.aliases.some((x) => x.email === d.fromEmail));
}

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
    { label: 'Delete group', icon: 'trash', onClick: async () => { if (await askConfirm(`Delete the group ${name}?`, 'The drafts in it stay, in No Group.', 'Delete group')) await deleteGroup(id); } },
  ];
}

export function AiDrafts() {
  const list = useAiDrafts((s) => s.list);
  const filter = useAiDrafts((s) => s.filter);
  const groups = useSettings((s) => s.draftGroups) || [];
  const accounts = useMail((s) => s.accounts);
  const outbox = useMail((s) => s.outbox);
  const menu = useMenu();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSortState] = useState<SortKey>(() => (SORTS.some((s) => s.key === readLocal(SORT_KEY)) ? readLocal(SORT_KEY) as SortKey : 'newest'));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickTime, setPickTime] = useState<{ ids: string[]; edits?: { subject: string; text: string } } | null>(null);
  const [timeValue, setTimeValue] = useState('');
  // Drafts that arrived since you last looked get a dot; "last looked" moves on when you leave.
  const [seenBefore] = useState(() => Number(readLocal(SEEN_KEY)) || 0);
  const rows = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    void refreshAiDrafts();
    syncDraftsSoon();
    return () => writeLocal(SEEN_KEY, String(Date.now()));
  }, []);
  const setSort = (k: SortKey) => { setSortState(k); writeLocal(SORT_KEY, k); };

  const counts = groupCounts(list, groups);
  const known = new Set(groups.map((g) => g.id));
  const groupName = (d: Draft) => groups.find((g) => g.id === d.group)?.name || '￿';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = list.filter((d) => {
      if (filter === 'none' ? d.group && known.has(d.group) : filter !== 'all' && d.group !== filter) return false;
      if (!q) return true;
      return [d.subject, preview(d.html), d.byAi || '', ...d.to.map((t) => `${t.name || ''} ${t.email}`)].join(' ').toLowerCase().includes(q);
    });
    const newest = (a: Draft, b: Draft) => b.updatedAt - a.updatedAt;
    const by = (f: (d: Draft) => string) => (a: Draft, b: Draft) => f(a).localeCompare(f(b), 'en-GB', { sensitivity: 'base' }) || newest(a, b);
    switch (sort) {
      case 'oldest': return out.sort((a, b) => a.updatedAt - b.updatedAt);
      case 'account': return out.sort(by((d) => draftAccount(d, accounts)?.label || d.fromEmail));
      case 'group': return out.sort(by(groupName));
      case 'recipient': return out.sort(by(firstTo));
      default: return out.sort(newest);
    }
  }, [list, filter, query, groups, sort, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduled = outbox.filter((o) => o.kind === 'scheduled' && o.draft.byAi).sort((a, b) => a.sendAt - b.sendAt);

  // Ticks only count for drafts still on screen.
  const ticked = shown.filter((d) => picked.has(d.id)).map((d) => d.id);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearTicks = () => setPicked(new Set());

  const remove = async (ids: string[]) => {
    const ds = list.filter((x) => ids.includes(x.id));
    if (!ds.length) return;
    const one = ds.length === 1;
    const ok = await askConfirm(one ? 'Delete this draft?' : `Delete ${ds.length} drafts?`,
      one ? `"${ds[0].subject || '(no subject)'}" will be removed from Well Good Mail and from the account's Drafts folder. This can't be undone.` : 'They will be removed from Well Good Mail and from the accounts\' Drafts folders. This can\'t be undone.',
      one ? 'Delete draft' : 'Delete drafts');
    if (!ok) return;
    for (const d of ds) {
      try { if (d.serverDraftId && d.serverAccountId) await providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId); } catch { /* it may already be gone */ }
      await store.deleteDraft(d.id);
    }
    clearTicks();
    await refreshAiDrafts();
    toast({ text: one ? 'Draft deleted' : `${ds.length} drafts deleted`, ttl: 2500 });
  };

  const sendLater = async (ids: string[], at: number, edits?: { subject: string; text: string }) => {
    for (const id of ids) await quickSend(id, edits?.subject, edits?.text, at);
    clearTicks();
    if (ids.includes(openId || '')) setOpenId(null);
  };
  const laterItems = (ids: string[], edits?: { subject: string; text: string }): MenuItem[] => [
    { heading: 'Send later' },
    ...sendLaterOptions().map((o) => ({ label: o.label, icon: 'clock' as const, onClick: () => void sendLater(ids, o.at, edits) })),
    { label: 'Pick a date and time...', icon: 'calendar', onClick: () => { setTimeValue(''); setPickTime({ ids, edits }); } },
  ];
  const canSend = (d: Draft) => d.to.length + d.cc.length + d.bcc.length > 0;
  const sendNow = (d: Draft) => {
    if (!canSend(d)) { toast({ text: 'Add who it goes to first: open it in the editor.', ttl: 4000 }); return; }
    void quickSend(d.id);
  };

  const groupMenu = (anchor: DOMRect | { x: number; y: number }, ids: string[], current?: string) => menu.open(anchor, [
    { heading: ids.length > 1 ? `Move ${ids.length} drafts to` : 'Move to group' },
    ...groups.map((g) => ({ label: g.name, icon: 'tag' as const, active: ids.length === 1 && g.id === current, onClick: () => { ids.forEach((id) => void setDraftGroup(id, g.id)); clearTicks(); } })),
    { label: 'No Group', icon: 'close', active: ids.length === 1 && (!current || !known.has(current)), onClick: () => { ids.forEach((id) => void setDraftGroup(id, undefined)); clearTicks(); } },
    { divider: true },
    { label: 'New group...', icon: 'plus', onClick: async () => { const g = await newGroup(); if (g) { ids.forEach((id) => void setDraftGroup(id, g)); clearTicks(); } } },
  ]);

  const chip = (value: string, label: string, n: number, id?: string) => (
    <button key={value} className={`ai-chip ${filter === value ? 'on' : ''}`} aria-pressed={filter === value} onClick={() => { setDraftFilter(value); clearTicks(); }}
      onContextMenu={id ? (e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, groupItems(id, label)); } : undefined}>
      {id && <i className="ai-dot" style={{ background: groupColour(groups.find((g) => g.id === id)) }} />}{label} <span>{n}</span>
    </button>
  );

  // Keyboard, when a row has focus (not while typing in a quick edit).
  const onRowKey = (e: React.KeyboardEvent, d: Draft) => {
    if (e.target !== e.currentTarget) return;
    const i = shown.findIndex((x) => x.id === d.id);
    const go = (j: number) => { const t = shown[Math.max(0, Math.min(shown.length - 1, j))]; if (t) rows.current.get(t.id)?.focus(); };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); setOpenId(openId === d.id ? null : d.id); }
    else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); void openDraft(d.id); }
    else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); toggle(d.id); }
    else if (e.key === 'Delete') { e.preventDefault(); void remove(ticked.length ? ticked : [d.id]); }
  };

  const sortLabel = SORTS.find((s) => s.key === sort)!.label;
  return (
    <div className="screen ai-drafts" role="main">
      <div className="ai-drafts-inner">
        <h1>AI Drafts</h1>
        <p className="lead">Drafts written by an AI app or made in Gmail. Nothing here has been sent. Open one to check it, change it and send it yourself.</p>

        {scheduled.length > 0 && (
          <div className="card ai-scheduled">
            <div className="ai-scheduled-head"><Icon name="clock" size={14} /> Scheduled</div>
            {scheduled.map((o) => (
              <div key={o.id} className="ai-scheduled-row">
                <time>{new Date(o.sendAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                <span className="ai-scheduled-what"><b>{firstTo(o.draft)}</b> · {o.draft.subject || '(no subject)'}</span>
                <button className="btn ghost" onClick={() => void cancelSend(o.id, { reopen: false }).then(refreshAiDrafts)}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        {list.length > 0 && (
          <>
            <div className="ai-drafts-tools">
              <div className="ai-drafts-search">
                <Icon name="search" size={15} />
                <input type="search" placeholder="Search AI Drafts" aria-label="Search AI Drafts" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <button className="btn ghost ai-sort" aria-label={`Sort: ${sortLabel}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
                { heading: 'Sort' },
                ...SORTS.map((s) => ({ label: s.label, icon: 'list' as const, active: s.key === sort, onClick: () => setSort(s.key) })),
              ], 'right')}>{sortLabel} <Icon name="chevronDown" size={12} /></button>
            </div>
            <div className="ai-chips" role="toolbar" aria-label="Filter by group">
              {chip('all', 'All', counts.all)}
              {groups.map((g) => chip(g.id, g.name, counts.byGroup[g.id] || 0, g.id))}
              {counts.none > 0 && chip('none', 'No Group', counts.none)}
              <button className="ai-chip add" onClick={() => void newGroup()} title="Add a group"><Icon name="plus" size={13} /> New group</button>
            </div>
          </>
        )}

        {ticked.length > 0 && (
          <div className="ai-bulk" role="toolbar" aria-label="Selected drafts">
            <span className="ai-bulk-count">{ticked.length} selected</span>
            {ticked.length < shown.length
              ? <button className="btn ghost" onClick={() => setPicked(new Set(shown.map((d) => d.id)))}>Select all</button>
              : <button className="btn ghost" onClick={clearTicks}>Clear</button>}
            <span className="grow" />
            <button className="btn" onClick={(e) => groupMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), ticked)}><Icon name="tag" size={14} /> Change group</button>
            <button className="btn" onClick={(e) => {
              const blocked = list.filter((d) => ticked.includes(d.id) && !canSend(d));
              if (blocked.length) { toast({ text: `${blocked.length === 1 ? 'One draft has' : `${blocked.length} drafts have`} nobody to send to yet. Untick ${blocked.length === 1 ? 'it' : 'them'} or add recipients first.`, ttl: 5000 }); return; }
              menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), laterItems(ticked));
            }}><Icon name="clock" size={14} /> Send later</button>
            <button className="btn ai-delete" onClick={() => void remove(ticked)}><Icon name="trash" size={14} /> Delete</button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon name="sparkle" size={24} />
            <div style={{ marginTop: 8 }}>No AI drafts yet. When an AI app writes one, or you start one in Gmail, it appears here.</div>
          </div>
        ) : shown.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            {query ? `No AI drafts match "${query}".` : 'No drafts in this group yet.'}
          </div>
        ) : (
          <div className="card ai-list">
            {shown.map((d) => {
              const acc = draftAccount(d, accounts);
              const g = groups.find((x) => x.id === d.group);
              const open = openId === d.id;
              const isNew = seenBefore > 0 && d.updatedAt > seenBefore;
              return (
                <div key={d.id} className={`ai-draft-wrap ${open ? 'open' : ''} ${picked.has(d.id) ? 'picked' : ''}`}>
                  <div
                    className="ai-draft-item"
                    ref={(el) => { if (el) rows.current.set(d.id, el); else rows.current.delete(d.id); }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    title={`${acc?.label || d.fromEmail} · ${writerText(d)}`}
                    onClick={() => setOpenId(open ? null : d.id)}
                    onKeyDown={(e) => onRowKey(e, d)}
                  >
                    <span className="bar" style={{ background: acc?.colour || 'var(--border)' }} />
                    <input type="checkbox" className="ai-pick" aria-label={`Select ${d.subject || 'draft'}`} checked={picked.has(d.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(d.id)} />
                    <button className={`ai-group-pill ${g ? '' : 'empty'}`} title={g ? `${g.name}: move to another group` : 'Add to a group'} onClick={(e) => { e.stopPropagation(); groupMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), [d.id], d.group); }}>
                      <span className="ai-pill-name">{g && <i className="ai-dot" style={{ background: groupColour(g) }} />}<span className="ai-pill-text">{g ? g.name : 'Add to group'}</span></span>
                    </button>
                    <div className="ai-line1">{isNew && <i className="ai-new-dot" title="New since you last looked" />}<b>{firstTo(d)}</b><span className="sep">·</span><span className="subj">{d.subject || '(no subject)'}</span></div>
                    <time>{open ? dayTime(d.updatedAt) : day(d.updatedAt)}</time>
                    <div className="ai-line2">{preview(d.html) || '(empty)'}</div>
                    <div className="ai-row-acts" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" aria-label="Send now" title="Send now (right-click to send later)" onClick={() => sendNow(d)}
                        onContextMenu={(e) => { e.preventDefault(); if (canSend(d)) menu.open({ x: e.clientX, y: e.clientY }, laterItems([d.id])); }}><Icon name="send" size={15} /></button>
                      <button className="icon-btn" aria-label="Open in editor" title="Open in editor" onClick={() => void openDraft(d.id)}><Icon name="compose" size={15} /></button>
                      <button className="icon-btn ai-delete" aria-label="Delete draft" title="Delete draft" onClick={() => void remove([d.id])}><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                  {open && <DraftDetail d={d} acc={acc} onDelete={() => void remove([d.id])} onDone={() => setOpenId(null)} laterMenu={(r, edits) => menu.open(r, laterItems([d.id], edits))} />}
                </div>
              );
            })}
          </div>
        )}
        {list.length > 0 && <p className="ai-keys">Keys: up and down to move, Enter to open, E for the editor, X to tick, Delete to delete.</p>}
      </div>

      {pickTime && (
        <Dialog
          title="Send later"
          onClose={() => setPickTime(null)}
          actions={<>
            <button className="btn" onClick={() => setPickTime(null)}>Cancel</button>
            <button className="btn primary" disabled={!timeValue || new Date(timeValue).getTime() < Date.now()} onClick={() => { const p = pickTime; setPickTime(null); void sendLater(p.ids, new Date(timeValue).getTime(), p.edits); }}>Schedule</button>
          </>}
        >
          <label className="set-row"><span className="label">Date and time</span><input type="datetime-local" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} /></label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>Well Good Mail needs to be running (it can sit in the tray). If your PC is off, it sends as soon as the app opens.</p>
        </Dialog>
      )}
      {menu.node}
    </div>
  );
}

/** A draft folded open: read it in full, make quick text changes, then send it now or later, or open the full editor. */
function DraftDetail({ d, acc, onDelete, onDone, laterMenu }: {
  d: Draft;
  acc?: Account;
  onDelete: () => void;
  onDone: () => void;
  laterMenu: (anchor: DOMRect, edits?: { subject: string; text: string }) => void;
}) {
  const simple = isSimple(d.html);
  const startText = useMemo(() => htmlToText(d.html), [d.html]);
  const [subject, setSubject] = useState(d.subject);
  const [text, setText] = useState(startText);
  const [busy, setBusy] = useState(false);
  const changed = subject !== d.subject || text !== startText;
  const noOne = d.to.length + d.cc.length + d.bcc.length === 0;
  const who = (list: { email: string; name?: string }[]) => list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');
  const edits = changed ? { subject, text } : undefined;
  const send = async () => {
    setBusy(true);
    try { await quickSend(d.id, edits?.subject, edits?.text); onDone(); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try { await quickSave(d.id, subject, text); toast({ text: 'Draft saved', ttl: 2000 }); } finally { setBusy(false); }
  };
  return (
    <div className="ai-draft-detail" onClick={(e) => e.stopPropagation()}>
      <div className="ai-draft-row"><b>To</b><span>{who(d.to) || 'Nobody yet'}</span></div>
      {d.cc.length > 0 && <div className="ai-draft-row"><b>Cc</b><span>{who(d.cc)}</span></div>}
      <div className="ai-draft-row"><b>From</b><span>{acc ? `${acc.label} (${d.fromEmail || acc.email})` : d.fromEmail} · {writerText(d)}</span></div>
      {simple ? (
        <>
          <input className="ai-quick-subject" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <textarea className="ai-quick-text" aria-label="Email text" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(16, Math.max(6, text.split('\n').length + 1))} />
          <div className="ai-quick-note">{d.noSignature ? 'This draft already ends with your name, so no signature is added.' : 'Your signature is added when it\'s sent.'} For attachments or formatting, use Open in editor.</div>
        </>
      ) : (
        <>
          <div className="ai-draft-row"><b>Subject</b><span>{d.subject || '(no subject)'}</span></div>
          <div className="ai-quick-read">{startText}</div>
          <div className="ai-quick-note">This draft has formatting, so change it in the editor.</div>
        </>
      )}
      <div className="ai-quick-actions">
        <div className="btn-group">
          <button className="btn primary" disabled={busy || noOne} title={noOne ? 'Add who it goes to in the editor first' : 'Send now'} onClick={() => void send()}><Icon name="send" size={14} /> Send</button>
          <button className="btn primary" disabled={busy || noOne} aria-label="Send later" title="Send later" onClick={(e) => laterMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), edits)}><Icon name="chevronDown" size={12} /></button>
        </div>
        <button className="btn" onClick={() => void openDraft(d.id)}>Open in editor</button>
        {simple && changed && <button className="btn" disabled={busy} onClick={() => void save()}>Save changes</button>}
        <span className="grow" />
        <button className="btn ghost ai-delete" onClick={onDelete}><Icon name="trash" size={14} /> Delete draft</button>
      </div>
    </div>
  );
}
