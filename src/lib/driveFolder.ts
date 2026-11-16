// One Well Good Mail folder in Google Drive, so the app's files aren't loose in My Drive:
//   Well Good Mail/
//     well-good-mail-settings.json   (settings sync, shared with the phone)
//     Event files/                   (files put on calendar events)
//     Backups/<this computer>/       (automatic backups, one folder per computer)
// Drive access is limited to files this app made (drive.file), so the folder is found by name among those, and its id
// is remembered on this computer. Moving or renaming it in Drive is fine: the id stays the same.
import { httpFetch } from './platform';
import { getGoogleAccessToken } from './auth/google';

export const FOLDER_NAME = 'Well Good Mail';
export const EVENT_FILES = 'Event files';
export const BACKUPS = 'Backups';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const IDS_KEY = 'wgm.driveFolders';

/** Calls the Drive API as one Google account. Throws with Drive's status when it says no. */
export async function driveCall<T>(email: string, path: string, init: RequestInit = {}, upload = false): Promise<T> {
  const token = await getGoogleAccessToken(email);
  const base = upload ? 'https://www.googleapis.com/upload/drive/v3' : 'https://www.googleapis.com/drive/v3';
  const res = await httpFetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) throw Object.assign(new Error(`Drive said ${res.status}`), { status: res.status });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Quotes a name for a Drive search (q=…), so an apostrophe or backslash in it can't change the search. */
export const qName = (name: string) => `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A folder name a computer can use: no slashes or control characters, not empty, not too long. */
export function cleanFolderName(name: string, fallback = 'This computer'): string {
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return n || fallback;
}

type Ids = Record<string, string>;
const readIds = (): Ids => { try { return JSON.parse(localStorage.getItem(IDS_KEY) || '{}') as Ids; } catch { return {}; } };
const writeIds = (ids: Ids) => { try { localStorage.setItem(IDS_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ } };
const idKey = (email: string, path: string) => `${email.toLowerCase()}|${path}`;

/** Forgets the folders remembered for an account (after one was deleted in Drive, say). */
export function forgetFolders(email?: string) {
  if (!email) return writeIds({});
  const ids = readIds();
  for (const k of Object.keys(ids)) if (k.startsWith(`${email.toLowerCase()}|`)) delete ids[k];
  writeIds(ids);
}

async function stillThere(email: string, id: string): Promise<boolean> {
  try {
    const f = await driveCall<{ trashed?: boolean }>(email, `/files/${id}?fields=id,trashed`);
    return !f.trashed;
  } catch { return false; }
}

/** The search for a folder: the top one by its hidden tag (so a renamed one is still found), the others by name inside their parent. */
export function folderQuery(name: string, parent?: string): string {
  return [parent ? `name=${qName(name)}` : `appProperties has { key='wgm' and value='root' }`, `mimeType='${FOLDER_MIME}'`, 'trashed=false', parent ? `${qName(parent)} in parents` : ''].filter(Boolean).join(' and ');
}

/** Finds a folder this app made (under parent, or the top folder), or makes it. */
async function findOrMake(email: string, name: string, parent?: string): Promise<string> {
  const r = await driveCall<{ files: { id: string }[] }>(email, `/files?q=${encodeURIComponent(folderQuery(name, parent))}&fields=files(id)&orderBy=createdTime&pageSize=1`);
  if (r.files[0]) return r.files[0].id;
  const made = await driveCall<{ id: string }>(email, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : { appProperties: { wgm: 'root' } }) }),
  });
  return made.id;
}

/**
 * The id of a folder inside Well Good Mail ([] for the top folder itself), made if it isn't there yet. Remembered on
 * this computer, and checked again if Drive says it's gone.
 */
export async function folderId(email: string, path: string[] = [], topName = FOLDER_NAME): Promise<string> {
  const ids = readIds();
  let parent: string | undefined;
  for (let i = 0; i <= path.length; i++) {
    const key = idKey(email, path.slice(0, i).join('/'));
    let id: string | undefined = ids[key];
    if (id && i === path.length && !(await stillThere(email, id))) id = undefined;
    if (!id) {
      id = await findOrMake(email, i === 0 ? topName : path[i - 1], parent);
      ids[key] = id;
      writeIds(ids);
    }
    parent = id;
  }
  return parent!;
}

/** Puts a file the app made into a folder (keeping its id, so anything that finds it by name still does). */
export async function moveInto(email: string, fileId: string, folder: string): Promise<void> {
  const f = await driveCall<{ parents?: string[] }>(email, `/files/${fileId}?fields=parents`);
  if (f.parents?.includes(folder)) return;
  const remove = (f.parents || []).join(',');
  await driveCall(email, `/files/${fileId}?addParents=${folder}${remove ? `&removeParents=${remove}` : ''}&fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

/** The folder's name and a link to open it in Drive. */
export async function folderInfo(email: string): Promise<{ id: string; name: string; link: string }> {
  const id = await folderId(email);
  const f = await driveCall<{ name: string; webViewLink: string }>(email, `/files/${id}?fields=name,webViewLink`);
  return { id, name: f.name, link: f.webViewLink };
}

/** Renames the Well Good Mail folder in Drive. */
export async function renameFolder(email: string, name: string): Promise<void> {
  const id = await folderId(email);
  await driveCall(email, `/files/${id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cleanFolderName(name, FOLDER_NAME) }) });
}
