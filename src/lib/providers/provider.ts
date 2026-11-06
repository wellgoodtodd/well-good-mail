// The contract every mail service (Gmail, Microsoft 365, IMAP, demo) fulfils.
import type { Account, Address, Alias, CalendarEvent, Folder, Message, OutgoingMessage, SystemFolder } from '../types';

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
  saveDraft(msg: OutgoingMessage, serverDraftId?: string): Promise<{ draftId: string }>;
  deleteDraft(serverDraftId: string): Promise<void>;
  /** Find the draft id for a message sitting in Drafts. */
  findDraftId?(providerMessageId: string): Promise<string | undefined>;
  searchRemote(query: string): Promise<Message[]>;
  listContacts(): Promise<Address[]>;
  listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]>;
  /** Upload a large file and return a share link (Google Drive). */
  uploadLargeFile?(name: string, mimeType: string, data: Uint8Array): Promise<string>;
}

export class NotSupportedError extends Error {
  constructor(what: string) {
    super(`${what} isn't available for this account type yet`);
  }
}
