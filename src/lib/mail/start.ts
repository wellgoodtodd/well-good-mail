// Starting up: loading the cache (a pop out loads only its own conversation), then syncing and the regular jobs.
import { store } from '../db';
import { bodyOf, carriesBody, listOnly, rememberBody } from '../bodyCache';
import { settings } from '../settings';
import { isTauri } from '../platform';
import type { Folder, Message } from '../types';
import { makeProvider, startDemo } from './accounts';
import { keepDraftSource } from './bodies';
import { lastEventsRefresh, refreshEvents } from './calendar';
import { refreshAccountPhotos, refreshContacts } from './contacts';
import { eachStoredSlice, indexStoredMail, updateUnreadBadge } from './messages';
import { notYetSent } from './outbox';
import { providers, useMail } from './store';
import { refreshAll } from './sync';
import { minuteTick, restartPolling, startMinuteTick } from './timers';

const get = useMail.getState;
const set = useMail.setState;

let initStarted = false;
/** The mail a pop out window needs: just its conversation, not the whole cache. */
async function popoutMessages(route: string): Promise<Message[]> {
  const [kind, ...rest] = route.split('/');
  const id = decodeURIComponent(rest.join('/'));
  if (kind === 'compose') {
    const d = await store.getDraft(id);
    const src = d?.sourceMessageId ? await store.getMessage(d.sourceMessageId) : undefined;
    return src ? store.threadMessages(src.accountId, src.threadId) : [];
  }
  const cut = id.indexOf('|');
  return cut > 0 ? store.threadMessages(id.slice(0, cut), id.slice(cut + 1)) : [];
}

export async function initMail(opts: { popout?: boolean; route?: string } = {}) {
  if (initStarted) return;
  initStarted = true;
  // A pop out window (a reply, a draft, one email) only loads its own conversation, so it opens at once.
  // The main window shows the last month first; everything older follows straight after, in the background.
  const RECENT = 31 * 86400000;
  const loadMessages = opts.popout && opts.route ? popoutMessages(opts.route).catch(() => store.messages()) : store.messagesSince(Date.now() - RECENT).catch(() => store.messages());
  const [accounts, folders, messages, outbox, snoozes, followups, events, dismissed, contacts] = await Promise.all([
    store.accounts(), store.folders(), loadMessages, store.outbox().then(notYetSent), store.snoozes(), store.followups(), store.events(), store.dismissed(), store.contacts(),
  ]);
  accounts.sort((a, b) => a.order - b.order);
  // A sync that was running when the app last closed is not running now, so don't show it as syncing.
  accounts.forEach((a) => { if (a.status === 'syncing') { a.status = 'ok'; a.syncDone = undefined; store.putAccount(a); } });
  accounts.forEach((a) => providers.set(a.id, makeProvider(a)));
  const byAcc: Record<string, Folder[]> = {};
  folders.forEach((f) => (byAcc[f.accountId] ||= []).push(f));
  for (const [id, list] of Object.entries(byAcc)) providers.get(id)?.hydrate?.(list);
  const map: Record<string, Message> = {};
  const live = new Set(accounts.map((a) => a.id));
  messages.forEach((m) => {
    if (!live.has(m.accountId)) return;
    map[m.id] = listOnly(m);
    // A pop out shows one conversation: keep its bodies at hand, as they are about to be read.
    if (opts.popout && m.bodyLoaded && carriesBody(m)) rememberBody(m.id, bodyOf(m));
  });
  for (const k of Object.keys(byAcc)) if (!live.has(k)) delete byAcc[k];
  set({ ready: true, accounts, folders: byAcc, messages: map, outbox, snoozes, followups, events, dismissed, contacts });

  if (opts.popout) {
    if (opts.route?.startsWith('compose/')) void keepDraftSource(decodeURIComponent(opts.route.slice('compose/'.length)));
    updateUnreadBadge();
    return;
  }

  // The rest of the cache, then the search index, without holding up the first screen. Both read the cache a slice
  // at a time, keeping list details only, so the bodies of the whole mailbox are never in memory at once.
  await new Promise((r) => setTimeout(r, 50));
  try {
    const merged: Record<string, Message> = { ...get().messages };
    const liveNow = new Set(get().accounts.map((a) => a.id));
    await eachStoredSlice((slice) => { for (const m of slice) if (!(m.id in merged) && liveNow.has(m.accountId)) merged[m.id] = listOnly(m); }, 2000);
    // Anything that changed while the slices were read wins over the saved copy.
    set({ messages: { ...merged, ...get().messages } });
  } catch (e) {
    console.warn('Loading older mail failed', e);
  }
  void indexStoredMail();
  updateUnreadBadge();

  // The browser preview can open straight into demo mode with ?demo=1 (used for the README screenshots).
  const demoLink = !isTauri() && typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
  if (!accounts.length && (settings().demoMode || demoLink)) await startDemo();

  window.addEventListener('online', () => { set({ online: true }); refreshAll(); });
  window.addEventListener('offline', () => set({ online: false }));
  restartPolling();
  startMinuteTick();
  // Catch up on anything that came due while the app was closed.
  minuteTick();
  refreshAll();
  setTimeout(refreshEvents, 3000);
  // Tasks load a little after the calendar, so tasks with a time can alert even before Tasks is opened.
  setTimeout(() => { if (get().accounts.length) void import('../tasks').then((t) => t.startTasks()); }, 6000);
  setTimeout(refreshAccountPhotos, 4000);
  // Every few minutes, so a meeting added at the last minute still gets its notification and banner. Every minute
  // while Calendar & Reminders is open, and on coming back to the window, so changes made on a phone show soon.
  setInterval(() => { if (get().screen !== 'reminders' || Date.now() - lastEventsRefresh() > 170000) void refreshEvents(); }, 3 * 60 * 1000);
  setInterval(() => { if (get().screen === 'reminders' && document.visibilityState === 'visible' && Date.now() - lastEventsRefresh() > 55000) void refreshEvents(); }, 60 * 1000);
  window.addEventListener('focus', () => { if (Date.now() - lastEventsRefresh() > 45000) void refreshEvents(); });
  setInterval(refreshContacts, 12 * 60 * 60 * 1000);
}
