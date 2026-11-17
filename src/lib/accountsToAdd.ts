// Accounts you have elsewhere but not on this computer yet: from a backup you set this computer up from, or added on
// another computer (they come through settings sync). Settings › Accounts lists them with a Sign in button each,
// and ticks them off as they're added. Only names and server details travel, never a password or sign-in.
import { create } from 'zustand';
import type { Account } from './types';
import { useMail, toast, updateAccount, openScreen, errorToast, addGoogleAccountAs, addMicrosoftAccountStrict } from './mail';
import { openGuide } from './guide';
import { presetForEmail } from './imapUtil';

export interface WantedAccount {
  email: string;
  kind: 'gmail' | 'microsoft' | 'imap';
  label?: string;
  colour?: string;
  imap?: Account['imap'];
  /** Where it was found. */
  from: 'backup' | 'other';
}

const LIST_KEY = 'wgm.accountsToAdd';
const NO_KEY = 'wgm.accountsNotHere';
const low = (x: string) => x.trim().toLowerCase();
const keyOf = (a: { kind: string; email: string }) => `${a.kind}:${low(a.email)}`;

const load = <T,>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return fallback; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export const useAccountsToAdd = create<{ list: WantedAccount[]; busy?: string }>(() => ({ list: load<WantedAccount[]>(LIST_KEY, []) }));
const notHere = (): string[] => load<string[]>(NO_KEY, []);

/**
 * The accounts in `found` that aren't on this computer. Accounts you said aren't for this computer are left out,
 * unless you picked a backup to set up from, which asks for all of them. Exported for tests.
 */
export function missingAccounts(found: unknown, here: Pick<Account, 'kind' | 'email'>[], declined: string[], from: WantedAccount['from']): WantedAccount[] {
  if (!Array.isArray(found)) return [];
  const have = new Set(here.map(keyOf));
  const no = new Set(declined);
  const out: WantedAccount[] = [];
  for (const e of found as Partial<WantedAccount>[]) {
    if (!e || typeof e.email !== 'string' || !e.email.includes('@')) continue;
    const kind = e.kind === 'microsoft' || e.kind === 'imap' ? e.kind : e.kind === 'gmail' || !e.kind ? 'gmail' : undefined;
    if (!kind) continue; // demo
    const k = keyOf({ kind, email: e.email });
    if (have.has(k) || (from === 'other' && no.has(k)) || out.some((o) => keyOf(o) === k)) continue;
    // An IMAP account needs its server details, unless it's a known service such as iCloud.
    if (kind === 'imap' && !e.imap?.host && !presetForEmail(e.email)) continue;
    out.push({ email: low(e.email), kind, label: typeof e.label === 'string' ? e.label : undefined, colour: typeof e.colour === 'string' ? e.colour : undefined, ...(kind === 'imap' && e.imap ? { imap: e.imap } : {}), from });
  }
  return out;
}

function setList(list: WantedAccount[]) {
  useAccountsToAdd.setState({ list });
  save(LIST_KEY, list);
}

/** Adds accounts to the list. Returns the ones that are new to it. */
export function wantAccounts(found: unknown, from: WantedAccount['from']): WantedAccount[] {
  const st = useMail.getState();
  const add = missingAccounts(found, st.accounts, notHere(), from).filter((a) => !useAccountsToAdd.getState().list.some((x) => keyOf(x) === keyOf(a)));
  if (add.length) setList([...useAccountsToAdd.getState().list, ...add]);
  return add;
}

/** Accounts added on another computer, read from the settings file: listed here, with a note the first time. */
export function accountsFromOtherComputers(found: unknown) {
  // Not before this computer's own accounts have loaded, or they'd all look missing.
  const st = useMail.getState();
  if (!st.ready || st.accounts.some((a) => a.kind === 'demo')) return;
  const add = wantAccounts(found, 'other');
  if (!add.length) return;
  const names = add.map((a) => a.label || a.email);
  toast({
    text: add.length === 1 ? `${names[0]} was added on another computer. Add it here too?` : `${add.length} accounts were added on another computer: ${names.join(', ')}. Add them here too?`,
    ttl: 30000,
    action: add.length === 1 ? { label: 'Add', run: () => void signInTo(add[0]) } : { label: 'Show', run: () => openScreen('settings', 'accounts') },
  });
}

/** Not on this computer: off the list, and not offered again from other computers. */
export function notOnThisComputer(a: WantedAccount) {
  setList(useAccountsToAdd.getState().list.filter((x) => keyOf(x) !== keyOf(a)));
  save(NO_KEY, [...new Set([...notHere(), keyOf(a)])]);
}

/** Signs in to one account on the list. Google and Microsoft open their sign-in page; iCloud and others ask for an app password. */
export async function signInTo(a: WantedAccount) {
  if (a.kind === 'imap') {
    openGuide('imap', { email: a.email, imap: a.imap || undefined, preset: presetForEmail(a.email)?.id });
    return;
  }
  useAccountsToAdd.setState({ busy: keyOf(a) });
  try {
    if (a.kind === 'gmail') {
      await addGoogleAccountAs(a.email);
    } else {
      await addMicrosoftAccountStrict();
    }
  } catch (e) {
    errorToast(e, `Couldn't add ${a.email}`);
  } finally {
    useAccountsToAdd.setState({ busy: undefined });
  }
}

/** Keeps the list in step: an account added here comes off it (with its nickname and colour from elsewhere), and
 * one removed here isn't offered back from other computers. */
export function startAccountsToAdd() {
  let before = new Set(useMail.getState().accounts.map(keyOf));
  let ready = useMail.getState().ready;
  useMail.subscribe((s) => {
    const now = new Set(s.accounts.map(keyOf));
    if (ready && s.ready) {
      const removed = [...before].filter((k) => !now.has(k) && !k.startsWith('demo:'));
      if (removed.length) save(NO_KEY, [...new Set([...notHere(), ...removed])]);
    }
    ready = s.ready;
    before = now;
    const list = useAccountsToAdd.getState().list;
    const done = list.filter((w) => now.has(keyOf(w)));
    if (!done.length) return;
    // Off the list first, so the nickname changes below don't find them again.
    setList(list.filter((w) => !now.has(keyOf(w))));
    for (const w of done) {
      const acc = s.accounts.find((x) => keyOf(x) === keyOf(w));
      if (acc && (w.label || w.colour)) updateAccount(acc.id, { ...(w.label ? { label: w.label } : {}), ...(w.colour ? { colour: w.colour } : {}) });
    }
    // Something you added on purpose here is fine to offer again later, if it's ever removed and added elsewhere.
    save(NO_KEY, notHere().filter((k) => !done.some((w) => keyOf(w) === k)));
  });
}
