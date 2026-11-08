// The app's live state: accounts, messages, what's selected, and every mail
// action (archive, delete, send...). Syncing with providers happens here.
import { create } from 'zustand';
import { store } from './db';
import { settings, useSettings, isQuietNow } from './settings';
import { GmailProvider } from './providers/gmail';
import { MicrosoftProvider } from './providers/microsoft';
import { ImapProvider } from './providers/imap';
import { openImapGuide } from './guide';
import { record, undoEntry } from './history';
import { removeImapPassword, saveImapPassword, testImap, type ImapSettings } from './auth/imap';
import { DemoProvider, DEMO_ACCOUNTS, resetDemo } from './providers/demo';
import type { MailProvider } from './providers/provider';
import { buildReply, RSVP_WORDS, whichIsMe, type Invite, type Rsvp } from './invites';
import { signInWithGoogle, signOutGoogle } from './auth/google';
import { signInWithMicrosoft, signOutMicrosoft } from './auth/microsoft';
import { indexMessages, rebuildIndex, removeFromIndex, searchMessages, toGmailQuery } from './search';
import { inSystemFolder, threadKey } from './mailbox';
import { showBanner } from './banners';
import { notify, flashTaskbar, setUnreadCount, openExternal, httpFetch, isPopout, isTauri, openPopout } from './platform';
import { myAddresses } from './compose';
import { bytesToBase64 } from './mime';
import { paletteById, colourFor } from './palettes';
import type { Account, Address, CalendarEvent, Draft, EventGuest, Folder, FollowUp, MailboxRef, Message, OutboxItem, Snooze, SystemFolder, View } from './types';

const providers = new Map<string, MailProvider>();
export const providerFor = (accountId: string) => providers.get(accountId);

function makeProvider(a: Account): MailProvider {
  switch (a.kind) {
    case 'gmail': return new GmailProvider(a);
    case 'microsoft': return new MicrosoftProvider(a);
    case 'imap': {
      // After a move, the list is brought up to date with the server straight away, because moved emails get new numbers there.
      const p = new ImapProvider(a, () => Object.values(get().messages));
      p.onChanged = () => { syncAccount(a.id, { quiet: true }); };
      return p;
    }
    case 'demo': return new DemoProvider(a);
    default: throw new Error(`${a.kind} accounts aren't supported yet`);
  }
}

export interface Toast {
  id: string;
  text: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
  ttl?: number;
}

interface MailState {
  ready: boolean;
  accounts: Account[];
  folders: Record<string, Folder[]>;
  messages: Record<string, Message>;
  view: View;
  /** Selected list row: the thread key of the selected conversation. */
  selectedKey?: string;
  selectedKeys: string[];
  searchQuery: string;
  remoteResults: Message[];
  searching: boolean;
  syncing: boolean;
  lastSyncAt?: number;
  outbox: OutboxItem[];
  snoozes: Snooze[];
  followups: FollowUp[];
  events: CalendarEvent[];
  /** Why an account's calendar did not load, by account id. */
  calendarErrors: Record<string, string>;
  /** The calendars each account has, even ones with nothing coming up. */
  calendarNames: Record<string, string[]>;
  dismissed: Set<string>;
  contacts: Address[];
  toasts: Toast[];
  /** Draft open inline in the reading pane. */
  inlineDraftId?: string;
  screen: 'mail' | 'reminders' | 'settings' | 'help' | 'aidrafts';
  settingsTab: string;
  online: boolean;
  filters: ListFilters;
}

export interface ListFilters {
  unread: boolean;
  flagged: boolean;
  attachments: boolean;
  vip: boolean;
  toMe: boolean;
  period: 'any' | 'today' | 'week' | 'month';
  /** Limit a combined view to some accounts ([] = all). */
  accountIds: string[];
}

export const NO_FILTERS: ListFilters = { unread: false, flagged: false, attachments: false, vip: false, toMe: false, period: 'any', accountIds: [] };

export function setFilters(patch: Partial<ListFilters>) {
  set({ filters: { ...get().filters, ...patch } });
}

export const activeFilterCount = (f: ListFilters) =>
  [f.unread, f.flagged, f.attachments, f.vip, f.toMe, f.period !== 'any', f.accountIds.length > 0].filter(Boolean).length;

export const useMail = create<MailState>(() => ({
  ready: false,
  accounts: [],
  folders: {},
  messages: {},
  view: { scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } },
  selectedKeys: [],
  searchQuery: '',
  remoteResults: [],
  searching: false,
  syncing: false,
  outbox: [],
  snoozes: [],
  followups: [],
  events: [],
  calendarErrors: {},
  calendarNames: {},
  dismissed: new Set(),
  contacts: [],
  toasts: [],
  screen: 'mail',
  settingsTab: 'accounts',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  filters: NO_FILTERS,
}));

const get = useMail.getState;
const set = useMail.setState;

// ---------- toasts ----------

export function toast(t: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  set({ toasts: [...get().toasts, { ...t, id }] });
  setTimeout(() => dismissToast(id), t.ttl ?? 6000);
  return id;
}
export const dismissToast = (id: string) => set({ toasts: get().toasts.filter((t) => t.id !== id) });

function errorToast(e: unknown, prefix = '') {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e);
  toast({ text: prefix ? `${prefix}: ${msg}` : msg, ttl: 9000 });
}

// ---------- local state helpers ----------

function putMessages(msgs: Message[]) {
  if (!msgs.length) return;
  const next = { ...get().messages };
  for (const m of msgs) {
    const prev = next[m.id];
    // Keep bodies we already downloaded when an update arrives without one.
    next[m.id] = prev && prev.bodyLoaded && !m.bodyLoaded
      ? { ...m, bodyHtml: prev.bodyHtml, bodyText: prev.bodyText, attachments: prev.attachments, hasAttachments: prev.hasAttachments, bodyLoaded: true }
      : m;
  }
  set({ messages: next });
  const merged = msgs.map((m) => next[m.id]);
  indexMessages(merged);
  store.putMessages(merged);
  updateUnreadBadge();
}

/** Adds a large batch of messages (a cache import) a slice at a time so the window stays responsive. */
export async function importMessages(msgs: Message[]) {
  for (let i = 0; i < msgs.length; i += 500) {
    putMessages(msgs.slice(i, i + 500));
    await new Promise((r) => setTimeout(r, 0));
  }
}

function patchMessages(ids: string[], patch: (m: Message) => Message) {
  const next = { ...get().messages };
  const changed: Message[] = [];
  for (const id of ids) {
    if (next[id]) {
      next[id] = patch(next[id]);
      changed.push(next[id]);
    }
  }
  set({ messages: next });
  store.putMessages(changed).then(() => { if (isPopout()) broadcast({ type: 'messages-changed' }); });
  updateUnreadBadge();
}

/** Main window: pick up changes a pop out window made. */
export async function reloadMessagesFromDb() {
  const all = await store.messages();
  const map: Record<string, Message> = {};
  all.forEach((m) => (map[m.id] = m));
  set({ messages: map });
  updateUnreadBadge();
}

function removeMessages(ids: string[]) {
  const next = { ...get().messages };
  ids.forEach((id) => delete next[id]);
  set({ messages: next });
  removeFromIndex(ids);
  store.deleteMessages(ids);
}

function updateUnreadBadge() {
  let n = 0;
  const leftOut = new Set(get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id));
  for (const m of Object.values(get().messages)) {
    if (m.unread && !leftOut.has(m.accountId) && inSystemFolder(m, 'inbox', providers.get(m.accountId))) n++;
  }
  setUnreadCount(n);
}

function saveAccount(a: Account) {
  set({ accounts: get().accounts.map((x) => (x.id === a.id ? a : x)) });
  store.putAccount(a);
}

// ---------- start up ----------

let pollTimer: ReturnType<typeof setInterval> | undefined;
let minuteTimer: ReturnType<typeof setInterval> | undefined;

let initStarted = false;
export async function initMail(opts: { popout?: boolean } = {}) {
  if (initStarted) return;
  initStarted = true;
  const [accounts, folders, messages, outbox, snoozes, followups, events, dismissed, contacts] = await Promise.all([
    store.accounts(), store.folders(), store.messages(), store.outbox(), store.snoozes(), store.followups(), store.events(), store.dismissed(), store.contacts(),
  ]);
  accounts.sort((a, b) => a.order - b.order);
  // A sync that was running when the app last closed is not running now, so don't show it as syncing.
  accounts.forEach((a) => { if (a.status === 'syncing') { a.status = 'ok'; a.syncDone = undefined; store.putAccount(a); } });
  accounts.forEach((a) => providers.set(a.id, makeProvider(a)));
  const byAcc: Record<string, Folder[]> = {};
  folders.forEach((f) => (byAcc[f.accountId] ||= []).push(f));
  for (const [id, list] of Object.entries(byAcc)) providers.get(id)?.hydrate?.(list);
  const map: Record<string, Message> = {};
  messages.forEach((m) => (map[m.id] = m));
  rebuildIndex(messages);
  set({ ready: true, accounts, folders: byAcc, messages: map, outbox, snoozes, followups, events, dismissed, contacts });
  updateUnreadBadge();

  if (opts.popout) return;

  // The browser preview can open straight into demo mode with ?demo=1 (used for the README screenshots).
  const demoLink = !isTauri() && typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
  if (!accounts.length && (settings().demoMode || demoLink)) await startDemo();

  window.addEventListener('online', () => { set({ online: true }); refreshAll(); });
  window.addEventListener('offline', () => set({ online: false }));
  restartPolling();
  minuteTimer = setInterval(minuteTick, 30000);
  // Catch up on anything that came due while the app was closed.
  minuteTick();
  refreshAll();
  setTimeout(refreshEvents, 3000);
  setTimeout(refreshAccountPhotos, 4000);
  // Every few minutes, so a meeting added at the last minute still gets its notification and banner.
  setInterval(refreshEvents, 3 * 60 * 1000);
  setInterval(refreshContacts, 12 * 60 * 60 * 1000);
}

export function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshAll(), Math.max(15, settings().pollSeconds) * 1000);
}

export function stopTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (minuteTimer) clearInterval(minuteTimer);
}

// ---------- accounts ----------

const paletteColours = () => paletteById(settings().palette).colours;

/** Recolours every account from a palette, in sidebar order. */
export function applyPalette(id: string) {
  useSettings.getState().set({ palette: id });
  const colours = paletteById(id).colours;
  [...get().accounts].sort((a, b) => a.order - b.order).forEach((a, i) => updateAccount(a.id, { colour: colourFor(colours, i) }));
}

async function addAccount(kind: Account['kind'], email: string, displayName: string, extra: Partial<Account> = {}) {
  const existing = get().accounts.find((a) => a.email === email && a.kind === kind);
  if (existing) {
    saveAccount({ ...existing, status: 'ok', error: undefined });
    toast({ text: `${email} is signed in again` });
    syncAccount(existing.id);
    return existing;
  }
  const order = get().accounts.length;
  const account: Account = {
    id: `${kind}-${email}`,
    kind,
    email,
    label: email.split('@')[0],
    displayName,
    colour: colourFor(paletteColours(), order),
    aliases: [],
    order,
    status: 'syncing',
    retentionDays: settings().defaultRetentionDays,
    notify: 'all',
    ...extra,
  };
  providers.set(account.id, makeProvider(account));
  set({ accounts: [...get().accounts, account] });
  await store.putAccount(account);
  if (!settings().defaultFromEmail) useSettings.getState().set({ defaultFromEmail: email });
  await syncAccount(account.id, { full: true });
  refreshContacts();
  refreshEvents();
  return account;
}

export async function addGoogleAccount() {
  try {
    const { email, name } = await signInWithGoogle();
    toast({ text: `Signed in as ${email}. Downloading mail...` });
    await addAccount('gmail', email, name);
  } catch (e) {
    errorToast(e, 'Couldn\'t add account');
  }
}

/** Like addGoogleAccount, but throws on failure so the setup guide can show what went wrong. Returns the email. */
export async function addGoogleAccountStrict(): Promise<string> {
  const { email, name } = await signInWithGoogle();
  await addAccount('gmail', email, name);
  return email;
}

/** Like addMicrosoftAccount, but throws on failure so the setup guide can show what went wrong. Returns the email. */
export async function addMicrosoftAccountStrict(): Promise<string> {
  const { email, name } = await signInWithMicrosoft();
  await addAccount('microsoft', email, name);
  return email;
}

/**
 * Adds (or, with a new password, reconnects) an account that uses IMAP, such as iCloud. The password is checked
 * against the server first, so a wrong one is reported here rather than after the account is added.
 */
export async function addImapAccountStrict(settings: ImapSettings, email: string, password: string, name: string): Promise<void> {
  await testImap(settings, password);
  await saveImapPassword(email, password);
  const existing = get().accounts.find((a) => a.kind === 'imap' && a.email === email);
  if (existing) providers.set(existing.id, makeProvider({ ...existing, imap: settings }));
  await addAccount('imap', email, name, { imap: settings });
}

export async function addMicrosoftAccount() {
  try {
    const { email, name } = await signInWithMicrosoft();
    await addAccount('microsoft', email, name);
  } catch (e) {
    errorToast(e, 'Couldn\'t add account');
  }
}

export async function reconnectAccount(id: string) {
  const a = get().accounts.find((x) => x.id === id);
  if (!a) return;
  try {
    if (a.kind === 'gmail') await signInWithGoogle(a.email);
    if (a.kind === 'microsoft') await signInWithMicrosoft();
    if (a.kind === 'imap') {
      // No web sign in here: the person enters a new app password in the guide, which reconnects the account itself.
      openImapGuide(a.email);
      return;
    }
    saveAccount({ ...a, status: 'ok', error: undefined });
    syncAccount(id);
  } catch (e) {
    errorToast(e, 'Sign in failed');
  }
}

export async function removeAccount(id: string) {
  const a = get().accounts.find((x) => x.id === id);
  if (!a) return;
  if (a.kind === 'gmail') await signOutGoogle(a.email);
  if (a.kind === 'microsoft') await signOutMicrosoft(a.email);
  if (a.kind === 'imap') await removeImapPassword(a.email).catch(() => {});
  providers.delete(id);
  await store.deleteAccount(id);
  const messages = Object.fromEntries(Object.entries(get().messages).filter(([, m]) => m.accountId !== id));
  const folders = { ...get().folders };
  delete folders[id];
  rebuildIndex(Object.values(messages));
  set({ accounts: get().accounts.filter((x) => x.id !== id), messages, folders, view: { scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } } });
  const s = settings();
  useSettings.getState().set({ groups: s.groups.map((g) => ({ ...g, accountIds: g.accountIds.filter((x) => x !== id) })) });
  updateUnreadBadge();
}

export function updateAccount(id: string, patch: Partial<Account>) {
  const a = get().accounts.find((x) => x.id === id);
  if (a) saveAccount({ ...a, ...patch });
}

/** Keeps an account's mail out of All Inboxes (or puts it back). It stays in the sidebar on its own. */
export function setLeaveOutOfAll(id: string, on: boolean) {
  updateAccount(id, { leaveOutOfAll: on });
  updateUnreadBadge();
}

export function reorderAccounts(ids: string[]) {
  const accounts = ids.map((id, i) => ({ ...get().accounts.find((a) => a.id === id)!, order: i }));
  set({ accounts });
  accounts.forEach((a) => store.putAccount(a));
}

export async function startDemo() {
  resetDemo();
  useSettings.getState().set({ demoMode: true, defaultFromEmail: 'alex@studio.example', vips: ['isla@glencorrie.example', 'mum@family.example'] });
  for (const [i, d] of DEMO_ACCOUNTS.entries()) {
    const account: Account = { ...d, order: i, status: 'ok', retentionDays: 365, notify: 'all' };
    providers.set(account.id, makeProvider(account));
    await store.putAccount(account);
  }
  set({ accounts: DEMO_ACCOUNTS.map((d, i) => ({ ...d, order: i, status: 'ok' as const, retentionDays: 365, notify: 'all' as const })) });
  useSettings.getState().set({
    groups: [{ id: 'grp-work', name: 'Work', accountIds: ['demo-wgm', 'demo-prompter'] }],
  });
  for (const a of get().accounts) await syncAccount(a.id, { full: true, quiet: true });
  await refreshEvents();
  await refreshContacts();
}

export async function leaveDemo() {
  stopTimers();
  for (const a of get().accounts.filter((x) => x.kind === 'demo')) {
    providers.delete(a.id);
    await store.deleteAccount(a.id);
  }
  await store.wipe();
  useSettings.getState().set({ demoMode: false, groups: [], vips: [], defaultFromEmail: '' });
  location.reload();
}

// ---------- syncing ----------

const syncingNow = new Set<string>();

/** True while this account is really being synced right now. */
export const isSyncing = (id: string) => syncingNow.has(id);

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
      const { cursor } = await provider.fullSync(
        account.retentionDays,
        async (batch) => {
          putMessages(batch);
          const done = (get().accounts.find((a) => a.id === id)?.syncDone || 0) + batch.length;
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
      putMessages(r.upserted);
      r.upserted.forEach((m) => { if (!before.has(m.id)) newOnes.push(get().messages[m.id]); });
      if (r.labelChanges.length) {
        const map = new Map(r.labelChanges.map((c) => [c.id, c.labels]));
        patchMessages([...map.keys()], (m) => {
          const labels = map.get(m.id)!;
          return { ...m, labels, unread: labels.includes('UNREAD'), flagged: labels.includes('STARRED') || labels.includes('FLAGGED') };
        });
      }
      if (r.deleted.length) removeMessages(r.deleted);
      account = { ...get().accounts.find((a) => a.id === id)!, syncCursor: r.cursor || account.syncCursor, lastSync: Date.now(), status: 'ok', error: undefined };
      saveAccount(account);
      // Folder list (labels) changes rarely; refresh every so often.
      if (Math.random() < 0.05) provider.listFolders().then((folders) => { set({ folders: { ...get().folders, [id]: folders } }); store.putFolders(id, folders); }).catch(() => {});
    }
    applyRulesToNew(newOnes);
    if (!opts.quiet) notifyNewMail(newOnes.filter((m) => m.date > startedAt - 10 * 60000));
  } catch (e) {
    const needs = (e as { needsSignIn?: boolean }).needsSignIn;
    saveAccount({ ...get().accounts.find((a) => a.id === id)!, status: needs ? 'needs-signin' : 'error', error: e instanceof Error ? e.message : String(e), syncDone: undefined });
    if (!opts.quiet && !needs && navigator.onLine) console.warn('Sync failed', id, e);
  } finally {
    syncingNow.delete(id);
    set({ syncing: syncingNow.size > 0, lastSyncAt: Date.now() });
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

// ---------- views & selection ----------

export function setView(view: View) {
  set({ view, selectedKey: undefined, selectedKeys: [], screen: 'mail', inlineDraftId: undefined });
}

export function selectThread(key: string | undefined, opts: { additive?: boolean; range?: string[] } = {}) {
  if (!key) return set({ selectedKey: undefined, selectedKeys: [] });
  if (opts.range) return set({ selectedKeys: opts.range, selectedKey: key });
  if (opts.additive) {
    const cur = get().selectedKeys;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    return set({ selectedKeys: next, selectedKey: key });
  }
  set({ selectedKey: key, selectedKeys: [key], inlineDraftId: undefined });
}

export function messagesInThread(key: string): Message[] {
  return Object.values(get().messages)
    .filter((m) => threadKey(m) === key)
    .sort((a, b) => a.date - b.date);
}

export function openScreen(screen: MailState['screen'], settingsTab?: string) {
  set({ screen, ...(settingsTab ? { settingsTab } : {}) });
}

// ---------- reading ----------

export async function loadBody(id: string): Promise<Message | undefined> {
  const m = get().messages[id];
  if (!m || m.bodyLoaded) return m;
  const p = providers.get(m.accountId);
  if (!p) return m;
  try {
    const body = await p.getBody(m);
    const updated: Message = { ...(get().messages[id] || m), bodyHtml: body.html, bodyText: body.text, attachments: body.attachments, hasAttachments: body.attachments.some((a) => !a.inline), bodyLoaded: true };
    putMessages([updated]);
    return updated;
  } catch (e) {
    errorToast(e, 'Couldn\'t load email');
    return m;
  }
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
    putMessages([{ ...(get().messages[id] || m), bodyHtml: body.html, bodyText: body.text, attachments: body.attachments, hasAttachments: body.attachments.some((a) => !a.inline), bodyLoaded: true }]);
  } catch { /* keep the saved copy */ }
}

// ---------- calendar invitations ----------

function inviteAddresses(accountId: string, m: Message): string[] {
  const a = get().accounts.find((x) => x.id === accountId);
  return [a?.email, ...(a?.aliases || []).map((x) => x.email), m.deliveredTo, ...m.to.map((x) => x.email)].filter(Boolean) as string[];
}

/** Whether the invitation is in the person's calendar yet, and what they answered. Undefined when this account can't tell. */
export async function inviteStatus(messageId: string, invite: Invite): Promise<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] } | undefined> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p?.inviteStatus) return undefined;
  try { return await p.inviteStatus(invite.uid); } catch { return undefined; }
}

export function canAddToCalendar(messageId: string): boolean {
  const m = get().messages[messageId];
  return Boolean(m && providers.get(m.accountId)?.addInviteToCalendar);
}

export async function addInviteToCalendar(messageId: string, invite: Invite): Promise<void> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p?.addInviteToCalendar) throw new Error("This account type can't add to a calendar from here yet");
  await p.addInviteToCalendar(invite);
  refreshEvents();
}

/** Answers an invitation. In the calendar itself where the account allows it, otherwise by emailing the organiser. */
export async function answerInvite(messageId: string, invite: Invite, status: Rsvp, opts: { byEmail?: boolean } = {}): Promise<'calendar' | 'email'> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  const account = m && get().accounts.find((a) => a.id === m.accountId);
  if (!m || !p || !account) throw new Error('Email not found');
  if (!opts.byEmail && p.respondToInvite && (await p.respondToInvite(invite.uid, status))) { refreshEvents(); return 'calendar'; }
  if (!invite.organizer) throw new Error("This invitation doesn't say who to reply to");
  const senderName = account.aliases.find((a) => a.isDefault)?.name || account.aliases[0]?.name || account.label;
  const me = whichIsMe(invite, inviteAddresses(m.accountId, m)) || { email: account.email.toLowerCase(), name: senderName };
  const words = RSVP_WORDS[status];
  const text = `${me.name || me.email} has replied ${words.label} to "${invite.title}".`;
  await p.send({
    from: { email: account.email, name: senderName },
    to: [{ email: invite.organizer.email, name: invite.organizer.name }],
    cc: [], bcc: [],
    subject: `${words.subject}: ${invite.title}`,
    html: `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`,
    text,
    attachments: [{ filename: 'invite.ics', mimeType: 'text/calendar; method=REPLY; charset=UTF-8', data: new TextEncoder().encode(buildReply(invite, me, status)) }],
  });
  return 'email';
}

export async function getAttachmentData(messageId: string, attachmentId: string): Promise<Uint8Array> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!m || !p) throw new Error('Email not found');
  return p.getAttachment(m, attachmentId);
}

// ---------- actions ----------

type ByAccount = Map<string, Message[]>;
function groupByAccount(ids: string[]): ByAccount {
  const map: ByAccount = new Map();
  for (const id of ids) {
    const m = get().messages[id];
    if (!m) continue;
    (map.get(m.accountId) || map.set(m.accountId, []).get(m.accountId)!).push(m);
  }
  return map;
}

async function modify(ids: string[], addFn: (p: MailProvider) => string[], removeFn: (p: MailProvider) => string[]) {
  const groups = groupByAccount(ids);
  // Optimistic local update first so the interface feels instant.
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const add = addFn(p).filter(Boolean);
    const remove = removeFn(p).filter(Boolean);
    patchMessages(msgs.map((m) => m.id), (m) => {
      const labels = [...new Set([...m.labels.filter((l) => !remove.includes(l)), ...add])];
      return { ...m, labels, unread: labels.includes('UNREAD'), flagged: labels.includes('STARRED') || labels.includes('FLAGGED') };
    });
  }
  await Promise.all(
    [...groups].map(async ([accId, msgs]) => {
      const p = providers.get(accId)!;
      try {
        await p.modifyLabels(msgs, addFn(p).filter(Boolean), removeFn(p).filter(Boolean));
      } catch (e) {
        errorToast(e, 'Change didn\'t save');
        syncAccount(accId);
      }
    }),
  );
}

const sys = (f: SystemFolder) => (p: MailProvider) => [p.systemFolderId(f) || ''];
const none = () => [] as string[];

export function idsForKeys(keys: string[]): string[] {
  const set = new Set(keys);
  return Object.values(get().messages).filter((m) => set.has(threadKey(m))).map((m) => m.id);
}

/** Message ids for the current selection, limited to what the view shows. */
export function selectedMessageIds(): string[] {
  const keys = get().selectedKeys.length ? get().selectedKeys : get().selectedKey ? [get().selectedKey!] : [];
  return idsForKeys(keys);
}

/** What an action was done to, for the undo list: the subject, or how many conversations. */
function describeIds(ids: string[]): string {
  const msgs = ids.map((id) => get().messages[id]).filter(Boolean);
  const threads = new Set(msgs.map(threadKey));
  if (threads.size === 1) {
    const subject = msgs[0].subject || '(no subject)';
    return subject.length > 34 ? `${subject.slice(0, 33)}…` : subject;
  }
  return `${threads.size} conversations`;
}

/** Marking as unread is recorded so it can be undone; marking as read happens by itself when you open an email, so it isn't. */
export async function markRead(ids: string[], read = true, opts: { silent?: boolean } = {}) {
  if (read) await modify(ids.filter((id) => get().messages[id]?.unread), none, () => ['UNREAD']);
  else {
    const was = ids.filter((id) => !get().messages[id]?.unread);
    await modify(ids, () => ['UNREAD'], none);
    if (!opts.silent && was.length) record(`Mark as unread: ${describeIds(ids)}`, () => markRead(was, true, { silent: true }), () => markRead(ids, false, { silent: true }));
  }
}

export async function toggleFlag(ids: string[]) {
  const anyUnflagged = ids.some((id) => !get().messages[id]?.flagged);
  const flagId = (p: MailProvider) => [p.systemFolderId('flagged') || 'STARRED'];
  const on = () => modify(ids, flagId, none);
  const off = () => modify(ids, none, flagId);
  const before = new Map(ids.map((id) => [id, get().messages[id]?.flagged]));
  if (anyUnflagged) await on();
  else await off();
  const restore = async () => {
    // Put each email back as it was, not just flip them all.
    const was = ids.filter((id) => before.get(id));
    const wasNot = ids.filter((id) => !before.get(id));
    if (was.length) await modify(was, flagId, none);
    if (wasNot.length) await modify(wasNot, none, flagId);
  };
  record(`${anyUnflagged ? 'Star' : 'Remove star'}: ${describeIds(ids)}`, restore, anyUnflagged ? on : off);
}

function afterRemoveFromView() {
  set({ selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined });
}

export async function archive(ids: string[], opts: { silent?: boolean; markRead?: boolean } = {}) {
  if (!ids.length) return;
  const remove = (p: MailProvider) => [p.systemFolderId('inbox') || '', ...(opts.markRead ? ['UNREAD'] : [])];
  const archiveId = (p: MailProvider) => (p.systemFolderId('archive') ? [p.systemFolderId('archive')!] : []);
  await modify(ids, archiveId, remove);
  if (!opts.silent) {
    afterRemoveFromView();
    const id = record(`Archive: ${describeIds(ids)}`, () => modify(ids, sys('inbox'), archiveId), () => archive(ids, { silent: true, markRead: opts.markRead }));
    toast({ text: ids.length > 1 ? `${ids.length} emails archived` : 'Archived', undo: () => undoEntry(id) });
  }
}

export async function trash(ids: string[], opts: { silent?: boolean } = {}) {
  if (!ids.length) return;
  const groups = groupByAccount(ids);
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const binId = p.systemFolderId('bin') || 'TRASH';
    const inboxId = p.systemFolderId('inbox') || 'INBOX';
    patchMessages(msgs.map((m) => m.id), (m) => ({ ...m, labels: [...new Set([...m.labels.filter((l) => l !== inboxId), binId])] }));
    p.trash(msgs).catch((e) => { errorToast(e, 'Delete didn\'t save'); syncAccount(accId); });
  }
  if (opts.silent) return;
  afterRemoveFromView();
  const label = describeIds(ids);
  const id = record(`Move to Bin: ${label}`, () => restoreFromBin(ids), () => trash(ids, { silent: true }));
  toast({ text: ids.length > 1 ? `${ids.length} emails moved to Bin` : 'Moved to Bin', undo: () => undoEntry(id) });
}

export async function restoreFromBin(ids: string[]) {
  const groups = groupByAccount(ids);
  for (const [accId, msgs] of groups) {
    const p = providers.get(accId)!;
    const binId = p.systemFolderId('bin') || 'TRASH';
    const inboxId = p.systemFolderId('inbox') || 'INBOX';
    patchMessages(msgs.map((m) => m.id), (m) => ({ ...m, labels: [...new Set([...m.labels.filter((l) => l !== binId), inboxId])] }));
    p.untrash(msgs).catch((e) => errorToast(e));
  }
}

export async function markSpam(ids: string[], spam = true, opts: { silent?: boolean } = {}) {
  if (spam) {
    await modify(ids, sys('junk'), sys('inbox'));
    if (opts.silent) return;
    afterRemoveFromView();
    const id = record(`Move to Junk: ${describeIds(ids)}`, () => modify(ids, sys('inbox'), sys('junk')), () => markSpam(ids, true, { silent: true }));
    toast({ text: 'Moved to Junk', undo: () => undoEntry(id) });
  } else {
    await modify(ids, sys('inbox'), sys('junk'));
    toast({ text: 'Moved to Inbox' });
  }
}

export async function moveToInbox(ids: string[]) {
  await modify(ids, sys('inbox'), (p) => [p.systemFolderId('bin') || '', p.systemFolderId('junk') || '']);
}

export async function applyLabel(ids: string[], accountId: string, labelId: string, remove = false) {
  const valid = ids.filter((id) => get().messages[id]?.accountId === accountId);
  if (remove) await modify(valid, none, () => [labelId]);
  else await modify(valid, () => [labelId], none);
}

export async function moveToLabel(ids: string[], accountId: string, labelId: string, opts: { silent?: boolean } = {}) {
  const valid = ids.filter((id) => get().messages[id]?.accountId === accountId);
  await modify(valid, () => [labelId], sys('inbox'));
  if (opts.silent) return;
  afterRemoveFromView();
  const name = get().folders[accountId]?.find((f) => f.id === labelId)?.name || 'folder';
  const id = record(`Move to ${name}: ${describeIds(valid)}`, () => modify(valid, sys('inbox'), () => [labelId]), () => moveToLabel(valid, accountId, labelId, { silent: true }));
  toast({ text: `Moved to ${name}`, undo: () => undoEntry(id) });
}

// ---------- snooze, mute, important senders, unsubscribe ----------

export async function snooze(ids: string[], until: number, opts: { silent?: boolean } = {}) {
  const msgs = ids.map((id) => get().messages[id]).filter(Boolean);
  if (!msgs.length) return;
  const items: Snooze[] = msgs.map((m) => ({ messageId: m.id, accountId: m.accountId, threadId: m.threadId, until, subject: m.subject }));
  for (const s of items) await store.putSnooze(s);
  set({ snoozes: [...get().snoozes.filter((s) => !ids.includes(s.messageId)), ...items] });
  await archive(ids, { silent: true });
  if (opts.silent) return;
  afterRemoveFromView();
  const when = new Date(until).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const id = record(`Snooze: ${describeIds(ids)}`, () => unsnooze(ids), () => snooze(ids, until, { silent: true }));
  toast({ text: `Snoozed until ${when}`, undo: () => undoEntry(id) });
}

export async function unsnooze(ids: string[]) {
  for (const id of ids) await store.deleteSnooze(id);
  set({ snoozes: get().snoozes.filter((s) => !ids.includes(s.messageId)) });
  await modify(ids, (p) => [p.systemFolderId('inbox') || '', 'UNREAD'], none);
}

export function toggleMute(key: string) {
  const muted = settings().mutedThreads.includes(key.toLowerCase());
  useSettings.getState().toggleIn('mutedThreads', key);
  if (!muted) {
    archive(idsForKeys([key]), { silent: true, markRead: true });
    afterRemoveFromView();
    toast({ text: 'Conversation muted. New replies skip your inbox.', undo: () => useSettings.getState().toggleIn('mutedThreads', key) });
  } else toast({ text: 'Conversation unmuted' });
}

/** Sends this sender's emails to Junk now and from now on. */
export async function blockSender(email: string, ids: string[]) {
  const e = email.toLowerCase();
  const setBlocked = (on: boolean) => { if (settings().blockedSenders.includes(e) !== on) useSettings.getState().toggleIn('blockedSenders', e); };
  setBlocked(true);
  afterRemoveFromView();
  await markSpam(ids, true, { silent: true });
  const id = record(`Block sender: ${e}`, async () => { setBlocked(false); await modify(ids, sys('inbox'), sys('junk')); }, async () => { setBlocked(true); await markSpam(ids, true, { silent: true }); });
  toast({ text: `${e} is blocked. Their emails go to Junk.`, undo: () => undoEntry(id) });
}

export function unblockSender(email: string) {
  if (settings().blockedSenders.includes(email.toLowerCase())) useSettings.getState().toggleIn('blockedSenders', email);
  toast({ text: `${email} is no longer blocked` });
}

export function toggleVip(email: string) {
  const on = settings().vips.includes(email.toLowerCase());
  useSettings.getState().toggleIn('vips', email);
  toast({ text: on ? `${email} removed from important senders` : `${email} marked as important` });
}

export async function unsubscribe(id: string) {
  const m = get().messages[id];
  if (!m?.listUnsubscribe) return;
  const links = [...m.listUnsubscribe.matchAll(/<([^>]+)>/g)].map((x) => x[1]);
  const https = links.find((l) => l.startsWith('https://'));
  const mailto = links.find((l) => l.startsWith('mailto:'));
  try {
    if (https && m.listUnsubscribePost) {
      const res = await httpFetch(https, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
      if (res.ok || res.status === 202) {
        toast({ text: `Unsubscribed from ${m.from.name || m.from.email}` });
        return;
      }
    }
    if (mailto) {
      const url = new URL(mailto);
      const acc = get().accounts.find((a) => a.id === m.accountId);
      const p = providers.get(m.accountId);
      if (acc && p) {
        await p.send({ from: { email: acc.email, name: acc.displayName }, to: [{ email: url.pathname }], cc: [], bcc: [], subject: url.searchParams.get('subject') || 'Unsubscribe', html: '<p>Unsubscribe</p>', text: 'Unsubscribe', attachments: [] });
        toast({ text: `Unsubscribe request sent to ${m.from.name || m.from.email}` });
        return;
      }
    }
    if (https) await openExternal(https);
  } catch (e) {
    if (https) await openExternal(https);
    else errorToast(e, 'Unsubscribe failed');
  }
}

// ---------- search ----------

let searchSeq = 0;
/** Searches the mailbox you are looking at, unless `everywhere` says to search all mail. */
export async function runSearch(query: string, opts: { everywhere?: boolean } = {}) {
  const q = query.trim();
  const cur = get().view.mailbox;
  if (!q) {
    searchSeq++;
    set({ searchQuery: '', remoteResults: [], searching: false });
    // Clearing goes back to where the search started.
    if (cur.kind === 'search') setView({ scope: get().view.scope, mailbox: cur.within || { kind: 'system', folder: 'inbox' } });
    return;
  }
  const within = opts.everywhere ? undefined : cur.kind === 'search' ? cur.within : cur;
  set({ searchQuery: q, view: { scope: get().view.scope, mailbox: { kind: 'search', query: q, within } }, selectedKey: undefined, selectedKeys: [], screen: 'mail', remoteResults: [] });
  const seq = ++searchSeq;
  if (!get().online) return;
  set({ searching: true });
  try {
    // Also ask the servers so older mail (beyond what's kept offline) is found.
    const results = await Promise.all(
      get().accounts.map((a) => providers.get(a.id)?.searchRemote(toGmailQuery(q) + remoteScope(within)).catch(() => [] as Message[]) ?? Promise.resolve([] as Message[])),
    );
    if (seq !== searchSeq) return;
    const known = get().messages;
    set({ remoteResults: results.flat().filter((m) => !known[m.id]) });
  } finally {
    if (seq === searchSeq) set({ searching: false });
  }
}

/** Gmail words that keep a server search inside the folder it started in. */
function remoteScope(within?: Exclude<MailboxRef, { kind: 'search' }>): string {
  if (within?.kind !== 'system') return '';
  const ops: Partial<Record<SystemFolder, string>> = { inbox: ' in:inbox', sent: ' in:sent', drafts: ' in:drafts', junk: ' in:spam', bin: ' in:trash', flagged: ' is:starred' };
  return ops[within.folder] || '';
}

export function localSearch(q: string): Message[] {
  return searchMessages(q, get().messages);
}

/** Bring a server search result into the local cache when opened. */
export function adoptRemote(m: Message) {
  putMessages([m]);
  set({ remoteResults: get().remoteResults.filter((r) => r.id !== m.id) });
}

// ---------- contacts & calendar ----------

export async function refreshContacts() {
  const all: Address[] = [];
  await Promise.all(get().accounts.map(async (a) => {
    try { all.push(...(await providers.get(a.id)!.listContacts())); } catch { /* ignore */ }
  }));
  // Also everyone you've emailed.
  const mine = myAddresses(get().accounts);
  for (const m of Object.values(get().messages)) {
    if (mine.has(m.from.email.toLowerCase())) all.push(...m.to, ...m.cc);
  }
  const map = new Map<string, Address>();
  for (const c of [...get().contacts, ...all]) {
    const e = c.email.toLowerCase();
    const had = map.get(e);
    if (!had || (!had.name && c.name)) map.set(e, { email: e, name: c.name || had?.name, photo: c.photo || had?.photo });
    else if (!had.photo && c.photo) had.photo = c.photo;
  }
  const list = [...map.values()];
  set({ contacts: list });
  store.putContacts(list);
}

/** Saves each Google account's profile picture, for the optional account icons in the sidebar. */
export async function refreshAccountPhotos() {
  if (!settings().accountIcons) return;
  for (const a of get().accounts) {
    if (a.kind !== 'gmail' || a.photoUrl) continue;
    try {
      const { getGoogleAccessToken } = await import('./auth/google');
      const token = await getGoogleAccessToken(a.email);
      const info = await (await httpFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } })).json();
      if (!info.picture) continue;
      const img = await httpFetch(info.picture);
      const bytes = new Uint8Array(await img.arrayBuffer());
      updateAccount(a.id, { photoUrl: `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${bytesToBase64(bytes)}` });
    } catch { /* keep the coloured dot */ }
  }
}

let eventsFetchedAt = 0;
/** When the calendars were last fetched, in milliseconds. */
export const lastEventsRefresh = () => eventsFetchedAt;

/** Fetches every account's calendar again. Returns the accounts it couldn't reach. */
export async function refreshEvents(): Promise<string[]> {
  eventsFetchedAt = Date.now();
  const from = Date.now() - 3 * 86400000;
  const to = Date.now() + 8 * 86400000;
  const all: CalendarEvent[] = [];
  const failed: string[] = [];
  const errors: Record<string, string> = {};
  const names: Record<string, string[]> = { ...get().calendarNames };
  await Promise.all(get().accounts.map(async (a) => {
    try {
      const events = await providers.get(a.id)!.listEvents(from, to);
      all.push(...events);
      store.replaceEvents(a.id, events);
      names[a.id] = providers.get(a.id)!.knownCalendars?.() || [];
    } catch (e) {
      errors[a.id] = e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 140) : 'The calendar could not be reached.';
      all.push(...get().events.filter((x) => x.accountId === a.id));
      console.warn('Events failed', a.email, e);
      failed.push(`${a.label || a.email}${e instanceof Error ? ` (${e.message.replace(/\s+/g, ' ').slice(0, 90)})` : ''}`);
    }
  }));
  set({ events: all, calendarErrors: errors, calendarNames: names });
  return failed;
}

export async function dismissReminders(ids: string[]) {
  await store.dismiss(ids);
  const next = new Set(get().dismissed);
  ids.forEach((id) => next.add(id));
  set({ dismissed: next });
  const fu = get().followups.filter((f) => ids.includes(`fu|${f.id}`));
  for (const f of fu) await store.deleteFollowup(f.id);
  if (fu.length) set({ followups: get().followups.filter((f) => !fu.includes(f)) });
}

// ---------- follow ups ----------

export async function addFollowup(f: FollowUp) {
  await store.putFollowup(f);
  set({ followups: [...get().followups, f] });
}

/** Clears follow ups once someone replies. */
function processFollowups() {
  const mine = myAddresses(get().accounts);
  const msgs = Object.values(get().messages);
  for (const f of get().followups) {
    const replied = msgs.some((m) => m.accountId === f.accountId && m.threadId === f.threadId && m.date > f.sentAt && !mine.has(m.from.email.toLowerCase()));
    if (replied) {
      store.deleteFollowup(f.id);
      set({ followups: get().followups.filter((x) => x.id !== f.id) });
    }
  }
}

// ---------- outbox (undo send, send later) ----------

let sendImpl: ((item: OutboxItem) => Promise<void>) | undefined;
/** The composer module registers the real send function (avoids a circular import). */
export function registerSender(fn: (item: OutboxItem) => Promise<void>) {
  sendImpl = fn;
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
  const outbox = await store.outbox();
  set({ outbox });
  const item = outbox.find((o) => o.id === id);
  if (item) announceQueued(item);
}

let channel: BroadcastChannel | null = null;
export function broadcast(msg: unknown) {
  try {
    channel ||= new BroadcastChannel('wgm');
    channel.postMessage(msg);
  } catch { /* ignore */ }
}

export async function cancelSend(id: string) {
  const item = get().outbox.find((o) => o.id === id);
  if (!item) return;
  await store.deleteOutbox(id);
  set({ outbox: get().outbox.filter((o) => o.id !== id) });
  const draft = { ...item.draft, sendAt: undefined };
  await store.putDraft(draft);
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
    try {
      await sendImpl(item);
      await store.deleteOutbox(item.id);
      set({ outbox: get().outbox.filter((o) => o.id !== item.id) });
      toast({ text: item.kind === 'scheduled' ? `Scheduled email sent: ${item.draft.subject || '(no subject)'}` : 'Sent', ttl: 3000 });
    } catch (e) {
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

// ---------- periodic jobs ----------

function minuteTick() {
  flushOutbox();
  const now = Date.now();
  const due = get().snoozes.filter((s) => s.until <= now);
  if (due.length) {
    unsnooze(due.map((s) => s.messageId));
    if (!isQuietNow(settings())) notify('Snoozed email is back', due.map((d) => d.subject).join(', '));
  }
  window.dispatchEvent(new Event('wgm-minute'));
}

export function inboxUnreadFor(accountIds: string[] | 'all', folder: SystemFolder = 'inbox'): number {
  let n = 0;
  const leftOut = get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id);
  const allowed = accountIds === 'all' ? (leftOut.length ? new Set(get().accounts.map((a) => a.id).filter((id) => !leftOut.includes(id))) : null) : new Set(accountIds);
  const snoozed = new Set(get().snoozes.map((s) => s.messageId));
  for (const m of Object.values(get().messages)) {
    if (!m.unread || (allowed && !allowed.has(m.accountId)) || snoozed.has(m.id)) continue;
    if (inSystemFolder(m, folder, providers.get(m.accountId))) n++;
  }
  return n;
}

/** Marks everything unread in a mailbox as read. */
export async function markViewRead(view: View) {
  const { inMailbox, scopeAccountIds } = await import('./mailbox');
  const allowed = new Set(scopeAccountIds(view.scope, get().accounts.map((a) => a.id), settings().groups, get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id)));
  const ctx = { vips: new Set(settings().vips), snoozed: new Set(get().snoozes.map((s) => s.messageId)) };
  const ids = Object.values(get().messages)
    .filter((m) => m.unread && allowed.has(m.accountId) && inMailbox(m, view.mailbox, providers.get(m.accountId), ctx))
    .map((m) => m.id);
  if (!ids.length) return;
  await markRead(ids, true);
  const id = record(`Mark ${ids.length} as read`, () => markRead(ids, false, { silent: true }), () => markRead(ids, true));
  toast({ text: `${ids.length} marked as read`, undo: () => undoEntry(id) });
}
