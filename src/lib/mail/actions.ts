// Mail actions: read, flag, archive, delete, junk, move, snooze, mute, block, unsubscribe, and follow ups.
import { store } from '../db';
import { settings, useSettings } from '../settings';
import { record, undoEntry } from '../history';
import type { MailProvider } from '../providers/provider';
import { threadKey } from '../mailbox';
import { openExternal, httpFetch } from '../platform';
import { myAddresses } from '../compose';
import type { FollowUp, Message, Snooze, SystemFolder, View } from '../types';
import { patchMessages } from './messages';
import { errorToast, indexNow, providers, toast, useMail } from './store';
import { syncAccount } from './sync';

const get = useMail.getState;
const set = useMail.setState;

type ByAccount = Map<string, Message[]>;
function groupByAccount(ids: string[]): ByAccount {
  const map: ByAccount = new Map();
  for (const id of ids) {
    const m = get().messages[id];
    if (!m) continue;
    (map.get(m.accountId) || map.set(m.accountId, []).get(m.accountId)!).push(m);
  }
  return map;
}

async function modify(ids: string[], addFn: (p: MailProvider) => string[], removeFn: (p: MailProvider) => string[]) {
  const groups = groupByAccount(ids);
  // Optimistic local update first so the interface feels instant.
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const add = addFn(p).filter(Boolean);
    const remove = removeFn(p).filter(Boolean);
    patchMessages(msgs.map((m) => m.id), (m) => {
      const labels = [...new Set([...m.labels.filter((l) => !remove.includes(l)), ...add])];
      return { ...m, labels, unread: labels.includes('UNREAD'), flagged: labels.includes('STARRED') || labels.includes('FLAGGED') };
    });
  }
  // The account is told in the background: whatever asked for this (archive, read, star, move) carries on at once.
  // If it fails, a message says so and the account syncs again to put things right.
  void Promise.all(
    [...groups].map(async ([accId, msgs]) => {
      const p = providers.get(accId)!;
      try {
        await p.modifyLabels(msgs, addFn(p).filter(Boolean), removeFn(p).filter(Boolean));
      } catch (e) {
        errorToast(e, 'Change didn\'t save');
        syncAccount(accId);
      }
    }),
  );
}

const sys = (f: SystemFolder) => (p: MailProvider) => [p.systemFolderId(f) || ''];
const none = () => [] as string[];

export function idsForKeys(keys: string[]): string[] {
  const ix = indexNow();
  return [...new Set(keys)].flatMap((k) => ix.idsIn(k));
}

/** Message ids for the current selection, limited to what the view shows. */
export function selectedMessageIds(): string[] {
  const keys = get().selectedKeys.length ? get().selectedKeys : get().selectedKey ? [get().selectedKey!] : [];
  return idsForKeys(keys);
}

/** What an action was done to, for the undo list: the subject, or how many conversations. */
function describeIds(ids: string[]): string {
  const msgs = ids.map((id) => get().messages[id]).filter(Boolean);
  const threads = new Set(msgs.map(threadKey));
  if (threads.size === 1) {
    const subject = msgs[0].subject || '(no subject)';
    return subject.length > 34 ? `${subject.slice(0, 33)}…` : subject;
  }
  return `${threads.size} conversations`;
}

/** Marking as unread is recorded so it can be undone; marking as read happens by itself when you open an email, so it isn't. */
/** One email per conversation: the newest of those given. */
export function latestPerConversation(ids: string[]): string[] {
  const msgs = get().messages;
  const best = new Map<string, Message>();
  const loose: string[] = [];
  for (const id of ids) {
    const m = msgs[id];
    if (!m) { loose.push(id); continue; }
    const k = threadKey(m);
    const was = best.get(k);
    if (!was || m.date > was.date) best.set(k, m);
  }
  return [...[...best.values()].map((m) => m.id), ...loose];
}

/**
 * Marks emails read or unread. Unread marks only one email in each conversation (its latest), so a conversation of
 * ten doesn't suddenly count as ten unread. `exact` marks just the emails given ("Mark as unread from here").
 */
export async function markRead(ids: string[], read = true, opts: { silent?: boolean; exact?: boolean } = {}) {
  if (!read && !opts.exact) ids = latestPerConversation(ids);
  const changing = read ? ids.filter((id) => get().messages[id]?.unread) : ids;
  if (!changing.length) return;
  const settle = await lookFirst(changing, { unread: !read });
  if (read) await modify(changing, none, () => ['UNREAD']);
  else {
    const was = ids.filter((id) => !get().messages[id]?.unread);
    await modify(ids, () => ['UNREAD'], none);
    if (!opts.silent && was.length) record(`Mark as unread: ${describeIds(ids)}`, () => markRead(was, true, { silent: true }), () => markRead(ids, false, { silent: true, exact: true }));
  }
  settle();
}

export async function toggleFlag(ids: string[]) {
  const anyUnflagged = ids.some((id) => !get().messages[id]?.flagged);
  const flagId = (p: MailProvider) => [p.systemFolderId('flagged') || 'STARRED'];
  const on = () => modify(ids, flagId, none);
  const off = () => modify(ids, none, flagId);
  const before = new Map(ids.map((id) => [id, get().messages[id]?.flagged]));
  const settle = await lookFirst(ids, { flagged: anyUnflagged });
  if (anyUnflagged) await on();
  else await off();
  settle();
  const restore = async () => {
    // Put each email back as it was, not just flip them all.
    const was = ids.filter((id) => before.get(id));
    const wasNot = ids.filter((id) => !before.get(id));
    if (was.length) await modify(was, flagId, none);
    if (wasNot.length) await modify(wasNot, none, flagId);
  };
  record(`${anyUnflagged ? 'Flag' : 'Remove flag'}: ${describeIds(ids)}`, restore, anyUnflagged ? on : off);
}

/**
 * Takes conversations off the screen straight away (and closes the open one), then waits for the screen to redraw
 * before the heavier work of updating every count and list. So an archive or delete looks instant however big the mailbox.
 */
async function leaveScreenFirst(ids: string[]) {
  const msgs = get().messages;
  const keys = [...new Set(ids.map((id) => msgs[id]).filter(Boolean).map((m) => threadKey(m)))];
  const sel = get().selectedKey;
  set({ goingKeys: keys, ...(sel && keys.includes(sel) ? { selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined } : {}) });
  await new Promise<void>((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120);
  });
}
const clearGoing = () => { if (get().goingKeys.length) set({ goingKeys: [] }); };

/** Shows a flag or read mark on the list at once, then lets the full update run after the screen has redrawn. */
async function lookFirst(ids: string[], look: { unread?: boolean; flagged?: boolean }) {
  const msgs = get().messages;
  const keys = [...new Set(ids.map((id) => msgs[id]).filter(Boolean).map((m) => threadKey(m)))];
  if (!keys.length) return () => undefined;
  set({ lookKeys: { ...get().lookKeys, ...Object.fromEntries(keys.map((k) => [k, { ...get().lookKeys[k], ...look }])) } });
  await new Promise<void>((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120);
  });
  return () => { const next = { ...get().lookKeys }; keys.forEach((k) => delete next[k]); set({ lookKeys: next }); };
}

function afterRemoveFromView() {
  set({ selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined });
}

export async function archive(ids: string[], opts: { silent?: boolean; markRead?: boolean } = {}) {
  if (!ids.length) return;
  const remove = (p: MailProvider) => [p.systemFolderId('inbox') || '', ...(opts.markRead ? ['UNREAD'] : [])];
  const archiveId = (p: MailProvider) => (p.systemFolderId('archive') ? [p.systemFolderId('archive')!] : []);
  if (!opts.silent) await leaveScreenFirst(ids);
  const saving = modify(ids, archiveId, remove);
  if (opts.silent) { await saving; return; }
  {
    afterRemoveFromView();
    clearGoing();
    const id = record(`Archive: ${describeIds(ids)}`, () => modify(ids, sys('inbox'), archiveId), () => archive(ids, { silent: true, markRead: opts.markRead }));
    toast({ text: ids.length > 1 ? `${ids.length} emails archived` : 'Archived', undo: () => undoEntry(id) });
  }
}

export async function trash(ids: string[], opts: { silent?: boolean } = {}) {
  if (!ids.length) return;
  if (!opts.silent) await leaveScreenFirst(ids);
  const groups = groupByAccount(ids);
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const binId = p.systemFolderId('bin') || 'TRASH';
    const inboxId = p.systemFolderId('inbox') || 'INBOX';
    patchMessages(msgs.map((m) => m.id), (m) => ({ ...m, labels: [...new Set([...m.labels.filter((l) => l !== inboxId), binId])] }));
    p.trash(msgs).catch((e) => { errorToast(e, 'Delete didn\'t save'); syncAccount(accId); });
  }
  if (opts.silent) return;
  afterRemoveFromView();
  clearGoing();
  const label = describeIds(ids);
  const id = record(`Move to Bin: ${label}`, () => restoreFromBin(ids), () => trash(ids, { silent: true }));
  toast({ text: ids.length > 1 ? `${ids.length} emails moved to Bin` : 'Moved to Bin', undo: () => undoEntry(id) });
}

export async function restoreFromBin(ids: string[]) {
  const groups = groupByAccount(ids);
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const binId = p.systemFolderId('bin') || 'TRASH';
    const inboxId = p.systemFolderId('inbox') || 'INBOX';
    patchMessages(msgs.map((m) => m.id), (m) => ({ ...m, labels: [...new Set([...m.labels.filter((l) => l !== binId), inboxId])] }));
    p.untrash(msgs).catch((e) => errorToast(e));
  }
}

export async function markSpam(ids: string[], spam = true, opts: { silent?: boolean } = {}) {
  if (spam) {
    await modify(ids, sys('junk'), sys('inbox'));
    if (opts.silent) return;
    afterRemoveFromView();
    const id = record(`Move to Junk: ${describeIds(ids)}`, () => modify(ids, sys('inbox'), sys('junk')), () => markSpam(ids, true, { silent: true }));
    toast({ text: 'Moved to Junk', undo: () => undoEntry(id) });
  } else {
    await modify(ids, sys('inbox'), sys('junk'));
    toast({ text: 'Moved to Inbox' });
  }
}

export async function moveToInbox(ids: string[]) {
  await modify(ids, sys('inbox'), (p) => [p.systemFolderId('bin') || '', p.systemFolderId('junk') || '']);
}

export async function applyLabel(ids: string[], accountId: string, labelId: string, remove = false) {
  const valid = ids.filter((id) => get().messages[id]?.accountId === accountId);
  if (remove) await modify(valid, none, () => [labelId]);
  else await modify(valid, () => [labelId], none);
}

export async function moveToLabel(ids: string[], accountId: string, labelId: string, opts: { silent?: boolean } = {}) {
  const valid = ids.filter((id) => get().messages[id]?.accountId === accountId);
  await modify(valid, () => [labelId], sys('inbox'));
  if (opts.silent) return;
  afterRemoveFromView();
  const name = get().folders[accountId]?.find((f) => f.id === labelId)?.name || 'folder';
  const id = record(`Move to ${name}: ${describeIds(valid)}`, () => modify(valid, sys('inbox'), () => [labelId]), () => moveToLabel(valid, accountId, labelId, { silent: true }));
  toast({ text: `Moved to ${name}`, undo: () => undoEntry(id) });
}

export async function snooze(ids: string[], until: number, opts: { silent?: boolean } = {}) {
  const msgs = ids.map((id) => get().messages[id]).filter(Boolean);
  if (!msgs.length) return;
  const items: Snooze[] = msgs.map((m) => ({ messageId: m.id, accountId: m.accountId, threadId: m.threadId, until, subject: m.subject }));
  for (const s of items) await store.putSnooze(s);
  set({ snoozes: [...get().snoozes.filter((s) => !ids.includes(s.messageId)), ...items] });
  await archive(ids, { silent: true });
  if (opts.silent) return;
  afterRemoveFromView();
  const when = new Date(until).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const id = record(`Snooze: ${describeIds(ids)}`, () => unsnooze(ids), () => snooze(ids, until, { silent: true }));
  toast({ text: `Snoozed until ${when}`, undo: () => undoEntry(id) });
}

export async function unsnooze(ids: string[]) {
  for (const id of ids) await store.deleteSnooze(id);
  set({ snoozes: get().snoozes.filter((s) => !ids.includes(s.messageId)) });
  await modify(ids, (p) => [p.systemFolderId('inbox') || '', 'UNREAD'], none);
}

export function toggleMute(key: string) {
  const muted = settings().mutedThreads.includes(key.toLowerCase());
  useSettings.getState().toggleIn('mutedThreads', key);
  if (!muted) {
    archive(idsForKeys([key]), { silent: true, markRead: true });
    afterRemoveFromView();
    toast({ text: 'Conversation muted. New replies skip your inbox.', undo: () => useSettings.getState().toggleIn('mutedThreads', key) });
  } else toast({ text: 'Conversation unmuted' });
}

/** Sends this sender's emails to Junk now and from now on. */
export async function blockSender(email: string, ids: string[]) {
  const e = email.toLowerCase();
  const setBlocked = (on: boolean) => { if (settings().blockedSenders.includes(e) !== on) useSettings.getState().toggleIn('blockedSenders', e); };
  setBlocked(true);
  afterRemoveFromView();
  await markSpam(ids, true, { silent: true });
  const id = record(`Block sender: ${e}`, async () => { setBlocked(false); await modify(ids, sys('inbox'), sys('junk')); }, async () => { setBlocked(true); await markSpam(ids, true, { silent: true }); });
  toast({ text: `${e} is blocked. Their emails go to Junk.`, undo: () => undoEntry(id) });
}

export function unblockSender(email: string) {
  if (settings().blockedSenders.includes(email.toLowerCase())) useSettings.getState().toggleIn('blockedSenders', email);
  toast({ text: `${email} is no longer blocked` });
}

export function toggleVip(email: string) {
  const on = settings().vips.includes(email.toLowerCase());
  useSettings.getState().toggleIn('vips', email);
  toast({ text: on ? `${email} removed from important senders` : `${email} marked as important` });
}

export async function unsubscribe(id: string) {
  const m = get().messages[id];
  if (!m?.listUnsubscribe) return;
  const links = [...m.listUnsubscribe.matchAll(/<([^>]+)>/g)].map((x) => x[1]);
  const https = links.find((l) => l.startsWith('https://'));
  const mailto = links.find((l) => l.startsWith('mailto:'));
  try {
    if (https && m.listUnsubscribePost) {
      const res = await httpFetch(https, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
      if (res.ok || res.status === 202) {
        toast({ text: `Unsubscribed from ${m.from.name || m.from.email}` });
        return;
      }
    }
    if (mailto) {
      const url = new URL(mailto);
      const acc = get().accounts.find((a) => a.id === m.accountId);
      const p = providers.get(m.accountId);
      if (acc && p) {
        await p.send({ from: { email: acc.email, name: acc.displayName }, to: [{ email: url.pathname }], cc: [], bcc: [], subject: url.searchParams.get('subject') || 'Unsubscribe', html: '<p>Unsubscribe</p>', text: 'Unsubscribe', attachments: [] });
        toast({ text: `Unsubscribe request sent to ${m.from.name || m.from.email}` });
        return;
      }
    }
    if (https) await openExternal(https);
  } catch (e) {
    if (https) await openExternal(https);
    else errorToast(e, 'Unsubscribe failed');
  }
}

export async function addFollowup(f: FollowUp) {
  await store.putFollowup(f);
  set({ followups: [...get().followups, f] });
}

/** Clears follow ups once someone replies. */
export function processFollowups() {
  if (!get().followups.length) return;
  const mine = myAddresses(get().accounts);
  const all = get().messages;
  const ix = indexNow();
  for (const f of get().followups) {
    // Only the emails in that conversation, not every email.
    const replied = ix.idsIn(`${f.accountId}|${f.threadId}`).some((id) => { const m = all[id]; return m && m.date > f.sentAt && !mine.has(m.from.email.toLowerCase()); });
    if (replied) {
      store.deleteFollowup(f.id);
      set({ followups: get().followups.filter((x) => x.id !== f.id) });
    }
  }
}

/** Marks everything unread in a mailbox as read. */
export async function markViewRead(view: View) {
  const { inMailbox, scopeAccountIds } = await import('../mailbox');
  const everywhere = view.mailbox.kind === 'search' || view.mailbox.kind === 'smart';
  const allowed = new Set(scopeAccountIds(view.scope, get().accounts.map((a) => a.id), settings().groups, everywhere ? [] : get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id)));
  const ctx = { vips: new Set(settings().vips), snoozed: new Set(get().snoozes.map((s) => s.messageId)), smart: settings().smartMailboxes, mine: myAddresses(get().accounts) };
  const ids = Object.values(get().messages)
    .filter((m) => m.unread && allowed.has(m.accountId) && inMailbox(m, view.mailbox, providers.get(m.accountId), ctx))
    .map((m) => m.id);
  if (!ids.length) return;
  await markRead(ids, true);
  const id = record(`Mark ${ids.length} as read`, () => markRead(ids, false, { silent: true }), () => markRead(ids, true));
  toast({ text: `${ids.length} marked as read`, undo: () => undoEntry(id) });
}
