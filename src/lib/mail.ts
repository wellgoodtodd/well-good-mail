// The app's live state: accounts, messages, what's selected, and every mail
// action (archive, delete, send...). Syncing with providers happens here.
import { askText } from './dialogs';
import { logLine } from './activityLog';
import { create } from 'zustand';
import { store } from './db';
import { settings, useSettings, isQuietNow } from './settings';
import { GmailProvider } from './providers/gmail';
import { MicrosoftProvider } from './providers/microsoft';
import { ImapProvider } from './providers/imap';
import { openImapGuide } from './guide';
import { record, undoEntry, useHistory } from './history';
import { askAiForNewAccount } from './aiAsk';
import { removeImapPassword, saveImapPassword, testImap, imapReset, type ImapSettings } from './auth/imap';
import { DemoProvider, DEMO_ACCOUNTS, resetDemo } from './providers/demo';
import { isMachineAddress } from './machineAddress';
import type { MailProvider } from './providers/provider';
import { buildReply, RSVP_WORDS, whichIsMe, type Invite, type Rsvp } from './invites';
import { signInWithGoogle, signOutGoogle } from './auth/google';
import { signInWithMicrosoft, signOutMicrosoft } from './auth/microsoft';
import { indexMessages, rebuildIndex, removeFromIndex, searchMessages, toGmailQuery, rebuildIndexInBackground } from './search';
import { inSystemFolder, threadKey } from './mailbox';
import { showBanner } from './banners';
import { notify, flashTaskbar, setUnreadCount, openExternal, httpFetch, isPopout, isTauri, openPopout, invoke } from './platform';
import { myAddresses } from './compose';
import { bytesToBase64 } from './mime';
import { paletteById, colourFor } from './palettes';
import type { Account, Address, CalendarEvent, EventCopy, EventPatch, Draft, EventGuest, Folder, FollowUp, MailboxRef, Message, OutboxItem, Snooze, SystemFolder, View } from './types';

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
  /** Several buttons, like Open and Show in folder. */
  actions?: { label: string; run: () => void }[];
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
  /** The last 20 notes, for the Recent list in the toolbar (this session only). */
  notes: (Toast & { at: number; used?: boolean })[];
  /** A note arrived since Recent was last opened. */
  notesUnseen: boolean;
  /** Draft open inline in the reading pane. */
  inlineDraftId?: string;
  screen: 'mail' | 'reminders' | 'settings' | 'help' | 'aidrafts' | 'scheduled';
  settingsTab: string;
  /** Where you were before, newest last, for the Back button. */
  backStack: Place[];
  /** Conversations just archived, deleted or moved: hidden from the list at once, before the full update runs. */
  goingKeys: string[];
  /** Conversations just flagged or marked read or unread: shown that way at once, before the full update runs. */
  lookKeys: Record<string, { unread?: boolean; flagged?: boolean }>;
  /** Places you went back from, for Forward. Cleared when you go somewhere new. */
  forwardStack: Place[];
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
  notes: [],
  notesUnseen: false,
  screen: 'mail',
  settingsTab: 'accounts',
  backStack: [],
  goingKeys: [],
  lookKeys: {},
  forwardStack: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  filters: NO_FILTERS,
}));

const get = useMail.getState;
const set = useMail.setState;

// ---------- toasts ----------

export function toast(t: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  logLine('note', t.text);
  set({ toasts: [...get().toasts, { ...t, id }], notes: [{ ...t, id, at: Date.now() }, ...get().notes].slice(0, 20), notesUnseen: true });
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
  const live = new Set(get().accounts.map((a) => a.id));
  all.forEach((m) => { if (live.has(m.accountId)) map[m.id] = m; });
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

let badgeTimer: ReturnType<typeof setTimeout> | undefined;
function updateUnreadBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(countUnreadBadge, 400);
}
function countUnreadBadge() {
  let n = 0;
  const leftOut = new Set(get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id));
  for (const m of Object.values(get().messages)) {
    if (m.unread && !leftOut.has(m.accountId) && inSystemFolder(m, 'inbox', providers.get(m.accountId))) n++;
  }
  setUnreadCount(settings().taskbarCount === false ? 0 : n);
}
/** Shows or clears the taskbar count straight away (the switch in Settings › General). */
export const refreshTaskbarCount = () => countUnreadBadge();

function saveAccount(a: Account) {
  set({ accounts: get().accounts.map((x) => (x.id === a.id ? a : x)) });
  store.putAccount(a);
}

// ---------- start up ----------

let pollTimer: ReturnType<typeof setInterval> | undefined;
let minuteTimer: ReturnType<typeof setInterval> | undefined;

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
    store.accounts(), store.folders(), loadMessages, store.outbox(), store.snoozes(), store.followups(), store.events(), store.dismissed(), store.contacts(),
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
  messages.forEach((m) => { if (live.has(m.accountId)) map[m.id] = m; });
  for (const k of Object.keys(byAcc)) if (!live.has(k)) delete byAcc[k];
  set({ ready: true, accounts, folders: byAcc, messages: map, outbox, snoozes, followups, events, dismissed, contacts });

  if (opts.popout) { updateUnreadBadge(); return; }

  // The rest of the cache, then the search index, without holding up the first screen.
  await new Promise((r) => setTimeout(r, 50));
  try {
    const all = await store.messages();
    const now = get().messages;
    const merged: Record<string, Message> = { ...now };
    const liveNow = new Set(get().accounts.map((a) => a.id));
    for (const m of all) if (!(m.id in merged) && liveNow.has(m.accountId)) merged[m.id] = m;
    set({ messages: merged });
    rebuildIndexInBackground(Object.values(merged));
  } catch (e) {
    console.warn('Loading older mail failed', e);
    rebuildIndexInBackground(messages);
  }
  updateUnreadBadge();

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
  // Removed earlier with its mail kept: put it back as it was, show its mail at once, then fetch only what changed.
  const parked = (await parkedAccounts()).find((a) => a.email === email && a.kind === kind);
  if (parked) {
    const back: Account = { ...parked, ...extra, order: get().accounts.length, status: 'syncing', error: undefined };
    await store.kvSet(PARKED_KEY, (await parkedAccounts()).filter((a) => a.id !== parked.id));
    providers.set(back.id, makeProvider(back));
    const [msgs, flds] = await Promise.all([store.messagesFor(back.id), store.foldersFor(back.id)]);
    providers.get(back.id)?.hydrate?.(flds);
    const merged = { ...get().messages };
    for (const m of msgs) merged[m.id] = m;
    set({ accounts: [...get().accounts, back], messages: merged, folders: { ...get().folders, [back.id]: flds } });
    indexMessages(msgs);
    await store.putAccount(back);
    toast({ text: `${email} is back, with ${msgs.length.toLocaleString()} emails kept on this computer. Fetching anything new.` });
    askAiForNewAccount(back.id);
    await syncAccount(back.id);
    refreshContacts();
    refreshEvents();
    updateUnreadBadge();
    return back;
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
  if (!settings().defaultFromEmail) useSettings.getState().set({ defaultFromEmail: email }, { quiet: true });
  if (kind !== 'demo') askAiForNewAccount(account.id);
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
  imapReset(email);
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

/** Accounts removed with "Keep its mail on this computer": the record, kept so adding it again picks up where it left off. */
const PARKED_KEY = 'parked-accounts';
async function parkedAccounts(): Promise<Account[]> { return (await store.kvGet<Account[]>(PARKED_KEY)) || []; }

/**
 * Removes an account. With keepMail, its mail and folders stay in the cache, hidden, so adding the same account again
 * brings it all back at once and only fetches what changed. Nothing changes in the account itself either way.
 */
export async function removeAccount(id: string, opts: { keepMail?: boolean } = {}) {
  const a = get().accounts.find((x) => x.id === id);
  if (!a) return;
  if (a.kind === 'gmail') await signOutGoogle(a.email);
  if (a.kind === 'microsoft') await signOutMicrosoft(a.email);
  if (a.kind === 'imap') {
    await removeImapPassword(a.email).catch(() => {});
    if (isTauri()) void invoke('imap_unwatch', { id }).catch(() => {});
  }
  providers.delete(id);
  if (opts.keepMail && a.kind !== 'demo') {
    const parked = (await parkedAccounts()).filter((x) => x.id !== id);
    await store.kvSet(PARKED_KEY, [...parked, { ...a, status: 'ok', error: undefined, syncDone: undefined }]);
    await store.parkAccount(id);
  } else {
    await store.deleteAccount(id);
    const parked = await parkedAccounts();
    if (parked.some((x) => x.id === id)) await store.kvSet(PARKED_KEY, parked.filter((x) => x.id !== id));
  }
  const messages = Object.fromEntries(Object.entries(get().messages).filter(([, m]) => m.accountId !== id));
  const folders = { ...get().folders };
  delete folders[id];
  rebuildIndex(Object.values(messages));
  set({ accounts: get().accounts.filter((x) => x.id !== id), messages, folders, view: { scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } } });
  const s = settings();
  useSettings.getState().set({ groups: s.groups.map((g) => ({ ...g, accountIds: g.accountIds.filter((x) => x !== id) })) }, { quiet: true });
  updateUnreadBadge();
}

export function updateAccount(id: string, patch: Partial<Account>) {
  const a = get().accounts.find((x) => x.id === id);
  if (a) saveAccount({ ...a, ...patch });
}

let lastAccountStep: { id: string; key: string; at: number } | null = null;
/**
 * An account change you made (its name, colour, alerts, All Inboxes), with a step in Undo.
 * Typing a name is one step, not one per letter.
 */
export function editAccount(id: string, patch: Partial<Account>, what: string) {
  const a = get().accounts.find((x) => x.id === id);
  if (!a) return;
  const was = Object.fromEntries(Object.keys(patch).map((k) => [k, (a as unknown as Record<string, unknown>)[k]])) as Partial<Account>;
  updateAccount(id, patch);
  if (Object.keys(patch).includes('leaveOutOfAll')) updateUnreadBadge();
  const key = `${id}|${Object.keys(patch).sort().join(',')}`;
  const past = useHistory.getState().past;
  const top = past[past.length - 1];
  if (lastAccountStep && top?.id === lastAccountStep.id && lastAccountStep.key === key && Date.now() - lastAccountStep.at < 2500) {
    lastAccountStep.at = Date.now();
    useHistory.setState((s) => ({ past: s.past.map((e) => (e.id === top.id ? { ...e, redo: () => { updateAccount(id, patch); updateUnreadBadge(); } } : e)) }));
    return;
  }
  const stepId = record(`Change ${what} for ${a.label || a.email}`, () => { updateAccount(id, was); updateUnreadBadge(); }, () => { updateAccount(id, patch); updateUnreadBadge(); });
  lastAccountStep = { id: stepId, key, at: Date.now() };
}

/** Keeps an account's mail out of All Inboxes (or puts it back). It stays in the sidebar on its own. */
export function setLeaveOutOfAll(id: string, on: boolean) {
  editAccount(id, { leaveOutOfAll: on }, 'Show in All Inboxes');
}

export function reorderAccounts(ids: string[]) {
  const accounts = ids.map((id, i) => ({ ...get().accounts.find((a) => a.id === id)!, order: i }));
  set({ accounts });
  accounts.forEach((a) => store.putAccount(a));
}

export async function startDemo() {
  resetDemo();
  useSettings.getState().set({ demoMode: true, defaultFromEmail: 'alex@studio.example', vips: ['isla@glencorrie.example', 'mum@family.example'] }, { quiet: true });
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
  useSettings.getState().set({ demoMode: false, groups: [], vips: [], defaultFromEmail: '' }, { quiet: true });
  location.reload();
}

// ---------- syncing ----------

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
          putMessages(batch);
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

// ---------- views & selection ----------

/** A place you can go back to: the screen, the mailbox and the email that was open. */
export interface Place { screen: MailState['screen']; view: View; settingsTab: string; selectedKey?: string }
const samePlace = (a: Place, b: Place) => a.screen === b.screen && (a.screen === 'settings' ? a.settingsTab === b.settingsTab : a.screen !== 'mail' || JSON.stringify(a.view) === JSON.stringify(b.view));

/** Notes where you are now, before going somewhere else. */
function remember(next: Partial<Place>) {
  const s = get();
  const here: Place = { screen: s.screen, view: s.view, settingsTab: s.settingsTab, selectedKey: s.selectedKey };
  const there: Place = { ...here, ...next };
  if (samePlace(here, there)) return;
  set({ backStack: [...s.backStack, here].slice(-30), forwardStack: [] });
}

const placeNow = (): Place => { const s = get(); return { screen: s.screen, view: s.view, settingsTab: s.settingsTab, selectedKey: s.selectedKey }; };
const goTo = (place: Place) => ({ screen: place.screen, view: place.view, settingsTab: place.settingsTab, selectedKey: place.selectedKey, selectedKeys: place.selectedKey ? [place.selectedKey] : [], inlineDraftId: undefined });

/** Back to where you were: the screen, the mailbox and the email that was open. */
export function goBack() {
  const stack = get().backStack;
  const place = stack[stack.length - 1];
  if (!place) return;
  set({ backStack: stack.slice(0, -1), forwardStack: [...get().forwardStack, placeNow()].slice(-30), ...goTo(place) });
}

/** Forward again, after going back. */
export function goForward() {
  const stack = get().forwardStack;
  const place = stack[stack.length - 1];
  if (!place) return;
  set({ forwardStack: stack.slice(0, -1), backStack: [...get().backStack, placeNow()].slice(-30), ...goTo(place) });
}

export function setView(view: View) {
  remember({ screen: 'mail', view });
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
  remember({ screen, ...(settingsTab ? { settingsTab } : {}) });
  set({ screen, ...(settingsTab ? { settingsTab } : {}) });
}

// ---------- reading ----------

export async function loadBody(id: string): Promise<Message | undefined> {
  // Already fetched in the background and waiting to be saved: save it now and use it.
  if (warmBuffer.some((u) => u.id === id)) flushWarm();
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

// ---------- loading emails ahead of time ----------
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
        const updated: Message = { ...(get().messages[id] || m), bodyHtml: body.html, bodyText: body.text, attachments: body.attachments, hasAttachments: body.attachments.some((a) => !a.inline), bodyLoaded: true };
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

export async function addInviteToCalendar(messageId: string, invite: Invite): Promise<string | void> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p?.addInviteToCalendar) throw new Error("This account type can't add to a calendar from here yet");
  const ref = await p.addInviteToCalendar(invite);
  refreshEvents();
  return ref;
}

/** Changes an event added from an email: by the calendar's own id where it gave one, else by adding again (same uid). */
export async function updateAddedEvent(messageId: string, ref: string | void, invite: Invite): Promise<void> {
  const m = get().messages[messageId];
  const p = m && providers.get(m.accountId);
  if (!p) throw new Error('Email not found');
  if (ref && p.updateAddedEvent) await p.updateAddedEvent(ref, invite);
  else if (p.addInviteToCalendar) await p.addInviteToCalendar(invite);
  refreshEvents();
  void import('./calendarCache').then((c) => c.refreshCalendarCopy());
}

/** Calendars in an account that events can be written to. */
export function writableCalendars(accountId: string): string[] {
  return providers.get(accountId)?.writableCalendars?.() || [];
}

/** Changes an event in its own calendar, then shows the change here straight away and refreshes the copy. */
export async function editEvent(ev: CalendarEvent, patch: EventPatch): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.editEvent) throw new Error("This calendar can't be changed from here yet");
  await p.editEvent(ev, patch);
  const changed = (e: CalendarEvent): CalendarEvent => (e.id === ev.id ? { ...e, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.start !== undefined ? { start: patch.start } : {}), ...(patch.end !== undefined ? { end: patch.end } : {}), ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}), ...(patch.location !== undefined ? { location: patch.location || undefined } : {}), ...(patch.description !== undefined ? { description: patch.description || undefined } : {}), ...(patch.calendarName ? { calendarName: patch.calendarName } : {}) } : e);
  set({ events: get().events.map(changed) });
  const cal = await import('./calendarCache');
  cal.useCalCache.setState((s) => ({ events: s.events.map(changed) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
}

/** Deletes an event you made, from its own calendar and from here. */
export async function deleteEvent(ev: CalendarEvent): Promise<void> {
  const p = providers.get(ev.accountId);
  if (!p?.deleteEvent) throw new Error("This calendar can't be changed from here yet");
  await p.deleteEvent(ev);
  set({ events: get().events.filter((e) => e.id !== ev.id) });
  const cal = await import('./calendarCache');
  cal.useCalCache.setState((s) => ({ events: s.events.filter((e) => e.id !== ev.id) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
}

/** Every calendar events can be put in, account by account, in the order the accounts are listed. */
export function calendarChoices(): { account: Account; calendars: string[] }[] {
  return [...get().accounts].sort((x, y) => x.order - y.order)
    .map((account) => ({ account, calendars: providers.get(account.id)?.createEvent ? writableCalendars(account.id) : [] }))
    .filter((x) => x.calendars.length);
}

/** Can this event go to another account from here? Repeating ones go as a whole series. */
export function canMoveAcross(ev: CalendarEvent): boolean {
  const p = providers.get(ev.accountId);
  return Boolean(ev.canEdit && p?.copyOfEvent && (ev.recurring ? p.endSeries : p.deleteEvent));
}

/** Everything about the event (or its series from this one on), read fresh from its calendar. */
export async function eventCopy(ev: CalendarEvent, series: boolean): Promise<EventCopy> {
  const p = providers.get(ev.accountId);
  if (!p?.copyOfEvent) throw new Error("This calendar can't be copied from here yet");
  return p.copyOfEvent(ev, { series });
}

/**
 * Puts an event in another account's calendar, then takes it out of the first (a series from this one on), only once
 * the new one is made. Changes from the form go across too. Returns the new event's id.
 */
export async function moveEventAcross(ev: CalendarEvent, to: { accountId: string; calendarName: string }, opts: { patch?: EventPatch; copy?: EventCopy; removeOriginal: boolean }): Promise<string> {
  const from = providers.get(ev.accountId);
  const dest = providers.get(to.accountId);
  if (!from || !dest?.createEvent) throw new Error("That calendar can't take events from here yet");
  const copy = { ...(opts.copy || (await eventCopy(ev, Boolean(ev.recurring)))) };
  if (copy.repeatUnsupported) throw new Error("This series repeats in a way that can't be copied to another account");
  const pt = opts.patch || {};
  if (pt.title !== undefined) copy.title = pt.title;
  if (pt.start !== undefined) copy.start = pt.start;
  if (pt.end !== undefined) copy.end = pt.end;
  if (pt.allDay !== undefined) copy.allDay = pt.allDay;
  if (pt.location !== undefined) copy.location = pt.location || undefined;
  if (pt.description !== undefined) copy.description = pt.description || undefined;
  const newId = await dest.createEvent(to.calendarName, copy);
  const made: CalendarEvent = { ...ev, id: newId, accountId: to.accountId, accountIds: undefined, calendarName: to.calendarName, title: copy.title, start: copy.start, end: copy.end, allDay: copy.allDay, location: copy.location, description: copy.description, htmlLink: undefined, canEdit: true, meetingUrl: copy.video ? undefined : ev.meetingUrl };
  const cal = await import('./calendarCache');
  const swap = (list: CalendarEvent[]) => [...(opts.removeOriginal ? list.filter((e) => e.id !== ev.id) : list), made];
  if (opts.removeOriginal) {
    try {
      if (ev.recurring) await from.endSeries!(ev); else await from.deleteEvent!(ev);
    } catch (e) {
      void refreshEvents(); void cal.refreshCalendarCopy();
      throw new Error(`It's now in ${accountName(to.accountId)}, but the original couldn't be removed (${e instanceof Error ? e.message : e}). Delete it there by hand.`);
    }
  }
  set({ events: swap(get().events) });
  cal.useCalCache.setState((s) => ({ events: swap(s.events) }));
  void refreshEvents();
  void cal.refreshCalendarCopy();
  return newId;
}

const accountName = (id: string) => { const a = get().accounts.find((x) => x.id === id); return a ? a.label || a.email : 'the other account'; };

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
  // The account is told in the background: whatever asked for this (archive, read, star, move) carries on at once.
  // If it fails, a message says so and the account syncs again to put things right.
  void Promise.all(
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
  const changing = read ? ids.filter((id) => get().messages[id]?.unread) : ids;
  if (!changing.length) return;
  const settle = await lookFirst(changing, { unread: !read });
  if (read) await modify(changing, none, () => ['UNREAD']);
  else {
    const was = ids.filter((id) => !get().messages[id]?.unread);
    await modify(ids, () => ['UNREAD'], none);
    if (!opts.silent && was.length) record(`Mark as unread: ${describeIds(ids)}`, () => markRead(was, true, { silent: true }), () => markRead(ids, false, { silent: true }));
  }
  settle();
}

export async function toggleFlag(ids: string[]) {
  const anyUnflagged = ids.some((id) => !get().messages[id]?.flagged);
  const flagId = (p: MailProvider) => [p.systemFolderId('flagged') || 'STARRED'];
  const on = () => modify(ids, flagId, none);
  const off = () => modify(ids, none, flagId);
  const before = new Map(ids.map((id) => [id, get().messages[id]?.flagged]));
  const settle = await lookFirst(ids, { flagged: anyUnflagged });
  if (anyUnflagged) await on();
  else await off();
  settle();
  const restore = async () => {
    // Put each email back as it was, not just flip them all.
    const was = ids.filter((id) => before.get(id));
    const wasNot = ids.filter((id) => !before.get(id));
    if (was.length) await modify(was, flagId, none);
    if (wasNot.length) await modify(wasNot, none, flagId);
  };
  record(`${anyUnflagged ? 'Flag' : 'Remove flag'}: ${describeIds(ids)}`, restore, anyUnflagged ? on : off);
}

/**
 * Takes conversations off the screen straight away (and closes the open one), then waits for the screen to redraw
 * before the heavier work of updating every count and list. So an archive or delete looks instant however big the mailbox.
 */
async function leaveScreenFirst(ids: string[]) {
  const msgs = get().messages;
  const keys = [...new Set(ids.map((id) => msgs[id]).filter(Boolean).map((m) => threadKey(m)))];
  const sel = get().selectedKey;
  set({ goingKeys: keys, ...(sel && keys.includes(sel) ? { selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined } : {}) });
  await new Promise<void>((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120);
  });
}
const clearGoing = () => { if (get().goingKeys.length) set({ goingKeys: [] }); };

/** Shows a flag or read mark on the list at once, then lets the full update run after the screen has redrawn. */
async function lookFirst(ids: string[], look: { unread?: boolean; flagged?: boolean }) {
  const msgs = get().messages;
  const keys = [...new Set(ids.map((id) => msgs[id]).filter(Boolean).map((m) => threadKey(m)))];
  if (!keys.length) return () => undefined;
  set({ lookKeys: { ...get().lookKeys, ...Object.fromEntries(keys.map((k) => [k, { ...get().lookKeys[k], ...look }])) } });
  await new Promise<void>((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120);
  });
  return () => { const next = { ...get().lookKeys }; keys.forEach((k) => delete next[k]); set({ lookKeys: next }); };
}

function afterRemoveFromView() {
  set({ selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined });
}

export async function archive(ids: string[], opts: { silent?: boolean; markRead?: boolean } = {}) {
  if (!ids.length) return;
  const remove = (p: MailProvider) => [p.systemFolderId('inbox') || '', ...(opts.markRead ? ['UNREAD'] : [])];
  const archiveId = (p: MailProvider) => (p.systemFolderId('archive') ? [p.systemFolderId('archive')!] : []);
  if (!opts.silent) await leaveScreenFirst(ids);
  const saving = modify(ids, archiveId, remove);
  if (opts.silent) { await saving; return; }
  {
    afterRemoveFromView();
    clearGoing();
    const id = record(`Archive: ${describeIds(ids)}`, () => modify(ids, sys('inbox'), archiveId), () => archive(ids, { silent: true, markRead: opts.markRead }));
    toast({ text: ids.length > 1 ? `${ids.length} emails archived` : 'Archived', undo: () => undoEntry(id) });
  }
}

export async function trash(ids: string[], opts: { silent?: boolean } = {}) {
  if (!ids.length) return;
  if (!opts.silent) await leaveScreenFirst(ids);
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
  clearGoing();
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
  if (cur.kind !== 'search') remember({ screen: 'mail', view: { scope: get().view.scope, mailbox: { kind: 'search', query: q, within } } });
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

/** Accounts that can add a contact: Google and Microsoft. */
export const contactAccounts = () => get().accounts.filter((a) => providers.get(a.id)?.addContact);

/** Adds someone to an account's contacts: the given one, else the account of the email open now, else the default. */
export async function addToContacts(person: Address, accountId?: string) {
  const able = contactAccounts();
  const open = get().selectedKey?.split('|')[0];
  const def = settings().defaultFromEmail.toLowerCase();
  const acc = able.find((a) => a.id === accountId) || able.find((a) => a.id === open) || able.find((a) => a.aliases.some((x) => x.email.toLowerCase() === def)) || able[0];
  if (!acc) { toast({ text: 'Adding contacts works for Google and Microsoft accounts.' }); return; }
  // Only an address: ask for a name first, so the contact is easy to find later.
  if (!person.name?.trim()) {
    const name = await askText(`Name for ${person.email}`, '', 'Add to contacts');
    if (name === null) return;
    person = { ...person, name: name.trim() || undefined };
  }
  try {
    await providers.get(acc.id)!.addContact!(person);
    toast({ text: `${person.name || person.email} added to ${acc.label || acc.email}'s contacts.` });
    void refreshContacts();
  } catch (e) {
    if ((e as { needsPermission?: boolean }).needsPermission) {
      toast({ text: `${acc.label || acc.email} needs one more sign in to add contacts.`, action: { label: 'Sign in', run: () => void reconnectAccount(acc.id) }, ttl: 12000 });
      return;
    }
    toast({ text: `Couldn't add the contact: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
  }
}

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
  const list = [...map.values()].filter((c) => !isMachineAddress(c.email));
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

/** Events for any stretch of time, straight from each account (the month view). Accounts that fail are skipped. */
export async function eventsBetween(from: number, to: number): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  await Promise.all(get().accounts.map(async (a) => {
    try { out.push(...(await providers.get(a.id)!.listEvents(from, to))); } catch { /* shown elsewhere */ }
  }));
  return out;
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
    try {
      await sendImpl(item);
      await store.deleteOutbox(item.id);
      if (item.kind === 'scheduled') unwake(item.id);
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
  void import('./oooStore').then((m) => m.oooTick()).catch(() => { /* not ready yet */ });
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
  const everywhere = view.mailbox.kind === 'search' || view.mailbox.kind === 'smart';
  const allowed = new Set(scopeAccountIds(view.scope, get().accounts.map((a) => a.id), settings().groups, everywhere ? [] : get().accounts.filter((a) => a.leaveOutOfAll).map((a) => a.id)));
  const { myAddresses } = await import('./compose');
  const ctx = { vips: new Set(settings().vips), snoozed: new Set(get().snoozes.map((s) => s.messageId)), smart: settings().smartMailboxes, mine: myAddresses(get().accounts) };
  const ids = Object.values(get().messages)
    .filter((m) => m.unread && allowed.has(m.accountId) && inMailbox(m, view.mailbox, providers.get(m.accountId), ctx))
    .map((m) => m.id);
  if (!ids.length) return;
  await markRead(ids, true);
  const id = record(`Mark ${ids.length} as read`, () => markRead(ids, false, { silent: true }), () => markRead(ids, true));
  toast({ text: `${ids.length} marked as read`, undo: () => undoEntry(id) });
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

// After starting: once the accounts have had a moment to sync, load the top of each Inbox.
let warmedAtStart = false;
export function warmAfterStart() {
  if (warmedAtStart) return;
  warmedAtStart = true;
  setTimeout(() => warmInbox(), 8000);
}

/** Accounts removed with their mail kept, for Storage (each can be cleared for good there). */
export async function keptAccounts(): Promise<{ id: string; email: string; label: string; count: number }[]> {
  const parked = await parkedAccounts();
  return Promise.all(parked.map(async (a) => ({ id: a.id, email: a.email, label: a.label || a.email, count: (await store.messagesFor(a.id)).length })));
}

/** Deletes the kept mail of a removed account from this computer. */
export async function forgetKeptAccount(id: string) {
  await store.deleteAccount(id);
  await store.kvSet(PARKED_KEY, (await parkedAccounts()).filter((x) => x.id !== id));
}
