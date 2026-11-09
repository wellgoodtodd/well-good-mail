// Smart Mailboxes: saved sets of rules ("from @bloom.co, unread, in WGM") that show matching mail from every
// account, like Apple Mail. Nothing moves: a Smart Mailbox is only a view, so an email can be in several.
import type { Message, SystemFolder } from './types';
import type { MailProvider } from './providers/provider';
import { inSystemFolder } from './mailbox';

export type SmartField = 'from' | 'to' | 'subject' | 'words' | 'account' | 'folder' | 'status' | 'attachments' | 'date';
export type SmartStatus = 'unread' | 'read' | 'flagged' | 'vip' | 'toMe';

/** One line of a Smart Mailbox. `not` turns "contains" into "doesn't contain", "is" into "isn't", and so on. */
export interface SmartRule {
  field: SmartField;
  not?: boolean;
  /** Words or addresses (several can be split with commas or OR), an account id, a folder, a status, or days for a date. */
  value: string;
}

export interface SmartMailbox {
  id: string;
  name: string;
  /** All rules must match, or any one of them. */
  match: 'all' | 'any';
  rules: SmartRule[];
  /** Bin and Junk are left out unless this is on (or a rule asks for them by name). */
  includeBinJunk?: boolean;
}

export interface SmartContext {
  vips: Set<string>;
  /** Your own addresses, for "sent to me". */
  mine?: Set<string>;
  now?: number;
}

/** "a, b OR c" to ["a", "b", "c"], lower case. */
export const alternatives = (v: string) => v.split(/,|\s+OR\s+/i).map((s) => s.trim().toLowerCase()).filter(Boolean);

const addrText = (a: { email: string; name?: string }) => `${a.name || ''} ${a.email}`.toLowerCase();

function ruleMatches(m: Message, r: SmartRule, provider: MailProvider | undefined, ctx: SmartContext): boolean {
  const any = (hay: string) => alternatives(r.value).some((w) => hay.includes(w));
  switch (r.field) {
    case 'from': return any(addrText(m.from));
    case 'to': return any([...m.to, ...m.cc].map(addrText).join(' '));
    case 'subject': return any(m.subject.toLowerCase());
    case 'words': return any(`${m.subject} ${m.from.name || ''} ${m.from.email} ${m.snippet} ${m.bodyText || ''} ${m.attachments.map((a) => a.filename).join(' ')}`.toLowerCase());
    case 'account': return alternatives(r.value).includes(m.accountId.toLowerCase());
    case 'folder': return inSystemFolder(m, r.value as SystemFolder, provider);
    case 'attachments': return m.hasAttachments || m.attachments.length > 0;
    case 'status':
      switch (r.value as SmartStatus) {
        case 'unread': return m.unread;
        case 'read': return !m.unread;
        case 'flagged': return m.flagged;
        case 'vip': return ctx.vips.has(m.from.email.toLowerCase());
        case 'toMe': return [...m.to, ...m.cc].some((a) => ctx.mine?.has(a.email.toLowerCase()));
        default: return false;
      }
    case 'date': {
      const days = Number(r.value);
      if (!Number.isFinite(days) || days <= 0) return true;
      return m.date >= (ctx.now ?? Date.now()) - days * 86400000;
    }
  }
}

/** True when an email belongs in this Smart Mailbox. */
export function matchSmart(m: Message, box: SmartMailbox, provider: MailProvider | undefined, ctx: SmartContext): boolean {
  const asksForBin = box.rules.some((r) => r.field === 'folder' && !r.not && (r.value === 'bin' || r.value === 'junk'));
  if (!box.includeBinJunk && !asksForBin && (inSystemFolder(m, 'bin', provider) || inSystemFolder(m, 'junk', provider))) return false;
  // Drafts are left out: they're not mail you've received or sent yet.
  if (m.isDraft) return false;
  // A rule with nothing filled in is ignored, so a half-made Smart Mailbox doesn't hide everything.
  const rules = box.rules.filter((r) => r.field === 'attachments' || r.field === 'status' || r.field === 'folder' || r.value.trim());
  if (!rules.length) return true;
  const test = (r: SmartRule) => ruleMatches(m, r, provider, ctx) !== Boolean(r.not);
  return box.match === 'any' ? rules.some(test) : rules.every(test);
}

/** A starting point for a new Smart Mailbox, or one made from a search. */
export function newSmartMailbox(name = 'New Smart Mailbox', words = ''): SmartMailbox {
  return { id: `sm${Date.now().toString(36)}`, name, match: 'all', rules: [{ field: words ? 'words' : 'from', value: words }] };
}
