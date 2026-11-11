// Whether you replied to or forwarded a conversation, worked out from your own sent emails in it. This works the
// same for Gmail, Microsoft and iCloud, since every one keeps what you sent in the conversation.
import type { Message } from './types';
import { threadKey } from './mailbox';

export interface SentStep { at: number; forward: boolean }
export interface ReplyMark { repliedAt?: number; forwardedAt?: number }

const FORWARD = /^\s*(fwd?|fw)\s*:/i;

/** Your sent emails, by conversation. Drafts don't count. */
export function sentByThread(messages: Iterable<Message>, mine: Set<string>): Map<string, SentStep[]> {
  const out = new Map<string, SentStep[]>();
  for (const m of messages) {
    if (m.isDraft || !mine.has(m.from.email.toLowerCase())) continue;
    const k = threadKey(m);
    const list = out.get(k);
    const step = { at: m.date, forward: FORWARD.test(m.subject || '') };
    if (list) list.push(step);
    else out.set(k, [step]);
  }
  return out;
}

/** For a row showing an email from someone else: the latest reply and forward you sent after it. */
export function replyMark(row: Message, sent: Map<string, SentStep[]>, mine: Set<string>): ReplyMark | undefined {
  if (mine.has(row.from.email.toLowerCase())) return undefined;
  const steps = sent.get(threadKey(row));
  if (!steps) return undefined;
  const mark: ReplyMark = {};
  for (const s of steps) {
    if (s.at < row.date) continue;
    if (s.forward) mark.forwardedAt = Math.max(mark.forwardedAt || 0, s.at);
    else mark.repliedAt = Math.max(mark.repliedAt || 0, s.at);
  }
  return mark.repliedAt || mark.forwardedAt ? mark : undefined;
}

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** "You replied on Tuesday 10 November at 14:02", and the same for a forward. */
export function replyMarkWords(mark: ReplyMark): string {
  const parts: string[] = [];
  if (mark.repliedAt) parts.push(`You replied on ${when(mark.repliedAt).replace(/, (\d\d:\d\d)$/, ' at $1')}`);
  if (mark.forwardedAt) parts.push(`${parts.length ? 'forwarded' : 'You forwarded'} on ${when(mark.forwardedAt).replace(/, (\d\d:\d\d)$/, ' at $1')}`);
  return parts.join(', and ');
}
