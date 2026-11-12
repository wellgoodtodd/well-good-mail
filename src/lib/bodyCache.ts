// Email bodies live in IndexedDB, not in the mail store. The store keeps only what the list needs (sender, subject,
// flags, the attachment list...), so a big mailbox doesn't hold every email's full text in memory. An email's body is
// read when it's opened, and the last few opened stay here so going back to one is instant.
//
// This module is plain data handling with no imports from the store, so compose.ts and the tests can use it freely.
import type { Message } from './types';

export interface Body { html?: string; text?: string }

/** How many opened bodies stay in memory. */
export const BODY_CACHE_SIZE = 50;

// A Map keeps insertion order, so the first key is the one used longest ago.
const cache = new Map<string, Body>();
// Bodies on their way into IndexedDB: readable here until the write has finished.
const pending = new Map<string, Body>();

/** True when the message object itself carries body text (a full copy from the database or a provider). */
export const carriesBody = (m: Pick<Message, 'bodyHtml' | 'bodyText'>) => m.bodyHtml !== undefined || m.bodyText !== undefined;

export const bodyOf = (m: Pick<Message, 'bodyHtml' | 'bodyText'>): Body => ({ html: m.bodyHtml, text: m.bodyText });

/** The list-only copy of an email kept in the store: everything but the body text. */
export function listOnly(m: Message): Message {
  if (!('bodyHtml' in m) && !('bodyText' in m)) return m;
  const { bodyHtml: _h, bodyText: _t, ...rest } = m;
  return rest as Message;
}

/** A body read from memory (recently opened, or still being saved), or undefined. Counts as a use. */
export function peekBody(id: string): Body | undefined {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  return pending.get(id);
}

/** Keeps a body in memory as recently opened, letting the oldest go past the limit. */
export function rememberBody(id: string, body: Body) {
  cache.delete(id);
  cache.set(id, body);
  while (cache.size > BODY_CACHE_SIZE) cache.delete(cache.keys().next().value as string);
}

/** A newer body for an email: replaces the copy in memory if there is one (it doesn't add new ones). */
export function refreshBody(id: string, body: Body) {
  if (cache.has(id)) cache.set(id, body);
}

/** Holds bodies while they are written to IndexedDB, so a read straight after still finds them. */
export function holdWhileSaving(items: { id: string; body: Body }[], saving: Promise<unknown>) {
  if (!items.length) return;
  for (const { id, body } of items) pending.set(id, body);
  const done = () => { for (const { id, body } of items) if (pending.get(id) === body) pending.delete(id); };
  saving.then(done, done);
}

export function forgetBodies(ids: string[]) {
  for (const id of ids) { cache.delete(id); pending.delete(id); }
}

/** The email with its body from memory where there is one (for code that can't wait, like switching Reply to Forward). */
export function withCachedBody(m: Message): Message {
  if (carriesBody(m)) return m;
  const b = peekBody(m.id);
  return b ? { ...m, bodyHtml: b.html, bodyText: b.text } : m;
}

/** For the tests: how many bodies are in memory. */
export const cachedBodyCount = () => cache.size;
export function clearBodyCache() { cache.clear(); pending.clear(); }
