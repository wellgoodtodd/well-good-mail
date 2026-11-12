// Contacts: everyone in each account's address book and everyone you've emailed, and account pictures.
import { askText } from '../dialogs';
import { store } from '../db';
import { settings } from '../settings';
import { isMachineAddress } from '../machineAddress';
import { httpFetch } from '../platform';
import { myAddresses } from '../compose';
import { bytesToBase64 } from '../mime';
import type { Address } from '../types';
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
