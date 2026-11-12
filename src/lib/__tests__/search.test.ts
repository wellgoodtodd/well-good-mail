import { describe, expect, it } from 'vitest';
import { BODY_CHARS, bodyMentions, indexMessages, indexStats, removeFromIndex, searchMessages } from '../search';
import { listOnly } from '../bodyCache';
import type { Message } from '../types';

const day = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
let n = 0;
const msg = (over: Partial<Message> = {}): Message => {
  n++;
  return {
    id: `s|${n}`, accountId: 's', providerId: String(n), threadId: `t${n}`, labels: ['INBOX'],
    from: { email: 'sam@bloom.co', name: 'Sam Smith' }, to: [{ email: 'me@x.com', name: 'Me' }], cc: [], bcc: [],
    subject: 'Hello', snippet: 'A short preview', date: day(10),
    unread: false, flagged: false, isDraft: false, hasAttachments: false, attachments: [], bodyLoaded: false, ...over,
  };
};
const ids = (q: string, all: Record<string, Message>) => searchMessages(q, all).map((m) => m.id);
const byId = (list: Message[]) => Object.fromEntries(list.map((m) => [m.id, listOnly(m)]));

describe('Search index', () => {
  it('finds words in the body, and a later update without the body keeps them findable', () => {
    const m = msg({ bodyText: 'The quarterly figures for the lighthouse project', bodyLoaded: true });
    indexMessages([m]);
    const all = byId([m]);
    expect(ids('lighthouse', all)).toEqual([m.id]);
    // A sync or flag change brings the email back with no body text: still found by its body.
    indexMessages([listOnly({ ...m, unread: true })]);
    indexMessages([{ ...listOnly(m), bodyLoaded: false }]);
    expect(ids('lighthouse', all)).toEqual([m.id]);
  });

  it('indexes each email once, not again on every sync', () => {
    const list = [msg({ bodyText: 'alpha bravo', bodyLoaded: true }), msg({ snippet: 'charlie delta' })];
    indexMessages(list);
    const before = indexStats().writes;
    for (let i = 0; i < 5; i++) indexMessages(list.map((m) => ({ ...listOnly(m), unread: i % 2 === 0 })));
    indexMessages(list); // the same full copies again
    expect(indexStats().writes).toBe(before);
    // The body arriving later is a real change.
    indexMessages([{ ...list[1], bodyText: 'charlie delta echo', bodyLoaded: true }]);
    expect(indexStats().writes).toBe(before + 1);
    expect(ids('echo', byId(list))).toEqual([list[1].id]);
  });

  it('indexes drafts again as they change', () => {
    const d = msg({ isDraft: true, subject: 'Draft one' });
    indexMessages([d]);
    indexMessages([{ ...d, subject: 'Draft zebra' }]);
    expect(ids('zebra', byId([{ ...d, subject: 'Draft zebra' }]))).toEqual([d.id]);
  });

  it('indexes the start of a long email only', () => {
    const m = msg({ bodyText: `${'filler '.repeat(Math.ceil(BODY_CHARS / 7))} pineapple`, bodyLoaded: true });
    const early = msg({ bodyText: 'pineapple at the start', bodyLoaded: true });
    indexMessages([m, early]);
    expect(ids('pineapple', byId([m, early]))).toEqual([early.id]);
  });

  it('forgets removed emails', () => {
    const m = msg({ bodyText: 'walrus', bodyLoaded: true });
    indexMessages([m]);
    removeFromIndex([m.id]);
    expect(ids('walrus', byId([m]))).toEqual([]);
    indexMessages([listOnly(m)]); // comes back without a body: indexed again, from its preview
    expect(ids('preview', byId([m]))).toContain(m.id);
  });

  it('keeps from:, to:, after:, before: and the other words working', () => {
    const a = msg({ from: { email: 'ann@acme.com', name: 'Ann' }, subject: 'Budget', date: day(5), unread: true, bodyText: 'numbers', bodyLoaded: true });
    const b = msg({ from: { email: 'bob@other.com', name: 'Bob' }, to: [{ email: 'team@acme.com' }], subject: 'Budget', date: day(12), flagged: true, hasAttachments: true, bodyText: 'numbers', bodyLoaded: true });
    indexMessages([a, b]);
    const all = byId([a, b]);
    expect(ids('budget from:ann', all)).toEqual([a.id]);
    expect(ids('to:team@acme', all)).toEqual([b.id]);
    expect(ids('numbers after:2026-11-10', all)).toEqual([b.id]);
    expect(ids('numbers before:2026-11-10', all)).toEqual([a.id]);
    expect(ids('is:unread budget', all)).toEqual([a.id]);
    expect(ids('is:flagged', all)).toContain(b.id);
    expect(ids('has:attachment budget', all)).toEqual([b.id]);
    expect(ids('budget', all)).toEqual([b.id, a.id]);
  });

  it('answers "has these words in the body" for Smart Mailboxes, and updates as mail changes', () => {
    const m = msg({ bodyText: 'Please find the invoices attached', bodyLoaded: true });
    indexMessages([m]);
    expect(bodyMentions(m.id, 'invoice')).toBe(true);
    expect(bodyMentions(m.id, 'receipt')).toBe(false);
    const later = msg({ bodyText: 'Your receipt is here', bodyLoaded: true });
    indexMessages([later]);
    expect(bodyMentions(later.id, 'receipt')).toBe(true);
    removeFromIndex([later.id]);
    expect(bodyMentions(later.id, 'receipt')).toBe(false);
  });
});
