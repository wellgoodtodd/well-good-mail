// Core data types shared across the app.

export type ProviderKind = 'gmail' | 'microsoft' | 'imap' | 'demo';

export interface Address {
  name?: string;
  email: string;
  /** Google contact photo, when there is one. */
  photo?: string;
}

/** A "send as" address. Gmail aliases come in automatically. */
export interface Alias {
  email: string;
  name: string;
  isDefault: boolean;
  /** Signature pulled from the provider (Gmail sendAs signature). */
  providerSignatureHtml?: string;
  replyTo?: string;
}

export type AccountStatus = 'ok' | 'syncing' | 'needs-signin' | 'error';

export interface Account {
  id: string;
  kind: ProviderKind;
  email: string;
  /** Name shown in the sidebar, e.g. "WGM" or "Personal". */
  label: string;
  displayName: string;
  /** The Google profile picture, saved as a data URL so it also shows offline. */
  photoUrl?: string;
  colour: string;
  aliases: Alias[];
  order: number;
  status: AccountStatus;
  error?: string;
  /** Messages fetched so far during a first sync, for the accounts list. */
  syncDone?: number;
  /** Provider sync cursor (Gmail historyId). */
  syncCursor?: string;
  lastSync?: number;
  /** How far back to keep mail offline, in days. null = everything. */
  retentionDays: number | null;
  notify: 'all' | 'important' | 'off';
  /** Keep this account's mail out of All Inboxes and the other combined views. It still has its own place in the sidebar. */
  leaveOutOfAll?: boolean;
  /** For IMAP accounts (not tested yet). */
  imap?: { host: string; port: number; smtpHost: string; smtpPort: number; username: string; /** iCloud: the Apple Account email, when it differs from the mail address. Used for contacts and calendar. */ appleId?: string };
}

/** The standard mailboxes every account has. */
export type SystemFolder = 'inbox' | 'drafts' | 'sent' | 'junk' | 'bin' | 'archive' | 'flagged';

export interface Folder {
  /** Provider label or folder id, e.g. "INBOX" or "Label_123". */
  id: string;
  accountId: string;
  name: string;
  system?: SystemFolder;
  unread: number;
  /** Nested labels use "Parent/Child" names in Gmail. */
  depth: number;
  colour?: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  inline: boolean;
}

export interface Message {
  /** Unique across accounts: `${accountId}|${providerId}`. */
  id: string;
  accountId: string;
  providerId: string;
  threadId: string;
  /** Provider label / folder ids the message sits in. */
  labels: string[];
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo?: Address[];
  deliveredTo?: string;
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
  flagged: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  attachments: AttachmentMeta[];
  bodyHtml?: string;
  bodyText?: string;
  bodyLoaded: boolean;
  messageIdHeader?: string;
  references?: string;
  inReplyTo?: string;
  listUnsubscribe?: string;
  listUnsubscribePost?: boolean;
  /** Gmail draft id when this message is a draft. */
  draftId?: string;
  /** IMAP only: which folders hold a copy of this email, and its number (UID) in each. */
  locations?: Record<string, number>;
}

export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
  contentId?: string;
  inline?: boolean;
}

export interface OutgoingMessage {
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo?: Address[];
  subject: string;
  html: string;
  text: string;
  attachments: OutgoingAttachment[];
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface CalendarEvent {
  id: string;
  accountId: string;
  calendarName: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  /** Notes from the event, kept short. */
  description?: string;
  /** The Teams, Zoom or Meet link, when the event has one. */
  meetingUrl?: string;
  /** Minutes before start that the calendar wants a reminder. */
  reminderMinutes: number[];
  htmlLink?: string;
  /** When the same event is on several of your calendars it is shown once; these are all the accounts it is on. */
  accountIds?: string[];
  /** Who is invited and what they answered, when the calendar tells us. */
  guests?: EventGuest[];
  /** Your own answer on this copy of the event. */
  myResponse?: GuestAnswer;
  /** True when every copy of the event has your "No" on it, so no alerts are needed. */
  declined?: boolean;
}

export type GuestAnswer = 'yes' | 'no' | 'maybe' | 'waiting';

export interface EventGuest {
  email: string;
  name?: string;
  answer: GuestAnswer;
  organiser?: boolean;
  self?: boolean;
}

export type ReminderKind = 'event' | 'followup' | 'snooze';

export interface ReminderItem {
  id: string;
  kind: ReminderKind;
  title: string;
  /** When the reminder became due. */
  dueAt: number;
  /** When the underlying event starts, for calendar items. */
  eventStart?: number;
  accountId: string;
  calendarName?: string;
  messageId?: string;
  threadId?: string;
}

/** Where the message list is pointing. */
export type Scope =
  | { type: 'all' }
  | { type: 'account'; accountId: string }
  | { type: 'group'; groupId: string };

export type MailboxRef =
  | { kind: 'system'; folder: SystemFolder }
  | { kind: 'label'; accountId: string; labelId: string }
  | { kind: 'vip' }
  | { kind: 'snoozed' }
  /** `within` is the mailbox the search started in; leave it out to search all mail. */
  | { kind: 'search'; query: string; within?: Exclude<MailboxRef, { kind: 'search' }> };

export interface View {
  scope: Scope;
  mailbox: MailboxRef;
}

export interface AccountGroup {
  id: string;
  name: string;
  accountIds: string[];
}

export interface Template {
  id: string;
  name: string;
  html: string;
}

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface Draft {
  id: string;
  mode: ComposeMode;
  sourceMessageId?: string;
  fromEmail: string;
  /** Which account sends it. Needed because two accounts (say Gmail and Microsoft) can share one address. */
  fromAccountId?: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  /** Recipients added by hand, kept when switching Reply / Reply All / Forward. */
  manualRecipients: { field: 'to' | 'cc' | 'bcc'; address: Address }[];
  /** Forwarding: include the original email's attachments. */
  includeSourceAttachments: boolean;
  subject: string;
  html: string;
  attachments: { id: string; filename: string; mimeType: string; size: number; dataB64: string }[];
  driveLinks: { name: string; url: string }[];
  quotedHtml: string;
  includeQuote: boolean;
  followUpDays?: number;
  sendAt?: number;
  updatedAt: number;
  /** Provider draft id once saved to the server. */
  serverDraftId?: string;
  serverAccountId?: string;
  /** Provider message id of the server draft this was opened from. */
  serverDraftMessageId?: string;
}

export interface OutboxItem {
  id: string;
  draft: Draft;
  /** When it actually goes out (undo window or send later). */
  sendAt: number;
  kind: 'undo' | 'scheduled';
}

export interface FollowUp {
  id: string;
  accountId: string;
  threadId: string;
  subject: string;
  sentAt: number;
  dueAt: number;
  to: string;
}

export interface Snooze {
  messageId: string;
  accountId: string;
  threadId: string;
  until: number;
  subject: string;
}
