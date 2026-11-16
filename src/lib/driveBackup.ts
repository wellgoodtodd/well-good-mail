// Automatic backups of settings and rules to Google Drive: Well Good Mail › Backups › <this computer>.
// Each backup is one small JSON file: every setting (rules, signatures, templates, groups, Smart Mailboxes, Out of
// Office…) and the list of accounts (no passwords, no sign-in tokens, no mail). AI Connection settings are left out,
// as they are from settings sync, so a file in Drive can never widen what an AI may do.
import { create } from 'zustand';
import { useSettings, settings, type Settings } from './settings';
import { useMail, toast, updateAccount } from './mail';
import type { Account } from './types';
import { BACKUPS, cleanFolderName, driveCall, folderId } from './driveFolder';
import { driveAccount } from './settingsSync';

export const BACKUP_FORMAT = 'wgm-backup';
const DAY = 86400000;
/** Never put in a backup, and never taken from one. */
const LEFT_OUT = new Set(['mcp', 'demoMode', 'backupLastAt', 'keysBackedUpAt', 'whatsNewSeen', 'deviceName', 'syncSettings', 'collapsed']);

export type BackupAccount = Pick<Account, 'email' | 'kind' | 'label' | 'displayName' | 'colour' | 'order' | 'notify' | 'retentionDays' | 'leaveOutOfAll' | 'imap'>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  appVersion?: string;
  createdAt: number;
  device: string;
  settings: Record<string, unknown>;
  accounts: BackupAccount[];
}

export interface BackupListing { id: string; name: string; device: string; createdAt: number; size?: number }

/** What a backup holds, from the settings and accounts given. */
export function buildBackup(all: Record<string, unknown>, accounts: Account[], device: string, now: number, appVersion?: string): BackupFile {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) if (typeof v !== 'function' && !LEFT_OUT.has(k)) out[k] = v;
  return {
    format: BACKUP_FORMAT,
    version: 1,
    appVersion,
    createdAt: now,
    device,
    settings: out,
    accounts: [...accounts].sort((a, b) => a.order - b.order).map((a) => ({
      email: a.email, kind: a.kind, label: a.label, displayName: a.displayName, colour: a.colour, order: a.order,
      notify: a.notify, retentionDays: a.retentionDays, ...(a.leaveOutOfAll ? { leaveOutOfAll: true } : {}), ...(a.imap ? { imap: a.imap } : {}),
    })),
  };
}

/** Reads a backup file's text. Throws a plain message if it isn't one. */
export function parseBackup(text: string): BackupFile {
  let data: Partial<BackupFile>;
  try { data = JSON.parse(text) as Partial<BackupFile>; } catch { throw new Error("That isn't a Well Good Mail backup."); }
  if (data.format !== BACKUP_FORMAT || typeof data.settings !== 'object' || !data.settings || !Array.isArray(data.accounts)) throw new Error("That isn't a Well Good Mail backup.");
  return data as BackupFile;
}

/** The settings from a backup that this app knows, minus the ones that belong to one computer or the AI Connection. */
export function settingsPatch(file: BackupFile, known: Record<string, unknown>): Partial<Settings> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(file.settings)) if (k in known && typeof known[k] !== 'function' && !LEFT_OUT.has(k)) patch[k] = v;
  return patch as Partial<Settings>;
}

/** Whether a backup is due: never made, or older than a day, week or month (a little early is fine, so it doesn't drift). */
export function backupIsDue(every: Settings['backupEvery'], lastAt: number, now: number): boolean {
  if (every === 'off') return false;
  if (!lastAt) return true;
  const gap = every === 'day' ? DAY : every === 'week' ? 7 * DAY : 30 * DAY;
  return now - lastAt >= gap - 2 * 3600000;
}

/** The file name: "Well Good Mail backup 2026-11-16 2350.json". */
export function backupName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Well Good Mail backup ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** The backups to delete so only the newest `keep` are left (at least one is always kept). */
export function toPrune<T extends { createdAt: number }>(files: T[], keep: number): T[] {
  return [...files].sort((a, b) => b.createdAt - a.createdAt).slice(Math.max(1, Math.floor(keep) || 1));
}

/** A first name for this computer, until it's renamed in Settings: "Windows PC, added 16 Nov 2026". */
export const defaultDeviceName = (now = Date.now()) => `Windows PC, added ${new Date(now).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

/** This computer's name, made once if it has none. */
export function deviceName(): string {
  const s = settings();
  if (s.deviceName) return s.deviceName;
  const name = defaultDeviceName();
  useSettings.getState().set({ deviceName: name }, { quiet: true });
  return name;
}

export const useBackupStatus = create<{ busy: boolean; error?: string }>(() => ({ busy: false }));

let appVersion: string | undefined;
async function version(): Promise<string | undefined> {
  if (appVersion) return appVersion;
  try { const { getVersion } = await import('@tauri-apps/api/app'); appVersion = await getVersion(); } catch { /* browser preview */ }
  return appVersion;
}

/** Backups made by this app in that account's Drive, newest first. */
export async function listBackups(email = driveAccount()): Promise<BackupListing[]> {
  if (!email) return [];
  const q = encodeURIComponent(`appProperties has { key='wgm' and value='backup' } and trashed=false`);
  const r = await driveCall<{ files: { id: string; name: string; size?: string; createdTime: string; appProperties?: Record<string, string> }[] }>(email, `/files?q=${q}&fields=files(id,name,size,createdTime,appProperties)&orderBy=createdTime desc&pageSize=200`);
  return r.files.map((f) => ({ id: f.id, name: f.name, device: f.appProperties?.device || '', createdAt: Number(f.appProperties?.at) || Date.parse(f.createdTime), size: f.size ? Number(f.size) : undefined }));
}

/** Makes a backup now, into this computer's folder, then deletes the oldest past the number to keep. */
export async function backUpNow(opts: { quiet?: boolean } = {}): Promise<boolean> {
  const email = driveAccount();
  if (!email) { if (!opts.quiet) toast({ text: 'Backups need a Google account, for Google Drive.' }); return false; }
  if (useBackupStatus.getState().busy) return false;
  useBackupStatus.setState({ busy: true, error: undefined });
  try {
    const device = cleanFolderName(deviceName());
    const now = Date.now();
    const file = buildBackup(useSettings.getState() as unknown as Record<string, unknown>, useMail.getState().accounts, device, now, await version());
    const folder = await folderId(email, [BACKUPS, device]);
    const boundary = `wgm${now.toString(36)}`;
    const meta = { name: backupName(now), mimeType: 'application/json', parents: [folder], appProperties: { wgm: 'backup', device, at: String(now) } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(file)}\r\n--${boundary}--`;
    await driveCall(email, '/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, true);
    useSettings.getState().set({ backupLastAt: now }, { quiet: true });
    // Only this computer's own backups are trimmed; other computers look after theirs.
    const mine = (await listBackups(email)).filter((b) => b.device === device);
    for (const old of toPrune(mine, settings().backupKeep)) await driveCall(email, `/files/${old.id}`, { method: 'DELETE' }).catch(() => {});
    if (!opts.quiet) toast({ text: 'Backed up to Google Drive' });
    return true;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    useBackupStatus.setState({ error });
    if (!opts.quiet) toast({ text: `Couldn't back up: ${error}`, ttl: 9000 });
    else console.warn('Automatic backup failed', e);
    return false;
  } finally {
    useBackupStatus.setState({ busy: false });
  }
}

/** Reads one backup from Drive. */
export async function readBackup(id: string, email = driveAccount()): Promise<BackupFile> {
  if (!email) throw new Error('No Google account');
  const data = await driveCall<unknown>(email, `/files/${id}?alt=media`);
  return parseBackup(JSON.stringify(data));
}

/**
 * Puts a backup's settings back (one Undo step), and the nicknames and colours of accounts that are here. Returns the
 * accounts in the backup that aren't on this computer, so they can be offered to add.
 */
export function restoreBackup(file: BackupFile): BackupAccount[] {
  const st = useSettings.getState();
  st.set(settingsPatch(file, st as unknown as Record<string, unknown>));
  const here = useMail.getState().accounts;
  const missing: BackupAccount[] = [];
  for (const a of file.accounts) {
    const acc = here.find((x) => x.email.toLowerCase() === a.email.toLowerCase() && x.kind === a.kind);
    if (!acc) { missing.push(a); continue; }
    const patch: Partial<Account> = {};
    if (a.label && a.label !== acc.label) patch.label = a.label;
    if (a.colour && a.colour !== acc.colour) patch.colour = a.colour;
    if (Object.keys(patch).length) updateAccount(acc.id, patch);
  }
  return missing;
}

/** Checks a minute after starting, then every hour, and backs up when one is due. */
export function startBackups() {
  const check = () => { const s = settings(); if (!s.demoMode && backupIsDue(s.backupEvery, s.backupLastAt, Date.now())) void backUpNow({ quiet: true }); };
  setTimeout(check, 60000);
  setInterval(check, 3600000);
}
