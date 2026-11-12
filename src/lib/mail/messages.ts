// Adding, changing and removing emails in the store, the database and the search index, and the taskbar count.
// The store keeps list details only; bodies go to the database (see bodies.ts and ../bodyCache.ts).
import { store } from '../db';
import { bodyOf, carriesBody, forgetBodies, holdWhileSaving, listOnly, refreshBody, type Body } from '../bodyCache';
import { settings } from '../settings';
import { indexMessages, removeFromIndex } from '../search';
import { setUnreadCount, isPopout } from '../platform';
import type { Message } from '../types';
import { broadcast, indexNow, useMail } from './store';

const get = useMail.getState;
const set = useMail.setState;

/**
 * Emails you changed here (archived, read, flagged, deleted) in the last little while. A sync that set off before the
 * change reached the server can bring back the old state; for these, what you did here wins until the server has caught up.
 */
const touched = new Map<string, number>();
const TOUCH_HOLD = 45_000;
const recentlyTouched = (id: string) => (touched.get(id) || 0) > Date.now() - TOUCH_HOLD;
function touch(ids: string[]) {
  const now = Date.now();
  for (const id of ids) touched.set(id, now);
  if (touched.size > 500) for (const [id, t] of touched) if (t < now - TOUCH_HOLD) touched.delete(id);
}
const sameFlags = (a: Message, b: Message) => a.unread === b.unread && a.flagged === b.flagged && a.labels.length === b.labels.length && a.labels.every((l, i) => l === b.labels[i]);

/** Adds or updates emails. fromSync: they came from the server, so recent changes made here are kept. */
export function putMessages(msgs: Message[], fromSync = false) {
  if (fromSync) {
    msgs = msgs.flatMap((m) => {
      if (!recentlyTouched(m.id)) return [m];
      const mine = get().messages[m.id];
      // Deleted here a moment ago: don't bring it back.
      if (!mine) return [];
      return [{ ...m, labels: mine.labels, unread: mine.unread, flagged: mine.flagged }];
    });
  }
  if (!msgs.length) return;
  const next = { ...get().messages };
  // The full copies (with any body that came in) go to the database and the search index; the store keeps list details only.
  const full: Message[] = [];
  const bodies: { id: string; body: Body }[] = [];
  for (const m of msgs) {
    const prev = next[m.id];
    // An update without body text (a sync, or IMAP's copy of the list details) keeps the saved body: see store.putMessages.
    // Keep the body we already downloaded (it's in the database) when an update arrives without one.
    const merged = prev && prev.bodyLoaded && !m.bodyLoaded
      ? { ...m, attachments: prev.attachments, hasAttachments: prev.hasAttachments, bodyLoaded: true }
      : m;
    full.push(merged);
    if (carriesBody(merged)) {
      const body = bodyOf(merged);
      bodies.push({ id: m.id, body });
      refreshBody(m.id, body);
    }
    next[m.id] = listOnly(merged);
  }
  set({ messages: next });
  indexMessages(full);
  holdWhileSaving(bodies, store.putMessages(full));
  updateUnreadBadge();
}

/** Adds a large batch of messages (a cache import) a slice at a time so the window stays responsive. */
export async function importMessages(msgs: Message[]) {
  for (let i = 0; i < msgs.length; i += 500) {
    putMessages(msgs.slice(i, i + 500));
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function patchMessages(ids: string[], patch: (m: Message) => Message, fromSync = false) {
  const next = { ...get().messages };
  const changed: Message[] = [];
  for (const id of ids) {
    if (!next[id] || (fromSync && recentlyTouched(id))) continue;
    const was = next[id];
    next[id] = patch(was);
    if (!fromSync && !sameFlags(was, next[id])) touch([id]);
    changed.push(next[id]);
  }
  if (!changed.length) return;
  set({ messages: next });
  store.putMessages(changed).then(() => { if (isPopout()) broadcast({ type: 'messages-changed' }); });
  updateUnreadBadge();
}

/** Main window: pick up changes a pop out window made. */
export async function reloadMessagesFromDb() {
  const map: Record<string, Message> = {};
  const live = new Set(get().accounts.map((a) => a.id));
  await eachStoredSlice((slice) => { for (const m of slice) if (live.has(m.accountId)) { map[m.id] = listOnly(m); if (m.bodyLoaded) refreshBody(m.id, bodyOf(m)); } });
  set({ messages: map });
  updateUnreadBadge();
}

/** Reads the whole mail cache a slice at a time, so only one slice's bodies are in memory at once. */
export async function eachStoredSlice(use: (slice: Message[]) => void | Promise<void>, size = 1000) {
  let after: string | undefined;
  for (;;) {
    const slice = await store.messagesAfter(after, size);
    if (!slice.length) return;
    await use(slice);
    if (slice.length < size) return;
    after = slice[slice.length - 1].id;
  }
}

export function removeMessages(ids: string[], fromSync = false) {
  if (fromSync) ids = ids.filter((id) => !recentlyTouched(id));
  else touch(ids);
  const next = { ...get().messages };
  ids.forEach((id) => delete next[id]);
  set({ messages: next });
  removeFromIndex(ids);
  forgetBodies(ids);
  store.deleteMessages(ids);
}

let badgeTimer: ReturnType<typeof setTimeout> | undefined;
export function updateUnreadBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(countUnreadBadge, 400);
}
function countUnreadBadge() {
  const n = indexNow().counts().badge || 0;
  setUnreadCount(settings().taskbarCount === false ? 0 : n);
}
/** Shows or clears the taskbar count straight away (the switch in Settings › General). */
export const refreshTaskbarCount = () => countUnreadBadge();

/**
 * Fills the search index from the saved mail (with its body text), a slice at a time between other work. Mail that
 * syncs meanwhile is indexed as it arrives; an email already indexed the same way is skipped (see search.ts).
 */
export async function indexStoredMail() {
  try {
    await eachStoredSlice(async (slice) => {
      const live = get().messages;
      // Only mail still here: an email deleted since it was saved stays out.
      indexMessages(slice.filter((m) => live[m.id]));
      await new Promise((r) => setTimeout(r, 0));
    }, 500);
  } catch (e) {
    console.warn('Search index not fully built', e);
  }
}
