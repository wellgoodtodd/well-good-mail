// Adding, reconnecting, changing and removing accounts, the demo, and accounts removed with their mail kept.
import { store } from '../db';
import { forgetBodies, listOnly } from '../bodyCache';
import { settings, useSettings } from '../settings';
import { GmailProvider } from '../providers/gmail';
import { MicrosoftProvider } from '../providers/microsoft';
import { ImapProvider } from '../providers/imap';
import { openImapGuide } from '../guide';
import { record, useHistory } from '../history';
import { askAiForNewAccount } from '../aiAsk';
import { removeImapPassword, saveImapPassword, testImap, imapReset, type ImapSettings } from '../auth/imap';
import { DemoProvider, DEMO_ACCOUNTS, resetDemo } from '../providers/demo';
import type { MailProvider } from '../providers/provider';
import { signInWithGoogle, signOutGoogle } from '../auth/google';
import { signInWithMicrosoft, signOutMicrosoft } from '../auth/microsoft';
import { indexMessages, removeFromIndex } from '../search';
import { isTauri, invoke } from '../platform';
import { paletteById, colourFor } from '../palettes';
import type { Account } from '../types';
import { refreshEvents } from './calendar';
import { refreshContacts } from './contacts';
import { updateUnreadBadge } from './messages';
import { errorToast, providers, saveAccount, toast, useMail } from './store';
import { syncAccount } from './sync';
import { stopTimers } from './timers';

const get = useMail.getState;
const set = useMail.setState;

export function makeProvider(a: Account): MailProvider {
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
    for (const m of msgs) merged[m.id] = listOnly(m);
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
  const leaving = Object.values(get().messages).filter((m) => m.accountId === id).map((m) => m.id);
  const messages = Object.fromEntries(Object.entries(get().messages).filter(([, m]) => m.accountId !== id));
  const folders = { ...get().folders };
  delete folders[id];
  removeFromIndex(leaving);
  forgetBodies(leaving);
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
