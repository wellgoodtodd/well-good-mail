// Middle column: conversations with sender, subject and preview lines.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { listTime, useMenu, snoozeOptions, avatarColour, initials, type MenuItem } from './ui';
import { setFilters, activeFilterCount, NO_FILTERS, type ListFilters } from '../lib/mail';
import type { Account, Message } from '../lib/types';
import { useMail, messagesInThread, runSearch, selectThread, archive, trash, toggleFlag, snooze, idsForKeys, markRead, adoptRemote, providerFor } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { useViewList } from '../lib/useList';
import { threadKey, viewTitle, inSystemFolder, type ListItem } from '../lib/mailbox';
import { messageMenu } from '../lib/actions';
import { popoutMessage, editServerDraft } from '../lib/composeActions';
import { myAddresses } from '../lib/compose';

export function MessageList({ style }: { style: React.CSSProperties }) {
  const { items, remote } = useViewList();
  const view = useMail((s) => s.view);
  const accounts = useMail((s) => s.accounts);
  const folders = useMail((s) => s.folders);
  const selectedKey = useMail((s) => s.selectedKey);
  const selectedKeys = useMail((s) => s.selectedKeys);
  const searching = useMail((s) => s.searching);
  const syncing = useMail((s) => s.syncing);
  const lastSyncAt = useMail((s) => s.lastSyncAt);
  const previewLines = useSettings((s) => s.previewLines);
  const groups = useSettings((s) => s.groups);
  const threaded = useSettings((s) => s.threaded);
  const senderPhotos = useSettings((s) => s.senderPhotos);
  const contacts = useMail((s) => s.contacts);
  const photoOf = useMemo(() => (senderPhotos ? new Map(contacts.filter((c) => c.photo).map((c) => [c.email, c.photo as string])) : new Map<string, string>()), [senderPhotos, contacts]);
  const menu = useMenu();
  const filters = useMail((s) => s.filters);
  const filterMenu = (): MenuItem[] => {
    const tick = (on: boolean) => (on ? 'check' : undefined);
    const f = useMail.getState().filters;
    const items: MenuItem[] = [
      { heading: 'Show only' },
      { label: 'Unread', icon: tick(f.unread), onClick: () => setFilters({ unread: !f.unread }) },
      { label: 'Flagged', icon: tick(f.flagged), onClick: () => setFilters({ flagged: !f.flagged }) },
      { label: 'With attachments', icon: tick(f.attachments), onClick: () => setFilters({ attachments: !f.attachments }) },
      { label: 'From important senders', icon: tick(f.vip), onClick: () => setFilters({ vip: !f.vip }) },
      { label: 'Sent to me directly (not Cc)', icon: tick(f.toMe), onClick: () => setFilters({ toMe: !f.toMe }) },
      { heading: 'Received' },
      { label: 'Any time', icon: tick(f.period === 'any'), onClick: () => setFilters({ period: 'any' }) },
      { label: 'Today', icon: tick(f.period === 'today'), onClick: () => setFilters({ period: 'today' }) },
      { label: 'Last 7 days', icon: tick(f.period === 'week'), onClick: () => setFilters({ period: 'week' }) },
      { label: 'Last 30 days', icon: tick(f.period === 'month'), onClick: () => setFilters({ period: 'month' }) },
    ];
    if (view.scope.type !== 'account' && accounts.length > 1) {
      items.push({ heading: 'Accounts' });
      accounts.forEach((a) => {
        const on = f.accountIds.includes(a.id);
        items.push({ label: a.label, icon: tick(on), onClick: () => setFilters({ accountIds: on ? f.accountIds.filter((x) => x !== a.id) : [...f.accountIds, a.id] }) });
      });
    }
    if (activeFilterCount(f)) items.push({ divider: true }, { label: 'Clear all filters', icon: 'close', onClick: () => setFilters(NO_FILTERS) });
    return items;
  };
  const listRef = useRef<HTMLDivElement>(null);
  // While the list is moving, the hover buttons stay out of the way (rows rush past under a resting mouse).
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>();
  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    el.classList.add('scrolling');
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => el.classList.remove('scrolling'), 350);
  };
  const mine = useMemo(() => myAddresses(accounts), [accounts]);
  const accountColour = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.colour])), [accounts]);
  const showStripe = useSettings((s) => s.showAccountStripe);
  const showAccount = showStripe && view.scope.type !== 'account' && accounts.length > 1;

  const title = viewTitle(
    view,
    (id) => accounts.find((a) => a.id === id)?.label || '',
    (id) => groups.find((g) => g.id === id)?.name || 'Group',
    (acc, id) => folders[acc]?.find((f) => f.id === id)?.name || 'Label',
  );
  const unread = items.filter((i) => i.unread).length;
  const shownBox = view.mailbox.kind === 'search' ? view.mailbox.within : view.mailbox;
  const showRecipient = shownBox?.kind === 'system' && (shownBox.folder === 'sent' || shownBox.folder === 'drafts');
  const isDraftMsg = (m: Message) => m.isDraft || inSystemFolder(m, 'drafts', providerFor(m.accountId));

  // Drawing thousands of rows at once makes every click slow, so show a first batch and add more as you scroll.
  const BATCH = 100;
  const [limit, setLimit] = useState(BATCH);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setLimit(BATCH); listRef.current?.scrollTo({ top: 0 }); }, [view, filters]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + BATCH * 2); }, { root: listRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, items.length]);
  // Moving to a conversation further down (arrow keys, search) draws it first.
  useEffect(() => {
    if (!selectedKey) return;
    const at = items.findIndex((i) => threadKey(i.message) === selectedKey);
    if (at >= limit) setLimit(at + BATCH);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected row visible when moving with the keyboard.
  useEffect(() => {
    if (!selectedKey) return;
    listRef.current?.querySelector(`[data-key="${CSS.escape(selectedKey)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  // When every message is listed separately (search, or conversations off), only the row you clicked lights up,
  // even though the whole conversation opens on the right.
  const [picked, setPicked] = useState<{ id: string; key: string } | null>(null);
  const unthreaded = !threaded || view.mailbox.kind === 'search';
  const firstRowFor = useMemo(() => {
    const first = new Map<string, string>();
    for (const i of [...items, ...remote]) { const k = threadKey(i.message); if (!first.has(k)) first.set(k, i.message.id); }
    return first;
  }, [items, remote]);
  const onClick = (e: React.MouseEvent, item: ListItem, list: ListItem[]) => {
    setPicked({ id: item.message.id, key: threadKey(item.message) });
    const key = threadKey(item.message);
    if (e.shiftKey && selectedKey) {
      const keys = list.map((i) => threadKey(i.message));
      const a = keys.indexOf(selectedKey);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) return selectThread(key, { range: keys.slice(Math.min(a, b), Math.max(a, b) + 1) });
    }
    if (e.ctrlKey || e.metaKey) return selectThread(key, { additive: true });
    if (remote.includes(item)) adoptRemote(item.message);
    selectThread(key);
    const p = providerFor(item.message.accountId);
    // Only the Drafts folder itself opens a draft for editing; in search results or a conversation it is just read.
    const inDraftsFolder = view.mailbox.kind === 'system' && view.mailbox.folder === 'drafts';
    if (inDraftsFolder && inSystemFolder(item.message, 'drafts', p) && !e.shiftKey) editServerDraft(item.message);
  };

  // Conversations opened out in the list (the arrow on the left of a row).
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) => setOpenRows((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const subRows = (key: string) => [...messagesInThread(key)].reverse().map((m) => {
    const fromMe = mine.has(m.from.email.toLowerCase());
    return (
      <div key={`sub:${m.id}`} className={`row subrow ${m.unread ? 'unread' : ''}`} onClick={() => selectThread(key)} role="listitem">
        <div className="row-body">
          <div className="row-top">
            <span className="from">{isDraftMsg(m) && <span className="draft-tag">Draft</span>}{fromMe ? 'Me' : m.from.name || m.from.email}</span>
            <span className="time">{listTime(m.date)}</span>
          </div>
          <div className="preview" style={{ WebkitLineClamp: 1 }}>{m.snippet}</div>
        </div>
      </div>
    );
  });

  const row = (item: ListItem, list: ListItem[]) => {
    const m = item.message;
    const key = threadKey(m);
    const inSelection = selectedKeys.includes(key) || key === selectedKey;
    const selected = inSelection && (!unthreaded || m.id === (picked && picked.key === key ? picked.id : firstRowFor.get(key)));
    const fromMe = mine.has(m.from.email.toLowerCase());
    const who = showRecipient || fromMe
      ? `To: ${m.to.map((a) => a.name || a.email).join(', ') || '(no recipient)'}`
      : item.thread.length > 1
        ? [...new Set(item.thread.map((t) => (mine.has(t.from.email.toLowerCase()) ? 'Me' : (t.from.name || t.from.email).split(' ')[0])))].reverse().slice(0, 3).join(', ')
        : m.from.name || m.from.email;
    return (
      <div
        key={key + (list === remote ? ':r' : '')}
        data-key={key}
        className={`row ${item.unread ? 'unread' : ''} ${selected ? 'selected' : ''} `}
        onClick={(e) => onClick(e, item, list)}
        onDoubleClick={() => (isDraftMsg(m) ? editServerDraft(m) : popoutMessage(key))}
        onContextMenu={(e) => {
          e.preventDefault();
          const keys = selectedKeys.includes(key) ? selectedKeys : [key];
          if (!selectedKeys.includes(key)) selectThread(key);
          menu.open({ x: e.clientX, y: e.clientY }, messageMenu(keys));
        }}
        draggable
        onDragStart={(e) => {
          const keys = selectedKeys.includes(key) ? selectedKeys : [key];
          e.dataTransfer.setData('text/wgm-keys', JSON.stringify(keys));
          e.dataTransfer.effectAllowed = 'move';
        }}
        role="listitem"
        aria-current={selected ? 'true' : undefined}
      >
        {showAccount && <span className="acct" style={{ background: accountColour[m.accountId] }} />}
        {item.unread && <span className="unread-dot" role="img" aria-label="Unread" />}
        {senderPhotos && (() => {
          const who = fromMe ? m.to[0] || m.from : m.from;
          const photo = photoOf.get(who.email.toLowerCase());
          const label = who.name || who.email;
          return photo
            ? <img className="sender-photo" src={photo} alt="" loading="lazy" />
            : <span className="sender-photo" aria-hidden style={{ background: avatarColour(who.email.toLowerCase()) }}>{initials(label)}</span>;
        })()}
        <div className="row-body">
          <div className="row-top">
            {item.count > 1 && list !== remote && (
              <button tabIndex={-1}
                className="twisty"
                aria-label={openRows.has(key) ? 'Hide the messages in this conversation' : 'Show the messages in this conversation'}
                aria-expanded={openRows.has(key)}
                onClick={(e) => { e.stopPropagation(); toggleRow(key); }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name={openRows.has(key) ? 'chevronDown' : 'chevronRight'} size={13} />
              </button>
            )}
            <span className="from">{who}</span>
            <span className="meta">
              {item.flagged && <span className="flag"><Icon name="flag" size={12} /></span>}
              {item.hasAttachments && <Icon name="paperclip" size={12} />}
              {item.count > 1 && (list === remote
                ? <span className="badge">{item.count}</span>
                : <button tabIndex={-1} className="badge" aria-label="Show the messages in this conversation" onClick={(e) => { e.stopPropagation(); toggleRow(key); }} onDoubleClick={(e) => e.stopPropagation()} style={{ cursor: 'pointer' }}>{item.count}</button>)}
            </span>
            <span className="time">{listTime(m.date)}</span>
          </div>
          <div className="subject">{isDraftMsg(m) && <span className="draft-tag">Draft</span>}{m.subject}</div>
          {previewLines > 0 && <div className="preview" style={{ WebkitLineClamp: previewLines }}>{m.snippet}</div>}
        </div>
        <div className="quick" onClick={(e) => e.stopPropagation()}>
          <div className="qb">
          <button tabIndex={-1} className="icon-btn" title="Archive" aria-label="Archive" onClick={() => archive(idsForKeys(selectedKeys.includes(key) ? selectedKeys : [key]))}><Icon name="archive" /></button>
          <button tabIndex={-1} className="icon-btn" title={item.flagged ? 'Remove flag' : 'Flag'} aria-label="Flag" onClick={() => toggleFlag(idsForKeys(selectedKeys.includes(key) ? selectedKeys : [key]))}><Icon name="flag" /></button>
          <button tabIndex={-1} className="icon-btn" title="Snooze" aria-label="Snooze" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), snoozeOptions().map((o) => ({ label: o.label, icon: 'clock', onClick: () => snooze(idsForKeys(selectedKeys.includes(key) ? selectedKeys : [key]), o.at) })), 'right')}><Icon name="clock" /></button>
          <button tabIndex={-1} className="icon-btn" title={item.unread ? 'Mark as read' : 'Mark as unread'} aria-label="Toggle read" onClick={() => markRead(idsForKeys(selectedKeys.includes(key) ? selectedKeys : [key]), item.unread)}><Icon name={item.unread ? 'mailOpen' : 'mail'} /></button>
          <button tabIndex={-1} className="icon-btn" title="Move to Bin" aria-label="Move to Bin" onClick={() => trash(idsForKeys(selectedKeys.includes(key) ? selectedKeys : [key]))}><Icon name="trash" /></button>
          </div>
          <button tabIndex={-1}
            className="qh"
            title="More options"
            aria-label="More options"
            onClick={(e) => {
              const keys = selectedKeys.includes(key) ? selectedKeys : [key];
              if (!selectedKeys.includes(key)) selectThread(key);
              menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), messageMenu(keys), 'right');
            }}
          ><Icon name="more" size={14} /></button>
        </div>
      </div>
    );
  };

  return (
    <section className="list" style={style} aria-label="Messages">
      <div className="list-head">
        <h1>{title}</h1>
        <span className="sub">{view.mailbox.kind === 'search' ? `${items.length} found` : unread ? `${unread} unread` : `${items.length}`}</span>
        {view.mailbox.kind === 'search' && <button className="btn ghost" onClick={() => runSearch('')}>Clear search</button>}
        <button
          className={`icon-btn filter-btn ${threaded ? 'on' : ''}`}
          title={threaded ? 'Conversations on. Click to list every message separately.' : 'Conversations off. Click to group replies together.'}
          aria-label="Group replies into conversations"
          aria-pressed={threaded}
          onClick={() => useSettings.getState().set({ threaded: !threaded })}
        >
          <Icon name="layers" />
        </button>
        <button
          className={`icon-btn filter-btn ${filters.unread ? 'on' : ''}`}
          title={filters.unread ? 'Showing unread only. Click to show everything.' : 'Show unread only'}
          aria-label="Show unread only"
          aria-pressed={filters.unread}
          onClick={() => setFilters({ unread: !filters.unread })}
        >
          <span className="unread-toggle" />
        </button>
        <button
          className={`icon-btn filter-btn ${activeFilterCount({ ...filters, unread: false }) ? 'on' : ''}`}
          title="Filter"
          aria-label="Filter"
          onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), filterMenu(), 'right')}
        >
          <Icon name="filter" />
        </button>
      </div>
      {activeFilterCount(filters) > 0 && (
        <div className="filter-bar">
          <span>Showing: {describeFilters(filters, accounts)}</span>
          <button className="btn ghost" onClick={() => setFilters(NO_FILTERS)}>Clear</button>
        </div>
      )}
      {view.mailbox.kind === 'search' && (
        <div className="search-scope" role="group" aria-label="Where to search">
          {view.mailbox.within && (
            <button className="on" aria-pressed>
              In {viewTitle({ scope: view.scope, mailbox: view.mailbox.within }, (id) => accounts.find((a) => a.id === id)?.label || '', (id) => groups.find((g) => g.id === id)?.name || 'Group', (acc, id) => folders[acc]?.find((f) => f.id === id)?.name || 'Label')}
            </button>
          )}
          <button className={view.mailbox.within ? '' : 'on'} aria-pressed={!view.mailbox.within} onClick={() => runSearch(view.mailbox.kind === 'search' ? view.mailbox.query : '', { everywhere: true })}>All mail</button>
          {!view.mailbox.within && <span className="hint">Drafts are marked in coral.</span>}
        </div>
      )}
      <div className="rows" ref={listRef} onScroll={onListScroll} tabIndex={0} role="list" aria-label={title}>
        {items.slice(0, limit).map((i) => [row(i, items), openRows.has(threadKey(i.message)) ? subRows(threadKey(i.message)) : null])}
        {items.length > limit && <div ref={moreRef} className="empty" style={{ padding: 16 }}>Loading more...</div>}
        {view.mailbox.kind === 'search' && (searching || remote.length > 0) && (
          <>
            <div className="section-label">{searching ? 'Searching older mail on the server...' : 'Older mail on the server'}</div>
            {remote.map((i) => row(i, remote))}
          </>
        )}
        {!items.length && !remote.length && !searching && (
          <div className="empty">{view.mailbox.kind === 'search' ? 'Nothing found' : 'Nothing here'}</div>
        )}
      </div>
      <div className="list-foot">
        {syncing ? <><Icon name="refresh" size={12} /> Checking for mail...</> : lastSyncAt ? `Updated ${new Date(lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>
      {menu.node}
    </section>
  );
}

function describeFilters(f: ListFilters, accounts: Account[]): string {
  const parts: string[] = [];
  if (f.unread) parts.push('unread');
  if (f.flagged) parts.push('flagged');
  if (f.attachments) parts.push('with attachments');
  if (f.vip) parts.push('from important senders');
  if (f.toMe) parts.push('sent to me');
  if (f.period === 'today') parts.push('today');
  if (f.period === 'week') parts.push('last 7 days');
  if (f.period === 'month') parts.push('last 30 days');
  if (f.accountIds.length) parts.push(f.accountIds.map((id) => accounts.find((a) => a.id === id)?.label || id).join(', '));
  return parts.join(' · ');
}
