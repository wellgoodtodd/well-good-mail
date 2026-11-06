// Microsoft 365 / Outlook.com via Microsoft Graph.
// Built so a 365 account can be added later; not yet tested with a real one.
// Graph has folders rather than labels, so each message carries its folder id
// plus two pseudo labels: UNREAD and FLAGGED.
import { getMicrosoftAccessToken } from '../auth/microsoft';
import { bytesToBase64, buildRawMessage, base64ToBytes } from '../mime';
import { httpFetch } from '../platform';
import type { Account, Address, Alias, CalendarEvent, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
import type { MailProvider, MessageBody, SyncResult } from './provider';

const G = 'https://graph.microsoft.com/v1.0/me';
const WELL_KNOWN: Record<Exclude<SystemFolder, 'flagged'>, string> = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  junk: 'junkemail',
  bin: 'deleteditems',
  archive: 'archive',
};

interface GraphMessage {
  id: string;
  conversationId: string;
  parentFolderId: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  flag?: { flagStatus: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
  ccRecipients?: { emailAddress: { name?: string; address: string } }[];
  bccRecipients?: { emailAddress: { name?: string; address: string } }[];
  replyTo?: { emailAddress: { name?: string; address: string } }[];
  internetMessageId?: string;
  body?: { contentType: string; content: string };
  '@removed'?: unknown;
}

const addr = (r?: { emailAddress: { name?: string; address: string } }): Address => ({ name: r?.emailAddress.name, email: (r?.emailAddress.address || '').toLowerCase() });

/**
 * Microsoft sends mail as the signed in mailbox and rejects a From header that is not exactly that mailbox's address.
 * A personal account's sign in name (say a work address linked to an Outlook mailbox) is often not the mailbox address,
 * so the From line is left out and Microsoft fills in the right one.
 */
function withoutFrom(raw: string): string {
  return raw.replace(/^From:[^\r\n]*(\r?\n[ \t][^\r\n]*)*\r?\n/m, '');
}

export class MicrosoftProvider implements MailProvider {
  private folderIds: Partial<Record<SystemFolder, string>> = {};
  constructor(public readonly account: Account) {}

  systemFolderId(f: SystemFolder) {
    if (f === 'flagged') return 'FLAGGED';
    return this.folderIds[f] || null;
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await getMicrosoftAccessToken(this.account.email);
    const res = await httpFetch(url.startsWith('http') ? url : G + url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) {
      const err = new Error(`Microsoft ${res.status}: ${(await res.text()).slice(0, 300)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    if (res.status === 202 || res.status === 204) return undefined as T;
    return res.json();
  }

  private toMessage(g: GraphMessage, withBody: boolean): Message {
    const labels = [g.parentFolderId];
    if (!g.isRead) labels.push('UNREAD');
    if (g.flag?.flagStatus === 'flagged') labels.push('FLAGGED');
    return {
      id: `${this.account.id}|${g.id}`,
      accountId: this.account.id,
      providerId: g.id,
      threadId: g.conversationId,
      labels,
      from: addr(g.from),
      to: (g.toRecipients || []).map(addr),
      cc: (g.ccRecipients || []).map(addr),
      bcc: (g.bccRecipients || []).map(addr),
      replyTo: (g.replyTo || []).map(addr),
      subject: g.subject || '(no subject)',
      snippet: g.bodyPreview || '',
      date: new Date(g.receivedDateTime).getTime(),
      unread: !g.isRead,
      flagged: g.flag?.flagStatus === 'flagged',
      isDraft: g.isDraft,
      hasAttachments: g.hasAttachments,
      attachments: [],
      bodyHtml: withBody && g.body?.contentType === 'html' ? g.body.content : undefined,
      bodyText: withBody && g.body?.contentType === 'text' ? g.body.content : undefined,
      bodyLoaded: withBody && Boolean(g.body),
      messageIdHeader: g.internetMessageId,
    };
  }

  async listFolders(): Promise<Folder[]> {
    for (const [k, wk] of Object.entries(WELL_KNOWN)) {
      try {
        const f = await this.call<{ id: string }>(`/mailFolders/${wk}`);
        this.folderIds[k as SystemFolder] = f.id;
      } catch { /* archive may not exist */ }
    }
    const { value } = await this.call<{ value: { id: string; displayName: string; unreadItemCount: number }[] }>('/mailFolders?$top=200');
    const reverse = Object.fromEntries(Object.entries(this.folderIds).map(([k, v]) => [v, k as SystemFolder]));
    return [
      ...value.map((f) => ({ id: f.id, accountId: this.account.id, name: f.displayName, system: reverse[f.id], unread: f.unreadItemCount, depth: 0 })),
      { id: 'FLAGGED', accountId: this.account.id, name: 'Flagged', system: 'flagged' as const, unread: 0, depth: 0 },
    ];
  }

  async listAliases(): Promise<Alias[]> {
    return [{ email: this.account.email, name: this.account.displayName, isDefault: true }];
  }

  async fullSync(sinceDays: number | null, onBatch: (m: Message[]) => Promise<void> | void) {
    const filter = sinceDays ? `&$filter=receivedDateTime ge ${new Date(Date.now() - sinceDays * 86400000).toISOString()}` : '';
    let url: string | undefined = `/messages?$top=100&$orderby=receivedDateTime desc${filter}`;
    while (url) {
      const page: { value: GraphMessage[]; '@odata.nextLink'?: string } = await this.call(url);
      await onBatch(page.value.map((m) => this.toMessage(m, false)));
      url = page['@odata.nextLink'];
    }
    // Delta per folder would be more efficient; a simple time cursor keeps it robust.
    return { cursor: new Date().toISOString() };
  }

  async incrementalSync(cursor: string): Promise<SyncResult> {
    const since = new Date(new Date(cursor).getTime() - 5 * 60000).toISOString();
    const page = await this.call<{ value: GraphMessage[] }>(`/messages?$top=200&$filter=lastModifiedDateTime ge ${since}&$orderby=lastModifiedDateTime desc`);
    return { upserted: page.value.map((m) => this.toMessage(m, false)), labelChanges: [], deleted: [], cursor: new Date().toISOString() };
  }

  async getBody(msg: Message): Promise<MessageBody> {
    const g = await this.call<GraphMessage>(`/messages/${msg.providerId}?$select=body,hasAttachments`);
    const atts = g.hasAttachments
      ? (await this.call<{ value: { id: string; name: string; contentType: string; size: number; isInline: boolean; contentId?: string }[] }>(`/messages/${msg.providerId}/attachments?$select=id,name,contentType,size,isInline,contentId`)).value
      : [];
    return {
      html: g.body?.contentType === 'html' ? g.body.content : undefined,
      text: g.body?.contentType === 'text' ? g.body.content : undefined,
      attachments: atts.map((a) => ({ id: a.id, filename: a.name, mimeType: a.contentType, size: a.size, inline: a.isInline, contentId: a.contentId })),
    };
  }

  async getAttachment(msg: Message, id: string) {
    const a = await this.call<{ contentBytes: string }>(`/messages/${msg.providerId}/attachments/${id}`);
    return base64ToBytes(a.contentBytes);
  }

  async modifyLabels(msgs: Message[], add: string[], remove: string[]) {
    for (const m of msgs) {
      const patch: Record<string, unknown> = {};
      if (add.includes('UNREAD')) patch.isRead = false;
      if (remove.includes('UNREAD')) patch.isRead = true;
      if (add.includes('FLAGGED')) patch.flag = { flagStatus: 'flagged' };
      if (remove.includes('FLAGGED')) patch.flag = { flagStatus: 'notFlagged' };
      if (Object.keys(patch).length) await this.call(`/messages/${m.providerId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      const dest = add.find((l) => l !== 'UNREAD' && l !== 'FLAGGED');
      const archiving = remove.includes(this.folderIds.inbox || '') && !dest;
      const target = dest || (archiving ? this.folderIds.archive : undefined);
      if (target) await this.call(`/messages/${m.providerId}/move`, { method: 'POST', body: JSON.stringify({ destinationId: target }) });
    }
  }

  async trash(msgs: Message[]) {
    for (const m of msgs) await this.call(`/messages/${m.providerId}/move`, { method: 'POST', body: JSON.stringify({ destinationId: 'deleteditems' }) });
  }

  async untrash(msgs: Message[]) {
    for (const m of msgs) await this.call(`/messages/${m.providerId}/move`, { method: 'POST', body: JSON.stringify({ destinationId: 'inbox' }) });
  }

  async send(msg: OutgoingMessage) {
    const mime = bytesToBase64(new TextEncoder().encode(withoutFrom(buildRawMessage(msg))));
    await this.call('/sendMail', { method: 'POST', body: mime, headers: { 'Content-Type': 'text/plain' } });
    return { providerId: '', threadId: msg.threadId || '' };
  }

  async saveDraft(msg: OutgoingMessage, serverDraftId?: string) {
    if (serverDraftId) await this.deleteDraft(serverDraftId);
    const mime = bytesToBase64(new TextEncoder().encode(withoutFrom(buildRawMessage(msg))));
    const r = await this.call<{ id: string }>('/messages', { method: 'POST', body: mime, headers: { 'Content-Type': 'text/plain' } });
    return { draftId: r.id };
  }

  async deleteDraft(id: string) {
    await this.call(`/messages/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async searchRemote(query: string) {
    const page = await this.call<{ value: GraphMessage[] }>(`/messages?$search="${encodeURIComponent(query)}"&$top=50`);
    return page.value.map((m) => this.toMessage(m, false));
  }

  async listContacts(): Promise<Address[]> {
    const page = await this.call<{ value: { displayName?: string; emailAddresses: { address: string }[] }[] }>('/contacts?$top=500');
    return page.value.flatMap((c) => c.emailAddresses.map((e) => ({ name: c.displayName, email: e.address.toLowerCase() })));
  }

  async listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]> {
    const page = await this.call<{ value: { id: string; subject: string; start: { dateTime: string }; end: { dateTime: string }; isAllDay: boolean; isReminderOn: boolean; reminderMinutesBeforeStart: number; webLink: string; location?: { displayName?: string } }[] }>(
      `/calendarView?startDateTime=${new Date(fromMs).toISOString()}&endDateTime=${new Date(toMs).toISOString()}&$top=250`,
      { headers: { Prefer: 'outlook.timezone="UTC"' } },
    );
    return page.value.map((e) => ({
      id: `${this.account.id}|${e.id}`,
      accountId: this.account.id,
      calendarName: 'Calendar',
      title: e.subject,
      start: new Date(e.start.dateTime + 'Z').getTime(),
      end: new Date(e.end.dateTime + 'Z').getTime(),
      allDay: e.isAllDay,
      location: e.location?.displayName,
      reminderMinutes: e.isReminderOn ? [e.reminderMinutesBeforeStart] : [],
      htmlLink: e.webLink,
    }));
  }
}
