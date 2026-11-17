// Keeps settings the same on every computer, using one small file the app keeps in Google Drive.
// Drive access is limited to files this app created, so nothing else in Drive is visible to it.
import { create } from 'zustand';
import { accountsFromOtherComputers } from './accountsToAdd';
import { useSettings, settings } from './settings';
import { useMail, toast, updateAccount } from './mail';
import type { Account } from './types';
import { httpFetch } from './platform';
import { getGoogleAccessToken } from './auth/google';
import { folderId, moveInto } from './driveFolder';

export const FILE_NAME = 'well-good-mail-settings.json';
const STAMP_KEY = 'wgm.settingsSync.stamp';
/** The nicknames and colours last written to the file, so a computer that has never sent them sends them once, and
 * a nickname or colour in the file that differs from it is known to be a change made on the phone. */
const LOOKS_KEY = 'wgm.settingsSync.looks';
/** When the file was last saved from this computer (ms), for Settings › General. */
const SAVED_KEY = 'wgm.settingsSync.saved';

const readSaved = () => { try { return Number(localStorage.getItem(SAVED_KEY) || 0) || undefined; } catch { return undefined; } };
/** For Settings › General: when this computer last saved the file to Google Drive. */
export const useSettingsSyncStatus = create<{ lastSaved?: number }>(() => ({ lastSaved: readSaved() }));
let failToldThisSession = false;

/** Things that belong to one computer, not to you. */
const PER_DEVICE = new Set(['whatsNewSeen', 'keysBackedUpAt', 'syncSettings', 'backupLastAt', 'deviceName', 'startWithWindows', 'closeQuits', 'autoUpdate', 'testVersionNotices', 'mcp', 'collapsed']);

export interface Look { email: string; kind?: string; label?: string; colour?: string; imap?: Account['imap'] }

/** Each account's nickname and colour, shared with Well Good Calendar on the phone. The phone can change them too,
 * and changes it made are read back in pullSettings (see looksFromPhone). */
// IMAP accounts also carry their server details (never a password), so another computer can offer to add them.
const accountLooks = (): Look[] => useMail.getState().accounts.filter((a) => a.kind !== 'demo').map((a) => ({ email: a.email, kind: a.kind, label: a.label, colour: a.colour, ...(a.kind === 'imap' && a.imap ? { imap: a.imap } : {}) }));

const readSent = (): Look[] => { try { return JSON.parse(localStorage.getItem(LOOKS_KEY) || '[]') as Look[]; } catch { return []; } };

/**
 * The nickname and colour changes the phone made, as account patches. A value in the file that matches what this
 * computer last sent is not a change. Only Google accounts on this computer, matched by email (any case).
 */
export function looksFromPhone(remote: unknown, accounts: Pick<Account, 'id' | 'email' | 'kind' | 'label' | 'colour'>[], sent: Look[]): { id: string; email: string; patch: Partial<Pick<Account, 'label' | 'colour'>> }[] {
  if (!Array.isArray(remote)) return [];
  const out: { id: string; email: string; patch: Partial<Pick<Account, 'label' | 'colour'>> }[] = [];
  const low = (x: string) => x.trim().toLowerCase();
  for (const e of remote as Look[]) {
    if (!e || typeof e.email !== 'string' || (e.kind && e.kind !== 'gmail')) continue;
    const acc = accounts.find((a) => a.kind === 'gmail' && low(a.email) === low(e.email));
    if (!acc) continue;
    const was = sent.find((x) => low(x.email) === low(e.email));
    const patch: Partial<Pick<Account, 'label' | 'colour'>> = {};
    const label = typeof e.label === 'string' ? e.label.trim() : '';
    if (label !== (was?.label ?? '').trim() && label !== (acc.label || '')) patch.label = label;
    const colour = typeof e.colour === 'string' && /^#[0-9a-f]{3,8}$/i.test(e.colour) ? e.colour : undefined;
    if (colour && colour !== was?.colour && colour !== acc.colour) patch.colour = colour;
    if (Object.keys(patch).length) out.push({ id: acc.id, email: acc.email, patch });
  }
  return out;
}

/** Nicknames and colours changed on the phone, put on the accounts here quietly (no Undo step, not pushed back). */
function takeLooksFromPhone(remote: Record<string, unknown>) {
  const changes = looksFromPhone(remote.accounts, useMail.getState().accounts, readSent());
  if (!changes.length) return;
  for (const c of changes) updateAccount(c.id, c.patch);
  // What the phone set now counts as sent, so it isn't read as a change again. Other accounts keep what was there,
  // so ones this computer has never sent still go on the next push.
  const sent = readSent();
  for (const c of changes) {
    const now = accountLooks().find((x) => x.email === c.email);
    if (!now) continue;
    const i = sent.findIndex((x) => x.email.toLowerCase() === c.email.toLowerCase());
    if (i >= 0) sent[i] = now; else sent.push(now);
  }
  try { localStorage.setItem(LOOKS_KEY, JSON.stringify(sent)); } catch { /* storage unavailable */ }
}

const read = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(useSettings.getState())) if (typeof v !== 'function' && !PER_DEVICE.has(k)) out[k] = v;
  out.accounts = accountLooks();
  return out;
};

let applying = false;
let fileId: string | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** The Google account whose Drive holds the file: the default sender if it is a Google account. */
export function driveAccount(): string | undefined {
  const google = useMail.getState().accounts.filter((a) => a.kind === 'gmail');
  return (google.find((a) => a.email === settings().defaultFromEmail) || google[0])?.email;
}

async function drive<T>(path: string, init: RequestInit = {}, upload = false, account?: string): Promise<T> {
  const email = account || driveAccount();
  if (!email) throw new Error('No Google account to keep the settings file in');
  const token = await getGoogleAccessToken(email);
  const base = upload ? 'https://www.googleapis.com/upload/drive/v3' : 'https://www.googleapis.com/drive/v3';
  const res = await httpFetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Drive said ${res.status}`);
  return (await res.json()) as T;
}

async function findFile(account?: string): Promise<{ id: string; modifiedTime: string } | undefined> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await drive<{ files: { id: string; modifiedTime: string }[] }>(`/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`, {}, false, account);
  return r.files[0];
}

/** A settings file from before 0.7.5 sits loose in My Drive: move it into the Well Good Mail folder, once per run.
 * It keeps its id and name, so the phone (which finds it by name) still does. */
let tidied = false;
async function tidyIntoFolder(id: string) {
  const email = driveAccount();
  if (tidied || !email) return;
  tidied = true;
  try { await moveInto(email, id, await folderId(email)); } catch (e) { console.warn('Settings file not moved into the folder', e); }
}

const stamp = () =>Number(localStorage.getItem(STAMP_KEY) || 0);
const setStamp = (iso: string) => { try { localStorage.setItem(STAMP_KEY, String(Date.parse(iso))); } catch { /* storage unavailable */ } };

/** Fetches the shared settings if they're newer than what this computer last saw. True when this computer is up to date with the file. */
export async function pullSettings(): Promise<boolean> {
  if (!settings().syncSettings || !driveAccount()) return false;
  try {
    const f = await findFile();
    if (!f) { await pushSettings(); return false; }
    fileId = f.id;
    if (Date.parse(f.modifiedTime) <= stamp()) return true;
    const remote = await drive<Record<string, unknown>>(`/files/${f.id}?alt=media`);
    applying = true;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(remote)) if (!PER_DEVICE.has(k) && k in useSettings.getState()) patch[k] = v;
    useSettings.getState().set(patch, { quiet: true });
    takeLooksFromPhone(remote);
    accountsFromOtherComputers(remote.accounts);
    setStamp(f.modifiedTime);
    return true;
  } catch (e) {
    console.warn('Settings sync (pull) failed', e);
    return false;
  } finally {
    applying = false;
  }
}

export async function pushSettings(): Promise<void> {
  if (!settings().syncSettings || !driveAccount()) return;
  try {
    // Read first: if the phone (or another computer) saved since this computer last read the file, take those changes
    // in before writing, or saving here would write over them (a nickname changed on the phone was lost this way).
    const f = await findFile();
    if (f) {
      fileId = f.id;
      if (Date.parse(f.modifiedTime) > stamp()) await pullSettings();
    }
    if (!fileId) {
      const folder = await folderId(driveAccount()!).catch(() => undefined);
      const made = await drive<{ id: string }>('/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FILE_NAME, ...(folder ? { parents: [folder] } : {}) }) });
      fileId = made.id;
    } else void tidyIntoFolder(fileId);
    const saved = await drive<{ modifiedTime: string }>(`/files/${fileId}?uploadType=media&fields=modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(read()) }, true);
    setStamp(saved.modifiedTime);
    const at = Date.parse(saved.modifiedTime) || Date.now();
    try { localStorage.setItem(LOOKS_KEY, JSON.stringify(accountLooks())); localStorage.setItem(SAVED_KEY, String(at)); } catch { /* storage unavailable */ }
    useSettingsSyncStatus.setState({ lastSaved: at });
  } catch (e) {
    console.warn('Settings sync (push) failed', e);
    if (!failToldThisSession) {
      failToldThisSession = true;
      toast({ text: `Couldn't save your settings to Google Drive, so your phone and other computers won't see the latest. ${e instanceof Error ? e.message : ''}`.trim(), ttl: 9000 });
    }
  }
}

/** Starts watching: pull at start, every five minutes and on coming to the front; push a few seconds after any change. */
export function startSettingsSync() {
  // Pull first, then send the nicknames and colours if this computer has not sent these ones yet (the file from
  // before they were shared has none, and nothing else would send them until a setting changed).
  setTimeout(() => void pullSettings().then((ok) => {
    if (!ok) return;
    let sent: string | null = null;
    try { sent = localStorage.getItem(LOOKS_KEY); } catch { /* storage unavailable */ }
    if (settings().syncSettings && sent !== JSON.stringify(accountLooks())) void pushSettings();
  }), 6000);
  // Often enough that a group made on the phone (Well Good Calendar shares this file) turns up here soon.
  setInterval(pullSettings, 5 * 60 * 1000);
  let lastFocus = 0;
  window.addEventListener('focus', () => { if (Date.now() - lastFocus > 60000) { lastFocus = Date.now(); void pullSettings(); } });
  let last = JSON.stringify(read());
  const changed = () => {
    if (applying || !settings().syncSettings) return;
    const now = JSON.stringify(read());
    if (now === last) return;
    last = now;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushSettings, 5000);
  };
  useSettings.subscribe(changed);
  // A nickname or colour changed in Settings › Accounts.
  let looks = JSON.stringify(accountLooks());
  useMail.subscribe(() => { const now = JSON.stringify(accountLooks()); if (now !== looks) { looks = now; changed(); } });
}

/** Called when the switch is turned on: take the shared settings if there are any, otherwise create them from this computer. */
export async function enableSettingsSync() {
  if (!driveAccount()) return void toast({ text: 'Settings sync needs a Google account' });
  const f = await findFile().catch(() => undefined);
  if (f) {
    localStorage.removeItem(STAMP_KEY);
    await pullSettings();
    toast({ text: 'Settings brought in from your other computer' });
  } else {
    await pushSettings();
    toast({ text: 'Settings saved to Google Drive. Turn this on in the other computer too.' });
  }
}

/**
 * After the app's data was lost: looks in each Google account's Drive for the settings file (it lives in whichever
 * account was the default sender), newest first. Undefined when there is none.
 */
export async function findSettingsBackup(): Promise<{ email: string; modifiedTime: string } | undefined> {
  const google = useMail.getState().accounts.filter((a) => a.kind === 'gmail');
  const found = await Promise.all(google.map((a) => findFile(a.email).then((f) => (f ? { email: a.email, modifiedTime: f.modifiedTime } : undefined)).catch(() => undefined)));
  return found.filter((f): f is { email: string; modifiedTime: string } => Boolean(f)).sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime))[0];
}

/** Brings the settings back from that file and keeps them in step from then on. */
export async function restoreSettingsFrom(email: string) {
  fileId = undefined;
  // Quietly, so switching sync on doesn't push this computer's empty settings over the backup before it is read.
  applying = true;
  try { useSettings.getState().set({ syncSettings: true, defaultFromEmail: email }, { quiet: true }); } finally { applying = false; }
  await enableSettingsSync();
}
