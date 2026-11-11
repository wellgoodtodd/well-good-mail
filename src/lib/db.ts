// Local cache in IndexedDB: messages for offline reading and search, plus
// the app's own records (drafts, outbox, snoozes, follow ups).
import { openDB, type IDBPDatabase } from 'idb';
import type { Account, Draft, Folder, FollowUp, Message, OutboxItem, Snooze, Address, CalendarEvent } from './types';

const DB_NAME = 'well-good-mail';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore('accounts', { keyPath: 'id' });
        const f = d.createObjectStore('folders', { keyPath: 'key' });
        f.createIndex('accountId', 'accountId');
        const m = d.createObjectStore('messages', { keyPath: 'id' });
        m.createIndex('accountId', 'accountId');
        m.createIndex('threadId', 'threadId');
        m.createIndex('date', 'date');
        d.createObjectStore('drafts', { keyPath: 'id' });
        d.createObjectStore('outbox', { keyPath: 'id' });
        d.createObjectStore('followups', { keyPath: 'id' });
        d.createObjectStore('snoozes', { keyPath: 'messageId' });
        d.createObjectStore('dismissed', { keyPath: 'id' });
        d.createObjectStore('contacts', { keyPath: 'email' });
        d.createObjectStore('events', { keyPath: 'id' });
        d.createObjectStore('kv');
      },
    });
  }
  return dbPromise;
}

type FolderRow = Folder & { key: string };

export const store = {
  async accounts(): Promise<Account[]> {
    return (await db()).getAll('accounts');
  },
  async putAccount(a: Account) {
    await (await db()).put('accounts', a);
  },
  /** One account's mail, for bringing back an account whose mail was kept when it was removed. */
  async messagesFor(accountId: string): Promise<Message[]> {
    return (await db()).getAllFromIndex('messages', 'accountId', accountId) as Promise<Message[]>;
  },
  async foldersFor(accountId: string): Promise<Folder[]> {
    const rows = (await (await db()).getAllFromIndex('folders', 'accountId', accountId)) as FolderRow[];
    return rows.map(({ key: _k, ...f }) => f);
  },
  /** Removes only the account record; its mail and folders stay (kept for adding it again). */
  async parkAccount(id: string) {
    await (await db()).delete('accounts', id);
  },
  async deleteAccount(id: string) {
    const d = await db();
    await d.delete('accounts', id);
    const tx = d.transaction(['messages', 'folders'], 'readwrite');
    for (const key of await tx.objectStore('messages').index('accountId').getAllKeys(id)) {
      await tx.objectStore('messages').delete(key);
    }
    for (const key of await tx.objectStore('folders').index('accountId').getAllKeys(id)) {
      await tx.objectStore('folders').delete(key);
    }
    await tx.done;
  },

  async folders(): Promise<Folder[]> {
    const rows = (await (await db()).getAll('folders')) as FolderRow[];
    return rows.map(({ key: _k, ...f }) => f);
  },
  async putFolders(accountId: string, folders: Folder[]) {
    const d = await db();
    const tx = d.transaction('folders', 'readwrite');
    for (const key of await tx.store.index('accountId').getAllKeys(accountId)) await tx.store.delete(key);
    for (const f of folders) await tx.store.put({ ...f, key: `${accountId}|${f.id}` });
    await tx.done;
  },

  async messages(): Promise<Message[]> {
    return (await db()).getAll('messages');
  },
  /** Only mail dated on or after a time (by the date index), for a fast first screen. */
  async messagesSince(since: number): Promise<Message[]> {
    return (await db()).getAllFromIndex('messages', 'date', IDBKeyRange.lowerBound(since)) as Promise<Message[]>;
  },
  /** One conversation, without loading the whole cache (for pop out windows). */
  async threadMessages(accountId: string, threadId: string): Promise<Message[]> {
    return ((await (await db()).getAllFromIndex('messages', 'threadId', threadId)) as Message[]).filter((m) => m.accountId === accountId);
  },
  async putMessages(msgs: Message[]) {
    if (!msgs.length) return;
    const d = await db();
    const tx = d.transaction('messages', 'readwrite');
    for (const m of msgs) await tx.store.put(m);
    await tx.done;
  },
  async deleteMessages(ids: string[]) {
    if (!ids.length) return;
    const d = await db();
    const tx = d.transaction('messages', 'readwrite');
    for (const id of ids) await tx.store.delete(id);
    await tx.done;
  },
  async getMessage(id: string): Promise<Message | undefined> {
    return (await db()).get('messages', id);
  },

  async drafts(): Promise<Draft[]> {
    return (await db()).getAll('drafts');
  },
  async getDraft(id: string): Promise<Draft | undefined> {
    return (await db()).get('drafts', id);
  },
  async putDraft(d: Draft) {
    await (await db()).put('drafts', d);
  },
  async deleteDraft(id: string) {
    await (await db()).delete('drafts', id);
  },

  async outbox(): Promise<OutboxItem[]> {
    return (await db()).getAll('outbox');
  },
  async putOutbox(o: OutboxItem) {
    await (await db()).put('outbox', o);
  },
  async deleteOutbox(id: string) {
    await (await db()).delete('outbox', id);
  },

  async followups(): Promise<FollowUp[]> {
    return (await db()).getAll('followups');
  },
  async putFollowup(f: FollowUp) {
    await (await db()).put('followups', f);
  },
  async deleteFollowup(id: string) {
    await (await db()).delete('followups', id);
  },

  async snoozes(): Promise<Snooze[]> {
    return (await db()).getAll('snoozes');
  },
  async putSnooze(s: Snooze) {
    await (await db()).put('snoozes', s);
  },
  async deleteSnooze(id: string) {
    await (await db()).delete('snoozes', id);
  },

  async dismissed(): Promise<Set<string>> {
    const rows = (await (await db()).getAll('dismissed')) as { id: string }[];
    return new Set(rows.map((r) => r.id));
  },
  async dismiss(ids: string[]) {
    const d = await db();
    const tx = d.transaction('dismissed', 'readwrite');
    for (const id of ids) await tx.store.put({ id, at: Date.now() });
    await tx.done;
  },

  async contacts(): Promise<Address[]> {
    return (await db()).getAll('contacts');
  },
  async putContacts(list: Address[]) {
    if (!list.length) return;
    const d = await db();
    const tx = d.transaction('contacts', 'readwrite');
    for (const c of list) await tx.store.put({ ...c, email: c.email.toLowerCase() });
    await tx.done;
  },

  async events(): Promise<CalendarEvent[]> {
    return (await db()).getAll('events');
  },
  async replaceEvents(accountId: string, events: CalendarEvent[]) {
    const d = await db();
    const tx = d.transaction('events', 'readwrite');
    const all = (await tx.store.getAll()) as CalendarEvent[];
    for (const e of all) if (e.accountId === accountId) await tx.store.delete(e.id);
    for (const e of events) await tx.store.put(e);
    await tx.done;
  },

  async kvGet<T>(key: string): Promise<T | undefined> {
    return (await db()).get('kv', key);
  },
  async kvSet(key: string, value: unknown) {
    await (await db()).put('kv', value, key);
  },

  async wipe() {
    const d = await db();
    for (const name of Array.from(d.objectStoreNames)) await d.clear(name);
  },
};
