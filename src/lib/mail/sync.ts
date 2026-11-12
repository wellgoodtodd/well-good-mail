// Syncing each account with its server, and what happens to newly arrived mail (rules and alerts).
import { store } from '../db';
import { settings, isQuietNow } from '../settings';
import { inSystemFolder, threadKey } from '../mailbox';
import { showBanner } from '../banners';
import { notify, flashTaskbar, isPopout, isTauri } from '../platform';
import { myAddresses } from '../compose';
import type { Message } from '../types';
import { archive, markRead, markSpam, processFollowups } from './actions';
import { warmBodies } from './bodies';
import { patchMessages, putMessages, removeMessages } from './messages';
import { providers, saveAccount, useMail } from './store';
import { selectThread, setView } from './views';

const get = useMail.getState;
const set = useMail.setState;

const syncingNow = new Set<string>();
/** Accounts whose running sync should stop at the next batch, and start again from scratch. */
const restartWanted = new Set<string>();
class SyncStopped extends Error {}

/** When the person last clicked or typed, so a big sync can ease off while they are using the app. */
let lastInputAt = 0;
if (typeof window !== 'undefined') {
  const mark = () => { lastInputAt = Date.now(); };
  window.addEventListener('pointerdown', mark, true);
  window.addEventListener('keydown', mark, true);
  window.addEventListener('wheel', mark, { capture: true, passive: true });
}
/** Between batches of a big sync: give the screen a turn, and a longer one while the person is busy. */
const breathe = () => new Promise<void>((r) => setTimeout(r, Date.now() - lastInputAt < 3000 ? 600 : 0));

/** True while this account is really being synced right now. */
export const isSyncing = (id: string) => syncingNow.has(id);

/** A full sync from scratch, stopping one that is already running (for example after the range changes). */
export function restartSync(id: string) {
  if (syncingNow.has(id)) restartWanted.add(id);
  else void syncAccount(id, { full: true });
}

export async function syncAccount(id: string, opts: { full?: boolean; quiet?: boolean } = {}) {
  if (syncingNow.has(id)) return;
  const provider = providers.get(id);
  let account = get().accounts.find((a) => a.id === id);
  if (!provider || !account) return;
  syncingNow.add(id);
  set({ syncing: true });
  const startedAt = Date.now();
  const before = new Set(Object.keys(get().messages));
  const newOnes: Message[] = [];
  try {
    if (opts.full || !account.syncCursor) {
      // Clear any old error straight away so the accounts list shows this attempt, not the last one.
      account = { ...account, status: 'syncing', error: undefined, syncDone: 0 };
      saveAccount(account);
      const [folders, aliases] = await Promise.all([provider.listFolders(), provider.listAliases()]);
      set({ folders: { ...get().folders, [id]: folders } });
      store.putFolders(id, folders);
      account = { ...account, aliases };
      saveAccount(account);
      // Each email counts once, even when it arrives twice (first the summary, then the full text).
      const counted = new Set<string>();
      const { cursor } = await provider.fullSync(
        account.retentionDays,
        async (batch) => {
          if (restartWanted.has(id)) throw new SyncStopped();
          putMessages(batch, true);
          await breathe();
          let fresh = 0;
          for (const m of batch) if (!counted.has(m.id)) { counted.add(m.id); fresh++; }
          const done = (get().accounts.find((a) => a.id === id)?.syncDone || 0) + fresh;
          set({ accounts: get().accounts.map((x) => (x.id === id ? { ...x, syncDone: done } : x)) });
        },
        // A first sync that was cut short keeps what it already fetched.
        opts.full && account.syncCursor ? undefined : (providerId) => Boolean(get().messages[`${id}|${providerId}`]),
      );
      account = { ...get().accounts.find((a) => a.id === id)!, syncCursor: cursor, lastSync: Date.now(), status: 'ok', error: undefined, syncDone: undefined };
      saveAccount(account);
    } else {
      const r = await provider.incrementalSync(account.syncCursor);
      if (r.resetNeeded) {
        syncingNow.delete(id);
        return syncAccount(id, { full: true, quiet: true });
      }
      putMessages(r.upserted, true);
      r.upserted.forEach((m) => { if (!before.has(m.id)) newOnes.push(get().messages[m.id]); });
      if (r.labelChanges.length) {
        const map = new Map(r.labelChanges.map((c) => [c.id, c.labels]));
        patchMessages([...map.keys()], (m) => {
          const labels = map.get(m.id)!;
          return { ...m, labels, unread: labels.includes('UNREAD'), flagged: labels.includes('STARRED') || labels.includes('FLAGGED') };
        }, true);
      }
      if (r.deleted.length) removeMessages(r.deleted, true);
      account = { ...get().accounts.find((a) => a.id === id)!, syncCursor: r.cursor || account.syncCursor, lastSync: Date.now(), status: 'ok', error: undefined };
      saveAccount(account);
      // Folder list (labels) changes rarely; refresh every so often.
      if (Math.random() < 0.05) provider.listFolders().then((folders) => { set({ folders: { ...get().folders, [id]: folders } }); store.putFolders(id, folders); }).catch(() => {});
    }
    applyRulesToNew(newOnes);
    warmBodies(newOnes.filter(Boolean).map((m) => m.id));
    if (!opts.quiet) notifyNewMail(newOnes.filter((m) => m.date > startedAt - 10 * 60000));
  } catch (e) {
    if (e instanceof SyncStopped) {
      // Stopped on purpose; the fresh sync below takes over.
    } else {
      const needs = (e as { needsSignIn?: boolean }).needsSignIn;
      saveAccount({ ...get().accounts.find((a) => a.id === id)!, status: needs ? 'needs-signin' : 'error', error: e instanceof Error ? e.message : String(e), syncDone: undefined });
      if (!opts.quiet && !needs && navigator.onLine) console.warn('Sync failed', id, e);
    }
  } finally {
    syncingNow.delete(id);
    set({ syncing: syncingNow.size > 0, lastSyncAt: Date.now() });
    if (restartWanted.delete(id)) void syncAccount(id, { full: true });
  }
}

export async function refreshAll() {
  if (!get().online) return;
  await Promise.all(get().accounts.map((a) => syncAccount(a.id)));
  processFollowups();
}

/** Mute and other automatic handling for newly arrived mail. */
function applyRulesToNew(msgs: Message[]) {
  const blocked = new Set(settings().blockedSenders);
  const unwanted = msgs.filter((m) => blocked.has(m.from.email.toLowerCase()) && !inSystemFolder(m, 'junk', providers.get(m.accountId)));
  if (unwanted.length) {
    const ids = unwanted.map((m) => m.id);
    markSpam(ids, true, { silent: true });
    markRead(ids, true);
  }
  const muted = new Set(settings().mutedThreads);
  const toArchive = msgs.filter((m) => muted.has(threadKey(m).toLowerCase()) || muted.has(threadKey(m)));
  if (toArchive.length) archive(toArchive.map((m) => m.id), { silent: true, markRead: true });
}

function notifyNewMail(msgs: Message[]) {
  const s = settings();
  if (s.newMailAlerts === 'off' || isQuietNow(s)) return;
  if (s.oooActive?.pauseAlerts && s.oooActive.start <= Date.now() && (!s.oooActive.end || s.oooActive.end > Date.now())) return;
  const mine = myAddresses(get().accounts);
  const vips = new Set(s.vips);
  const candidates = msgs.filter((m) => {
    const acc = get().accounts.find((a) => a.id === m.accountId);
    if (!acc || acc.notify === 'off') return false;
    if (s.blockedSenders.includes(m.from.email.toLowerCase())) return false;
    if (!m.unread || mine.has(m.from.email.toLowerCase())) return false;
    if (!inSystemFolder(m, 'inbox', providers.get(m.accountId))) return false;
    const important = vips.has(m.from.email.toLowerCase());
    if (s.newMailAlerts === 'important' || acc.notify === 'important') return important;
    return true;
  });
  if (!candidates.length) return;
  // With the app open and in front of you, a small banner inside the app is gentler than a Windows pop-up.
  const inFront = typeof document !== 'undefined' && document.hasFocus() && !document.hidden;
  if (inFront && s.appOpenAlerts !== 'windows') {
    if (s.appOpenAlerts === 'off') return;
    const open = (m?: Message) => {
      setView({ scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } });
      if (m) selectThread(threadKey(m));
    };
    if (candidates.length > 3) showBanner({ title: 'Well Good Mail', body: `${candidates.length} new emails`, run: () => open() });
    else candidates.forEach((m) => showBanner({ title: m.from.name || m.from.email, body: m.subject, run: () => open(m) }));
    return;
  }
  if (s.flashTaskbar) flashTaskbar();
  if (candidates.length > 3) {
    notify('Well Good Mail', `${candidates.length} new emails`);
  } else {
    candidates.forEach((m) => notify(m.from.name || m.from.email, m.subject));
  }
}

// iCloud and other IMAP accounts: the Inbox watcher says something changed, so that account syncs now (a short wait
// gathers the few signals a single new email brings).
const imapNudges = new Map<string, ReturnType<typeof setTimeout>>();
if (isTauri() && !isPopout()) {
  void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('imap-changed', (e) => {
    const id = e.payload;
    clearTimeout(imapNudges.get(id));
    imapNudges.set(id, setTimeout(() => { imapNudges.delete(id); void syncAccount(id); }, 2000));
  })).catch(() => undefined);
}
