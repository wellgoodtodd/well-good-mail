// The conversation a draft replies to, read from the mail already on this computer, for the "Replying to" card in
// AI Drafts. Works for any reply, not only drafts that carry a quote.
import { messagesInThread, useMail } from './mail';
import { threadKey } from './mailbox';
import type { Draft, Message } from './types';

export interface ReplyThread {
  /** The email being replied to. */
  source: Message;
  /** The conversation's key, for opening it in a window. */
  key: string;
  /** Every email in the conversation that isn't a draft, newest first. */
  messages: Message[];
}

export function replyThreadOf(d: Pick<Draft, 'mode' | 'sourceMessageId' | 'serverDraftMessageId' | 'serverAccountId'>, all: Record<string, Message> = useMail.getState().messages): ReplyThread | undefined {
  if (d.mode === 'new') return undefined;
  // A draft made by Claude knows its source; one that came back from the server is found through its own saved copy.
  const source = (d.sourceMessageId && all[d.sourceMessageId])
    || (d.serverDraftMessageId && d.serverAccountId ? all[`${d.serverAccountId}|${d.serverDraftMessageId}`] : undefined);
  if (!source) return undefined;
  const key = threadKey(source);
  const messages = messagesInThread(key).filter((m) => !m.isDraft).reverse();
  if (!messages.length) return undefined;
  return { source: source.isDraft ? messages[0] : source, key, messages };
}
