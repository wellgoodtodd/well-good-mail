// The rows for whatever mailbox is selected.
import { useMemo } from 'react';
import { useMail, providerFor, localSearch } from './mail';
import { myAddresses } from './compose';
import { useSettings } from './settings';
import type { Message } from './types';
import { buildList, inMailbox, scopeAccountIds, threadKey, type ListItem } from './mailbox';

export function useViewList(): { items: ListItem[]; remote: ListItem[] } {
  const messages = useMail((s) => s.messages);
  const view = useMail((s) => s.view);
  const accounts = useMail((s) => s.accounts);
  const snoozes = useMail((s) => s.snoozes);
  const remoteResults = useMail((s) => s.remoteResults);
  const groups = useSettings((s) => s.groups);
  const vips = useSettings((s) => s.vips);
  const threaded = useSettings((s) => s.threaded);
  const filters = useMail((s) => s.filters);
  const smart = useSettings((s) => s.smartMailboxes);

  // The search itself only reruns when the words change, not on every sync batch or read mark.
  const query = view.mailbox.kind === 'search' ? view.mailbox.query : '';
  const hitIds = useMemo(() => (query ? localSearch(query).map((m) => m.id) : []), [query]);

  return useMemo(() => {
    // Accounts left out of All Inboxes stay out of the combined views, but a search still looks everywhere.
    const everywhere = view.mailbox.kind === 'search' || view.mailbox.kind === 'smart';
    const leftOut = everywhere ? [] : accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id);
    const allowed = new Set(scopeAccountIds(view.scope, accounts.map((a) => a.id), groups, leftOut));
    const ctx = { vips: new Set(vips), snoozed: new Set(snoozes.map((s) => s.messageId)), smart, mine: myAddresses(accounts) };
    const pool = view.mailbox.kind === 'search' ? hitIds.map((id) => messages[id]).filter(Boolean) : Object.values(messages);
    // A search that started in a folder stays in that folder (until you choose All mail).
    const within = view.mailbox.kind === 'search' ? view.mailbox.within : undefined;
    const fits = (m: Message) => !within || inMailbox(m, within, providerFor(m.accountId), ctx);
    const msgs = pool.filter((m) => allowed.has(m.accountId) && (view.mailbox.kind === 'search' ? fits(m) : inMailbox(m, view.mailbox, providerFor(m.accountId), ctx)));
    // In a folder view, a thread shows when any of its messages is in that folder.
    let items = buildList(msgs, threaded && view.mailbox.kind !== 'search');
    if (threaded && view.mailbox.kind !== 'search') {
      // The number on a conversation counts everything in it (yours too), matching what opens on click.
      const total = new Map<string, number>();
      for (const m of Object.values(messages)) { const k = threadKey(m); total.set(k, (total.get(k) || 0) + 1); }
      for (const i of items) i.count = Math.max(i.count, total.get(threadKey(i.message)) || 1);
    }
    const f = filters;
    if (f.unread || f.flagged || f.attachments || f.vip || f.toMe || f.period !== 'any' || f.accountIds.length) {
      const mine = myAddresses(accounts);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const since = f.period === 'today' ? start.getTime() : f.period === 'week' ? Date.now() - 7 * 86400000 : f.period === 'month' ? Date.now() - 30 * 86400000 : 0;
      const vipSet = new Set(vips);
      items = items.filter((i) => {
        // Keep the open conversation visible even once it's been read.
        const selectedKey = useMail.getState().selectedKey;
        if (selectedKey && `${i.message.accountId}|${i.message.threadId}` === selectedKey) return true;
        if (f.unread && !i.unread) return false;
        if (f.flagged && !i.flagged) return false;
        if (f.attachments && !i.hasAttachments) return false;
        if (f.vip && !i.thread.some((m) => vipSet.has(m.from.email.toLowerCase()))) return false;
        if (f.toMe && !i.thread.some((m) => m.to.some((a) => mine.has(a.email.toLowerCase())))) return false;
        if (since && i.message.date < since) return false;
        if (f.accountIds.length && !f.accountIds.includes(i.message.accountId)) return false;
        return true;
      });
    }
    const remote = view.mailbox.kind === 'search' ? buildList(remoteResults.filter((m) => allowed.has(m.accountId) && fits(m)), false) : [];
    return { items, remote };
  }, [messages, view, hitIds, accounts, snoozes, remoteResults, groups, vips, threaded, filters, smart]);
}
