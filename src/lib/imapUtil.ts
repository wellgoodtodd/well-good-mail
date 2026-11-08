// Plain helpers for IMAP accounts (iCloud, Yahoo, Fastmail and others): the services we know, folder names, threads.
// Kept apart from the provider so they can be tested without a mail server.
import type { Message, SystemFolder } from './types';
import { cleanPreview } from './cleanText';

export interface ImapPreset {
  id: string;
  name: string;
  /** Addresses ending in these domains use this service. */
  domains: string[];
  host: string;
  port: number;
  smtpHost: string;
  smtpPort: number;
  /** Where to make the app password, and what the service calls it. */
  passwordUrl: string;
  passwordName: string;
}

export const IMAP_PRESETS: ImapPreset[] = [
  {
    id: 'icloud',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    host: 'imap.mail.me.com', port: 993, smtpHost: 'smtp.mail.me.com', smtpPort: 587,
    passwordUrl: 'https://account.apple.com/account/manage', passwordName: 'app-specific password',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com'],
    host: 'imap.mail.yahoo.com', port: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465,
    passwordUrl: 'https://login.yahoo.com/account/security', passwordName: 'app password',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    host: 'imap.fastmail.com', port: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 465,
    passwordUrl: 'https://app.fastmail.com/settings/security/devicekeys', passwordName: 'app password',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    domains: ['aol.com'],
    host: 'imap.aol.com', port: 993, smtpHost: 'smtp.aol.com', smtpPort: 465,
    passwordUrl: 'https://login.aol.com/account/security', passwordName: 'app password',
  },
];

export const presetById = (id: string) => IMAP_PRESETS.find((p) => p.id === id);

export function presetForEmail(email: string): ImapPreset | undefined {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return undefined;
  return IMAP_PRESETS.find((p) => p.domains.includes(domain));
}

// ---------- folders ----------

export interface ImapFolderInfo {
  name: string;
  delimiter: string | null;
  attrs: string[];
}

/** The name of a folder without its parents: "INBOX.Sent" is "Sent". */
export function leafName(name: string, delimiter: string | null): string {
  if (!delimiter) return name;
  const i = name.lastIndexOf(delimiter);
  return i < 0 ? name : name.slice(i + delimiter.length);
}

/** Folder names travel in a cut down form of UTF-7 ("&AOk-" is "é"). This turns them back into readable text. */
export function decodeFolderName(name: string): string {
  return name.replace(/&([^-]*)-/g, (_m, enc: string) => {
    if (!enc) return '&';
    try {
      const b64 = enc.replace(/,/g, '/');
      const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      let out = '';
      for (let i = 0; i + 1 < bin.length; i += 2) out += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
      return out;
    } catch {
      return enc;
    }
  });
}

const SPECIAL_USE: Record<string, Exclude<SystemFolder, 'inbox' | 'flagged'>> = {
  '\\sent': 'sent',
  '\\drafts': 'drafts',
  '\\trash': 'bin',
  '\\junk': 'junk',
  '\\archive': 'archive',
};

const BY_NAME: [RegExp, Exclude<SystemFolder, 'inbox' | 'flagged'>][] = [
  [/^(sent|sent messages|sent items|sent mail)$/i, 'sent'],
  [/^drafts?$/i, 'drafts'],
  [/^(trash|deleted messages|deleted items|bin)$/i, 'bin'],
  [/^(junk|spam|junk e-?mail|bulk mail)$/i, 'junk'],
  [/^(archive|archives)$/i, 'archive'],
];

/** Works out which folder is the Inbox, Sent, Drafts and so on, from what the server says and common names. */
export function systemFolders(folders: ImapFolderInfo[]): Partial<Record<SystemFolder, string>> {
  const out: Partial<Record<SystemFolder, string>> = {};
  const selectable = folders.filter((f) => !f.attrs.some((a) => a.toLowerCase() === '\\noselect'));
  const inbox = selectable.find((f) => f.name.toUpperCase() === 'INBOX');
  if (inbox) out.inbox = inbox.name;
  for (const f of selectable) {
    for (const a of f.attrs) {
      const kind = SPECIAL_USE[a.toLowerCase()];
      if (kind && !out[kind]) out[kind] = f.name;
    }
  }
  for (const f of selectable) {
    const leaf = decodeFolderName(leafName(f.name, f.delimiter));
    for (const [re, kind] of BY_NAME) if (!out[kind] && re.test(leaf)) out[kind] = f.name;
  }
  return out;
}

/** Folders that hold things which are not email, and are not worth syncing. */
export function isSyncable(f: ImapFolderInfo, host: string): boolean {
  if (f.attrs.some((a) => a.toLowerCase() === '\\noselect')) return false;
  // iCloud keeps the Notes app's notes in a mail folder.
  if (/mail\.me\.com$/i.test(host) && /^notes$/i.test(f.name)) return false;
  return true;
}

// ---------- ids and threads ----------

/** A short stable hash (cyrb53), used to make an id from a Message-ID header. */
export function hashId(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The id an email goes by. Copies of the same email in different folders (Inbox and a folder you filed it in, or
 * the Sent copy of something you sent yourself) share one id, so they show as one email in more than one place.
 */
export function messageKey(messageId: string | undefined, folder: string, uid: number): string {
  const mid = (messageId || '').trim().toLowerCase();
  return mid ? `m${hashId(mid)}` : `u${hashId(folder)}-${uid}`;
}

const idsIn = (s: string | undefined) => (s || '').match(/<[^>]+>/g)?.map((x) => x.toLowerCase()) ?? [];

/**
 * IMAP has no conversations, so they are worked out from the References and In-Reply-To headers. A reply joins the
 * conversation of anything it points at that we already know; otherwise the first email in the chain names it.
 * `seen` maps Message-IDs to conversation ids and is added to as emails are placed.
 */
export function threadFor(
  m: { messageId?: string; inReplyTo?: string; references?: string },
  seen: Map<string, string>,
  fallback: string,
): string {
  const refs = [...idsIn(m.references), ...idsIn(m.inReplyTo)];
  let thread: string | undefined;
  for (const r of refs) {
    const hit = seen.get(r);
    if (hit) { thread = hit; break; }
  }
  if (!thread) thread = refs.length ? `t${hashId(refs[0])}` : m.messageId ? `t${hashId(m.messageId.toLowerCase())}` : fallback;
  for (const r of refs) if (!seen.has(r)) seen.set(r, thread);
  const own = (m.messageId || '').toLowerCase();
  if (own && !seen.has(own)) seen.set(own, thread);
  return thread;
}

// ---------- flags and labels ----------

/** The labels the app keeps for an email: each folder it is in, plus UNREAD and FLAGGED. */
export function labelsFor(folders: string[], unread: boolean, flagged: boolean): string[] {
  return [...folders, ...(unread ? ['UNREAD'] : []), ...(flagged ? ['FLAGGED'] : [])];
}

/** Unread if any copy is unread; flagged if any copy is flagged. */
export function summariseFlags(copies: string[][]): { unread: boolean; flagged: boolean; draft: boolean } {
  return {
    unread: copies.some((f) => !f.includes('\\Seen')),
    flagged: copies.some((f) => f.includes('\\Flagged')),
    draft: copies.some((f) => f.includes('\\Draft')),
  };
}

export const IMAP_DATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date the way IMAP searches want it: 01-Jan-2026. */
export function imapDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${IMAP_DATE_MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** A short plain text preview from an email's text or HTML. */
export function previewOf(text: string | undefined, html: string | undefined): string {
  let s = text || '';
  if (!s.trim() && html) {
    s = html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"');
  }
  return cleanPreview(s);
}

/** Merges a copy of an email found in another folder into the one we already hold. */
export function mergeCopies(existing: Message | undefined, incoming: Message): Message {
  if (!existing) return incoming;
  return {
    ...existing,
    labels: [...new Set([...existing.labels.filter((l) => l !== 'UNREAD' && l !== 'FLAGGED'), ...incoming.labels.filter((l) => l !== 'UNREAD' && l !== 'FLAGGED')])]
      .concat(existing.unread || incoming.unread ? ['UNREAD'] : [])
      .concat(existing.flagged || incoming.flagged ? ['FLAGGED'] : []),
    locations: { ...(existing.locations || {}), ...(incoming.locations || {}) },
    unread: existing.unread || incoming.unread,
    flagged: existing.flagged || incoming.flagged,
    isDraft: existing.isDraft || incoming.isDraft,
    hasAttachments: existing.hasAttachments || incoming.hasAttachments,
  };
}
