// AI Drafts: every draft an AI app (or Gmail itself) wrote, in one place, to work through and send.
// Search, sort and group chips at the top; tick drafts to move, schedule or delete them together; each card
// opens into a small editor (From, To, Cc, Bcc, Subject and the message) that saves as you go.
// Keyboard: up and down to move, Enter to open, E for the editor, X to tick, Delete to delete.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { sendLaterOptions, useMenu, type MenuItem } from './ui';
import { RecipientField } from './RecipientField';
import { SendLaterPicker } from './SendLaterPicker';
import { ScheduledViewer } from './Scheduled';
import { useMail, providerFor, toast, cancelSend } from '../lib/mail';
import { useEditor, EditorContent } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { FormatBar, editorMenuItems } from './FormatBar';
import { SignaturePicker } from './SignaturePicker';
import { editorExtensions } from './editorExtensions';
import { composeContext, writingStyle } from '../lib/composeActions';
import { useSettings } from '../lib/settings';
import { store } from '../lib/db';
import { openDraft } from '../lib/composeActions';
import { cssToStyle } from './Composer';
import { DraftFilesPreview, draftFile, openDraftFile } from './AttachmentPreview';
import { allAliases, draftSignature } from '../lib/compose';
import { askConfirm, askText } from '../lib/dialogs';
import { undoSteps, record } from '../lib/history';
import { useAiDrafts, saveDraftEverywhere, refreshAiDrafts, syncDraftsSoon, setDraftFilter, setDraftGroup, addGroup, renameGroup, deleteGroup, groupCounts, groupColour, nextGroupColour, htmlToText, quickSave, quickSend, splitQuote, OUTSIDE_WRITER } from '../lib/mcp/aiDrafts';
import type { Account, Address, Draft, Message } from '../lib/types';

/** One line of plain text for the preview, without a closing sign-off like "All the best," (it says nothing about the email). */
const preview = (html: string) => htmlToText(html.split(/gmail_quote|<blockquote/i)[0]).replace(/\n\s*[^\n]{1,30},\s*$/, '').replace(/\s+/g, ' ').trim();

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
const writerText = (d: Draft) => (d.byAi === OUTSIDE_WRITER ? 'Made in Gmail' : `Written by ${d.byAi}`);

/**
 * Names for addresses, from your contacts and then your mail. Each address is looked up once and remembered;
 * the mail is only read when an address turns up that hasn't been seen before (one pass for all of them).
 */
const knownNames = new Map<string, string>();
function namesFor(emails: string[], messages: Record<string, Message>, contacts: Address[]): Map<string, string> {
  const missing = new Set(emails.map((e) => e.toLowerCase()).filter((e) => !knownNames.has(e)));
  if (missing.size) {
    for (const c of contacts) { const e = c.email.toLowerCase(); if (missing.has(e) && c.name && !c.name.includes('@')) { knownNames.set(e, c.name); missing.delete(e); } }
  }
  if (missing.size) {
    const note = (a?: Address) => { const e = a?.email.toLowerCase(); if (e && missing.has(e) && a!.name && !a!.name.includes('@')) { knownNames.set(e, a!.name); missing.delete(e); } };
    for (const m of Object.values(messages)) { note(m.from); m.to.forEach(note); m.cc.forEach(note); if (!missing.size) break; }
    for (const e of missing) knownNames.set(e, ''); // no name anywhere: don't look again
  }
  return knownNames;
}

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

/** Stops asking before something that can be undone anyway. */
const stopAsking = (key: 'deleteDraft' | 'deleteGroup' | 'deleteSmart') => () => {
  const w = useSettings.getState().warnings;
  useSettings.getState().set({ warnings: { ...w, [key]: false } }, { quiet: true });
};
const asks = (key: 'deleteDraft' | 'deleteGroup' | 'deleteSmart') => useSettings.getState().warnings[key] !== false;
export const askUndoable = (key: 'deleteDraft' | 'deleteGroup' | 'deleteSmart', title: string, message: string, confirmLabel: string) =>
  asks(key) ? askConfirm(title, `${message} You can still undo this.`, confirmLabel, { onOptOut: stopAsking(key), optOutLabel: 'Don\'t ask again' }) : Promise.resolve(true);

/** The choices for one group (in the sidebar and on its chip). */
export function groupItems(id: string, name: string): MenuItem[] {
  return [
    { heading: name },
    { label: 'Change colour', icon: 'tag', onClick: () => nextGroupColour(id) },
    { label: 'Rename', icon: 'compose', onClick: async () => { const v = await askText('Rename group', name, 'Rename'); if (v) renameGroup(id, v); } },
    { label: 'Delete group', icon: 'trash', onClick: async () => { if (await askUndoable('deleteGroup', `Delete the group ${name}?`, 'The drafts in it stay, in No Group.', 'Delete group')) await deleteGroup(id); } },
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
  const [pickTime, setPickTime] = useState<string[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  // Drafts that arrived since you last looked get a dot; "last looked" moves on when you leave.
  const [seenBefore] = useState(() => Number(readLocal(SEEN_KEY)) || 0);
  const rows = useRef(new Map<string, HTMLDivElement>());
  // While a draft is open, the list keeps its order, so saving it doesn't move it to the top under your cursor.
  const order = useRef<string[]>([]);

  useEffect(() => {
    void refreshAiDrafts();
    syncDraftsSoon();
    return () => writeLocal(SEEN_KEY, String(Date.now()));
  }, []);
  const setSort = (k: SortKey) => { setSortState(k); writeLocal(SORT_KEY, k); };

  const contacts = useMail((s) => s.contacts);
  const names = useMemo(() => namesFor([...list.flatMap((d) => d.to.map((a) => a.email)), ...outbox.flatMap((o) => o.draft.to.map((a) => a.email))], useMail.getState().messages, contacts), [list, outbox, contacts]);
  const nameOf = (a: Address) => (a.name && !a.name.includes('@') ? a.name : names.get(a.email.toLowerCase()) || a.email);
  const whoFor = (d: Draft) => (d.to[0] ? nameOf(d.to[0]) + (d.to.length > 1 ? ` +${d.to.length - 1}` : '') : 'Nobody yet');

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
      case 'oldest': out.sort((a, b) => a.updatedAt - b.updatedAt); break;
      case 'account': out.sort(by((d) => draftAccount(d, accounts)?.label || d.fromEmail)); break;
      case 'group': out.sort(by(groupName)); break;
      case 'recipient': out.sort(by(whoFor)); break;
      default: out.sort(newest);
    }
    if (openId && order.current.includes(openId)) {
      const at = (id: string) => { const i = order.current.indexOf(id); return i < 0 ? -1 : i; };
      out.sort((a, b) => at(a.id) - at(b.id));
    } else order.current = out.map((d) => d.id);
    return out;
  }, [list, filter, query, groups, sort, accounts, names, openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduled = outbox.filter((o) => o.kind === 'scheduled' && o.draft.byAi).sort((a, b) => a.sendAt - b.sendAt);

  // Ticks only count for drafts still on screen.
  const ticked = shown.filter((d) => picked.has(d.id)).map((d) => d.id);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearTicks = () => setPicked(new Set());

  const removeNow = async (ds: Draft[]) => {
    for (const d of ds) {
      try { if (d.serverDraftId && d.serverAccountId) await providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId); } catch { /* it may already be gone */ }
      await store.deleteDraft(d.id);
    }
    await refreshAiDrafts();
  };
  const remove = async (ids: string[]): Promise<void> => {
    // Straight from the list on screen, so the question shows at once.
    const ds = list.filter((x) => ids.includes(x.id));
    if (!ds.length) return;
    const one = ds.length === 1;
    const ok = await askUndoable('deleteDraft', one ? 'Delete this draft?' : `Delete ${ds.length} drafts?`,
      one ? `"${ds[0].subject || '(no subject)'}" will be removed from Well Good Mail and from the account's Drafts folder.` : 'They will be removed from Well Good Mail and from the accounts\' Drafts folders.',
      one ? 'Delete draft' : 'Delete drafts');
    if (!ok) return;
    if (ids.includes(openId || '')) setOpenId(null);
    clearTicks();
    await removeNow(ds);
    // Undo saves them again, here and in the account's Drafts folder (as new drafts there).
    const bring = async () => {
      for (const d of ds) await saveDraftEverywhere({ ...d, serverDraftId: undefined, serverDraftMessageId: undefined, updatedAt: Date.now() });
      await refreshAiDrafts();
    };
    const again = async () => removeNow((await Promise.all(ds.map((d) => store.getDraft(d.id)))).filter(Boolean) as Draft[]);
    record(one ? `Delete draft: ${ds[0].subject || '(no subject)'}` : `Delete ${ds.length} drafts`, bring, again);
    toast({ text: one ? 'Draft deleted' : `${ds.length} drafts deleted`, ttl: 6000, undo: () => void undoSteps(1) });
  };

  const sendLater = async (ids: string[], at: number) => {
    if (ids.includes(openId || '')) setOpenId(null);
    for (const id of ids) await quickSend(id, undefined, undefined, at);
    clearTicks();
  };
  const laterItems = (ids: string[]): MenuItem[] => [
    { heading: 'Send later' },
    ...sendLaterOptions().map((o) => ({ label: o.label, icon: 'clock' as const, onClick: () => void sendLater(ids, o.at) })),
    { label: 'Pick a date and time...', icon: 'calendar', onClick: () => setPickTime(ids) },
  ];
  const canSend = (d: Draft) => d.to.length + d.cc.length + d.bcc.length > 0;
  const sendNow = (d: Draft) => {
    if (!canSend(d)) { toast({ text: 'Add who it goes to first.', ttl: 4000 }); return; }
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

  // The editor and the open card never show the same draft at once: the card closes (saving first), and shows any changes when opened again.
  const toEditor = (id: string) => { if (openId === id) setOpenId(null); void openDraft(id); };

  // Keyboard, when a card has focus (not while typing in it).
  const onRowKey = (e: React.KeyboardEvent, d: Draft) => {
    if (e.target !== e.currentTarget) return;
    const i = shown.findIndex((x) => x.id === d.id);
    const go = (j: number) => { const t = shown[Math.max(0, Math.min(shown.length - 1, j))]; if (t) rows.current.get(t.id)?.focus(); };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); setOpenId(openId === d.id ? null : d.id); }
    else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); toEditor(d.id); }
    else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); toggle(d.id); }
    else if (e.key === 'Delete') { e.preventDefault(); void remove(ticked.length ? ticked : [d.id]); }
  };

  const tag = (d: Draft) => {
    const g = groups.find((x) => x.id === d.group);
    return (
      <button className={`ai-tag ${g ? '' : 'empty'}`} title={g ? `${g.name}: move to another group` : 'Add to a group'} onClick={(e) => { e.stopPropagation(); groupMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), [d.id], d.group); }}>
        {g ? <><i className="ai-dot" style={{ background: groupColour(g) }} /><span>{g.name}</span></> : <><Icon name="plus" size={11} /><span>Add to group</span></>}
      </button>
    );
  };
  // The tick box, with the whole left strip of the card as its target, so a near miss ticks rather than opens.
  const pickZone = (d: Draft) => (
    <span className="ai-pick-zone" onClick={(e) => { e.stopPropagation(); toggle(d.id); }}>
      <input type="checkbox" className="ai-pick" aria-label={`Select ${d.subject || 'draft'}`} checked={picked.has(d.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(d.id)} />
    </span>
  );

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
              <div key={o.id} className="ai-scheduled-row" role="button" tabIndex={0} title="Read it, change its time or stop it going" onClick={() => setViewing(o.id)} onKeyDown={(e) => { if (e.key === 'Enter') setViewing(o.id); }}>
                <time>{new Date(o.sendAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                <span className="ai-scheduled-what"><b>{whoFor(o.draft)}</b> · {o.draft.subject || '(no subject)'}</span>
                <button className="btn ghost" title="Stops it being sent and puts it back in AI Drafts" onClick={(e) => { e.stopPropagation(); void cancelSend(o.id, { reopen: false }).then(refreshAiDrafts); }}>Back to drafts</button>
              </div>
            ))}
          </div>
        )}

        {list.length > 0 && (
          <>
            {/* Ticking a draft swaps the search bar for the selection bar, in the same space, so the list never moves. */}
            {ticked.length > 0 ? (
              <div className="ai-bulk" role="toolbar" aria-label="Selected drafts">
                <span className="ai-bulk-count">{ticked.length} selected</span>
                {ticked.length < shown.length && <button className="btn ghost" onClick={() => setPicked(new Set(shown.map((d) => d.id)))}>Select all</button>}
                <span className="grow" />
                <button className="btn" onClick={(e) => groupMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), ticked)}><Icon name="tag" size={14} /> Change group</button>
                <button className="btn" onClick={(e) => {
                  const blocked = list.filter((d) => ticked.includes(d.id) && !canSend(d));
                  if (blocked.length) { toast({ text: `${blocked.length === 1 ? 'One draft has' : `${blocked.length} drafts have`} nobody to send to yet. Untick ${blocked.length === 1 ? 'it' : 'them'} or add recipients first.`, ttl: 5000 }); return; }
                  menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), laterItems(ticked));
                }}><Icon name="clock" size={14} /> Send later</button>
                <button className="btn ai-delete" onClick={() => void remove(ticked)}><Icon name="trash" size={14} /> Delete</button>
                <button className="btn" onClick={clearTicks}>Done</button>
              </div>
            ) : (
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
            )}
            <div className="ai-chips" role="toolbar" aria-label="Filter by group">
              {chip('all', 'All', counts.all)}
              {/* Empty groups stay out of the way unless you are looking at one. */}
              {groups.filter((g) => (counts.byGroup[g.id] || 0) > 0 || filter === g.id).map((g) => chip(g.id, g.name, counts.byGroup[g.id] || 0, g.id))}
              {counts.none > 0 && chip('none', 'No Group', counts.none)}
              <button className="ai-chip add" onClick={() => void newGroup()} title="Add a group"><Icon name="plus" size={13} /> New group</button>
            </div>
          </>
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
          <div className="ai-cards">
            {shown.map((d) => {
              const acc = draftAccount(d, accounts);
              const open = openId === d.id;
              const isNew = seenBefore > 0 && d.updatedAt > seenBefore;
              return (
                // One card per draft. The account's colour runs down its left edge.
                <div key={d.id} className={`ai-draft-wrap ${open ? 'open' : ''} ${picked.has(d.id) ? 'picked' : ''}`} style={{ borderLeftColor: acc?.colour || 'var(--border)' }}>
                  <div
                    className={`ai-draft-item ${open ? 'slim' : ''}`}
                    ref={(el) => { if (el) rows.current.set(d.id, el); else rows.current.delete(d.id); }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    title={open ? 'Close' : `${acc?.label || d.fromEmail} · ${writerText(d)}`}
                    onClick={() => setOpenId(open ? null : d.id)}
                    onKeyDown={(e) => onRowKey(e, d)}
                  >
                    {pickZone(d)}
                    {open ? (
                      // Open: the top shrinks to one line, so the space goes to what you're changing.
                      <>
                        <div className="ai-slim-title"><b>{whoFor(d)}</b><span className="sep">·</span><span className="subj">{d.subject || '(no subject)'}</span></div>
                        {tag(d)}
                        <time>{dayTime(d.updatedAt)}</time>
                        <Icon name="chevronDown" size={14} className="rot180 ai-slim-chev" />
                      </>
                    ) : (
                      <>
                        <div className="ai-who">{isNew && <i className="ai-new-dot" title="New since you last looked" />}<span>{whoFor(d)}</span></div>
                        <time>{day(d.updatedAt)}</time>
                        <div className="ai-subj">{d.subject || '(no subject)'}</div>
                        <div className="ai-row-acts" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" aria-label="Send now" title="Send now (right-click to send later)" onClick={() => sendNow(d)}
                            onContextMenu={(e) => { e.preventDefault(); if (canSend(d)) menu.open({ x: e.clientX, y: e.clientY }, laterItems([d.id])); }}><Icon name="send" size={15} /></button>
                          <button className="icon-btn" aria-label="Open in editor" title="Open in editor" onClick={() => toEditor(d.id)}><Icon name="compose" size={15} /></button>
                          <button className="icon-btn ai-delete" aria-label="Delete draft" title="Delete draft" onClick={() => void remove([d.id])}><Icon name="trash" size={15} /></button>
                        </div>
                        <div className="ai-prev">{preview(d.html) || '(empty)'}</div>
                        {tag(d)}
                      </>
                    )}
                  </div>
                  {open && <DraftDetail d={d} acc={acc} onDelete={() => void remove([d.id])} onClose={() => setOpenId(null)} laterMenu={(r) => menu.open(r, laterItems([d.id]))} />}
                </div>
              );
            })}
          </div>
        )}
        {list.length > 0 && <p className="ai-keys">Keys: up and down to move, Enter to open, E for the editor, X to tick, Delete to delete.</p>}
      </div>

      {pickTime && <SendLaterPicker onClose={() => setPickTime(null)} onPick={(at) => { const ids = pickTime; setPickTime(null); void sendLater(ids, at); }} />}
      {viewing && <ScheduledViewer id={viewing} onClose={() => { setViewing(null); void refreshAiDrafts(); }} />}
      {menu.node}
    </div>
  );
}

interface QuickForm { fromAccountId?: string; fromEmail: string; to: Address[]; cc: Address[]; bcc: Address[]; subject: string; html: string; signatureOf?: string }

/**
 * A draft opened on its card: a small editor with From, To, Cc, Bcc and Subject like the full one, a basic formatting bar
 * (with the signature at its right end), and the message in its own box. Changes save by themselves a moment after you
 * stop typing, and when the card closes.
 */
function DraftDetail({ d, acc, onDelete, onClose, laterMenu }: {
  d: Draft;
  acc?: Account;
  onDelete: () => void;
  onClose: () => void;
  laterMenu: (anchor: DOMRect) => void;
}) {
  const accounts = useMail((s) => s.accounts);
  const contacts = useMail((s) => s.contacts);
  const aliases = useMemo(() => allAliases(accounts), [accounts]);
  const [filePreview, setFilePreview] = useState<number | null>(null);
  const editMenu = useMenu();
  // Only the reply itself is edited here; earlier emails quoted under it fold away and are kept as they are.
  const parts = useMemo(() => splitQuote(d.html), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showQuote, setShowQuote] = useState(false);
  const [form, setForm] = useState<QuickForm>(() => ({ fromAccountId: d.fromAccountId || acc?.id, fromEmail: d.fromEmail, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, html: parts.own, signatureOf: d.signatureOf }));
  const writing = { font: useSettings((s) => s.writingFont), size: useSettings((s) => s.writingSize) };
  const editor = useEditor({
    extensions: editorExtensions(),
    content: parts.own,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-GB', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Message', class: 'ai-rich' } },
    onUpdate: ({ editor: ed }) => change({ html: ed.getHTML() }),
    onBlur: () => void flush(),
  });
  const signature = draftSignature({ fromEmail: form.fromEmail, signatureOf: form.signatureOf }, composeContext());
  const [showCc, setShowCc] = useState(d.cc.length > 0);
  const [showBcc, setShowBcc] = useState(d.bcc.length > 0);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const formRef = useRef(form);
  formRef.current = form;
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setSaving('saving');
    const f = formRef.current;
    await quickSave(d.id, { fromAccountId: f.fromAccountId, fromEmail: f.fromEmail, to: f.to, cc: f.cc, bcc: f.bcc, subject: f.subject, html: f.html, signatureOf: f.signatureOf });
    setSaving('saved');
  };
  const change = (patch: Partial<QuickForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    dirty.current = true;
    setSaving('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1200);
  };
  // Closing the card saves what's there.
  useEffect(() => () => { void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (k: 'to' | 'cc' | 'bcc', list: Address[]) => {
    const have = new Set(formRef.current[k].map((a) => a.email.toLowerCase()));
    change({ [k]: [...formRef.current[k], ...list.filter((a) => !have.has(a.email.toLowerCase()))] } as Partial<QuickForm>);
  };
  const drop = (k: 'to' | 'cc' | 'bcc', email: string) => change({ [k]: formRef.current[k].filter((a) => a.email !== email) } as Partial<QuickForm>);
  const noOne = form.to.length + form.cc.length + form.bcc.length === 0;
  const fromHit = aliases.find((x) => x.account.id === form.fromAccountId && x.alias.email === form.fromEmail) || aliases.find((x) => x.alias.email === form.fromEmail);

  const send = async () => { await flush(); onClose(); await quickSend(d.id); };
  const later = async (r: DOMRect) => { await flush(); laterMenu(r); };
  const toEditor = async () => { await flush(); onClose(); void openDraft(d.id); };

  return (
    <div className="ai-draft-detail" onClick={(e) => e.stopPropagation()}>
      <div className="ai-fields">
        <div className="comp-field">
          <label htmlFor={`aifrom-${d.id}`}>From</label>
          <span className="dot" style={{ background: fromHit?.account.colour, marginTop: 10 }} />
          <select id={`aifrom-${d.id}`} value={fromHit ? `${fromHit.account.id}|${fromHit.alias.email}` : ''} onChange={(e) => { const [accountId, ...rest] = e.target.value.split('|'); change({ fromAccountId: accountId, fromEmail: rest.join('|') }); }}>
            {accounts.map((a) => (
              <optgroup key={a.id} label={a.label}>
                {aliases.filter((x) => x.account.id === a.id).map(({ alias }) => <option key={alias.email} value={`${a.id}|${alias.email}`}>{alias.name} &lt;{alias.email}&gt;</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['cc', 'bcc'] as const).map((k) => {
              const shownNow = k === 'cc' ? showCc : showBcc;
              const set = k === 'cc' ? setShowCc : setShowBcc;
              const filled = form[k].length > 0;
              const name = k === 'cc' ? 'Cc' : 'Bcc';
              return <button key={k} className={`btn ghost ${shownNow ? 'active' : ''}`} aria-pressed={shownNow} title={shownNow ? (filled ? `Remove the ${name} addresses to hide this line` : `Hide ${name}`) : `Show ${name}`} onClick={() => { if (!shownNow) set(true); else if (!filled) set(false); }}>{name}</button>;
            })}
          </span>
        </div>
        <RecipientField label="To" value={form.to} contacts={contacts} onAdd={(l) => add('to', l)} onRemove={(e) => drop('to', e)} />
        {showCc && <RecipientField label="Cc" value={form.cc} contacts={contacts} onAdd={(l) => add('cc', l)} onRemove={(e) => drop('cc', e)} />}
        {showBcc && <RecipientField label="Bcc" value={form.bcc} contacts={contacts} onAdd={(l) => add('bcc', l)} onRemove={(e) => drop('bcc', e)} />}
        <div className="comp-field">
          <label htmlFor={`aisubj-${d.id}`}>Subject</label>
          <input id={`aisubj-${d.id}`} className="plain ai-subject-input" value={form.subject} onChange={(e) => change({ subject: e.target.value })} onBlur={() => void flush()} onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey && editor) { e.preventDefault(); editor.commands.focus(); } }} placeholder="Subject" />
        </div>
      </div>
      <div className="ai-editor">
        <FormatBar editor={editor} basic defaultFont={writing.font} defaultSize={writing.size}
          end={<SignaturePicker fromEmail={form.fromEmail} value={form.signatureOf} onChange={(v) => change({ signatureOf: v })} />} />
        <div className="ai-body" onClick={(e) => { if (e.target === e.currentTarget) editor?.commands.focus('end'); }}>
          <div style={cssToStyle(writingStyle())}><EditorContent editor={editor} onContextMenu={(e) => { if (!editor) return; e.preventDefault(); editMenu.open({ x: e.clientX, y: e.clientY }, editorMenuItems(editor)); }} /></div>{editMenu.node}
          {signature && <div className="signature-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }} />}
        </div>
      </div>
      {parts.quote && (
        <div className="ai-quote">
          <button className="btn ghost" onClick={() => setShowQuote(!showQuote)}><Icon name={showQuote ? 'chevronDown' : 'chevronRight'} size={12} /> {showQuote ? 'Hide the earlier emails' : 'Show the earlier emails'}</button>
          {showQuote && <div className="ai-quote-text">{htmlToText(parts.quote)}</div>}
        </div>
      )}
      {d.attachments.length > 0 && (
        <div className="ai-files" aria-label="Attachments">
          {d.attachments.map((a, i) => <button key={a.id} className="ai-file" title={`Open ${a.filename}`} onClick={() => void openDraftFile(d.attachments.map(draftFile), i).then((n) => n !== null && setFilePreview(n))}><Icon name="paperclip" size={13} /> {a.filename}</button>)}
          {filePreview !== null && <DraftFilesPreview files={d.attachments.map(draftFile)} start={filePreview} onClose={() => setFilePreview(null)} />}
        </div>
      )}
      <div className="ai-quick-note ai-note-row">
        <span>{writerText(d)}. To add or remove attachments, or change fonts, use Open in editor.</span>
        <span className={`ai-saved ${saving}`} aria-live="polite">{saving === 'saving' ? 'Saving...' : saving === 'saved' ? 'Saved' : ''}</span>
      </div>
      <div className="ai-quick-actions">
        <div className="btn-group">
          <button className="btn primary" disabled={noOne} title={noOne ? 'Add who it goes to first' : 'Send now'} onClick={() => void send()}><Icon name="send" size={14} /> Send</button>
          <button className="btn primary" disabled={noOne} aria-label="Send later" title="Send later" onClick={(e) => void later((e.currentTarget as HTMLElement).getBoundingClientRect())}><Icon name="chevronDown" size={12} /></button>
        </div>
        <button className="btn" onClick={() => void toEditor()}>Open in editor</button>
        <span className="grow" />
        <button className="btn ghost ai-delete" onClick={onDelete}><Icon name="trash" size={14} /> Delete draft</button>
      </div>
    </div>
  );
}
