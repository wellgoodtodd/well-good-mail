// Email bodies: read when an email is opened (memory, then the database, then the account), and fetched ahead of time.
import { store } from '../db';
import { bodyOf, peekBody, rememberBody, type Body } from '../bodyCache';
import type { Message } from '../types';
import { putMessages } from './messages';
import { errorToast, providers, useMail } from './store';

const get = useMail.getState;

/** An email with a body just fetched from its account. An empty body is kept as empty text, so it counts as loaded. */
function withFetchedBody(m: Message, body: { html?: string; text?: string; attachments: Message['attachments'] }): Message {
  const empty = body.html === undefined && body.text === undefined;
  return { ...m, bodyHtml: body.html, bodyText: empty ? '' : body.text, attachments: body.attachments, hasAttachments: body.attachments.some((a) => !a.inline), bodyLoaded: true };
}

/** The saved body of an email, from memory or the database, without asking the account. Undefined when none is saved. */
async function storedBody(id: string): Promise<Body | undefined> {
  const hit = peekBody(id);
  if (hit) return hit;
  try {
    const row = await store.getMessage(id);
    if (row?.bodyLoaded) return bodyOf(row);
  } catch { /* fetched from the account instead */ }
  return undefined;
}

/**
 * An email with its full text, for opening, replying, printing and the AI Connection. The store holds list details
 * only; the body comes from memory if it was opened lately, else from the database, else from the account.
 * The result is not put in the store (it would hold the body again); the body stays in the small recent cache.
 */
export async function loadBody(id: string): Promise<Message | undefined> {
  // Already fetched in the background and waiting to be saved: save it now and use it.
  if (warmBuffer.some((u) => u.id === id)) flushWarm();
  const m = get().messages[id];
  if (!m) return m;
  if (m.bodyLoaded) {
    const saved = await storedBody(id);
    if (saved) {
      rememberBody(id, saved);
      return { ...(get().messages[id] || m), bodyHtml: saved.html, bodyText: saved.text };
    }
    // Marked as loaded but the database has no body (a save that failed): fetch it again below.
  }
  const p = providers.get(m.accountId);
  if (!p) return m;
  try {
    const body = await p.getBody(m);
    const updated = withFetchedBody(get().messages[id] || m, body);
    rememberBody(id, bodyOf(updated));
    putMessages([updated]);
    return updated;
  } catch (e) {
    errorToast(e, 'Couldn\'t load email');
    return m;
  }
}

/**
 * A draft is open: keep the email it answers in the recent cache, so switching Reply, Reply All and Forward in the
 * editor quotes its full text straight away (the store holds list details only). Only what's saved here, as before.
 */
export async function keepDraftSource(draftId: string) {
  try {
    const d = await store.getDraft(draftId);
    const id = d?.sourceMessageId;
    if (!id || !get().messages[id]?.bodyLoaded) return;
    const saved = await storedBody(id);
    if (saved) rememberBody(id, saved);
  } catch { /* the quote falls back to the one already in the draft */ }
}
useMail.subscribe((s, prev) => { if (s.inlineDraftId && s.inlineDraftId !== prev.inlineDraftId) void keepDraftSource(s.inlineDraftId); });

/** Like loadBody, but only from what's saved here: never asks the account (for drafts the AI writes). */
export async function savedCopy(id: string): Promise<Message | undefined> {
  const m = get().messages[id];
  if (!m || !m.bodyLoaded) return m;
  const saved = await storedBody(id);
  return saved ? { ...m, bodyHtml: saved.html, bodyText: saved.text } : m;
}

// Opening an email is instant when its body is already here. New mail, the top of the Inbox and whatever the
// pointer rests on are fetched quietly in the background, one at a time, so nothing else is held up.
const warmQueue: string[] = [];
const warmUrgent = new Set<string>();
let warming = false;
// Bodies fetched in the background are saved together every couple of seconds. Saving one at a time copied the
// whole mail list and redrew the app each time, which made everything feel slow while it worked.
let warmBuffer: Message[] = [];
let warmFlushTimer: ReturnType<typeof setTimeout> | undefined;
function flushWarm() {
  clearTimeout(warmFlushTimer);
  warmFlushTimer = undefined;
  if (!warmBuffer.length) return;
  const batch = warmBuffer.map((u) => ({ ...(get().messages[u.id] || u), bodyHtml: u.bodyHtml, bodyText: u.bodyText, attachments: u.attachments, hasAttachments: u.hasAttachments, bodyLoaded: true }));
  warmBuffer = [];
  putMessages(batch);
}

/** Loads these emails' bodies in the background. With first, they jump the queue (the pointer is on them). */
export function warmBodies(ids: string[], opts: { first?: boolean } = {}) {
  const todo = ids.filter((id) => { const m = get().messages[id]; return m && !m.bodyLoaded && !m.isDraft && !warmQueue.includes(id); });
  if (!todo.length) return;
  if (opts.first) { warmQueue.unshift(...todo); todo.forEach((id) => warmUrgent.add(id)); } else warmQueue.push(...todo);
  if (warmQueue.length > 200) warmQueue.length = 200;
  if (!warming) void runWarm();
}

async function runWarm() {
  warming = true;
  try {
    while (warmQueue.length) {
      const id = warmQueue.shift()!;
      const urgent = warmUrgent.delete(id);
      const m = get().messages[id];
      const p = m && providers.get(m.accountId);
      if (!m || m.bodyLoaded || !p) continue;
      try {
        const body = await p.getBody(m);
        const updated = withFetchedBody(get().messages[id] || m, body);
        if (urgent) { warmBuffer.push(updated); flushWarm(); } // About to be opened: save now.
        else {
          warmBuffer.push(updated);
          if (warmBuffer.length >= 25) flushWarm();
          else if (!warmFlushTimer) warmFlushTimer = setTimeout(flushWarm, 2500);
        }
      } catch { /* it loads when opened instead */ }
      // Gentle in the background; quick for what the pointer is on.
      await new Promise((r) => setTimeout(r, urgent ? 0 : 250));
    }
  } finally {
    warming = false;
    flushWarm();
  }
}

/** The newest emails in each Inbox that aren't loaded yet. */
export function warmInbox(perAccount = 25) {
  const byAcc = new Map<string, Message[]>();
  for (const m of Object.values(get().messages)) {
    if (m.bodyLoaded || m.isDraft || !m.labels.includes('INBOX')) continue;
    const list = byAcc.get(m.accountId) || [];
    list.push(m);
    byAcc.set(m.accountId, list);
  }
  const ids: string[] = [];
  for (const list of byAcc.values()) ids.push(...list.sort((a, b) => b.date - a.date).slice(0, perAccount).map((m) => m.id));
  warmBodies(ids);
}

const refetched = new Set<string>();

/** True when a saved body has the tell-tale marks of UTF-8 read as Windows-1252 (â€™ and the like). */
export function looksGarbled(m: Message): boolean {
  return !refetched.has(m.id) && /â€[™˜œ\u009d¦“”]|Ã[\u00a0-\u00bf]/.test(`${m.bodyText || ''}${m.bodyHtml || ''}`);
}

/** Downloads an email's body again, replacing the saved copy. Tried once per email. */
export async function refetchBody(id: string): Promise<void> {
  const m = get().messages[id];
  const p = m && providers.get(m.accountId);
  if (!m || !p || refetched.has(id)) return;
  refetched.add(id);
  try {
    const body = await p.getBody(m);
    const updated = withFetchedBody(get().messages[id] || m, body);
    putMessages([updated]);
  } catch { /* keep the saved copy */ }
}

export async function getAttachmentData(messageId: string, attachmentId: string): Promise<Uint8Array> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!m || !p) throw new Error('Email not found');
  return p.getAttachment(m, attachmentId);
}
