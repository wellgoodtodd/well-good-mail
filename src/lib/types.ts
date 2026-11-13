// Core data types shared across the app.

export type ProviderKind = 'gmail' | 'microsoft' | 'imap' | 'demo';

export interface Address {
  name?: string;
  email: string;
  /** Google contact photo, when there is one. */
  photo?: string;
  /** A contact's postal address on one line, when the contacts list has one (offered as a place for events). */
  address?: string;
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
  /** You can change it here: it's on a calendar you can write to and you made it (not an invitation from someone else). */
  canEdit?: boolean;
  /** One of a repeating series (changes here change only this one). */
  recurring?: boolean;
  /** For one of a series: the series it belongs to (same for every one), when the calendar says. */
  seriesId?: string;
  /** Who sent the invitation, when the calendar says. `self` when it's you. */
  organiser?: { email: string; name?: string; self?: boolean };
  /** The organiser cancelled it, but it is still in your calendar (Outlook keeps these until you remove them). */
  cancelled?: boolean;
  /** How it repeats, in a few words ("every year"), when the calendar says. */
  repeatText?: string;
}

/** How a series repeats, in a shape both Google and Outlook rules turn into. */
export interface Repeat {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** Two-letter days (MO, TU...). Weekly: the days it falls on. Monthly or yearly with nth: the one day. */
  days?: string[];
  /** "The second Tuesday": 1 to 4, or -1 for the last. */
  nth?: number;
  monthDay?: number;
  /** 1 to 12, for yearly. */
  month?: number;
  /** Local midnight of the last day it can happen on. */
  until?: number;
  count?: number;
}

/** Everything needed to make the same event in another account. */
export interface EventCopy {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  description?: string;
  guests: { email: string; name?: string }[];
  /** It had a video link, so the copy gets a new one from its own account. */
  video: boolean;
  /** For a whole series: how it repeats, from start on. */
  repeat?: Repeat;
  /** The series repeats in a way that can't be copied. */
  repeatUnsupported?: boolean;
  /** Alerts, in minutes before it starts (0 at the time). Left out: the calendar's own default. */
  alerts?: number[];
}

/** What can be changed on an event. Only the fields given are changed. */
export interface EventPatch {
  title?: string;
  start?: number;
  end?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  /** Another calendar in the same account, by its name. */
  calendarName?: string;
  /** Alerts, in minutes before it starts. An empty list means none. */
  alerts?: number[];
  /** The guests (not you): the whole new list. Answers of people already invited are kept. */
  guests?: { email: string; name?: string }[];
  /** Add (true) or remove (false) the video call. */
  video?: boolean;
  /** A new repeat rule (null stops it repeating). Changes the whole series. */
  repeat?: Repeat | null;
}

/** Which events of a series a change or delete applies to. */
export type SeriesScope = 'one' | 'following' | 'all';

/** How a change reaches the event and its guests. */
export interface ChangeOptions {
  scope?: SeriesScope;
  /** Email the guests about it (default true). */
  notify?: boolean;
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
  /** A Smart Mailbox: saved rules, from settings. */
  | { kind: 'smart'; id: string }
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
  /** Open in the editor while scheduled: it still goes at this time unless you send it now or move it back to drafts. */
  scheduledAt?: number;
  updatedAt: number;
  /** Provider draft id once saved to the server. */
  serverDraftId?: string;
  serverAccountId?: string;
  /** Provider message id of the server draft this was opened from. */
  serverDraftMessageId?: string;
  /** Old: a guess that a draft already had a sign-off. No longer used; the signature choice below decides. */
  noSignature?: boolean;
  /** Which signature goes on it: unset for the From address's own, '' for none, or another address's. */
  signatureOf?: string;
  /** Written by an AI app (its plain name), so it shows under AI drafts. */
  byAi?: string;
  /** Which AI drafts group it is in (a group id from settings), if any. */
  group?: string;
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
