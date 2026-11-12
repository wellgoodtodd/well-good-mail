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

let index = new MiniSearch<Doc>({
  fields: ['subject', 'from', 'to', 'body'],
  storeFields: [],
  searchOptions: SEARCH_OPTIONS,
});

/**
 * Builds the search index a slice at a time between other work, so the app stays responsive while it fills.
 * Searches work straight away; older mail turns up in them as the index catches up.
 */
let building = 0;
export function rebuildIndexInBackground(messages: Message[], slice = 1500) {
  const run = ++building;
  index = new MiniSearch<Doc>({ fields: ['subject', 'from', 'to', 'body'], storeFields: [], searchOptions: SEARCH_OPTIONS });
  let i = 0;
  const step = () => {
    if (run !== building) return; // a newer rebuild took over
    const end = Math.min(messages.length, i + slice);
    for (; i < end; i++) { const m = messages[i]; if (!index.has(m.id)) index.add(toDoc(m)); }
    if (i < messages.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export function indexMessages(messages: Message[]) {
  for (const m of messages) {
    if (index.has(m.id)) index.replace(toDoc(m));
    else index.add(toDoc(m));
  }
}

export function removeFromIndex(ids: string[]) {
  for (const id of ids) if (index.has(id)) index.discard(id);
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
