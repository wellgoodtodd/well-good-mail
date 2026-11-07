// Right click menu for one or more conversations in the list.
import type { MenuItem } from '../components/ui';
import { snoozeOptions } from '../components/ui';
import { applyLabel, blockSender, unblockSender, archive, idsForKeys, markRead, markSpam, moveToInbox, moveToLabel, providerFor, restoreFromBin, runSearch, snooze, toast, toggleFlag, toggleMute, toggleVip, trash, useMail } from './mail';
import { startCompose, popoutMessage } from './composeActions';
import { settings } from './settings';
import { inSystemFolder } from './mailbox';
import { bindingsFor, isSingleKey, type ShortcutAction } from './shortcuts';
import { openExternal } from './platform';
import { printThread, savePdfThread } from './print';

/** The shortcut to show next to a menu item (first one with a modifier or a named key). */
export function kbd(action: ShortcutAction): string | undefined {
  const keys = bindingsFor(settings().keybindings)[action];
  return keys.find((k) => !isSingleKey(k)) || keys[0];
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ text: `${what} copied`, ttl: 2000 });
  } catch {
    toast({ text: text, ttl: 6000 });
  }
}

export function messageMenu(keys: string[]): MenuItem[] {
  const ids = idsForKeys(keys);
  const msgs = ids.map((id) => useMail.getState().messages[id]).filter(Boolean);
  if (!msgs.length) return [];
  const latest = [...msgs].sort((a, b) => b.date - a.date)[0];
  const single = keys.length === 1;
  const anyUnread = msgs.some((m) => m.unread);
  const anyFlagged = msgs.some((m) => m.flagged);
  const p = providerFor(latest.accountId);
  const inBin = inSystemFolder(latest, 'bin', p);
  const inJunk = inSystemFolder(latest, 'junk', p);
  const sameAccount = msgs.every((m) => m.accountId === latest.accountId);
  const account = useMail.getState().accounts.find((a) => a.id === latest.accountId);
  const labels = sameAccount ? (useMail.getState().folders[latest.accountId] || []).filter((f) => !f.system) : [];
  const muted = settings().mutedThreads.includes(keys[0]?.toLowerCase());
  const sender = latest.from.email.toLowerCase();
  const senderName = latest.from.name || latest.from.email;
  const vip = settings().vips.includes(sender);
  const blocked = settings().blockedSenders.includes(sender);

  const items: MenuItem[] = [];
  if (single) {
    items.push(
      { label: 'Reply', icon: 'reply', kbd: kbd('reply'), onClick: () => startCompose('reply', latest) },
      { label: 'Reply All', icon: 'replyAll', kbd: kbd('replyAll'), onClick: () => startCompose('replyAll', latest) },
      { label: 'Forward', icon: 'forward', kbd: kbd('forward'), onClick: () => startCompose('forward', latest) },
      { label: 'Open in new window', icon: 'popout', kbd: kbd('openWindow'), onClick: () => popoutMessage(keys[0]) },
      { label: 'Print...', icon: 'printer', kbd: kbd('print'), onClick: () => printThread(keys[0]) },
      { label: 'Save as PDF...', icon: 'filePdf', onClick: () => savePdfThread(keys[0]) },
      { divider: true },
    );
  }
  items.push(
    anyUnread
      ? { label: 'Mark as read', icon: 'mailOpen', kbd: kbd('markRead'), onClick: () => markRead(ids, true) }
      : { label: 'Mark as unread', icon: 'mail', kbd: kbd('markUnread'), onClick: () => markRead(ids, false) },
    { label: anyFlagged ? 'Remove flag' : 'Flag', icon: 'flag', kbd: kbd('flag'), onClick: () => toggleFlag(ids) },
    { divider: true },
  );
  if (inBin || inJunk) {
    items.push({ label: 'Move to Inbox', icon: 'inbox', onClick: () => (inBin ? restoreFromBin(ids) : moveToInbox(ids)) });
  } else {
    items.push({ label: 'Archive', icon: 'archive', kbd: kbd('archive'), onClick: () => archive(ids) });
  }
  if (!inBin) items.push({ label: 'Move to Bin', icon: 'trash', kbd: kbd('delete'), onClick: () => trash(ids) });
  items.push(inJunk ? { label: 'Not junk', icon: 'inbox', onClick: () => markSpam(ids, false) } : { label: 'Mark as junk', icon: 'junk', kbd: kbd('junk'), onClick: () => markSpam(ids) });
  // The longer lists sit behind a flyout so the menu stays short.
  items.push({ divider: true }, { label: 'Snooze', icon: 'clock', submenu: snoozeOptions().slice(0, 4).map((o) => ({ label: o.label, icon: 'clock' as const, onClick: () => snooze(ids, o.at) })) });
  if (labels.length) {
    items.push(
      { label: 'Move to', icon: 'folder', submenu: labels.map((l) => ({ label: l.name, icon: 'folder' as const, onClick: () => moveToLabel(ids, latest.accountId, l.id) })) },
      {
        label: 'Label',
        icon: 'tag',
        submenu: labels.map((l) => {
          const has = msgs.every((m) => m.labels.includes(l.id));
          return { label: has ? `Remove ${l.name}` : l.name, icon: 'tag' as const, onClick: () => applyLabel(ids, latest.accountId, l.id, has) };
        }),
      },
    );
  }
  if (single) {
    const more: MenuItem[] = [
      { label: muted ? 'Unmute conversation' : 'Mute conversation', icon: 'mute', onClick: () => toggleMute(keys[0]) },
      { label: vip ? `Remove ${senderName} from important senders` : `Mark ${senderName} as important`, icon: 'star', onClick: () => toggleVip(sender) },
      blocked
        ? { label: `Unblock ${senderName}`, icon: 'junk' as const, onClick: () => unblockSender(sender) }
        : { label: `Block ${senderName}`, icon: 'junk' as const, onClick: () => blockSender(sender, ids) },
      { label: `Find emails from ${senderName}`, icon: 'search', onClick: () => runSearch(`from:${sender}`, { everywhere: true }) },
      { label: 'Copy sender address', icon: 'user', onClick: () => copy(sender, 'Address') },
      { label: 'Copy subject', icon: 'file', onClick: () => copy(latest.subject, 'Subject') },
    ];
    if (account?.kind === 'gmail') {
      more.push({ label: 'Open in Gmail on the web', icon: 'link', onClick: () => openExternal(`https://mail.google.com/mail/u/${encodeURIComponent(account.email)}/#all/${latest.threadId}`) });
    }
    items.push({ divider: true }, { label: 'More', icon: 'more', submenu: more });
  }
  return items;
}
