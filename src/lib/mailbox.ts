// Which messages belong in which mailbox, threads and unread counts.
import type { AccountGroup, MailboxRef, Message, Scope, SystemFolder, View } from './types';
import type { MailProvider } from './providers/provider';

export type ProviderLookup = (accountId: string) => MailProvider | undefined;

export function inSystemFolder(m: Message, folder: SystemFolder, provider: MailProvider | undefined): boolean {
  const id = (f: SystemFolder) => provider?.systemFolderId(f) ?? null;
  const has = (f: SystemFolder) => {
    const x = id(f);
    return x ? m.labels.includes(x) : false;
  };
  const trashed = has('bin');
  const spam = has('junk');
  switch (folder) {
    case 'flagged':
      return m.flagged && !trashed && !spam;
    case 'archive': {
      const archiveId = id('archive');
      if (archiveId) return m.labels.includes(archiveId);
      // Gmail: anything not in the inbox, bin, junk or drafts, excluding
      // messages that are only in Sent.
      if (has('inbox') || trashed || spam || has('drafts')) return false;
      const sentOnly = has('sent') && !m.labels.some((l) => l.startsWith('Label_'));
      return !sentOnly;
    }
    case 'drafts':
      return has('drafts') || m.isDraft;
    default:
      return has(folder) && (folder === 'bin' || folder === 'junk' || (!trashed && !spam));
  }
}

/** The accounts a view covers. `leftOut` are accounts kept out of the combined "all" view (they still show on their own). */
export function scopeAccountIds(scope: Scope, allIds: string[], groups: AccountGroup[], leftOut: string[] = []): string[] {
  if (scope.type === 'all') return leftOut.length ? allIds.filter((id) => !leftOut.includes(id)) : allIds;
  if (scope.type === 'account') return [scope.accountId];
  return groups.find((g) => g.id === scope.groupId)?.accountIds.filter((id) => allIds.includes(id)) || [];
}

export function inMailbox(
  m: Message,
  mailbox: MailboxRef,
  provider: MailProvider | undefined,
  ctx: { vips: Set<string>; snoozed: Set<string> },
): boolean {
  switch (mailbox.kind) {
    case 'system':
      return inSystemFolder(m, mailbox.folder, provider) && !(mailbox.folder === 'inbox' && ctx.snoozed.has(m.id));
    case 'label':
      return m.accountId === mailbox.accountId && m.labels.includes(mailbox.labelId);
    case 'vip':
      return ctx.vips.has(m.from.email.toLowerCase()) && inSystemFolder(m, 'inbox', provider);
    case 'snoozed':
      return ctx.snoozed.has(m.id);
    case 'search':
      return true;
  }
}

export interface ListItem {
  /** Message shown in the row (newest in the thread). */
  message: Message;
  /** All messages in this conversation within the view, newest first. */
  thread: Message[];
  unread: boolean;
  flagged: boolean;
  count: number;
  hasAttachments: boolean;
}

export function threadKey(m: Message) {
  return `${m.accountId}|${m.threadId}`;
}

export function buildList(messages: Message[], threaded: boolean): ListItem[] {
  if (!threaded) {
    return messages
      .sort((a, b) => b.date - a.date)
      .map((m) => ({ message: m, thread: [m], unread: m.unread, flagged: m.flagged, count: 1, hasAttachments: m.hasAttachments }));
  }
  const groups = new Map<string, Message[]>();
  for (const m of messages) {
    const k = threadKey(m);
    const g = groups.get(k);
    if (g) g.push(m);
    else groups.set(k, [m]);
  }
  const items: ListItem[] = [];
  for (const thread of groups.values()) {
    thread.sort((a, b) => b.date - a.date);
    items.push({
      message: thread[0],
      thread,
      unread: thread.some((m) => m.unread),
      flagged: thread.some((m) => m.flagged),
      count: thread.length,
      hasAttachments: thread.some((m) => m.hasAttachments),
    });
  }
  return items.sort((a, b) => b.message.date - a.message.date);
}

export function viewTitle(view: View, accountLabel: (id: string) => string, groupName: (id: string) => string, labelName: (acc: string, id: string) => string): string {
  const mb = view.mailbox;
  const folderNames: Record<SystemFolder, string> = {
    inbox: 'Inbox', drafts: 'Drafts', sent: 'Sent', junk: 'Junk', bin: 'Bin', archive: 'Archive', flagged: 'Flagged',
  };
  const allNames: Record<SystemFolder, string> = {
    inbox: 'All Inboxes', drafts: 'All Drafts', sent: 'All Sent', junk: 'All Junk', bin: 'All Bin', archive: 'All Archive', flagged: 'Flagged',
  };
  if (mb.kind === 'search') return `Search: ${mb.query}`;
  if (mb.kind === 'vip') return 'Important';
  if (mb.kind === 'snoozed') return 'Snoozed';
  if (mb.kind === 'label') return labelName(mb.accountId, mb.labelId);
  if (view.scope.type === 'all') return allNames[mb.folder];
  const prefix = view.scope.type === 'account' ? accountLabel(view.scope.accountId) : groupName(view.scope.groupId);
  return `${prefix}: ${folderNames[mb.folder]}`;
}
