// A small backup of the things that are hard to get back: the Google and Microsoft app keys the person made in the
// setup guides. They live in Windows Credential Manager, so a reinstall or a new PC would lose them. The file has
// no mail and no sign in tokens, but the Google secret is in it, so it must be kept private.
import { saveFile, secrets } from './platform';
import { useSettings } from './settings';
import { toast } from './mail';

const KEYS = ['google-client-id', 'google-client-secret', 'microsoft-client-id'] as const;

export interface KeysFile {
  format: 'wgm-keys';
  version: 1;
  exportedAt: number;
  keys: Partial<Record<(typeof KEYS)[number], string>>;
}

/** Whether there is anything worth backing up: keys the person made themselves. */
export async function haveOwnKeys(): Promise<boolean> {
  try { return Boolean(await secrets.get('google-client-id')); } catch { return false; }
}

export async function exportKeys(): Promise<boolean> {
  const keys: KeysFile['keys'] = {};
  for (const k of KEYS) {
    const v = await secrets.get(k).catch(() => null);
    if (v) keys[k] = v;
  }
  if (!Object.keys(keys).length) {
    toast({ text: 'There are no app keys of your own to back up. The shared Microsoft app needs none.' });
    return false;
  }
  const data: KeysFile = { format: 'wgm-keys', version: 1, exportedAt: Date.now(), keys };
  await saveFile('well-good-mail-keys.json', new TextEncoder().encode(JSON.stringify(data, null, 2)), 'application/json', { ask: true });
  useSettings.getState().set({ keysBackedUpAt: Date.now() });
  toast({ text: 'Keys saved. Keep that file somewhere private: it holds your Google secret.', ttl: 8000 });
  return true;
}

/** Reads a file made by exportKeys and puts the keys back. Returns how many were restored. */
export async function importKeys(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<KeysFile>;
  if (data.format !== 'wgm-keys' || !data.keys) throw new Error("That isn't a Well Good Mail keys file.");
  let n = 0;
  for (const k of KEYS) {
    const v = data.keys[k];
    if (typeof v === 'string' && v) { await secrets.set(k, v); n++; }
  }
  return n;
}

const DAY = 86400000;

/** True when keys exist but no backup has been made, or the last one is more than a year old. */
export function backupDue(hasKeys: boolean, backedUpAt: number, now = Date.now()): boolean {
  return hasKeys && (!backedUpAt || now - backedUpAt > 365 * DAY);
}
