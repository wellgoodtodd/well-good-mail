// The suggested event and task for an email, read once and shared by both cards. Reading an email for dates means
// turning its HTML into text and running the date reader over it, which is slow on a big email, so it's done:
// - never for newsletters and machine senders (they get no card anyway),
// - once per email (both cards share it, and the calendar refreshing doesn't redo it),
// - just after the email shows, so opening it isn't held up.
import { useEffect, useState } from 'react';
import { visibleText } from './cleanText';
import { MACHINE, findEvent, type Suggestion } from './suggestEvents';
import { suggestTask, type TaskSuggestion } from './suggestTasks';
import type { Message } from './types';

export interface EmailSuggestions {
  /** Without the calendar check: add it with withExisting. */
  event?: Suggestion;
  task?: TaskSuggestion;
}

type Readable = Pick<Message, 'id' | 'from' | 'subject' | 'date' | 'listUnsubscribe' | 'bodyHtml' | 'bodyText' | 'bodyLoaded' | 'isDraft'>;

const NONE: EmailSuggestions = Object.freeze({});
/** Kept ten minutes: a suggestion stops being offered a quarter of an hour after it starts. */
const FRESH = 10 * 60000;
const cache = new Map<string, { at: number; found: EmailSuggestions }>();

/** Nothing to read: a machine sender, a newsletter, a draft or no body yet. */
const skip = (m: Readable) => !m.bodyLoaded || m.isDraft || MACHINE.test(m.from.email) || Boolean(m.listUnsubscribe);
const keyOf = (m: Readable) => `${m.id}|${(m.bodyHtml || '').length}|${(m.bodyText || '').length}`;

/** What's already been worked out for this email, if anything. */
export function knownSuggestions(m: Readable, now = Date.now()): EmailSuggestions | undefined {
  if (skip(m)) return NONE;
  const hit = cache.get(keyOf(m));
  return hit && now - hit.at < FRESH ? hit.found : undefined;
}

export function emailSuggestions(m: Readable, now = Date.now()): EmailSuggestions {
  const known = knownSuggestions(m, now);
  if (known) return known;
  const text = visibleText(m.bodyHtml, m.bodyText, 8000);
  const event = findEvent(m, text, now);
  const task = suggestTask(m, text, now);
  const found: EmailSuggestions = { ...(event ? { event } : {}), ...(task ? { task } : {}) };
  const key = keyOf(m);
  cache.delete(key);
  cache.set(key, { at: now, found });
  // The last 60 emails is plenty: it's for going back and forth.
  while (cache.size > 60) cache.delete(cache.keys().next().value!);
  return found;
}

/** The suggestions for an email, worked out just after it shows (undefined until then). */
export function useEmailSuggestions(m: Readable): EmailSuggestions | undefined {
  const key = skip(m) ? '' : keyOf(m);
  const [got, setGot] = useState<{ key: string; found: EmailSuggestions } | undefined>(undefined);
  const known = knownSuggestions(m);
  useEffect(() => {
    if (!key || knownSuggestions(m)) return;
    let live = true;
    const run = () => { if (live) setGot({ key, found: emailSuggestions(m) }); };
    // After the email has been drawn; a short wait so moving quickly through the list doesn't read every one.
    const t = setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 400 }) : run()), 120);
    return () => { live = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return known ?? (got?.key === key ? got.found : undefined);
}
