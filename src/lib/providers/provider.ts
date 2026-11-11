// The contract every mail service (Gmail, Microsoft 365, IMAP, demo) fulfils.
import type { Account, Address, Alias, CalendarEvent, EventGuest, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
import type { Invite, Rsvp } from '../invites';
import type { AutoReply } from '../ooo';

export interface SyncResult {
  upserted: Message[];
  /** Label changes on messages we already have. */
  labelChanges: { id: string; labels: string[] }[];
  deleted: string[];
  cursor?: string;
  /** The cursor expired; the caller should run a full sync. */
  resetNeeded?: boolean;
}

export interface MessageBody {
  html?: string;
  text?: string;
  attachments: Message['attachments'];
}

export interface MailProvider {
  readonly account: Account;
  /** Maps standard mailboxes to this provider's folder/label ids. */
  systemFolderId(folder: SystemFolder): string | null;
  listFolders(): Promise<Folder[]>;
  /** Tells the provider which folders were saved last time, so Inbox, Sent and the rest are known straight after the app starts. */
  hydrate?(folders: Folder[]): void;
  listAliases(): Promise<Alias[]>;
  /** First sync: recent mail back to `sinceDays` (null = everything). */
  fullSync(sinceDays: number | null, onBatch: (msgs: Message[]) => Promise<void> | void, isKnown?: (providerId: string) => boolean): Promise<{ cursor?: string }>;
  incrementalSync(cursor: string): Promise<SyncResult>;
  getBody(msg: Message): Promise<MessageBody>;
  getAttachment(msg: Message, attachmentId: string): Promise<Uint8Array>;
  modifyLabels(msgs: Message[], add: string[], remove: string[]): Promise<void>;
  trash(msgs: Message[]): Promise<void>;
  untrash(msgs: Message[]): Promise<void>;
  send(msg: OutgoingMessage): Promise<{ providerId: string; threadId: string }>;
  saveDraft(msg: OutgoingMessage, serverDraftId?: string): Promise<{ draftId: string; messageId?: string }>;
  /** Gmail only: puts labels (made if missing, by name like "AI Drafts/Clients") on a saved draft's message. */
  labelByName?(messageId: string, names: string[]): Promise<void>;
  /** Gmail only: every draft on the server, by draft id and the id of its current message. */
  listDrafts?(): Promise<{ draftId: string; messageId: string }[]>;
  /** Gmail only: a message's label names (as written in Gmail) and its date. */
  messageInfo?(messageId: string): Promise<{ labels: string[]; date: number }>;
  deleteDraft(serverDraftId: string): Promise<void>;
  /** Find the draft id for a message sitting in Drafts. */
  findDraftId?(providerMessageId: string): Promise<string | undefined>;
  searchRemote(query: string): Promise<Message[]>;
  listContacts(): Promise<Address[]>;
  /** Adds someone to the account's own contacts (Google Contacts, Outlook People). */
  addContact?(a: Address): Promise<void>;
  listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]>;
  /** Is this invitation in the person's calendar, and what did they answer? */
  /** The calendars this account has, as last seen, even if none has an event. */
  knownCalendars?(): string[];
  inviteStatus?(uid: string): Promise<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] }>;
  /** Answers an invitation in the calendar itself, telling the organiser. False when it isn't in the calendar. */
  respondToInvite?(uid: string, status: Rsvp): Promise<boolean>;
  /** Puts an invitation in the calendar. */
  addInviteToCalendar?(invite: Invite): Promise<void>;
  /** Out of Office as the account itself holds it. */
  getAutoReply?(): Promise<AutoReply>;
  /** Sets Out of Office inside the account, so it works with this computer off. */
  setAutoReply?(r: AutoReply): Promise<void>;
  /** An "Away" event in the calendar for the time away. Google Workspace can decline new invitations during it. Returns its id. */
  addAwayEvent?(start: number, end: number, opts: { allDay: boolean; decline: boolean; message?: string }): Promise<string>;
  removeAwayEvent?(id: string): Promise<void>;
  /** Upload a large file and return a share link (Google Drive). */
  uploadLargeFile?(name: string, mimeType: string, data: Uint8Array): Promise<string>;
}

/** The account hasn't allowed the app to change its calendar yet; signing in again does that. */
export class CalendarPermissionError extends Error {
  constructor() {
    super("This account hasn't allowed Well Good Mail to change its calendar yet");
  }
}

/** The account signed in before it allowed this (like Out of Office). Signing in once more fixes it. */
export class NeedsPermissionError extends Error {
  needsPermission = true;
  constructor(what = 'this') {
    super(`This account needs to sign in once more to allow ${what}`);
  }
}

export class NotSupportedError extends Error {
  constructor(what: string) {
    super(`${what} isn't available for this account type yet`);
  }
}
