// What an AI connected to Well Good Mail is allowed to do. Nothing here talks to the network: it is the rulebook
// that the connection asks before every single action.

/** Off: refused. Ask: the app shows what and to whom, and waits for you. Allow: goes ahead and is logged. */
export type Mode = 'off' | 'ask' | 'allow';

export type Group = 'read' | 'organise' | 'calendar' | 'send';

export interface Capability {
  id: string;
  group: Group;
  label: string;
  /** One plain sentence, shown beside the switch. */
  description: string;
  /** What a fresh install starts with. */
  fallback: Mode;
  /** The most trust this can ever be given. Anything that leaves your computer can never go above "ask". */
  max: Mode;
}

export const CAPABILITIES: Capability[] = [
  // Looking
  { id: 'read.accounts', group: 'read', label: 'See your accounts and folders', description: 'Which accounts, folders and labels you have. No mail.', fallback: 'allow', max: 'allow' },
  { id: 'read.search', group: 'read', label: 'Search your mail', description: 'Search by word, sender or date. Results show sender, subject and a short preview.', fallback: 'allow', max: 'allow' },
  { id: 'read.messages', group: 'read', label: 'Read emails', description: 'Open the full text of an email or conversation.', fallback: 'ask', max: 'allow' },
  { id: 'read.attachments', group: 'read', label: 'Read attachments', description: 'Open the contents of attached files, not just their names.', fallback: 'off', max: 'allow' },
  { id: 'read.calendar', group: 'read', label: 'See your calendar and reminders', description: 'Events, invitations, reminders and follow ups.', fallback: 'allow', max: 'allow' },
  { id: 'read.contacts', group: 'read', label: 'See your contacts', description: 'Names, addresses and companies from your address books.', fallback: 'ask', max: 'allow' },
  // Tidying (stays on your computer, and each can be undone)
  { id: 'organise.draft', group: 'organise', label: 'Write drafts', description: 'Make a draft you can read and edit. It is never sent by this switch.', fallback: 'allow', max: 'allow' },
  { id: 'organise.flag', group: 'organise', label: 'Mark read, unread and flagged', description: 'Change the read and flag marks on emails.', fallback: 'ask', max: 'allow' },
  { id: 'organise.file', group: 'organise', label: 'Archive and file', description: 'Archive, move to a folder or apply a label.', fallback: 'ask', max: 'allow' },
  { id: 'organise.snooze', group: 'organise', label: 'Snooze and follow up', description: 'Snooze an email, or ask to be reminded if nobody replies.', fallback: 'ask', max: 'allow' },
  { id: 'organise.remind', group: 'organise', label: 'Make reminders', description: 'Add a reminder to your Reminders list.', fallback: 'ask', max: 'allow' },
  { id: 'organise.bin', group: 'organise', label: 'Move to Bin', description: 'Put emails in the Bin, where you can still get them back.', fallback: 'off', max: 'allow' },
  // Calendar (answers other people)
  { id: 'calendar.reply', group: 'calendar', label: 'Answer invitations', description: 'Say Yes, No or Maybe. The organiser is told, so it always asks.', fallback: 'ask', max: 'ask' },
  { id: 'calendar.add', group: 'calendar', label: 'Add invitations to your calendar', description: 'Put an invitation from an email into your calendar.', fallback: 'ask', max: 'allow' },
  // Anything that reaches other people
  { id: 'send.email', group: 'send', label: 'Send email', description: 'Send a reply or new email. The app shows who it goes to and the whole message, and waits for you every time.', fallback: 'off', max: 'ask' },
  { id: 'send.forward', group: 'send', label: 'Forward to someone else', description: 'Pass an email on. It always asks, and it always shows the recipient.', fallback: 'off', max: 'ask' },
];

/** Things no switch can ever turn on. They are listed so the settings screen can say so plainly. */
export const NEVER: { id: string; text: string }[] = [
  { id: 'never.delete', text: 'Delete anything for good, or empty the Bin' },
  { id: 'never.accounts', text: 'Add, remove or change an account, a sign in, or how an account connects' },
  { id: 'never.secrets', text: 'See passwords, sign in keys, app keys or tokens' },
  { id: 'never.permissions', text: 'Change these permissions, or turn the connection on, off or wider' },
  { id: 'never.updates', text: 'Install updates, or change anything about how the app updates itself' },
  { id: 'never.privacy', text: 'Switch off the privacy protections for pictures and trackers' },
  { id: 'never.export', text: 'Export, copy out or back up your whole mailbox' },
];

/** How much of one account the AI gets. Off: invisible. Read only: it may look, never change anything. Read and write: it follows the switches. */
export type AccountLevel = 'off' | 'read' | 'write';

export const LEVEL_WORDS: Record<AccountLevel, string> = { off: 'Off', read: 'Read only', write: 'Read and write' };

export interface McpSettings {
  enabled: boolean;
  /** Each account's level. An account that is missing here is Off, so new accounts start hidden from the AI. */
  accounts: Record<string, AccountLevel>;
  modes: Record<string, Mode>;
  /** An account's own settings, only where they differ from `modes`. */
  overrides: Record<string, Record<string, Mode>>;
  /** Pause after this many minutes with no requests. 0 means never. */
  idleMinutes: number;
  /** "Don't pause again today": no idle pausing until this time. */
  noPauseUntil?: number;
  /** The connection switches itself off at this time (ms since 1970). Undefined means it stays until you stop it. */
  expiresAt?: number;
  /** Most actions per minute, whatever the switches say. */
  maxPerMinute: number;
}

/** Accounts the AI may see at all. */
export const sharedAccounts = (s: McpSettings) => Object.entries(s.accounts).filter(([, v]) => v !== 'off').map(([id]) => id);

export const defaultMcp = (): McpSettings => ({
  enabled: false,
  accounts: {},
  modes: Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.fallback])),
  overrides: {},
  idleMinutes: 60,
  maxPerMinute: 30,
});

/** Choices for idle pausing, in minutes (0 is never). */
export const IDLE_CHOICES = [15, 30, 60, 120, 0];

const rank: Record<Mode, number> = { off: 0, ask: 1, allow: 2 };
const lower = (a: Mode, b: Mode): Mode => (rank[a] <= rank[b] ? a : b);

/** The mode for a capability (for one account, if it has its own setting), with its ceiling applied, so a stored "allow" can never get past an "ask" limit. */
export function effectiveMode(s: McpSettings, capabilityId: string, accountId?: string): Mode {
  const cap = CAPABILITIES.find((c) => c.id === capabilityId);
  if (!cap) return 'off';
  const own = accountId !== undefined ? s.overrides?.[accountId]?.[capabilityId] : undefined;
  return lower(own ?? s.modes[capabilityId] ?? cap.fallback, cap.max);
}

/** True for anything that reaches other people. Those always ask: no "for an hour", no "always". */
export const alwaysAsks = (capabilityId: string) => CAPABILITIES.find((c) => c.id === capabilityId)?.max === 'ask';

export type Decision = { verdict: 'deny'; reason: string } | { verdict: 'ask' } | { verdict: 'allow' };

/** The one question the connection asks before it does anything. */
export function decide(s: McpSettings, capabilityId: string, accountId?: string, now = Date.now()): Decision {
  if (!s.enabled) return { verdict: 'deny', reason: 'The connection is switched off in Well Good Mail.' };
  if (s.expiresAt !== undefined && now >= s.expiresAt) return { verdict: 'deny', reason: 'The connection time you set has ended.' };
  const cap = CAPABILITIES.find((c) => c.id === capabilityId);
  if (!cap) return { verdict: 'deny', reason: 'That is not something Well Good Mail lets an AI do.' };
  if (accountId !== undefined) {
    const level = s.accounts[accountId] ?? 'off';
    if (level === 'off') return { verdict: 'deny', reason: 'That account is not shared with the AI.' };
    if (level === 'read' && cap.group !== 'read') return { verdict: 'deny', reason: 'That account is read only for the AI.' };
  }
  const mode = effectiveMode(s, capabilityId, accountId);
  if (mode === 'off') return { verdict: 'deny', reason: `"${cap.label}" is switched off.` };
  return { verdict: mode };
}

/** Keeps a settings object honest: unknown switches dropped, missing ones filled in, ceilings applied. */
export function tidy(s: Partial<McpSettings> | undefined): McpSettings {
  const base = defaultMcp();
  const modes: Record<string, Mode> = {};
  for (const c of CAPABILITIES) {
    const wanted = s?.modes?.[c.id];
    modes[c.id] = lower(wanted === 'off' || wanted === 'ask' || wanted === 'allow' ? wanted : c.fallback, c.max);
  }
  return {
    enabled: Boolean(s?.enabled),
    accounts: Object.fromEntries(Object.entries(s?.accounts || {}).map(([id, v]) => [id, v === 'read' || v === 'write' ? v : (v as unknown) === true ? 'read' : 'off'] as [string, AccountLevel])),
    modes,
    overrides: Object.fromEntries(Object.entries(s?.overrides || {}).map(([id, o]) => [id, Object.fromEntries(CAPABILITIES.filter((c) => o?.[c.id] === 'off' || o?.[c.id] === 'ask' || o?.[c.id] === 'allow').map((c) => [c.id, lower(o[c.id], c.max)]))] as [string, Record<string, Mode>]).filter(([, o]) => Object.keys(o).length)),
    idleMinutes: IDLE_CHOICES.includes(Number(s?.idleMinutes)) ? Number(s?.idleMinutes) : base.idleMinutes,
    noPauseUntil: typeof s?.noPauseUntil === 'number' ? s.noPauseUntil : undefined,
    expiresAt: typeof s?.expiresAt === 'number' ? s.expiresAt : undefined,
    maxPerMinute: Math.min(120, Math.max(1, Math.round(s?.maxPerMinute ?? base.maxPerMinute))),
  };
}

/** A sliding one minute counter. Over the limit, the action waits for the next minute. */
export class RateLimit {
  private stamps: number[] = [];
  constructor(private perMinute: number) {}
  setLimit(n: number) { this.perMinute = n; }
  take(now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < 60000);
    if (this.stamps.length >= this.perMinute) return false;
    this.stamps.push(now);
    return true;
  }
}
