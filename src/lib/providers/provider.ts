// The contract every mail service (Gmail, Microsoft 365, IMAP, demo) fulfils.
import type { Account, Address, Task, TaskList, TaskPatch, Alias, CalendarEvent, EventCopy, EventPatch, ChangeOptions, EventGuest, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
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
  /** Calendars in this account that events can be written to (known after listEvents). */
  writableCalendars?(): string[];
  /** Changes an event you can edit. Guests, if any, are told. */
  editEvent?(event: CalendarEvent, patch: EventPatch, opts?: ChangeOptions): Promise<void>;
  /** Deletes an event you made. Guests are told unless notify is false. Scope 'all' deletes the whole series. */
  deleteEvent?(event: CalendarEvent, opts?: ChangeOptions): Promise<void>;
  /** Everything about an event (or, with series, its whole series from this one on), to make it in another account. */
  copyOfEvent?(event: CalendarEvent, opts: { series: boolean }): Promise<EventCopy>;
  /** Makes an event in one of this account's calendars, inviting any guests. Returns the app's id for it. */
  createEvent?(calendarName: string, copy: EventCopy): Promise<string>;
  /** Stops a series from this one on (deletes it if this is the first). */
  endSeries?(event: CalendarEvent): Promise<void>;
  /** Is this invitation in the person's calendar, and what did they answer? */
  /** The calendars this account has, as last seen, even if none has an event. */
  knownCalendars?(): string[];
  inviteStatus?(uid: string): Promise<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] }>;
  /** Answers an invitation in the calendar itself, telling the organiser (with a note, if given). False when it isn't in the calendar. */
  respondToInvite?(uid: string, status: Rsvp, note?: string): Promise<boolean>;
  /** Answers an invitation found in the calendar (an event where you are a guest), telling the organiser, with an optional note. */
  respondToEvent?(event: CalendarEvent, status: Rsvp, note?: string): Promise<void>;
  /** Puts an invitation in the calendar. */
  /** Adds an event; may return the calendar's own id for it, so it can be changed later. */
  addInviteToCalendar?(invite: Invite): Promise<string | void>;
  /** Changes an event added from here (its time or title). Without this, adding again with the same uid updates it. */
  updateAddedEvent?(ref: string, invite: Invite): Promise<void>;
  /** Out of Office as the account itself holds it. */
  getAutoReply?(): Promise<AutoReply>;
  /** Sets Out of Office inside the account, so it works with this computer off. */
  setAutoReply?(r: AutoReply): Promise<void>;
  /** An "Away" event in the calendar for the time away. Google Workspace can decline new invitations during it. Returns its id. */
  addAwayEvent?(start: number, end: number, opts: { allDay: boolean; decline: boolean; message?: string }): Promise<string>;
  removeAwayEvent?(id: string): Promise<void>;
  /** Upload a large file and return a share link (Google Drive). */
  uploadLargeFile?(name: string, mimeType: string, data: Uint8Array): Promise<string>;
  /** Task lists (Google Tasks, Microsoft To Do). */
  listTaskLists?(): Promise<TaskList[]>;
  /** Open tasks in a list, and ones finished since `doneSince`. */
  listTasks?(list: TaskList, doneSince: number): Promise<Task[]>;
  createTask?(list: TaskList, p: TaskPatch): Promise<Task>;
  updateTask?(task: Task, p: TaskPatch): Promise<Task>;
  deleteTask?(task: Task): Promise<void>;
  createTaskList?(name: string): Promise<TaskList>;
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

/** Google: the Tasks API isn't turned on in the person's own Google Cloud project yet. */
export class TasksApiOffError extends Error {
  apiOff = true;
  constructor() {
    super('The Google Tasks API is not turned on in your Google Cloud project yet');
  }
}
