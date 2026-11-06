// Moving the downloaded mail to another computer: a single compressed file, with no passwords or sign ins in it.
import { store } from './db';
import { saveFile } from './platform';
import { importMessages, refreshContacts, toast } from './mail';
import type { Address, Message } from './types';

interface CacheFile {
  format: 'wgm-cache';
  version: 1;
  exportedAt: number;
  messages: Message[];
  contacts: Address[];
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(file: File): Promise<string> {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function exportCache(): Promise<void> {
  const [messages, contacts] = await Promise.all([store.messages(), store.contacts()]);
  if (!messages.length) return void toast({ text: 'There is no downloaded mail to export yet' });
  toast({ text: `Packing ${messages.length.toLocaleString('en-GB')} emails...`, ttl: 3000 });
  const data: CacheFile = { format: 'wgm-cache', version: 1, exportedAt: Date.now(), messages, contacts };
  const bytes = await gzip(JSON.stringify(data));
  const day = new Date().toISOString().slice(0, 10);
  await saveFile(`well-good-mail-cache-${day}.wgmcache`, bytes, 'application/gzip');
  toast({ text: 'Mail cache saved. Copy it to the other computer and choose Import there.' });
}

/** Reads a cache file made by exportCache. Mail for accounts that aren't signed in here yet stays out of sight until they are. */
export async function importCache(file: File): Promise<void> {
  let data: CacheFile;
  try {
    data = JSON.parse(await gunzip(file)) as CacheFile;
  } catch {
    return void toast({ text: "That doesn't look like a Well Good Mail cache file" });
  }
  if (data.format !== 'wgm-cache' || !Array.isArray(data.messages)) return void toast({ text: "That doesn't look like a Well Good Mail cache file" });
  toast({ text: `Importing ${data.messages.length.toLocaleString('en-GB')} emails...`, ttl: 4000 });
  await importMessages(data.messages);
  if (data.contacts?.length) {
    await store.putContacts([...(await store.contacts()), ...data.contacts]);
    await refreshContacts();
  }
  toast({ text: `Imported ${data.messages.length.toLocaleString('en-GB')} emails. Each account now only fetches what's new.` });
}
