// The outbox: undo send, send later and scheduled sending (with Windows waking the app), and pop out windows.
import { store } from '../db';
import { settings } from '../settings';
import { threadKey } from '../mailbox';
import { isPopout, isTauri, openPopout, invoke } from '../platform';
import type { Draft, OutboxItem } from '../types';
import { broadcast, errorToast, toast, useMail } from './store';

const get = useMail.getState;
const set = useMail.setState;

// Emails that have gone, remembered apart from the outbox store, so one whose outbox entry couldn't be cleared is never sent again.
const SENT_KEY = 'wgm-sent-outbox';
function sentIds(): string[] {
  try { const l = JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
function markSent(id: string) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...sentIds().filter((x) => x !== id), id].slice(-100))); } catch { /* best effort */ }
}
/** The outbox without anything already sent, clearing those leftovers as it goes. */
export function notYetSent(list: OutboxItem[]): OutboxItem[] {
  const gone = new Set(sentIds());
  for (const o of list) if (gone.has(o.id)) void store.deleteOutbox(o.id).catch(() => undefined);
  return list.filter((o) => !gone.has(o.id));
}

let sendImpl: ((item: OutboxItem) => Promise<void>) | undefined;
/** The composer module registers the real send function (avoids a circular import). */
export function registerSender(fn: (item: OutboxItem) => Promise<void>) {
  sendImpl = fn;
}

/** Local time as Windows wants it for a scheduled task: "2026-11-10T00:05:00". */
const localIso = (t: number) => { const d = new Date(t); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; };
/** Asks Windows to start Well Good Mail at a scheduled email's time, if that's switched on. */
function wakeFor(item: OutboxItem) {
  if (!isTauri() || item.kind !== 'scheduled' || !settings().wakeToSend) return;
  void invoke('schedule_wake', { id: item.id, at: localIso(item.sendAt) }).catch((e) => console.warn('Wake-up not set', e));
}
function unwake(id: string) {
  if (!isTauri()) return;
  void invoke('cancel_wake', { id }).catch(() => undefined);
}
/** After the setting changes: every scheduled email gets a wake-up, or none does. */
export function syncWakes() {
  for (const o of get().outbox) { if (o.kind === 'scheduled') { if (settings().wakeToSend) wakeFor(o); else unwake(o.id); } }
}

/** A scheduled email goes at a different time. */
export async function rescheduleSend(id: string, at: number) {
  const item = get().outbox.find((o) => o.id === id);
  if (!item) return;
  const next: OutboxItem = { ...item, sendAt: at, kind: 'scheduled' };
  await store.putOutbox(next);
  set({ outbox: get().outbox.map((o) => (o.id === id ? next : o)) });
  wakeFor(next);
  toast({ text: `Now scheduled for ${new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` });
}

export async function queueSend(draft: Draft, opts: { sendAt?: number } = {}) {
  const undo = settings().undoSendSeconds;
  const scheduled = Boolean(opts.sendAt && opts.sendAt > Date.now() + 30000);
  const item: OutboxItem = {
    id: draft.id,
    draft,
    sendAt: scheduled ? opts.sendAt! : Date.now() + undo * 1000,
    kind: scheduled ? 'scheduled' : 'undo',
  };
  await store.putOutbox(item);
  await store.deleteDraft(draft.id);
  wakeFor(item);
  if (isPopout()) {
    // The main window does the actual sending, so closing this window is fine.
    broadcast({ type: 'outbox-changed', id: item.id });
    return;
  }
  announceQueued(item);
  set({ outbox: [...get().outbox.filter((o) => o.id !== item.id), item], inlineDraftId: get().inlineDraftId === draft.id ? undefined : get().inlineDraftId });
}

/** Shows the Sending / Undo message and sets the send timer. */
export function announceQueued(item: OutboxItem) {
  const remaining = Math.max(0, item.sendAt - Date.now());
  if (item.kind === 'scheduled') {
    toast({ text: `Scheduled for ${new Date(item.sendAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, undo: () => cancelSend(item.id) });
  } else if (remaining > 0) {
    toast({ text: 'Sending...', undo: () => cancelSend(item.id), ttl: remaining });
    setTimeout(() => flushOutbox(), remaining + 50);
  } else {
    flushOutbox();
  }
}

/** Main window: a pop out queued something. */
export async function adoptOutboxItem(id: string) {
  const outbox = notYetSent(await store.outbox());
  set({ outbox });
  const item = outbox.find((o) => o.id === id);
  if (item) announceQueued(item);
}

/** Takes an email out of the outbox without touching any copy being edited (for "Back to drafts" from the editor). */
export async function unschedule(id: string) {
  await store.deleteOutbox(id);
  set({ outbox: get().outbox.filter((o) => o.id !== id) });
  unwake(id);
}

/**
 * Opens a scheduled email in the editor and keeps it scheduled: the outbox still has it (so it goes on time if you
 * leave it), and Keep scheduled in the editor saves your changes over it, at the same time.
 */
export async function editScheduled(id: string) {
  const item = get().outbox.find((o) => o.id === id);
  if (!item) return;
  const draft = { ...item.draft, sendAt: undefined, scheduledAt: item.sendAt };
  await store.putDraft(draft);
  const source = draft.sourceMessageId ? get().messages[draft.sourceMessageId] : undefined;
  if (source && !settings().popOutCompose) {
    set({ screen: 'mail', selectedKey: threadKey(source), selectedKeys: [threadKey(source)], inlineDraftId: draft.id });
  } else if (!(await openPopout(`compose/${draft.id}`, draft.subject || 'Email'))) {
    set({ screen: 'mail', selectedKey: undefined, selectedKeys: [], inlineDraftId: draft.id });
  }
}

export async function cancelSend(id: string, opts: { reopen?: boolean } = {}) {
  const item = get().outbox.find((o) => o.id === id);
  if (!item) return;
  await store.deleteOutbox(id);
  set({ outbox: get().outbox.filter((o) => o.id !== id) });
  unwake(id);
  const draft = { ...item.draft, sendAt: undefined };
  await store.putDraft(draft);
  if (opts.reopen === false) {
    toast({ text: 'Not sending it. It\'s back in your drafts.', ttl: 3000 });
    return;
  }
  const source = draft.sourceMessageId ? get().messages[draft.sourceMessageId] : undefined;
  if (source && !settings().popOutCompose) {
    set({ screen: 'mail', selectedKey: threadKey(source), selectedKeys: [threadKey(source)], inlineDraftId: draft.id });
  } else if (!(await openPopout(`compose/${draft.id}`, draft.subject || 'Email'))) {
    set({ screen: 'mail', selectedKey: undefined, selectedKeys: [], inlineDraftId: draft.id });
  }
  toast({ text: 'Sending cancelled. Your email is open again.' });
}

const flushing = new Set<string>();
export async function flushOutbox() {
  if (!sendImpl || !get().online) return;
  const due = get().outbox.filter((o) => o.sendAt <= Date.now() && !flushing.has(o.id));
  for (const item of due) {
    flushing.add(item.id);
    let sent = false;
    try {
      await sendImpl(item);
      sent = true;
      markSent(item.id);
      // Sent: whatever happens while tidying up, it must never be sent again.
      set({ outbox: get().outbox.filter((o) => o.id !== item.id) });
      await store.deleteOutbox(item.id).catch((e) => console.warn('Could not clear a sent email from the outbox', e));
      if (item.kind === 'scheduled') unwake(item.id);
      set({ outbox: get().outbox.filter((o) => o.id !== item.id) });
      toast({ text: item.kind === 'scheduled' ? `Scheduled email sent: ${item.draft.subject || '(no subject)'}` : 'Sent', ttl: 3000 });
    } catch (e) {
      if (sent) continue;
      errorToast(e, 'Send failed, it will retry');
      // Retry in a minute.
      const retry = { ...item, sendAt: Date.now() + 60000 };
      await store.putOutbox(retry);
      set({ outbox: get().outbox.map((o) => (o.id === item.id ? retry : o)) });
    } finally {
      flushing.delete(item.id);
    }
  }
}
