// Right column: the open conversation, with reply inline underneath.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toolsThatFit } from '../lib/toolbarFit';
import { Icon } from './Icon';
import { MessageView } from './MessageView';
import { Composer } from './Composer';
import { snoozeOptions, useMenu } from './ui';
import { useMail, messagesInThread, markRead, archive, trash, toggleFlag, snooze, markSpam, idsForKeys, providerFor, restoreFromBin, moveToInbox } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { startCompose, popoutMessage } from '../lib/composeActions';
import { messageMenu, kbd } from '../lib/actions';
import { inSystemFolder } from '../lib/mailbox';
import { printThread } from '../lib/print';

const DEFAULT_TOOLS = ['archive', 'bin', 'junk', 'read', 'flag', 'snooze', 'print', 'pdf', 'popout', 'more'];

export function ReadingPane({ threadKeyOverride, standalone = false, onBack }: { threadKeyOverride?: string; standalone?: boolean; onBack?: () => void }) {
  const selectedKey = useMail((s) => s.selectedKey);
  const selectedKeys = useMail((s) => s.selectedKeys);
  const key = threadKeyOverride || selectedKey;
  const messages = useMail((s) => s.messages);
  const inlineDraftId = useMail((s) => s.inlineDraftId);
  const muted = useSettings((s) => s.mutedThreads);
  const newestFirst = useSettings((s) => s.newestFirstInThread);
  const toolbarOrder = useSettings((s) => s.toolbarOrder);
  const menu = useMenu();
  const thread = useMemo(() => (key ? messagesInThread(key) : []), [key, messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = thread[thread.length - 1];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragTool = useRef<string>();
  const bar = useRef<HTMLDivElement>(null);
  // How much room the toolbar has. As it narrows, icons drop off the right end and wait in the More menu.
  const [fit, setFit] = useState<{ room: number; compact: boolean }>({ room: 99, compact: false });
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      const fixed = (el.querySelector('.bar-fixed') as HTMLElement | null)?.offsetWidth ?? 0;
      setFit(toolsThatFit(el.clientWidth, fixed));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  // Expand unread ones and the newest, mark as read on open.
  useEffect(() => {
    if (!thread.length) return;
    setExpanded(new Set([...thread.filter((m) => m.unread).map((m) => m.id), thread[thread.length - 1].id]));
    const unread = thread.filter((m) => m.unread).map((m) => m.id);
    if (unread.length) markRead(unread, true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // A reply that opens inline is at the bottom of the conversation, so bring it into view.
  useEffect(() => {
    if (!inlineDraftId) return;
    const t = setTimeout(() => {
      const el = document.querySelector('.composer.inline') as HTMLElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (el?.querySelector('[contenteditable="true"]') as HTMLElement | null)?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [inlineDraftId]);

  if (!standalone && selectedKeys.length > 1) {
    return (
      <div className="pane" role="main" aria-label="Email">
        <div className="pane-empty">
          <div style={{ fontSize: '1.2em', fontWeight: 600 }}>{selectedKeys.length} conversations selected</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => archive(idsForKeys(selectedKeys))}><Icon name="archive" /> Archive</button>
            <button className="btn" onClick={() => markRead(idsForKeys(selectedKeys), true)}><Icon name="mailOpen" /> Mark read</button>
            <button className="btn danger" onClick={() => trash(idsForKeys(selectedKeys))}><Icon name="trash" /> Bin</button>
          </div>
        </div>
      </div>
    );
  }

  if (!key || !latest) {
    return (
      <div className="pane" role="main" aria-label="Email">
        {inlineDraftId ? (
          <>
            {onBack && <div className="pane-toolbar"><button className="btn ghost" onClick={onBack}><Icon name="chevronLeft" /> Back</button></div>}
            <Composer draftId={inlineDraftId} variant="full" />
          </>
        ) : (
          <div className="pane-empty">
            <img src="icon.svg" alt="" />
            <div>No email selected</div>
          </div>
        )}
      </div>
    );
  }

  const ids = thread.map((m) => m.id);
  const p = providerFor(latest.accountId);
  const inBin = inSystemFolder(latest, 'bin', p);
  const inJunk = inSystemFolder(latest, 'junk', p);
  const isMuted = muted.includes(key.toLowerCase());

  const ordered = [...toolbarOrder.filter((t) => DEFAULT_TOOLS.includes(t)), ...DEFAULT_TOOLS.filter((t) => !toolbarOrder.includes(t))];
  const order = ordered;
  // The icon being dragged: the others slide out of the way as it passes over them.
  const moveTool = (from: string, over: string) => {
    if (!from || from === over) return;
    const next = ordered.filter((t) => t !== from);
    next.splice(next.indexOf(over) + (ordered.indexOf(from) < ordered.indexOf(over) ? 1 : 0), 0, from);
    if (next.join() !== ordered.join()) useSettings.getState().set({ toolbarOrder: next });
  };
  const dragProps = (id: string) => ({
    draggable: true,
    title: undefined,
    onDragStart: (e: React.DragEvent) => { dragTool.current = id; e.dataTransfer.setData('text/wgm-tool', id); e.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => { dragTool.current = undefined; },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('text/wgm-tool')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragTool.current) moveTool(dragTool.current, id);
    },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); dragTool.current = undefined; },
  });
  const tools: Record<string, React.ReactNode> = {
    archive: inBin || inJunk
      ? <button className="icon-btn" title="Move to Inbox" aria-label="Move to Inbox" onClick={() => (inBin ? restoreFromBin(ids) : moveToInbox(ids))}><Icon name="inbox" /></button>
      : <button className="icon-btn" title={`Archive (${kbd('archive')})`} aria-label="Archive" onClick={() => archive(ids)}><Icon name="archive" /></button>,
    bin: !inBin && <button className="icon-btn" title={`Move to Bin (${kbd('delete')})`} aria-label="Move to Bin" onClick={() => trash(ids)}><Icon name="trash" /></button>,
    junk: <button className="icon-btn" title={inJunk ? 'Not junk' : 'Mark as junk'} aria-label="Junk" onClick={() => markSpam(ids, !inJunk)}><Icon name="junk" /></button>,
    read: <button className="icon-btn" title={thread.some((m) => m.unread) ? `Mark as read (${kbd('markRead')})` : `Mark as unread (${kbd('markUnread')})`} aria-label="Toggle read" onClick={() => markRead(ids, thread.some((m) => m.unread))}><Icon name={thread.some((m) => m.unread) ? 'mailOpen' : 'mail'} /></button>,
    flag: <button className={`icon-btn ${thread.some((m) => m.flagged) ? 'active' : ''}`} title={`Flag (${kbd('flag')})`} aria-label="Flag" onClick={() => toggleFlag([latest.id])}><Icon name="flag" /></button>,
    snooze: <button className="icon-btn" title="Snooze" aria-label="Snooze" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), snoozeOptions().map((o) => ({ label: o.label, icon: 'clock', onClick: () => snooze(ids, o.at) })), 'right')}><Icon name="clock" /></button>,
    print: <button className="icon-btn" title={`Print (${kbd('print')})`} aria-label="Print" onClick={() => printThread(key)}><Icon name="printer" /></button>,
    pdf: <button className="icon-btn" title="Save as PDF" aria-label="Save as PDF" onClick={() => printThread(key, { pdf: true })}><Icon name="filePdf" /></button>,
    popout: !standalone && <button className="icon-btn" title="Open in new window" aria-label="Open in new window" onClick={() => popoutMessage(key)}><Icon name="popout" /></button>,
    more: <button className="icon-btn" title="More" aria-label="More" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), messageMenu([key]), 'right')}><Icon name="more" /></button>,
  };

  return (
    <div className="pane" role="main" aria-label="Email">
      <div ref={bar} className={`pane-toolbar ${fit.compact ? 'compact' : ''}`} role="toolbar" aria-label="Email actions">
        {onBack && <button className="icon-btn" aria-label="Back to list" onClick={onBack}><Icon name="chevronLeft" /></button>}
        <span className="bar-fixed">
          <button className="btn ghost" onClick={() => startCompose('reply', latest)} title={`Reply (${kbd('reply')})`} aria-label="Reply"><Icon name="reply" /><span className="lbl"> Reply</span></button>
          <button className="btn ghost" onClick={() => startCompose('replyAll', latest)} title={`Reply All (${kbd('replyAll')})`} aria-label="Reply All"><Icon name="replyAll" /><span className="lbl"> Reply All</span></button>
          <button className="btn ghost" onClick={() => startCompose('forward', latest)} title={`Forward (${kbd('forward')})`} aria-label="Forward"><Icon name="forward" /><span className="lbl"> Forward</span></button>
        </span>
        <span style={{ flex: 1 }} />
        {order.filter((id) => tools[id]).filter((id, i) => id === 'more' || i < fit.room).map((id) => <span key={id} className="tool" {...dragProps(id)}>{tools[id]}</span>)}
      </div>
      <div className="pane-scroll">
        <h2 className="thread-subject">{latest.subject}</h2>
        <div className="thread-meta">
          {thread.length > 1 && <span>{thread.length} messages</span>}
          {isMuted && <span><Icon name="mute" size={12} /> Muted</span>}
        </div>
        {(newestFirst ? [...thread].reverse() : thread).map((m) => (
          <MessageView
            key={m.id}
            message={m}
            isLatest={m.id === latest.id}
            expanded={expanded.has(m.id)}
            onToggle={() => setExpanded((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
          />
        ))}
        {inlineDraftId && <Composer draftId={inlineDraftId} variant="inline" />}
      </div>
      {menu.node}
    </div>
  );
}
