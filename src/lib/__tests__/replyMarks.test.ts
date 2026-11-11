import { describe, expect, it } from 'vitest';
import { replyMark, replyMarkWords, sentByThread } from '../replyMarks';
import type { Message } from '../types';

const mine = new Set(['me@studio.example']);
const msg = (over: Partial<Message>): Message => ({
  id: 'a|x', accountId: 'a', providerId: 'x', threadId: 't1', labels: [], from: { email: 'isla@glen.example' }, to: [], cc: [], bcc: [],
  subject: 'Invoice', snippet: '', date: 1000, unread: false, flagged: false, isDraft: false, hasAttachments: false, attachments: [], bodyLoaded: true, ...over,
});

describe('reply marks', () => {
  const incoming = msg({ id: 'a|1', providerId: '1', date: 1000 });
  it('marks a reply and a forward sent after the email', () => {
    const sent = sentByThread([
      incoming,
      msg({ id: 'a|2', providerId: '2', from: { email: 'me@studio.example' }, subject: 'Re: Invoice', date: 2000 }),
      msg({ id: 'a|3', providerId: '3', from: { email: 'me@studio.example' }, subject: 'Fwd: Invoice', date: 3000 }),
    ], mine);
    expect(replyMark(incoming, sent, mine)).toEqual({ repliedAt: 2000, forwardedAt: 3000 });
  });
  it('ignores drafts, earlier emails and other conversations', () => {
    const sent = sentByThread([
      msg({ id: 'a|2', from: { email: 'me@studio.example' }, isDraft: true, date: 2000 }),
      msg({ id: 'a|3', from: { email: 'me@studio.example' }, date: 500 }),
      msg({ id: 'a|4', from: { email: 'me@studio.example' }, threadId: 't2', date: 2000 }),
    ], mine);
    expect(replyMark(incoming, sent, mine)).toBeUndefined();
  });
  it('says when', () => {
    const at = new Date(2026, 10, 10, 14, 2).getTime();
    expect(replyMarkWords({ repliedAt: at })).toBe('You replied on Tuesday 10 November at 14:02');
  });
});
