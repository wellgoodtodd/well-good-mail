// Conversations and counts kept up to date as emails change, instead of worked out again from every email each time.
//
// The mail store replaces its `messages` object on every change but keeps the same object for each email that didn't
// change. So comparing the old and new objects email by email (a quick check of each one, no other work) finds exactly
// what changed, and only those emails are re-filed. Anything the counts depend on besides the emails themselves (which
// accounts are left out of All Inboxes, what's snoozed) is compared by value; when it changes, the counts start again.
import type { Account, Message, Snooze } from './types';
import { inSystemFolder, threadKey, type ProviderLookup } from './mailbox';

export type Counts = Readonly<Record<string, number>>;

/** The count keys one email adds to: per account and for All Inboxes, as the sidebar and the taskbar use them. */
function countKeys(m: Message, provider: ProviderLookup, leftOut: Set<string>, snoozed: Set<string>): string[] {
  const p = provider(m.accountId);
  const out: string[] = [];
  const both = (k: string) => { out.push(`${m.accountId}|${k}`); if (!leftOut.has(m.accountId)) out.push(`all|${k}`); };
  const inbox = inSystemFolder(m, 'inbox', p);
  if (m.unread && inbox && !snoozed.has(m.id)) both('inbox');
  if (m.unread && inbox && !leftOut.has(m.accountId)) out.push('badge');
  if (m.unread && inSystemFolder(m, 'junk', p)) both('junk');
  if (inSystemFolder(m, 'drafts', p)) both('drafts');
  if (m.flagged && inSystemFolder(m, 'flagged', p) && !leftOut.has(m.accountId)) out.push('all|flagged');
  if (m.unread) for (const l of m.labels) if (l.startsWith('Label_') || l.length > 12) out.push(`${m.accountId}|label|${l}`);
  return out;
}

export class MessageIndex {
  private seen: Record<string, Message> = {};
  private threadOf = new Map<string, string>();
  private threads = new Map<string, Set<string>>();
  private gave = new Map<string, string[]>();
  private tally = new Map<string, number>();
  private context = '';
  private snapshot: Counts = {};
  private dirty = true;

  constructor(private provider: ProviderLookup) {}

  /** Brings the index up to date with the store's messages: only emails that changed are looked at again. */
  update(messages: Record<string, Message>, accounts: Account[], snoozes: Snooze[]): void {
    const leftOut = new Set(accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id));
    const snoozed = new Set(snoozes.map((s) => s.messageId));
    const context = [...leftOut].sort().join(',') + '#' + [...snoozed].sort().join(',');
    if (context !== this.context) {
      // What the counts depend on changed: count everything again (threads don't depend on it, so they stay).
      this.context = context;
      this.tally.clear();
      this.gave.clear();
      for (const id in this.seen) this.give(id, this.seen[id], leftOut, snoozed);
    }
    if (messages === this.seen) return;
    const before = this.seen;
    for (const id in messages) {
      const m = messages[id];
      const old = before[id];
      if (old === m) continue;
      if (old) this.forget(id);
      this.file(id, m);
      this.give(id, m, leftOut, snoozed);
    }
    for (const id in before) if (!(id in messages)) { this.forget(id); }
    this.seen = messages;
  }

  /** The ids of the emails in one conversation. */
  idsIn(key: string): string[] {
    const s = this.threads.get(key);
    return s ? [...s] : [];
  }

  /** The counts, as one object that stays the same until a count changes (so it's safe to hand to React). */
  counts(): Counts {
    if (this.dirty) {
      this.snapshot = Object.freeze(Object.fromEntries(this.tally));
      this.dirty = false;
    }
    return this.snapshot;
  }

  private file(id: string, m: Message) {
    const key = threadKey(m);
    this.threadOf.set(id, key);
    let s = this.threads.get(key);
    if (!s) this.threads.set(key, (s = new Set()));
    s.add(id);
  }

  private give(id: string, m: Message, leftOut: Set<string>, snoozed: Set<string>) {
    const keys = countKeys(m, this.provider, leftOut, snoozed);
    if (!keys.length) return;
    this.gave.set(id, keys);
    for (const k of keys) this.tally.set(k, (this.tally.get(k) || 0) + 1);
    this.dirty = true;
  }

  private forget(id: string) {
    const key = this.threadOf.get(id);
    if (key) {
      const s = this.threads.get(key);
      s?.delete(id);
      if (s && !s.size) this.threads.delete(key);
      this.threadOf.delete(id);
    }
    const keys = this.gave.get(id);
    if (keys) {
      for (const k of keys) {
        const n = (this.tally.get(k) || 0) - 1;
        if (n > 0) this.tally.set(k, n); else this.tally.delete(k);
      }
      this.gave.delete(id);
      this.dirty = true;
    }
  }
}
