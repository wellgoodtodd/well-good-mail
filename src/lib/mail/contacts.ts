// Contacts: everyone in each account's address book and everyone you've emailed, and account pictures.
import { askConfirm, askText } from '../dialogs';
import { store } from '../db';
import { settings } from '../settings';
import { isMachineAddress } from '../machineAddress';
import { httpFetch } from '../platform';
import { myAddresses } from '../compose';
import { bytesToBase64 } from '../mime';
import type { Address, ContactGroup } from '../types';
import { reconnectAccount, updateAccount } from './accounts';
import { providers, toast, useMail } from './store';

const get = useMail.getState;
const set = useMail.setState;

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
    if (!had || (!had.name && c.name)) map.set(e, { email: e, name: c.name || had?.name, photo: c.photo || had?.photo, address: c.address || had?.address });
    else { if (!had.photo && c.photo) had.photo = c.photo; if (c.address) had.address = c.address; }
  }
  const list = [...map.values()].filter((c) => !isMachineAddress(c.email));
  set({ contacts: list });
  store.putContacts(list);
  await refreshContactGroups();
}

/** Saves each Google account's profile picture, for the optional account icons in the sidebar. */
export async function refreshAccountPhotos() {
  if (!settings().accountIcons) return;
  for (const a of get().accounts) {
    if (a.kind !== 'gmail' || a.photoUrl) continue;
    try {
      const { getGoogleAccessToken } = await import('../auth/google');
      const token = await getGoogleAccessToken(a.email);
      const info = await (await httpFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } })).json();
      if (!info.picture) continue;
      const img = await httpFetch(info.picture);
      const bytes = new Uint8Array(await img.arrayBuffer());
      updateAccount(a.id, { photoUrl: `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${bytesToBase64(bytes)}` });
    } catch { /* keep the coloured dot */ }
  }
}

// Contact groups: Google Contacts labels, like Trustees. Typing a group's name in To adds everyone in it, one by one.

/** Accounts that keep contact groups (Google). */
export const groupAccounts = () => get().accounts.filter((a) => providers.get(a.id)?.listContactGroups);

const saveGroups = (list: ContactGroup[]) => {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
  set({ contactGroups: sorted });
  void store.kvSet('contactGroups', sorted).catch(() => {});
};

/** The groups saved last time, so they're there at once, before Google answers. */
export async function loadContactGroups() {
  try {
    const kept = await store.kvGet<ContactGroup[]>('contactGroups');
    if (kept?.length && !get().contactGroups.length) set({ contactGroups: kept });
  } catch { /* fetched again shortly */ }
}

export async function refreshContactGroups() {
  const accs = groupAccounts();
  const results = await Promise.all(accs.map(async (a) => {
    try { return { id: a.id, groups: await providers.get(a.id)!.listContactGroups!() }; } catch { return { id: a.id, groups: undefined }; }
  }));
  // An account that couldn't answer keeps the groups it had.
  const keep = get().contactGroups.filter((g) => results.some((r) => r.id === g.accountId && !r.groups));
  saveGroups([...keep, ...results.flatMap((r) => r.groups || [])]);
}

/** "Trustees", or "Trustees (WGM)" when another account has a group with the same name. */
export function groupLabel(g: ContactGroup, all = get().contactGroups): string {
  const twin = all.some((x) => x.id !== g.id && x.name.toLowerCase() === g.name.toLowerCase());
  const acc = get().accounts.find((a) => a.id === g.accountId);
  return twin && acc ? `${g.name} (${acc.label || acc.email})` : g.name;
}

/** What went wrong, said plainly, with a sign in button when the account needs one more permission. */
function groupFailed(e: unknown, accountId: string, what: string) {
  const acc = get().accounts.find((a) => a.id === accountId);
  if ((e as { needsPermission?: boolean }).needsPermission && acc) {
    toast({ text: `${acc.label || acc.email} needs one more sign in to change contact groups.`, action: { label: 'Sign in', run: () => void reconnectAccount(acc.id) }, ttl: 12000 });
  } else {
    toast({ text: `Couldn't ${what}: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
  }
  void refreshContactGroups();
}

/** The account a new group goes into: the given one, else the open email's, else the default sending account. */
function groupAccountFor(accountId?: string) {
  const able = groupAccounts();
  const open = get().selectedKey?.split('|')[0];
  const def = settings().defaultFromEmail.toLowerCase();
  return able.find((a) => a.id === accountId) || able.find((a) => a.id === open) || able.find((a) => a.aliases.some((x) => x.email.toLowerCase() === def)) || able[0];
}

/** Real people only: no repeats, none of your own addresses, no machine addresses. */
const people = (list: Address[]) => {
  const mine = myAddresses(get().accounts);
  const seen = new Set<string>();
  return list.filter((a) => {
    const e = a.email.toLowerCase();
    if (seen.has(e) || mine.has(e) || isMachineAddress(e)) return false;
    seen.add(e);
    return true;
  }).map((a) => ({ ...a, email: a.email.toLowerCase() }));
};

/** Makes a group with these people in it, asking for its name. Returns the new group, or undefined if cancelled. */
export async function newContactGroup(members: Address[] = [], opts: { name?: string; accountId?: string } = {}): Promise<ContactGroup | undefined> {
  const acc = groupAccountFor(opts.accountId);
  if (!acc) { toast({ text: 'Contact groups work with Google accounts.' }); return undefined; }
  const name = (opts.name ?? (await askText('Name for the new group', '', 'Make group')))?.trim().slice(0, 60);
  if (!name) return undefined;
  const list = people(members);
  try {
    const p = providers.get(acc.id)!;
    const id = await p.saveContactGroup!({ name });
    if (list.length) await p.changeGroupMembers!(id, list, []);
    const group: ContactGroup = { id, accountId: acc.id, name, members: list };
    saveGroups([...get().contactGroups.filter((g) => g.id !== id), group]);
    toast({ text: list.length ? `Made the group ${name} with ${list.length} ${list.length === 1 ? 'person' : 'people'}.` : `Made the group ${name}.` });
    return group;
  } catch (e) {
    groupFailed(e, acc.id, 'make the group');
    return undefined;
  }
}

/** Adds people to a group (anyone not in contacts yet is added to contacts too). */
export async function addToGroup(groupId: string, members: Address[], quiet = false) {
  const g = get().contactGroups.find((x) => x.id === groupId);
  if (!g) return;
  const have = new Set(g.members.map((m) => m.email.toLowerCase()));
  const add = people(members).filter((a) => !have.has(a.email));
  if (!add.length) {
    if (!quiet) toast({ text: members.length === 1 ? `${members[0].name || members[0].email} is already in ${g.name}.` : `They're already in ${g.name}.` });
    return;
  }
  saveGroups(get().contactGroups.map((x) => (x.id === groupId ? { ...x, members: [...x.members, ...add] } : x)));
  try {
    await providers.get(g.accountId)!.changeGroupMembers!(groupId, add, []);
    if (!quiet) toast({ text: add.length === 1 ? `${add[0].name || add[0].email} added to ${g.name}.` : `${add.length} people added to ${g.name}.`, action: { label: 'Undo', run: () => void removeFromGroup(groupId, add.map((a) => a.email), true) } });
  } catch (e) {
    groupFailed(e, g.accountId, `add to ${g.name}`);
  }
}

/** Takes people out of a group. They stay in contacts. */
export async function removeFromGroup(groupId: string, emails: string[], quiet = false) {
  const g = get().contactGroups.find((x) => x.id === groupId);
  if (!g) return;
  const out = new Set(emails.map((e) => e.toLowerCase()));
  const gone = g.members.filter((m) => out.has(m.email.toLowerCase()));
  if (!gone.length) return;
  saveGroups(get().contactGroups.map((x) => (x.id === groupId ? { ...x, members: x.members.filter((m) => !out.has(m.email.toLowerCase())) } : x)));
  try {
    await providers.get(g.accountId)!.changeGroupMembers!(groupId, [], gone.map((m) => m.email));
    if (!quiet) toast({ text: gone.length === 1 ? `${gone[0].name || gone[0].email} taken out of ${g.name}.` : `${gone.length} people taken out of ${g.name}.`, action: { label: 'Undo', run: () => void addToGroup(groupId, gone, true) } });
  } catch (e) {
    groupFailed(e, g.accountId, `change ${g.name}`);
  }
}

export async function renameContactGroup(groupId: string, name?: string) {
  const g = get().contactGroups.find((x) => x.id === groupId);
  if (!g) return;
  const next = (name ?? (await askText('Rename group', g.name, 'Rename')))?.trim().slice(0, 60);
  if (!next || next === g.name) return;
  saveGroups(get().contactGroups.map((x) => (x.id === groupId ? { ...x, name: next } : x)));
  try { await providers.get(g.accountId)!.saveContactGroup!({ id: groupId, name: next }); } catch (e) { groupFailed(e, g.accountId, 'rename the group'); }
}

export async function deleteContactGroup(groupId: string, ask = true) {
  const g = get().contactGroups.find((x) => x.id === groupId);
  if (!g) return;
  if (ask && !(await askConfirm(`Delete the group ${g.name}?`, 'The people in it stay in your contacts. The group goes from Google Contacts too.', 'Delete group'))) return;
  saveGroups(get().contactGroups.filter((x) => x.id !== groupId));
  try {
    await providers.get(g.accountId)!.deleteContactGroup!(groupId);
    toast({ text: `Deleted the group ${g.name}.` });
  } catch (e) { groupFailed(e, g.accountId, 'delete the group'); }
}
