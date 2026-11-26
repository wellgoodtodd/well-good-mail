// Hub projects on conversations: Gmail labels under "Hub/" (like "Hub/1234 Smith wedding"), so Well Good Mail, the
// hub, Gmail on the web and the phone all show which project an email belongs to. The hub reads the same labels.
import { applyLabel, providerFor, toast, useMail } from './mail';
import { store } from './db';
import { askText } from './dialogs';
import type { Folder } from './types';

export const HUB_PREFIX = 'Hub/';

/** The account's Hub project labels, sorted by name. */
export function hubLabels(accountId: string): Folder[] {
  return (useMail.getState().folders[accountId] || [])
    .filter((f) => !f.system && f.name.toLowerCase().startsWith(HUB_PREFIX.toLowerCase()) && f.name.length > HUB_PREFIX.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true }));
}

/** The project's name without "Hub/", for menus. */
export const hubName = (f: Pick<Folder, 'name'>) => f.name.slice(HUB_PREFIX.length);

/** "1234 Smith wedding" (or "Hub/1234 Smith wedding") to the label's full name. */
export function hubLabelName(typed: string): string {
  const t = typed.trim().replace(/^\/+|\/+$/g, '');
  return t.toLowerCase().startsWith(HUB_PREFIX.toLowerCase()) ? HUB_PREFIX + t.slice(HUB_PREFIX.length).trim() : HUB_PREFIX + t;
}

/** Tags or untags the emails with a Hub project label. */
export async function setHubProject(ids: string[], accountId: string, label: Folder, remove: boolean) {
  await applyLabel(ids, accountId, label.id, remove);
  toast({ text: remove ? `Taken out of ${hubName(label)}` : `Tagged with ${hubName(label)}`, ttl: 3000 });
}

/** Asks for a new project's name, makes its Gmail label and tags the emails with it. */
export async function newHubProject(ids: string[], accountId: string) {
  const typed = await askText('New Hub project (job number and name)', '', 'Create');
  if (!typed?.trim() || hubLabelName(typed) === HUB_PREFIX) return;
  const p = providerFor(accountId);
  if (!p?.ensureLabel) return toast({ text: 'Hub projects work on Google accounts only' });
  const name = hubLabelName(typed);
  try {
    const id = await p.ensureLabel(name);
    const folders = await p.listFolders();
    useMail.setState({ folders: { ...useMail.getState().folders, [accountId]: folders } });
    void store.putFolders(accountId, folders);
    await setHubProject(ids, accountId, folders.find((f) => f.id === id) || { id, accountId, name, unread: 0, depth: 1 }, false);
  } catch (e) {
    toast({ text: `Couldn't make that project: ${e instanceof Error ? e.message : String(e)}` });
  }
}
