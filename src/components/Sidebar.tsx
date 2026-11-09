// Left column: Favourites, combined mailboxes, custom groups, each account,
// and a Hidden section for things you rarely need.
//
// Every item has a "ref" (e.g. "all|inbox", "acc|<id>|junk", "acc|<id>|label|<labelId>",
// "grp|<id>|sent") so it can be pinned to Favourites or hidden without moving it.
import { createContext, useContext, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Icon, type IconName } from './Icon';
import { useMenu, type MenuItem } from './ui';
import { useSettings, type Settings } from '../lib/settings';
import { useSettingsAlerts } from '../lib/alerts';
import { useMail, setView, openScreen, providerFor, archive, trash, markSpam, moveToInbox, moveToLabel, idsForKeys, reconnectAccount, markViewRead, toast, syncAccount, updateAccount } from '../lib/mail';
import { ColourPicker } from './ColourPicker';
import { addAccountItems } from '../lib/accountMenu';
import { askText, askConfirm } from '../lib/dialogs';
import { inSystemFolder } from '../lib/mailbox';
import { dueReminders, alertMute } from '../lib/reminders';
import { useAiDrafts, groupCounts, setDraftFilter, groupColour } from '../lib/mcp/aiDrafts';
import { groupItems, newGroup } from './AiDrafts';
import { openSmartEditor, smartItems } from './SmartMailboxEditor';
import { matchSmart } from '../lib/smartMailboxes';
import { myAddresses } from '../lib/compose';
import type { Account, AccountGroup, Folder, Scope, SystemFolder, View } from '../lib/types';

const FOLDERS: { folder: SystemFolder; icon: IconName; name: string; all: string }[] = [
  { folder: 'inbox', icon: 'inbox', name: 'Inbox', all: 'All Inboxes' },
  { folder: 'drafts', icon: 'file', name: 'Drafts', all: 'All Drafts' },
  { folder: 'sent', icon: 'send', name: 'Sent', all: 'All Sent' },
  { folder: 'junk', icon: 'junk', name: 'Junk', all: 'All Junk' },
  { folder: 'bin', icon: 'trash', name: 'Bin', all: 'All Bin' },
  { folder: 'archive', icon: 'archive', name: 'Archive', all: 'All Archive' },
];
const FOLDER_BY_KEY = Object.fromEntries(FOLDERS.map((f) => [f.folder, f]));

type Counts = Record<string, number>;

function useCounts(): Counts {
  const messages = useMail((s) => s.messages);
  const snoozes = useMail((s) => s.snoozes);
  const accounts = useMail((s) => s.accounts);
  return useMemo(() => {
    const c: Counts = {};
    const snoozed = new Set(snoozes.map((s) => s.messageId));
    const inc = (k: string) => (c[k] = (c[k] || 0) + 1);
    const leftOut = new Set(accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id));
    for (const m of Object.values(messages)) {
      const p = providerFor(m.accountId);
      const all = (k: string) => { if (!leftOut.has(m.accountId)) inc(k); };
      if (m.unread && !snoozed.has(m.id) && inSystemFolder(m, 'inbox', p)) { inc(`${m.accountId}|inbox`); all('all|inbox'); }
      if (m.unread && inSystemFolder(m, 'junk', p)) { inc(`${m.accountId}|junk`); all('all|junk'); }
      if (inSystemFolder(m, 'drafts', p)) { inc(`${m.accountId}|drafts`); all('all|drafts'); }
      if (m.flagged && inSystemFolder(m, 'flagged', p)) all('all|flagged');
      if (m.unread) for (const l of m.labels) if (l.startsWith('Label_') || l.length > 12) inc(`${m.accountId}|label|${l}`);
    }
    return c;
  }, [messages, snoozes, accounts]);
}

interface Desc {
  ref: string;
  name: string;
  /** Extra context shown in Favourites and Hidden, e.g. the account name. */
  context?: string;
  icon?: IconName;
  dot?: string;
  view?: View;
  count?: number;
  dropFolder?: SystemFolder;
  dropLabel?: { accountId: string; labelId: string };
  warn?: boolean;
  account?: Account;
}

/** Works out what a ref points at. Returns null when it no longer exists (e.g. account removed). */
type Badges = Settings['badges'];

/** Total for a collapsed account: whatever counts are switched on, added up. */
function accountSum(id: string, counts: Counts, folders: Folder[], b: Badges, hidden: Set<string>): number {
  let n = 0;
  const add = (ref: string, key: string, on: boolean) => { if (on && !hidden.has(ref)) n += counts[key] || 0; };
  add(`acc|${id}|inbox`, `${id}|inbox`, b.inbox);
  add(`acc|${id}|junk`, `${id}|junk`, b.junk);
  add(`acc|${id}|drafts`, `${id}|drafts`, b.drafts);
  for (const f of folders) if (!f.system) add(`acc|${id}|label|${f.id}`, `${id}|label|${f.id}`, b.labels);
  return n;
}

function describe(ref: string, ctx: { accounts: Account[]; folders: Record<string, Folder[]>; groups: AccountGroup[]; counts: Counts; badges: Badges; badgeHidden: Set<string>; names: Record<string, string> }): Desc | null {
  const raw = describeRaw(ref, ctx);
  if (!raw) return raw;
  const d = ctx.names[ref] ? { ...raw, name: ctx.names[ref] } : raw;
  const b = ctx.badges;
  if (!b.enabled || ctx.badgeHidden.has(ref)) return { ...d, count: undefined };
  const kind = ref.split('|');
  const last = kind[0] === 'acc' && kind[2] === 'label' ? 'label' : kind[kind.length - 1];
  const allowed: Record<string, boolean> = { inbox: b.inbox, junk: b.junk, drafts: b.drafts, label: b.labels, flagged: b.flagged };
  if (kind[0] === 'acc' && kind.length === 2) return { ...d, count: accountSum(kind[1], ctx.counts, ctx.folders[kind[1]] || [], b, ctx.badgeHidden) };
  if (kind[0] === 'grp' && kind.length === 2) return d;
  return last in allowed ? (allowed[last] ? d : { ...d, count: undefined }) : { ...d, count: undefined };
}

function describeRaw(ref: string, ctx: { accounts: Account[]; folders: Record<string, Folder[]>; groups: AccountGroup[]; counts: Counts }): Desc | null {
  const parts = ref.split('|');
  const all: Scope = { type: 'all' };
  if (parts[0] === 'all') {
    const k = parts[1];
    if (k === 'vip') return { ref, name: 'Important', icon: 'star', view: { scope: all, mailbox: { kind: 'vip' } } };
    if (k === 'snoozed') return { ref, name: 'Snoozed', icon: 'clock', view: { scope: all, mailbox: { kind: 'snoozed' } } };
    if (k === 'flagged') return { ref, name: 'Flagged', icon: 'flag', view: { scope: all, mailbox: { kind: 'system', folder: 'flagged' } }, count: ctx.counts['all|flagged'] };
    const f = FOLDER_BY_KEY[k];
    if (!f) return null;
    return { ref, name: f.all, icon: f.icon, view: { scope: all, mailbox: { kind: 'system', folder: f.folder } }, count: ctx.counts[`all|${f.folder}`], dropFolder: f.folder };
  }
  if (parts[0] === 'acc') {
    const account = ctx.accounts.find((a) => a.id === parts[1]);
    if (!account) return null;
    const scope: Scope = { type: 'account', accountId: account.id };
    if (parts.length === 2) {
      return { ref, name: account.label, dot: account.colour, account, view: { scope, mailbox: { kind: 'system', folder: 'inbox' } }, count: ctx.counts[`${account.id}|inbox`], warn: account.status === 'needs-signin' };
    }
    if (parts[2] === 'label') {
      const labelId = parts.slice(3).join('|');
      const label = ctx.folders[account.id]?.find((f) => f.id === labelId);
      if (!label) return null;
      return { ref, name: label.name.split('/').pop() || label.name, context: account.label, icon: 'tag', view: { scope, mailbox: { kind: 'label', accountId: account.id, labelId } }, count: ctx.counts[`${account.id}|label|${labelId}`], dropLabel: { accountId: account.id, labelId } };
    }
    const f = FOLDER_BY_KEY[parts[2]];
    if (!f) return null;
    return { ref, name: f.name, context: account.label, icon: f.icon, view: { scope, mailbox: { kind: 'system', folder: f.folder } }, count: f.folder === 'inbox' || f.folder === 'junk' || f.folder === 'drafts' ? ctx.counts[`${account.id}|${f.folder}`] : undefined, dropFolder: f.folder };
  }
  if (parts[0] === 'grp') {
    const group = ctx.groups.find((g) => g.id === parts[1]);
    if (!group) return null;
    const scope: Scope = { type: 'group', groupId: group.id };
    const unread = group.accountIds.reduce((n, id) => n + (ctx.counts[`${id}|inbox`] || 0), 0);
    if (parts.length === 2) return { ref, name: group.name, icon: 'layers', view: { scope, mailbox: { kind: 'system', folder: 'inbox' } }, count: unread };
    const f = FOLDER_BY_KEY[parts[2]];
    if (!f) return null;
    return { ref, name: f.name, context: group.name, icon: f.icon, view: { scope, mailbox: { kind: 'system', folder: f.folder } }, count: f.folder === 'inbox' ? unread : undefined };
  }
  return null;
}

const sameView = (a: View, b?: View) => Boolean(b) && JSON.stringify(a) === JSON.stringify(b);

function dropEmails(d: Desc) {
  return (e: React.DragEvent) => {
    const keys = JSON.parse(e.dataTransfer.getData('text/wgm-keys') || '[]') as string[];
    const ids = idsForKeys(keys);
    if (!ids.length) return;
    if (d.dropLabel) return moveToLabel(ids, d.dropLabel.accountId, d.dropLabel.labelId);
    switch (d.dropFolder) {
      case 'archive': return archive(ids);
      case 'bin': return trash(ids);
      case 'junk': return markSpam(ids);
      case 'inbox': return moveToInbox(ids);
    }
  };
}

interface SideCtxValue {
  view: View;
  screen: string;
  favDrop: number | null;
  menuFor: (d: Desc, inFavourites: boolean) => MenuItem[];
  open: (d: Desc) => void;
  openMenu: (anchor: DOMRect | { x: number; y: number }, items: MenuItem[], align?: 'left' | 'right') => void;
  pickColour: (accountId: string, anchor: { x: number; y: number }) => void;
  /** Which row is being renamed right now (see renameKey), and how to start or finish. */
  renaming: string | null;
  startRename: (key: string) => void;
  finishRename: (d: Desc, value: string | null) => void;
}

/** One row can show up twice (Favourites and the list), so editing is tracked per place. */
const renameKey = (d: Desc, inFavourites: boolean) => `${inFavourites ? 'fav:' : ''}${d.ref}${d.account ? '|acc' : ''}`;

/** The text box that replaces a name while it is being renamed. Enter or clicking away saves, Escape cancels. */
function NameEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { box.current?.focus(); box.current?.select(); }, []);
  const finish = (save: boolean) => { if (done.current) return; done.current = true; if (save) onSave(v); else onCancel(); };
  return (
    <input
      ref={box}
      className="side-rename"
      value={v}
      aria-label="Rename"
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); }}
      onBlur={() => finish(true)}
    />
  );
}

/** For headings and rows that are only a label (no mail behind them): a name you can change and reset. */
/** The sidebar sections that can be moved, in their usual order. */
const SECTION_IDS = ['sec:favourites', 'sec:mailboxes', 'sec:smart', 'sec:groups', 'sec:accounts', 'sec:aidrafts'];
/** Your order, with any section it doesn't mention yet in its usual place. */
function sectionOrder(saved: string[] | undefined): string[] {
  const mine = (saved || []).filter((id) => SECTION_IDS.includes(id));
  const out = [...mine];
  SECTION_IDS.forEach((id, i) => { if (!out.includes(id)) out.splice(Math.min(i, out.length), 0, id); });
  return out;
}
/** Drops section `from` just above section `target`, or just below it. */
function moveSection(from: string, target: string, after = false) {
  if (from === target) return;
  const cur = sectionOrder(useSettings.getState().sectionOrder).filter((x) => x !== from);
  cur.splice(cur.indexOf(target) + (after ? 1 : 0), 0, from);
  useSettings.getState().set({ sectionOrder: cur });
}
function nudgeSection(id: string, by: -1 | 1) {
  const cur = sectionOrder(useSettings.getState().sectionOrder);
  const i = cur.indexOf(id);
  const j = i + by;
  if (j < 0 || j >= cur.length) return;
  [cur[i], cur[j]] = [cur[j], cur[i]];
  useSettings.getState().set({ sectionOrder: cur });
}

function useLabelName(id: string, fallback: string) {
  const custom = useSettings((st) => st.sidebarNames[id]);
  const [editing, setEditing] = useState(false);
  const save = (v: string) => {
    const names = { ...useSettings.getState().sidebarNames };
    const t = v.trim();
    if (!t || t === fallback) delete names[id]; else names[id] = t;
    useSettings.getState().set({ sidebarNames: names });
    setEditing(false);
  };
  const menu = (openMenu: SideCtxValue['openMenu'], at: { x: number; y: number }, section?: string) => openMenu(at, [
    { label: 'Rename...', icon: 'compose', onClick: () => setEditing(true) },
    ...(custom ? [{ label: 'Reset name', icon: 'undo' as const, onClick: () => save('') }] : []),
    ...(section ? [
      { divider: true as const },
      { label: 'Move up', icon: 'chevronDown' as const, onClick: () => nudgeSection(section, -1) },
      { label: 'Move down', icon: 'chevronDown' as const, onClick: () => nudgeSection(section, 1) },
      { label: 'Reset section order', icon: 'undo' as const, onClick: () => useSettings.getState().set({ sectionOrder: [] }) },
    ] : []),
  ]);
  return { name: custom || fallback, editing, setEditing, save, menu };
}
const SideCtx = createContext<SideCtxValue>(null as unknown as SideCtxValue);

/** accountRow: 'inbox' is an account listed under All Inboxes (picture, email chip when there is room); 'head' is an account in the Accounts list (just the colour dot). */
function Item({ d, level = 0, twisty, onTwisty, inFavourites = false, favIndex, dim = false, showContext = false, accountRow, chip = false, folderId }: {
    d: Desc; level?: number; twisty?: 'open' | 'closed'; onTwisty?: () => void; inFavourites?: boolean; favIndex?: number; dim?: boolean; showContext?: boolean; accountRow?: 'inbox' | 'head'; chip?: false | 'under' | 'beside'; folderId?: string;
  }) {
    const { view, screen, favDrop, menuFor, open, openMenu, pickColour, renaming, startRename, finishRename } = useContext(SideCtx);
    const s = useSettings();
    const rkey = renameKey(d, inFavourites);
    const editing = renaming === rkey;
    const lastClick = useRef(0);
    const selected = screen === 'mail' && sameView(view, d.view) && !(twisty === 'open' && d.account);
    const canTakeEmails = Boolean(d.dropFolder && d.dropFolder !== 'drafts' && d.dropFolder !== 'sent') || Boolean(d.dropLabel);
    return (
      <div
        className={`side-row ${favDrop !== null && inFavourites && favIndex === favDrop ? 'drop-before' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/wgm-side', d.ref);
          e.dataTransfer.setData(inFavourites ? 'text/wgm-fav' : 'text/wgm-item', d.ref);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragEnd={(e) => {
          // Dragged out of Favourites and let go somewhere else: remove it, like the Mac dock.
          if (inFavourites && e.dataTransfer.dropEffect === 'none') {
            s.unpin(d.ref);
            toast({ text: `${d.name} removed from Favourites`, undo: () => useSettings.getState().pin(d.ref, favIndex) });
          }
          // Same for a folder you made: drag a row out and let go to take it back out.
          if (folderId && e.dataTransfer.dropEffect === 'none') {
            const f = useSettings.getState().customFolders.find((x) => x.id === folderId);
            if (f) {
              setFolderItems(folderId, f.items.filter((r) => r !== d.ref));
              toast({ text: `${d.name} taken out of ${f.name}`, undo: () => setFolderItems(folderId, f.items) });
            }
          }
        }}
        onDragOver={(e) => {
          if (canTakeEmails && e.dataTransfer.types.includes('text/wgm-keys')) e.preventDefault();
        }}
        onDrop={(e) => { if (e.dataTransfer.types.includes('text/wgm-keys')) { e.preventDefault(); dropEmails(d)(e); } }}
        onContextMenu={(e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, menuFor(d, inFavourites)); }}
      >
        {editing ? (
          <div className={`side-item ${level === 1 ? 'child' : level >= 2 ? 'grandchild' : ''}`}>
            <NameEdit value={d.name} onSave={(v) => finishRename(d, v)} onCancel={() => finishRename(d, null)} />
          </div>
        ) : (
        <button
          className={`side-item ${selected ? 'selected' : ''} ${level === 1 ? 'child' : level >= 2 ? 'grandchild' : ''} ${dim ? 'dim' : ''}`}
          style={selected && d.account && d.dot ? { background: `color-mix(in srgb, ${d.dot} 26%, transparent)`, boxShadow: `inset 3px 0 0 ${d.dot}` } : undefined}
          onClick={() => {
            // Click a selected row again after a short pause (like Explorer) to rename it.
            const gap = Date.now() - lastClick.current;
            lastClick.current = Date.now();
            if (selected && gap > 450 && gap < 2500) return startRename(rkey);
            open(d);
          }}
          title={d.context ? `${d.context}: ${d.name}` : d.name}
        >
          {twisty && (
            <span className="twisty" onClick={(e) => { e.stopPropagation(); onTwisty?.(); }} role="button" aria-label={twisty === 'open' ? 'Collapse' : 'Expand'}>
              <Icon name={twisty === 'open' ? 'chevronDown' : 'chevronRight'} size={13} />
            </span>
          )}
          {d.dot && s.accountIcons && d.account?.photoUrl && accountRow !== 'head' ? (
            <img
              className={`dot-photo ${chip === 'under' ? 'tall' : ''}`}
              src={d.account.photoUrl}
              alt=""
              title="Change colour"
              onClick={(e) => { e.stopPropagation(); pickColour(d.account!.id, { x: e.clientX, y: e.clientY + 10 }); }}
            />
          ) : d.dot ? (
            <span
              className={`dot ${d.account ? 'clickable' : ''}`}
              style={{ background: d.dot }}
              title={d.account ? 'Change colour' : undefined}
              onClick={d.account ? (e) => { e.stopPropagation(); pickColour(d.account!.id, { x: e.clientX, y: e.clientY + 10 }); } : undefined}
            />
          ) : d.icon ? <Icon name={d.icon} /> : null}
          <span className={`name ${chip && d.account ? `with-chip ${chip}` : ''}`}>
            {d.name}
            {showContext && d.context && <span className="ctx"> · {d.context}</span>}
            {chip && d.account && d.dot && <span className="side-email"><i style={{ background: d.dot }} />{d.account.email}</span>}
          </span>
          {d.warn && <span className="warn" title="Needs signing in again"><Icon name="alert" size={14} /></span>}
          {d.count && s.badges.style === 'dot' ? <span className="attn-dot" style={{ background: s.badges.colour }} title="Unread mail" aria-label="Has unread mail" /> : null}
          {d.count && s.badges.style !== 'dot' ? <span className={`count ${s.badges.style === 'pill' ? 'pill-badge' : ''}`} style={s.badges.style === 'pill' ? { background: s.badges.colour, color: textOn(s.badges.colour) } : undefined}>{d.count > 999 ? '999+' : d.count}</span> : null}
        </button>
        )}
        <button className="side-more" aria-label={`Options for ${d.name}`} onClick={(e) => openMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), menuFor(d, inFavourites), 'right')}>
          <Icon name="more" size={14} />
        </button>
      </div>
    );
  }

/** Puts a row in a folder, taking it out of any other folder (and out of Hidden). It lives in one place at a time. */
function moveIntoFolder(ref: string, folderId: string) {
  const st = useSettings.getState();
  st.set({
    customFolders: st.customFolders.map((f) => (f.id === folderId ? { ...f, items: f.items.includes(ref) ? f.items : [...f.items, ref] } : { ...f, items: f.items.filter((r) => r !== ref) })),
    hiddenItems: st.hiddenItems.filter((r) => r !== ref),
  });
}

function setFolderItems(id: string, items: string[]) {
  const st = useSettings.getState();
  st.set({ customFolders: st.customFolders.map((f) => (f.id === id ? { ...f, items } : f)) });
}

/** A folder you made. Drop rows on it to put them inside; it shows a coral dot instead of a count when anything inside has unread mail. */
function CustomFolder({ folder, rows, onNew, forceOpen }: { folder: { id: string; name: string; items: string[] }; rows: Desc[]; onNew: () => void; forceOpen: boolean }) {
  const { openMenu } = useContext(SideCtx);
  const collapsed = useSettings((st) => st.collapsed);
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);
  const isOpen = collapsed[`cf:${folder.id}`] === false || forceOpen;
  const toggle = (v: boolean) => useSettings.getState().set({ collapsed: { ...useSettings.getState().collapsed, [`cf:${folder.id}`]: !v } });
  const rename = (v: string) => {
    const t = v.trim();
    const st = useSettings.getState();
    if (t) st.set({ customFolders: st.customFolders.map((f) => (f.id === folder.id ? { ...f, name: t } : f)) });
    setEditing(false);
  };
  const remove = async () => {
    if (folder.items.length && !(await askConfirm(`Delete the folder ${folder.name}?`, 'The mail and folders inside are not touched; only this folder goes.', 'Delete'))) return;
    const st = useSettings.getState();
    const before = st.customFolders;
    st.set({ customFolders: before.filter((f) => f.id !== folder.id) });
    toast({ text: `${folder.name} deleted`, undo: () => useSettings.getState().set({ customFolders: before }) });
  };
  const attention = rows.some((r) => Boolean(r.count));
  return (
    <div
      className={over ? 'drop-target' : ''}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/wgm-side')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const ref = e.dataTransfer.getData('text/wgm-side');
        if (!ref) return;
        e.preventDefault(); e.stopPropagation();
        moveIntoFolder(ref, folder.id);
        toggle(true);
      }}
    >
      <div className="side-row" onContextMenu={(e) => {
        e.preventDefault(); e.stopPropagation();
        openMenu({ x: e.clientX, y: e.clientY }, [
          { label: 'Rename...', icon: 'compose', onClick: () => setEditing(true) },
          { label: 'New folder...', icon: 'folder', onClick: onNew },
          { divider: true },
          { label: 'Delete folder', icon: 'trash', onClick: remove },
        ]);
      }}>
        {editing ? (
          <div className="side-item"><NameEdit value={folder.name} onSave={rename} onCancel={() => setEditing(false)} /></div>
        ) : (
          <button className="side-item" onClick={() => toggle(!isOpen)} aria-expanded={isOpen} title={folder.name}>
            <span className="twisty" aria-hidden><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} /></span>
            <Icon name="folder" /><span className="name">{folder.name}</span>
            {attention && !isOpen ? <span className="attn-dot" title="Something inside has unread mail" aria-label="Something inside has unread mail" /> : null}
          </button>
        )}
      </div>
      {isOpen && rows.map((r) => <Item key={r.ref} d={r} level={1} showContext folderId={folder.id} />)}
      {isOpen && !rows.length && <div className="side-empty">Drag mailboxes here.</div>}
    </div>
  );
}

function Section({ id, title, children, defaultCollapsed = false, className = '', onDragOver, onDrop, onDragLeave }: {
    id: string; title: string; children: React.ReactNode; defaultCollapsed?: boolean; className?: string;
    onDragOver?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void; onDragLeave?: () => void;
  }) {
    const collapsed = useSettings((st) => st.collapsed);
    const { openMenu } = useContext(SideCtx);
    const label = useLabelName(id, title);
    const movable = SECTION_IDS.includes(id);
    const [dropHere, setDropHere] = useState<'before' | 'after' | false>(false);
    const setCollapsed = (key: string, value: boolean) => useSettings.getState().set({ collapsed: { ...useSettings.getState().collapsed, [key]: value } });
    const isCollapsed = collapsed[id] ?? defaultCollapsed;
    return (
      <div className={`side-section ${className}`} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
        {label.editing ? (
          <div className="side-heading"><NameEdit value={label.name} onSave={label.save} onCancel={() => label.setEditing(false)} /></div>
        ) : (
          <button
            className={`side-heading ${dropHere === 'before' ? 'drop-before' : dropHere === 'after' ? 'drop-after' : ''}`}
            onClick={() => setCollapsed(id, !isCollapsed)}
            aria-expanded={!isCollapsed}
            draggable={movable}
            title={movable ? 'Drag to move this section, or right-click for more' : undefined}
            onDragStart={movable ? (e) => { e.dataTransfer.setData('text/wgm-section', id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
            onDragOver={movable ? (e) => { if (e.dataTransfer.types.includes('text/wgm-section')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropHere(e.clientY > r.top + r.height / 2 ? 'after' : 'before'); } } : undefined}
            onDragLeave={() => setDropHere(false)}
            onDrop={movable ? (e) => { const from = e.dataTransfer.getData('text/wgm-section'); const after = dropHere === 'after'; setDropHere(false); if (from) { e.preventDefault(); moveSection(from, id, after); } } : undefined}
            onContextMenu={id === 'sec:hidden' ? undefined : (e) => { e.preventDefault(); label.menu(openMenu, { x: e.clientX, y: e.clientY }, movable ? id : undefined); }}
          >
            <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} /> {id === 'sec:hidden' ? title : label.name}
          </button>
        )}
        {!isCollapsed && children}
      </div>
    );
  }

/** Wide enough sidebar to show each account's email address as a coloured chip. */
const CHIP_WIDTH = 270;
/** Wider still: the address fits on the same line as the name, so the row stays one line tall. */
const CHIP_BESIDE = 360;

export function Sidebar({ width }: { width: number }) {
  const accounts = useMail((s) => s.accounts);
  const folders = useMail((s) => s.folders);
  const view = useMail((s) => s.view);
  const screen = useMail((s) => s.screen);
  const snoozes = useMail((s) => s.snoozes);
  const events = useMail((s) => s.events);
  const followups = useMail((s) => s.followups);
  const dismissed = useMail((s) => s.dismissed);
  const s = useSettings();
  const counts = useCounts();
  const alerts = useSettingsAlerts();
  const menu = useMenu();
  const [favDrop, setFavDrop] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ accountId: string; anchor: { x: number; y: number } } | null>(null);
  const pickColour = (accountId: string, anchor: { x: number; y: number }) => setPicker({ accountId, anchor });
  const hiddenCals = useSettings((s) => s.hiddenCalendars);
  const aiDrafts = useAiDrafts((s) => s.list);
  const draftFilter = useAiDrafts((s) => s.filter);
  const allMessages = useMail((st) => st.messages);
  const [showHiddenSmart, setShowHiddenSmart] = useState(false);
  // Unread count for each Smart Mailbox, worked out once per change rather than on every render.
  const smartUnread = useMemo(() => {
    const boxes = s.smartMailboxes || [];
    if (!boxes.length) return {} as Record<string, number>;
    const ctx = { vips: new Set(s.vips), mine: myAddresses(accounts) };
    const out: Record<string, number> = {};
    for (const b of boxes) out[b.id] = 0;
    for (const m of Object.values(allMessages)) {
      if (!m.unread) continue;
      for (const b of boxes) if (matchSmart(m, b, providerFor(m.accountId), ctx)) out[b.id]++;
    }
    return out;
  }, [allMessages, s.smartMailboxes, s.vips, accounts]);
  const aiOn = useSettings((s) => Boolean(s.mcp?.enabled));
  const alertsMode = useSettings((s) => s.hiddenCalendarsAlerts);
  const reminderCount = useMemo(() => dueReminders(events, followups, dismissed, Date.now(), alertMute({ hiddenCalendars: hiddenCals, hiddenCalendarsAlerts: alertsMode })).length, [events, followups, dismissed, hiddenCals, alertsMode]);

  const ctx = { accounts, folders, groups: s.groups, counts, badges: s.badges, badgeHidden: new Set(s.badgeHidden), names: s.sidebarNames };
  const hidden = new Set(s.hiddenItems);
  const favs = new Set(s.favourites);
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  const collapsed = s.collapsed;
  const setCollapsed = (key: string, value: boolean) => s.set({ collapsed: { ...useSettings.getState().collapsed, [key]: value } });

  const open = (d: Desc) => {
    if (d.account && d.account.status === 'needs-signin') return reconnectAccount(d.account.id);
    if (d.view) setView(d.view);
  };

  const menuFor = (d: Desc, inFavourites: boolean): MenuItem[] => {
    const items: MenuItem[] = [];
    if (d.view) items.push({ label: 'Open', icon: 'inbox', onClick: () => open(d) });
    if (d.view && (d.view.mailbox.kind !== 'system' || ['inbox', 'junk', 'flagged', 'archive'].includes((d.view.mailbox as { folder: string }).folder))) {
      items.push({ label: 'Mark all as read', icon: 'mailOpen', onClick: () => markViewRead(d.view!) });
    }
    items.push({ divider: true });
    items.push({ label: 'Rename...', icon: 'compose', onClick: () => setRenaming(renameKey(d, inFavourites)) });
    if (s.sidebarNames[d.ref] && !d.account) items.push({ label: 'Reset name', icon: 'undo', onClick: () => finishRename(d, '') });
    if (favs.has(d.ref)) items.push({ label: 'Remove from Favourites', icon: 'pin', onClick: () => s.unpin(d.ref) });
    else items.push({ label: 'Add to Favourites', icon: 'pin', onClick: () => { s.pin(d.ref); toast({ text: `${d.context ? `${d.context}: ` : ''}${d.name} added to Favourites`, ttl: 2500 }); } });
    for (const f of s.customFolders) {
      if (f.items.includes(d.ref)) items.push({ label: `Take out of ${f.name}`, icon: 'folder', onClick: () => setFolderItems(f.id, f.items.filter((r) => r !== d.ref)) });
      else items.push({ label: `Move to ${f.name}`, icon: 'folder', onClick: () => moveIntoFolder(d.ref, f.id) });
    }
    const countOff = s.badgeHidden.includes(d.ref);
    items.push({ label: countOff ? 'Show unread count' : 'Hide unread count', icon: 'bell', onClick: () => s.set({ badgeHidden: countOff ? s.badgeHidden.filter((r) => r !== d.ref) : [...s.badgeHidden, d.ref] }) });
    if (hidden.has(d.ref)) items.push({ label: 'Show in sidebar', icon: 'inbox', onClick: () => s.unhide(d.ref) });
    else if (!inFavourites) items.push({ label: 'Hide', icon: 'imageOff', onClick: () => { s.hide(d.ref); toast({ text: `${d.name} moved to Hidden`, undo: () => s.unhide(d.ref) }); } });
    if (d.account) {
      items.push({ divider: true }, { label: 'Change colour...', icon: 'layers', onClick: () => setPicker({ accountId: d.account!.id, anchor: { x: 60, y: 200 } }) }, { label: 'Check for new mail', icon: 'refresh', onClick: () => syncAccount(d.account!.id) }, { label: 'Account settings', icon: 'settings', onClick: () => openScreen('settings', 'accounts') });
    }
    return items;
  };

  const d = (ref: string) => describe(ref, ctx);

  // Renaming only changes how things look in this app. Accounts and groups share their name with Settings.
  const finishRename = (item: Desc, value: string | null) => {
    setRenaming(null);
    if (value === null) return;
    const name = value.trim();
    const parts = item.ref.split('|');
    if (item.account) {
      if (name) updateAccount(item.account.id, { label: name });
    } else if (parts[0] === 'grp' && parts.length === 2) {
      if (name) s.set({ groups: s.groups.map((g) => (g.id === parts[1] ? { ...g, name } : g)) });
    } else {
      const names = { ...useSettings.getState().sidebarNames };
      const original = describeRaw(item.ref, ctx)?.name;
      if (!name || name === original) delete names[item.ref]; else names[item.ref] = name;
      s.set({ sidebarNames: names });
    }
  };
  const visible = (ref: string) => !hidden.has(ref);
  // Something put in one of your folders lives there and no longer shows in its old place.
  const inFolders = new Set(s.customFolders.flatMap((f) => f.items));
  const onShelf = (ref: string) => !hidden.has(ref) && !inFolders.has(ref);

  const newFolder = async () => {
    const name = (await askText('New folder', '', 'Create'))?.trim();
    if (!name) return;
    const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    s.set({ customFolders: [...useSettings.getState().customFolders, { id, name, items: [] }], collapsed: { ...useSettings.getState().collapsed, [`cf:${id}`]: false } });
  };

  // ----- Favourites drag and drop -----
  const favList = s.favourites.map(d).filter(Boolean) as Desc[];
  const favDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('text/wgm-side')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('text/wgm-fav') ? 'move' : 'copy';
    const rows = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.side-row'));
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { idx = i; break; }
    }
    setFavDrop(idx);
  };
  const favDropHandler = (e: React.DragEvent) => {
    const ref = e.dataTransfer.getData('text/wgm-side');
    if (!ref) return;
    e.preventDefault();
    const idx = favDrop ?? s.favourites.length;
    const cur = s.favourites.indexOf(ref);
    s.pin(ref, cur >= 0 && cur < idx ? idx - 1 : idx);
    setFavDrop(null);
  };

  const accountRef = (a: Account) => `acc|${a.id}`;
  const allInboxOpen = !(collapsed['all-inboxes'] ?? false);

  // Each section by its id, so they can be shown in the order you choose (drag a heading, or right-click it).
  const blocks: Record<string, React.ReactNode> = {
    'sec:favourites': (
      <Section id="sec:favourites" title="Favourites" className={favDrop !== null ? 'drop-target' : ''} onDragOver={favDragOver} onDrop={favDropHandler} onDragLeave={() => setFavDrop(null)}>
        {favList.map((f, i) => <Item key={f.ref} d={f} inFavourites favIndex={i} showContext />)}
        {favDrop === favList.length && <div className="drop-line" />}
        {!favList.length && <div className="side-empty">Right click anything below, or drag it here, to pin it.</div>}
      </Section>
    ),
    'sec:mailboxes': (
      <Section id="sec:mailboxes" title="Mailboxes">
        {onShelf('all|inbox') && (
          <Item
            d={d('all|inbox')!}
            twisty={accounts.filter((a) => !a.leaveOutOfAll).length > 1 ? (allInboxOpen ? 'open' : 'closed') : undefined}
            onTwisty={() => setCollapsed('all-inboxes', allInboxOpen)}
          />
        )}
        {/* Accounts left out of All Inboxes are not listed under it. They keep their own place under Accounts. */}
        {onShelf('all|inbox') && allInboxOpen && accounts.filter((a) => !a.leaveOutOfAll).length > 1 && sorted.filter((a) => !a.leaveOutOfAll).map((a) => {
          const ref = `acc|${a.id}|inbox`;
          const desc = d(ref);
          return desc && <Item key={ref} d={{ ...desc, name: a.label, dot: a.colour, icon: undefined, account: a }} level={1} accountRow="inbox" chip={width >= CHIP_BESIDE ? 'beside' : width >= CHIP_WIDTH ? 'under' : false} />;
        })}
        {s.vips.length > 0 && onShelf('all|vip') && <Item d={d('all|vip')!} />}
        {onShelf('all|flagged') && <Item d={d('all|flagged')!} />}
        {snoozes.length > 0 && onShelf('all|snoozed') && <Item d={{ ...d('all|snoozed')!, count: snoozes.length }} />}
        {s.customFolders.map((f) => {
          const rows = f.items.filter(visible).map(d).filter(Boolean) as Desc[];
          const inside = screen === 'mail' && rows.some((r) => r.view && sameView(view, r.view));
          return <CustomFolder key={f.id} folder={f} rows={rows} onNew={newFolder} forceOpen={inside} />;
        })}
      </Section>
    ),
    'sec:smart': (
      <Section id="sec:smart" title="Smart Mailboxes">
        {(s.smartMailboxes || []).filter((b) => !b.hidden || showHiddenSmart).map((b) => {
          const v: View = { scope: { type: 'all' }, mailbox: { kind: 'smart', id: b.id } };
          const on = screen === 'mail' && sameView(view, v);
          return (
            <div className="side-row" key={b.id}>
              <button className={`side-item ${on ? 'selected' : ''} ${b.hidden ? 'dim' : ''}`} onClick={() => setView(v)} title={`${b.name}${b.hidden ? ' (hidden)' : ''}. Drag to reorder.`}
                draggable onDragStart={(e) => { e.dataTransfer.setData('text/wgm-smart', b.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('text/wgm-smart')) e.preventDefault(); }}
                onDrop={(e) => { const from = e.dataTransfer.getData('text/wgm-smart'); if (!from || from === b.id) return; e.preventDefault(); const list = (s.smartMailboxes || []).filter((x) => x.id !== from); const moved = (s.smartMailboxes || []).find((x) => x.id === from); if (!moved) return; list.splice(list.findIndex((x) => x.id === b.id), 0, moved); s.set({ smartMailboxes: list }); }}
                onContextMenu={(e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, smartItems(b)); }}>
                <Icon name="filter" /><span className="name">{b.name}</span>{smartUnread[b.id] ? <span className="count">{smartUnread[b.id]}</span> : null}
              </button>
              <button className="side-more" aria-label={`Options for ${b.name}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), smartItems(b), 'right')}><Icon name="more" size={14} /></button>
            </div>
          );
        })}
        {(s.smartMailboxes || []).some((b) => b.hidden) && (
          <div className="side-row">
            <button className="side-item dim" onClick={() => setShowHiddenSmart(!showHiddenSmart)}><Icon name={showHiddenSmart ? 'chevronDown' : 'eye'} /><span className="name">{showHiddenSmart ? 'Hide hidden ones' : `Show hidden (${(s.smartMailboxes || []).filter((b) => b.hidden).length})`}</span></button>
          </div>
        )}
        <div className="side-row">
          <button className="side-item dim" onClick={() => openSmartEditor()}><Icon name="plus" /><span className="name">New Smart Mailbox</span></button>
        </div>
      </Section>
    ),
    'sec:groups': (
s.groups.length > 0 && (
        <Section id="sec:groups" title="Groups">
          {s.groups.filter((g) => onShelf(`grp|${g.id}`)).map((g) => {
            const gOpen = !(collapsed[`grp:${g.id}`] ?? false);
            const head = d(`grp|${g.id}`)!;
            return (
              <div key={g.id}>
                <Item d={{ ...head, count: gOpen ? undefined : head.count }} twisty={gOpen ? 'open' : 'closed'} onTwisty={() => setCollapsed(`grp:${g.id}`, gOpen)} />
                {gOpen && FOLDERS.map((f) => `grp|${g.id}|${f.folder}`).filter(onShelf).map((ref) => <Item key={ref} d={d(ref)!} level={1} />)}
              </div>
            );
          })}
        </Section>
      )
    ),
    'sec:accounts': (
      <Section id="sec:accounts" title="Accounts">
        {sorted.filter((a) => onShelf(accountRef(a))).map((a) => {
          // Accounts start collapsed; All Inboxes covers day to day.
          const aOpen = collapsed[`acc:${a.id}`] === false;
          const head = d(accountRef(a))!;
          const labels = (folders[a.id] || []).filter((f) => !f.system).sort((x, y) => x.name.localeCompare(y.name));
          return (
            <div key={a.id}>
              <Item d={{ ...head, count: aOpen ? undefined : head.count }} accountRow="head" twisty={aOpen ? 'open' : 'closed'} onTwisty={() => setCollapsed(`acc:${a.id}`, aOpen)} />
              {aOpen && (
                <>
                  {FOLDERS.map((f) => `acc|${a.id}|${f.folder}`).filter(onShelf).map((ref) => <Item key={ref} d={d(ref)!} level={1} />)}
                  {labels.map((l) => `acc|${a.id}|label|${l.id}`).filter(onShelf).map((ref) => {
                    const desc = d(ref);
                    const depth = labels.find((l) => ref.endsWith(`|${l.id}`))?.depth || 0;
                    return desc && <Item key={ref} d={desc} level={1 + Math.min(depth, 1)} />;
                  })}
                </>
              )}
            </div>
          );
        })}
        <div className="side-row">
          <button className="side-item add-account" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), addAccountItems())}>
            <Icon name="plus" /><span className="name">Add account</span>
          </button>
        </div>
      </Section>
    ),
    'sec:aidrafts': (
(aiDrafts.length > 0 || aiOn) && (() => {
        // AI drafts, with its groups one level down. Click a group to see only those drafts; right-click to rename or delete it.
        const groups = s.draftGroups || [];
        const n = groupCounts(aiDrafts, groups);
        const filter = draftFilter;
        const go = (f: string) => { setDraftFilter(f); openScreen('aidrafts'); };
        const on = (f: string) => screen === 'aidrafts' && filter === f;
        return (
          <Section id="sec:aidrafts" title="AI Drafts">
            <div className="side-row">
              <button className={`side-item ${on('all') ? 'selected' : ''}`} onClick={() => go('all')} title="Drafts written by AI apps">
                <Icon name="sparkle" /><span className="name">All AI Drafts</span>{n.all ? <span className="count">{n.all}</span> : null}
              </button>
            </div>
            {groups.map((g) => (
              <div className="side-row" key={g.id}>
                <button className={`side-item child ${on(g.id) ? 'selected' : ''}`} onClick={() => go(g.id)}
                  onContextMenu={(e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, groupItems(g.id, g.name)); }}>
                  <span className="grp-tag" style={{ color: groupColour(g) }}><Icon name="tag" /></span><span className="name">{g.name}</span>{n.byGroup[g.id] ? <span className="count">{n.byGroup[g.id]}</span> : null}
                </button>
              </div>
            ))}
            {n.none > 0 && (
              <div className="side-row">
                <button className={`side-item child ${on('none') ? 'selected' : ''}`} onClick={() => go('none')}>
                  <Icon name="file" /><span className="name">No Group</span><span className="count">{n.none}</span>
                </button>
              </div>
            )}
            <div className="side-row">
              <button className="side-item child dim" onClick={() => void newGroup()}><Icon name="plus" /><span className="name">New group</span></button>
            </div>
          </Section>
        );
      })()
    ),
  };
  const order = sectionOrder(s.sectionOrder);

  return (
    <SideCtx.Provider value={{ view, screen, favDrop, menuFor, open, openMenu: menu.open, pickColour, renaming, startRename: setRenaming, finishRename }}>
    <nav className="sidebar" style={{ width }} aria-label="Mailboxes" onClick={(e) => { if (screen !== 'mail' && e.target === e.currentTarget) openScreen('mail'); }}>
      <div className="side-scroll" onClick={(e) => { if (screen !== 'mail' && (e.target as HTMLElement).closest('.side-row, .side-heading, button') === null) openScreen('mail'); }} onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.side-row, .side-heading')) return;
        e.preventDefault();
        menu.open({ x: e.clientX, y: e.clientY }, [{ label: 'New folder...', icon: 'folder', onClick: newFolder }]);
      }}>
      {order.map((id) => <Fragment key={id}>{blocks[id]}</Fragment>)}

      {s.hiddenItems.length > 0 && (
        <Section id="sec:hidden" title={`Hidden (${s.hiddenItems.length})`} defaultCollapsed>
          {(s.hiddenItems.map(d).filter(Boolean) as Desc[]).map((h) => <Item key={h.ref} d={h} dim showContext />)}
        </Section>
      )}

      </div>
      <div className="side-footer">
        <div className="side-row">
          <button className={`side-item ${screen === 'reminders' ? 'selected' : ''}`} onClick={() => openScreen(screen === 'reminders' ? 'mail' : 'reminders')}>
            <Icon name="bell" /><span className="name">Reminders</span>{reminderCount ? <span className="count">{reminderCount}</span> : null}
          </button>
        </div>
        <div className="side-row">
          <button className={`side-item ${screen === 'help' ? 'selected' : ''}`} onClick={() => openScreen('help')}>
            <Icon name="help" /><span className="name">Help</span>
          </button>
        </div>
        <div className="side-row">
          <button className={`side-item ${screen === 'settings' ? 'selected' : ''}`} onClick={() => openScreen('settings')}>
            <Icon name="settings" /><span className="name">Settings</span>{alerts.any ? <span className="attn-dot" title={Object.values(alerts.tabs).join('. ')} aria-label={Object.values(alerts.tabs).join('. ')} /> : null}
          </button>
        </div>
      </div>
      {menu.node}
      {picker && (
        <ColourPicker
          anchor={picker.anchor}
          value={accounts.find((a) => a.id === picker.accountId)?.colour || '#888888'}
          onPick={(c) => updateAccount(picker.accountId, { colour: c })}
          onClose={() => setPicker(null)}
        />
      )}
    </nav>
    </SideCtx.Provider>
  );
}

/** Dark or white text, whichever reads better on the badge colour. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? '#2a1a14' : '#ffffff';
}
