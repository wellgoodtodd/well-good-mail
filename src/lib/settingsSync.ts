// Keeps settings the same on every computer, using one small file the app keeps in Google Drive.
// Drive access is limited to files this app created, so nothing else in Drive is visible to it.
import { useSettings, settings } from './settings';
import { useMail, toast } from './mail';
import { httpFetch } from './platform';
import { getGoogleAccessToken } from './auth/google';

const FILE_NAME = 'well-good-mail-settings.json';
const STAMP_KEY = 'wgm.settingsSync.stamp';

/** Things that belong to one computer, not to you. */
const PER_DEVICE = new Set(['whatsNewSeen', 'keysBackedUpAt', 'syncSettings', 'startWithWindows', 'closeQuits', 'autoUpdate', 'testVersionNotices', 'mcp', 'collapsed']);

const read = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(useSettings.getState())) if (typeof v !== 'function' && !PER_DEVICE.has(k)) out[k] = v;
  return out;
};

let applying = false;
let fileId: string | undefined;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

/** The Google account whose Drive holds the file: the default sender if it is a Google account. */
function driveAccount(): string | undefined {
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

const stamp = () => Number(localStorage.getItem(STAMP_KEY) || 0);
const setStamp = (iso: string) => { try { localStorage.setItem(STAMP_KEY, String(Date.parse(iso))); } catch { /* storage unavailable */ } };

/** Fetches the shared settings if they're newer than what this computer last saw. */
export async function pullSettings(): Promise<void> {
  if (!settings().syncSettings || !driveAccount()) return;
  try {
    const f = await findFile();
    if (!f) return void (await pushSettings());
    fileId = f.id;
    if (Date.parse(f.modifiedTime) <= stamp()) return;
    const remote = await drive<Record<string, unknown>>(`/files/${f.id}?alt=media`);
    applying = true;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(remote)) if (!PER_DEVICE.has(k) && k in useSettings.getState()) patch[k] = v;
    useSettings.getState().set(patch, { quiet: true });
    setStamp(f.modifiedTime);
  } catch (e) {
    console.warn('Settings sync (pull) failed', e);
  } finally {
    applying = false;
  }
}

export async function pushSettings(): Promise<void> {
  if (!settings().syncSettings || !driveAccount()) return;
  try {
    if (!fileId) fileId = (await findFile())?.id;
    if (!fileId) {
      const made = await drive<{ id: string }>('/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FILE_NAME }) });
      fileId = made.id;
    }
    const saved = await drive<{ modifiedTime: string }>(`/files/${fileId}?uploadType=media&fields=modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(read()) }, true);
    setStamp(saved.modifiedTime);
  } catch (e) {
    console.warn('Settings sync (push) failed', e);
  }
}

/** Starts watching: pull at start, every five minutes and on coming to the front; push a few seconds after any change. */
export function startSettingsSync() {
  setTimeout(pullSettings, 6000);
  // Often enough that a group made on the phone (Well Good Calendar shares this file) turns up here soon.
  setInterval(pullSettings, 5 * 60 * 1000);
  let lastFocus = 0;
  window.addEventListener('focus', () => { if (Date.now() - lastFocus > 60000) { lastFocus = Date.now(); void pullSettings(); } });
  let last = JSON.stringify(read());
  useSettings.subscribe(() => {
    if (applying || !settings().syncSettings) return;
    const now = JSON.stringify(read());
    if (now === last) return;
    last = now;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushSettings, 5000);
  });
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
