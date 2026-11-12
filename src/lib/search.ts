// Local full text search across every account.
import MiniSearch from 'minisearch';
import type { Message } from './types';

interface Doc {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
}

const toDoc = (m: Message): Doc => ({
  id: m.id,
  subject: m.subject,
  from: `${m.from.name || ''} ${m.from.email}`,
  to: [...m.to, ...m.cc].map((a) => `${a.name || ''} ${a.email}`).join(' '),
  body: (m.bodyText || m.snippet || '').slice(0, 20000),
});

// Typo matching only for longer words: it is slow across a big mailbox and makes short words match unrelated mail.
const SEARCH_OPTIONS = { boost: { subject: 3, from: 2 }, prefix: true, fuzzy: (term: string) => (term.length > 5 ? 0.12 : false), combineWith: 'AND' } as const;

const index = new MiniSearch<Doc>({
  fields: ['subject', 'from', 'to', 'body'],
  storeFields: [],
  searchOptions: SEARCH_OPTIONS,
});

/** A quick fingerprint of what an email was indexed with, so an unchanged email isn't indexed again. */
function fingerprint(d: Doc): number {
  const s = `${d.subject}${d.from}${d.to}${d.body}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const indexed = new Map<string, number>();
/** Goes up whenever the index changes, so answers worked out from it can be kept until then. */
let version = 0;

/**
 * Adds emails to the index, or updates them, once each: an email indexed with the same details is left alone.
 * The mail store keeps no body text, so an update without it (a sync, a flag change) never replaces a body that
 * was indexed earlier with just the preview; drafts, whose details really change, are always indexed again.
 */
export function indexMessages(messages: Message[]) {
  for (const m of messages) {
    const had = indexed.get(m.id);
    if (had !== undefined && m.bodyText === undefined && m.bodyHtml === undefined && !m.isDraft) continue;
    const doc = toDoc(m);
    const print = fingerprint(doc);
    if (had === print) continue;
    if (index.has(m.id)) index.replace(doc);
    else index.add(doc);
    indexed.set(m.id, print);
    version++;
  }
}

const mentions = new Map<string, { version: number; ids: Set<string> }>();
/**
 * Whether an email's body has these words (each word, or a word starting with it), for Smart Mailboxes' "Any text".
 * Worked out once per phrase from the index and kept until the index changes.
 */
export function bodyMentions(id: string, words: string): boolean {
  let hit = mentions.get(words);
  if (!hit || hit.version !== version) {
    const ids = words.trim() ? index.search(words, { fields: ['body'], prefix: true, fuzzy: false, combineWith: 'AND' }).map((r) => r.id as string) : [];
    hit = { version, ids: new Set(ids) };
    mentions.set(words, hit);
    if (mentions.size > 200) mentions.delete(mentions.keys().next().value as string);
  }
  return hit.ids.has(id);
}

export function removeFromIndex(ids: string[]) {
  for (const id of ids) {
    indexed.delete(id);
    if (index.has(id)) { index.discard(id); version++; }
  }
}

export interface ParsedQuery {
  text: string;
  from?: string;
  to?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  flagged?: boolean;
  after?: number;
  before?: number;
}

/** Supports plain words plus from:, to:, has:attachment, is:unread, is:flagged, after:2026-01-01, before:… */
/** A date typed as 2026-11-12 means that day here, not in UTC (which would be hours out). Other forms as the browser reads them. */
function localDay(v: string): number {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : Date.parse(v);
}

export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { text: '' };
  const words: string[] = [];
  for (const token of q.match(/(\w+:"[^"]+"|\w+:\S+|"[^"]+"|\S+)/g) || []) {
    const [k, ...rest] = token.split(':');
    const v = rest.join(':').replace(/^"|"$/g, '');
    switch (rest.length ? k.toLowerCase() : '') {
      case 'from': out.from = v.toLowerCase(); break;
      case 'to': out.to = v.toLowerCase(); break;
      case 'has': if (v.startsWith('attach')) out.hasAttachment = true; break;
      case 'is':
        if (v === 'unread') out.unread = true;
        if (v === 'flagged' || v === 'starred') out.flagged = true;
        break;
      case 'after': out.after = localDay(v); break;
      case 'before': out.before = localDay(v); break;
      default: words.push(token.replace(/^"|"$/g, ''));
    }
  }
  out.text = words.join(' ');
  return out;
}

export function searchMessages(q: string, all: Record<string, Message>): Message[] {
  const p = parseQuery(q);
  let candidates: Message[];
  if (p.text.trim()) {
    candidates = index.search(p.text).map((r) => all[r.id as string]).filter(Boolean);
  } else {
    candidates = Object.values(all);
  }
  return candidates
    .filter((m) => !p.from || `${m.from.name} ${m.from.email}`.toLowerCase().includes(p.from))
    .filter((m) => !p.to || [...m.to, ...m.cc].some((a) => `${a.name} ${a.email}`.toLowerCase().includes(p.to!)))
    .filter((m) => !p.hasAttachment || m.hasAttachments)
    .filter((m) => !p.unread || m.unread)
    .filter((m) => !p.flagged || m.flagged)
    .filter((m) => !p.after || m.date >= p.after)
    .filter((m) => !p.before || m.date < p.before)
    .sort((a, b) => b.date - a.date)
    .slice(0, 500);
}

/** Turn our query into Gmail's search syntax (they're nearly identical). */
export function toGmailQuery(q: string): string {
  return q.replace(/is:flagged/g, 'is:starred');
}
