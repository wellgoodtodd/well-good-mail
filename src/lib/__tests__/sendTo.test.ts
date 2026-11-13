import { describe, expect, it } from 'vitest';
import { findInvoiceSenders, forwardName, placeSummary, ruleMatches, senderKey, subfolderFor } from '../sendTo';
import type { SendRule } from '../settings';
import type { Message } from '../types';

const msg = (over: Partial<Message>): Message => ({
  id: Math.random().toString(36), accountId: 'a', threadId: 't', providerId: 'p', labels: ['INBOX'], from: { email: 'billing@canva.com', name: 'Canva' }, to: [], cc: [], bcc: [],
  subject: 'Your Canva invoice', snippet: 'Thanks for your payment', date: Date.UTC(2026, 10, 3), unread: false, flagged: false, isDraft: false, hasAttachments: true,
  attachments: [{ id: 'x', filename: 'Invoice-1.pdf', mimeType: 'application/pdf', size: 100, inline: false }], bodyLoaded: false, ...over,
} as Message);

const rule = (over: Partial<SendRule>): SendRule => ({ id: 'r', name: 'Canva', from: 'canva.com', needsPdf: true, placeId: 'p', on: true, since: 0, sent: 0, ...over });

describe('Send To', () => {
  it('names forwarding addresses and sums up places', () => {
    expect(forwardName('receipts.ab12@app.hubdoc.com')).toBe('Hubdoc');
    expect(placeSummary({ id: 'p', name: 'Bookkeeping', forwardTo: 'x@app.hubdoc.com', sendMode: 'now', filesOnly: true, folder: 'D:\\Accounts\\Invoices', subfolders: 'month' })).toBe('Hubdoc and Invoices folder');
    expect(placeSummary({ id: 'p', name: 'Hubdoc', forwardTo: 'x@app.hubdoc.com', sendMode: 'now', filesOnly: true, subfolders: 'none' })).toBe('Forward only');
  });

  it('puts files in year and month folders', () => {
    const d = new Date(2026, 10, 13).getTime();
    expect(subfolderFor({ subfolders: 'none' }, d)).toBe('');
    expect(subfolderFor({ subfolders: 'year' }, d)).toBe('2026');
    expect(subfolderFor({ subfolders: 'month' }, d)).toBe('2026/11 November');
  });

  it('matches a company by domain and a Gmail user by address', () => {
    expect(senderKey('billing@mail.canva.com')).toBe('canva.com');
    expect(senderKey('Someone@Gmail.com')).toBe('someone@gmail.com');
  });

  it('runs a rule only on the right sender, with a PDF when asked', () => {
    expect(ruleMatches(rule({}), msg({}))).toBe(true);
    expect(ruleMatches(rule({}), msg({ from: { email: 'billing@mail.canva.com' } }))).toBe(true);
    expect(ruleMatches(rule({}), msg({ from: { email: 'x@notcanva.com' } }))).toBe(false);
    expect(ruleMatches(rule({}), msg({ attachments: [] }))).toBe(false);
    expect(ruleMatches(rule({ needsPdf: false, subjectHas: 'receipt' }), msg({ attachments: [] }))).toBe(false);
    expect(ruleMatches(rule({ on: false }), msg({}))).toBe(false);
  });

  it('finds senders of invoices, with how often they come', () => {
    const now = Date.UTC(2026, 10, 13);
    const canva = [0, 1, 2, 3].map((i) => msg({ date: Date.UTC(2026, 7 + i, 3) }));
    const news = msg({ from: { email: 'news@shop.example' }, subject: 'Our autumn sale', snippet: 'Big savings', hasAttachments: false, attachments: [] });
    const mine = msg({ from: { email: 'me@example.com' } });
    const found = findInvoiceSenders([...canva, news, mine], new Set(['me@example.com']), now);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'canva.com', name: 'Canva', count: 4, cadence: 'monthly' });
  });
});
