import { describe, expect, it } from 'vitest';
import { MessageIndex } from '../messageIndex';
import { inSystemFolder, threadKey } from '../mailbox';
import type { Account, Message, Snooze } from '../types';
import type { MailProvider } from '../providers/provider';

const folders: Record<string, string> = { inbox: 'INBOX', bin: 'TRASH', junk: 'SPAM', sent: 'SENT', drafts: 'DRAFT', archive: '', flagged: 'STARRED' };
const provider = { systemFolderId: (f: string) => folders[f] || null } as unknown as MailProvider;
const LABELS = ['INBOX', 'SPAM', 'DRAFT', 'TRASH', 'STARRED', 'Label_7', 'SENT'];

/** The old way: every email counted from scratch. The index must always agree with it. */
function fromScratch(messages: Record<string, Message>, accounts: Account[], snoozes: Snooze[]) {
  const c: Record<string, number> = {};
  const inc = (k: string) => (c[k] = (c[k] || 0) + 1);
  const leftOut = new Set(accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id));
  const snoozed = new Set(snoozes.map((s) => s.messageId));
  const threads: Record<string, string[]> = {};
  for (const m of Object.values(messages)) {
    (threads[threadKey(m)] ||= []).push(m.id);
    const all = (k: string) => { if (!leftOut.has(m.accountId)) inc(k); };
    if (m.unread && !snoozed.has(m.id) && inSystemFolder(m, 'inbox', provider)) { inc(`${m.accountId}|inbox`); all('all|inbox'); }
    if (m.unread && !leftOut.has(m.accountId) && inSystemFolder(m, 'inbox', provider)) inc('badge');
    if (m.unread && inSystemFolder(m, 'junk', provider)) { inc(`${m.accountId}|junk`); all('all|junk'); }
    if (inSystemFolder(m, 'drafts', provider)) { inc(`${m.accountId}|drafts`); all('all|drafts'); }
    if (m.flagged && inSystemFolder(m, 'flagged', provider)) all('all|flagged');
    if (m.unread) for (const l of m.labels) if (l.startsWith('Label_') || l.length > 12) inc(`${m.accountId}|label|${l}`);
  }
  return { c, threads };
}

// A small repeatable random number source, so a failure can be run again.
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

describe('message index', () => {
  it('always agrees with counting every email from scratch, through random changes', () => {
    const r = rng(42);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const make = (n: number): Message => ({
      id: `${pick(['a', 'b'])}|${n}`, accountId: '', providerId: String(n), threadId: `t${Math.floor(r() * 30)}`,
      labels: LABELS.filter(() => r() < 0.3), unread: r() < 0.5, flagged: r() < 0.2,
    } as unknown as Message);
    const fix = (m: Message): Message => ({ ...m, accountId: m.id.split('|')[0] });
    let messages: Record<string, Message> = {};
    for (let i = 0; i < 200; i++) { const m = fix(make(i)); messages[m.id] = m; }
    let accounts = [{ id: 'a' }, { id: 'b' }] as Account[];
    let snoozes: Snooze[] = [];
    const ix = new MessageIndex(() => provider);
    let next = 200;
    for (let step = 0; step < 300; step++) {
      const ids = Object.keys(messages);
      const roll = r();
      messages = { ...messages };
      if (roll < 0.5) { const id = pick(ids); messages[id] = { ...messages[id], unread: !messages[id].unread, labels: LABELS.filter(() => r() < 0.3) }; }
      else if (roll < 0.7) { delete messages[pick(ids)]; }
      else if (roll < 0.85) { const m = fix(make(next++)); messages[m.id] = m; }
      else if (roll < 0.93) { accounts = accounts.map((a) => (a.id === 'b' ? { ...a, leaveOutOfAll: !a.leaveOutOfAll } : a)); }
      else { snoozes = r() < 0.5 ? [] : [{ messageId: pick(ids) } as Snooze]; }
      ix.update(messages, accounts, snoozes);
      const want = fromScratch(messages, accounts, snoozes);
      expect(ix.counts()).toEqual(want.c);
      for (const [k, list] of Object.entries(want.threads)) expect(ix.idsIn(k).sort()).toEqual(list.sort());
    }
  });

  it('gives the same counts object back until something changes', () => {
    const m = { id: 'a|1', accountId: 'a', threadId: 't', labels: ['INBOX'], unread: true, flagged: false } as unknown as Message;
    const ix = new MessageIndex(() => provider);
    const accounts = [{ id: 'a' }] as Account[];
    ix.update({ [m.id]: m }, accounts, []);
    const first = ix.counts();
    ix.update({ [m.id]: m }, accounts, []);
    expect(ix.counts()).toBe(first);
    ix.update({ [m.id]: { ...m, unread: false } }, accounts, []);
    expect(ix.counts()).not.toBe(first);
    expect(ix.counts()['all|inbox']).toBeUndefined();
  });
});
