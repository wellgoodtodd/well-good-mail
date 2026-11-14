// Gmail via the Gmail REST API (plus Calendar, People and Drive for the
// extras). Everything goes through the signed in user's own access token.
import { forgetGoogleAccessToken, getGoogleAccessToken } from '../auth/google';
import { base64ToBytes, base64UrlEncode, buildRawMessage, decodeBody, decodeHeader, parseAddressList } from '../mime';
import { httpFetch } from '../platform';
import type { Account, Address, Alias, AttachmentMeta, Task, TaskList, TaskPatch, CalendarEvent, EventGuest, EventCopy, EventPatch, ChangeOptions, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
import type { AutoReply } from '../ooo';
import { htmlToText, isWorkAccount, ymd } from '../ooo';
import { CalendarPermissionError, NeedsPermissionError, TasksApiOffError, type MailProvider, type MessageBody, type SyncResult } from './provider';
import type { Invite, Rsvp } from '../invites';
import { cleanPreview } from '../cleanText';
import * as gcal from '../google/calendarApi';
import { answered, guestsOf } from '../google/calendarApi';
import * as gtasks from '../google/tasksApi';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** Mail newer than this many days is downloaded with full bodies for offline search. */
const FULL_BODY_DAYS = 45;
const CONCURRENCY = 4;
/** This project's limit is 6,000 quota units a minute per user and a message fetch costs 5. One request every 80 ms is about 3,750 units a minute. */
const MIN_GAP_MS = 80;
const MAX_GAP_MS = 1500;

interface Pace { next: number; hold: number; gap: number; calm: number }
const paces = new Map<string, Pace>();

/** How hard the app is currently pacing an account's requests, for the Diagnostics page. */
export function paceInfo(key: string): { gapMs: number; pausedUntil: number } | undefined {
  const p = paces.get(key);
  return p ? { gapMs: Math.round(p.gap), pausedUntil: p.hold > Date.now() ? p.hold : 0 } : undefined;
}

function paceFor(key: string): Pace {
  let p = paces.get(key);
  if (!p) paces.set(key, (p = { next: 0, hold: 0, gap: MIN_GAP_MS, calm: 0 }));
  return p;
}

/** Spaces requests for one account evenly, and holds them all while a quota pause is running. */
async function throttle(key: string, urgent = false) {
  const p = paceFor(key);
  const now = Date.now();
  // Something the person just clicked on skips the background queue, but still waits out a quota pause.
  if (urgent) {
    if (p.hold > now) await new Promise((r) => setTimeout(r, p.hold - now));
    return;
  }
  const slot = Math.max(now, p.next);
  p.next = slot + p.gap;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

/** Gmail said we were too fast: hold this account for a while and make the spacing wider. */
function backOff(key: string, pauseMs: number) {
  const p = paceFor(key);
  p.next = Math.max(p.next, Date.now() + pauseMs);
  p.hold = Math.max(p.hold, Date.now() + pauseMs);
  p.gap = Math.min(MAX_GAP_MS, p.gap * 2);
  p.calm = 0;
}

/** A clean run of requests lets the spacing tighten again, back towards the minimum. */
function allClear(key: string) {
  const p = paceFor(key);
  if (p.gap > MIN_GAP_MS && ++p.calm >= 150) {
    p.gap = Math.max(MIN_GAP_MS, Math.round(p.gap * 0.7));
    p.calm = 0;
  }
}

const SYSTEM: Record<SystemFolder, string | null> = {
  inbox: 'INBOX',
  sent: 'SENT',
  drafts: 'DRAFT',
  junk: 'SPAM',
  bin: 'TRASH',
  flagged: 'STARRED',
  archive: null,
};

const HIDDEN_LABELS = new Set(['UNREAD', 'IMPORTANT', 'CHAT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'YELLOW_STAR']);

interface GmailHeader { name: string; value: string }
interface GmailPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size: number; data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function header(part: GmailPart | undefined, name: string): string | undefined {
  const h = part?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : undefined;
}

function decodeData(data: string, contentType?: string): string {
  const charset = /charset="?([^";\s]+)"?/i.exec(contentType || '')?.[1] || 'utf-8';
  return decodeBody(base64ToBytes(data), charset);
}

export function parseGmailPayload(payload: GmailPart | undefined): MessageBody {
  let html: string | undefined;
  let text: string | undefined;
  const attachments: AttachmentMeta[] = [];
  const walk = (p: GmailPart) => {
    const disposition = header(p, 'Content-Disposition') || '';
    const contentId = header(p, 'Content-ID')?.replace(/[<>]/g, '');
    if (p.filename && p.body?.attachmentId) {
      attachments.push({
        id: p.body.attachmentId,
        filename: decodeHeader(p.filename),
        mimeType: p.mimeType,
        size: p.body.size,
        contentId,
        inline: Boolean(contentId) && !/attachment/i.test(disposition),
      });
    } else if (p.mimeType === 'text/html' && p.body?.data && html === undefined) {
      html = decodeData(p.body.data, header(p, 'Content-Type'));
    } else if (p.mimeType === 'text/plain' && p.body?.data && text === undefined) {
      text = decodeData(p.body.data, header(p, 'Content-Type'));
    }
    p.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  // A picture only counts as "inline" if the email's HTML actually points at it. Plain text emails
  // (Apple Mail forwards, for one) carry pictures with a Content-ID and just a <name.jpeg> note in the text,
  // so those must show up as attachments instead of vanishing.
  for (const a of attachments) {
    if (a.inline && !(html && a.contentId && html.toLowerCase().includes(`cid:${a.contentId.toLowerCase()}`))) a.inline = false;
  }
  return { html, text, attachments };
}

export function gmailToMessage(accountId: string, g: GmailMessage, withBody: boolean): Message {
  const p = g.payload;
  const labels = g.labelIds || [];
  const body = withBody ? parseGmailPayload(p) : { attachments: [] as AttachmentMeta[] };
  const unsub = header(p, 'List-Unsubscribe');
  const hasAttachmentHint = /multipart\/mixed/i.test(header(p, 'Content-Type') || '');
  return {
    id: `${accountId}|${g.id}`,
    accountId,
    providerId: g.id,
    threadId: g.threadId,
    labels,
    from: parseAddressList(header(p, 'From'))[0] || { email: 'unknown' },
    to: parseAddressList(header(p, 'To')),
    cc: parseAddressList(header(p, 'Cc')),
    bcc: parseAddressList(header(p, 'Bcc')),
    replyTo: parseAddressList(header(p, 'Reply-To')),
    deliveredTo: header(p, 'Delivered-To') || header(p, 'X-Original-To'),
    subject: decodeHeader(header(p, 'Subject') || '(no subject)'),
    snippet: cleanPreview(decodeEntities(g.snippet || ''), 300),
    date: Number(g.internalDate || Date.now()),
    unread: labels.includes('UNREAD'),
    flagged: labels.includes('STARRED'),
    isDraft: labels.includes('DRAFT'),
    hasAttachments: withBody ? body.attachments.some((a) => !a.inline) : hasAttachmentHint,
    attachments: body.attachments,
    bodyHtml: 'html' in body ? body.html : undefined,
    bodyText: 'text' in body ? body.text : undefined,
    bodyLoaded: withBody,
    messageIdHeader: header(p, 'Message-ID') || header(p, 'Message-Id'),
    references: header(p, 'References'),
    inReplyTo: header(p, 'In-Reply-To'),
    listUnsubscribe: unsub,
    listUnsubscribePost: /One-Click/i.test(header(p, 'List-Unsubscribe-Post') || ''),
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const METADATA_HEADERS = ['From', 'To', 'Cc', 'Bcc', 'Reply-To', 'Subject', 'Date', 'Message-ID', 'References', 'In-Reply-To', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'Delivered-To', 'Content-Type'];

// The guest list helpers moved to google/calendarApi.ts; kept here for anything that imported them from the provider.
export { guestsOf };

export class GmailProvider implements MailProvider {
  constructor(public readonly account: Account) {}

  systemFolderId(folder: SystemFolder) {
    return SYSTEM[folder];
  }

  private async call<T>(url: string, init: RequestInit = {}, retry = 0, urgent = false): Promise<T> {
    await throttle(this.account.email, urgent);
    const token = await getGoogleAccessToken(this.account.email);
    const res = await httpFetch(url.startsWith('http') ? url : API + url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    });
    const failText = res.ok ? '' : await res.text().catch(() => '');
    // Gmail reports its per minute quota as a 403, not a 429. Back off for everything on this account.
    const quota = res.status === 403 && /quota|rateLimit/i.test(failText);
    if ((res.status === 429 || res.status >= 500 || quota) && retry < (quota ? 8 : 4)) {
      const wait = quota ? Math.min(60000, 5000 * 2 ** retry) : 500 * 2 ** retry + Math.random() * 300;
      if (quota) backOff(this.account.email, wait);
      else await new Promise((r) => setTimeout(r, wait));
      return this.call<T>(url, init, retry + 1, urgent);
    }
    // A token Google stopped accepting before it was due to expire: get a fresh one and try once more.
    if (res.status === 401 && retry === 0) {
      forgetGoogleAccessToken(this.account.email);
      return this.call<T>(url, init, 1, urgent);
    }
    if (res.ok) allClear(this.account.email);
    if (!res.ok) {
      const text = failText;
      const err = new Error(`Gmail ${res.status}: ${text.slice(0, 300)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') || '';
    return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
  }

  async listFolders(): Promise<Folder[]> {
    const { labels } = await this.call<{ labels: { id: string; name: string; type: string; color?: { backgroundColor?: string } }[] }>('/labels');
    const reverse = Object.fromEntries(Object.entries(SYSTEM).filter(([, v]) => v).map(([k, v]) => [v, k as SystemFolder]));
    return labels
      .filter((l) => !HIDDEN_LABELS.has(l.id))
      .map((l) => ({
        id: l.id,
        accountId: this.account.id,
        name: l.name,
        system: reverse[l.id],
        unread: 0,
        depth: l.type === 'user' ? l.name.split('/').length - 1 : 0,
        colour: l.color?.backgroundColor,
      }))
      .filter((f) => f.system || !/^(CATEGORY_|SENT|DRAFT)/.test(f.id));
  }

  async listAliases(): Promise<Alias[]> {
    const { sendAs } = await this.call<{ sendAs: { sendAsEmail: string; displayName?: string; isDefault?: boolean; isPrimary?: boolean; signature?: string; replyToAddress?: string; verificationStatus?: string }[] }>('/settings/sendAs');
    return sendAs
      .filter((s) => s.isPrimary || s.verificationStatus === 'accepted' || !s.verificationStatus)
      .map((s) => ({
        email: s.sendAsEmail.toLowerCase(),
        name: s.displayName || this.account.displayName,
        isDefault: Boolean(s.isDefault),
        providerSignatureHtml: s.signature || undefined,
        replyTo: s.replyToAddress || undefined,
      }));
  }

  private async fetchMessage(id: string, full: boolean): Promise<Message | null> {
    try {
      const params = full
        ? 'format=full'
        : 'format=metadata&' + METADATA_HEADERS.map((h) => `metadataHeaders=${h}`).join('&');
      const g = await this.call<GmailMessage>(`/messages/${id}?${params}`);
      return gmailToMessage(this.account.id, g, full);
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async fullSync(sinceDays: number | null, onBatch: (msgs: Message[]) => Promise<void> | void, isKnown?: (providerId: string) => boolean) {
    const profile = await this.call<{ historyId: string }>('/profile');
    const fullCutoff = Date.now() - FULL_BODY_DAYS * 86400000;
    let pageToken: string | undefined;
    const q = sinceDays ? `newer_than:${sinceDays}d` : '';
    // Each email is fetched once: recent ones (newest first) with their full text straight away, older ones as
    // details only. It used to fetch recent ones twice, details first and then the full text.
    const seen = new Set<string>();
    let recent = true;
    const fetchSome = async (ids: string[]) => {
      const todo = ids.filter((id) => !seen.has(id) && !isKnown?.(id));
      todo.forEach((id) => seen.add(id));
      if (!todo.length) return;
      const msgs = (await pool(todo, CONCURRENCY, (id) => this.fetchMessage(id, recent))).filter(Boolean) as Message[];
      if (msgs.length) await onBatch(msgs);
      // Once a page reaches past the full-text window, the rest only need their details.
      if (recent && msgs.some((m) => m.date < fullCutoff)) recent = false;
    };
    // First, the newest 25 in the Inbox, shown straight away: that's what you look at while the rest comes in.
    try {
      const inboxQ = ['in:inbox', q].filter(Boolean).join(' ');
      const top = await this.call<{ messages?: { id: string }[] }>(`/messages?${new URLSearchParams({ maxResults: '25', q: inboxQ })}`);
      const wasRecent = recent;
      await fetchSome((top.messages || []).map((m) => m.id));
      recent = wasRecent;
    } catch { /* the full pass below fetches them anyway */ }
    // Then everything, a small page first so more keeps appearing quickly.
    let first = true;
    do {
      const params = new URLSearchParams({ maxResults: first ? '50' : '200', includeSpamTrash: 'true' });
      first = false;
      if (q) params.set('q', q);
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.call<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`);
      // Mail kept from an earlier, interrupted attempt is not fetched again.
      await fetchSome((page.messages || []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { cursor: profile.historyId };
  }

  async incrementalSync(cursor: string): Promise<SyncResult> {
    const added = new Set<string>();
    const deleted = new Set<string>();
    const labelChanged = new Set<string>();
    let pageToken: string | undefined;
    let latest = cursor;
    try {
      do {
        const params = new URLSearchParams({ startHistoryId: cursor, maxResults: '500' });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await this.call<{
          history?: {
            messagesAdded?: { message: GmailMessage }[];
            messagesDeleted?: { message: GmailMessage }[];
            labelsAdded?: { message: GmailMessage }[];
            labelsRemoved?: { message: GmailMessage }[];
          }[];
          historyId: string;
          nextPageToken?: string;
        }>(`/history?${params}`);
        latest = page.historyId || latest;
        for (const h of page.history || []) {
          h.messagesAdded?.forEach((x) => added.add(x.message.id));
          h.messagesDeleted?.forEach((x) => deleted.add(x.message.id));
          h.labelsAdded?.forEach((x) => labelChanged.add(x.message.id));
          h.labelsRemoved?.forEach((x) => labelChanged.add(x.message.id));
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (e) {
      if ((e as { status?: number }).status === 404) return { upserted: [], labelChanges: [], deleted: [], resetNeeded: true };
      throw e;
    }
    deleted.forEach((id) => added.delete(id));
    const upserted = (await pool([...added], CONCURRENCY, (id) => this.fetchMessage(id, true))).filter(Boolean) as Message[];
    const changedIds = [...labelChanged].filter((id) => !added.has(id) && !deleted.has(id));
    const labelChanges = (
      await pool(changedIds, CONCURRENCY, async (id) => {
        try {
          const g = await this.call<GmailMessage>(`/messages/${id}?format=minimal`);
          return { id: `${this.account.id}|${id}`, labels: g.labelIds || [] };
        } catch {
          return null;
        }
      })
    ).filter(Boolean) as { id: string; labels: string[] }[];
    return {
      upserted,
      labelChanges,
      deleted: [...deleted].map((id) => `${this.account.id}|${id}`),
      cursor: latest,
    };
  }

  async getBody(msg: Message): Promise<MessageBody> {
    const g = await this.call<GmailMessage>(`/messages/${msg.providerId}?format=full`, {}, 0, true);
    return parseGmailPayload(g.payload);
  }

  async getAttachment(msg: Message, attachmentId: string): Promise<Uint8Array> {
    const r = await this.call<{ data: string }>(`/messages/${msg.providerId}/attachments/${attachmentId}`, {}, 0, true);
    return base64ToBytes(r.data);
  }

  async modifyLabels(msgs: Message[], add: string[], remove: string[]) {
    if (!msgs.length) return;
    for (let i = 0; i < msgs.length; i += 900) {
      await this.call('/messages/batchModify', {
        method: 'POST',
        body: JSON.stringify({ ids: msgs.slice(i, i + 900).map((m) => m.providerId), addLabelIds: add, removeLabelIds: remove }),
      });
    }
  }

  async trash(msgs: Message[]) {
    await pool(msgs, CONCURRENCY, (m) => this.call(`/messages/${m.providerId}/trash`, { method: 'POST' }));
  }

  async untrash(msgs: Message[]) {
    await pool(msgs, CONCURRENCY, (m) => this.call(`/messages/${m.providerId}/untrash`, { method: 'POST' }));
  }

  async send(msg: OutgoingMessage) {
    const raw = base64UrlEncode(new TextEncoder().encode(buildRawMessage(msg)));
    const r = await this.call<{ id: string; threadId: string }>('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ raw, threadId: msg.threadId }),
    });
    return { providerId: r.id, threadId: r.threadId };
  }

  async saveDraft(msg: OutgoingMessage, serverDraftId?: string) {
    const raw = base64UrlEncode(new TextEncoder().encode(buildRawMessage(msg)));
    const body = JSON.stringify({ message: { raw, threadId: msg.threadId } });
    const r = serverDraftId
      ? await this.call<{ id: string; message?: { id: string } }>(`/drafts/${serverDraftId}`, { method: 'PUT', body })
      : await this.call<{ id: string; message?: { id: string } }>('/drafts', { method: 'POST', body });
    return { draftId: r.id, messageId: r.message?.id };
  }

  /** Label names to ids, made on first use. Kept for the session. Names are matched without case. */
  private labelIds = new Map<string, string>();
  /** Label ids to their names exactly as written in Gmail ("AI Writer/EA", not "ai writer/ea"). */
  private labelNames = new Map<string, string>();
  private async loadLabels() {
    const { labels } = await this.call<{ labels: { id: string; name: string }[] }>('/labels');
    for (const l of labels) { this.labelIds.set(l.name.toLowerCase(), l.id); this.labelNames.set(l.id, l.name); }
  }
  private async labelId(name: string): Promise<string> {
    const known = this.labelIds.get(name.toLowerCase());
    if (known) return known;
    await this.loadLabels();
    const found = this.labelIds.get(name.toLowerCase());
    if (found) return found;
    const made = await this.call<{ id: string }>('/labels', { method: 'POST', body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) });
    this.labelIds.set(name.toLowerCase(), made.id);
    this.labelNames.set(made.id, name);
    return made.id;
  }

  async labelByName(messageId: string, names: string[]) {
    // Parents first, so "AI Drafts/Clients" sits under "AI Drafts" in Gmail.
    const ids: string[] = [];
    for (const n of names) ids.push(await this.labelId(n));
    await this.call(`/messages/${messageId}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ids }) });
  }

  async listDrafts() {
    const out: { draftId: string; messageId: string }[] = [];
    let pageToken: string | undefined;
    do {
      const page: { drafts?: { id: string; message: { id: string } }[]; nextPageToken?: string } = await this.call(`/drafts?maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`);
      for (const d of page.drafts || []) out.push({ draftId: d.id, messageId: d.message.id });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async messageInfo(messageId: string) {
    const m = await this.call<{ labelIds?: string[]; internalDate?: string }>(`/messages/${messageId}?format=minimal`);
    if ((m.labelIds || []).some((x) => x.startsWith('Label_') && !this.labelNames.has(x))) await this.loadLabels();
    return { labels: (m.labelIds || []).map((x) => this.labelNames.get(x) || x), date: Number(m.internalDate) || 0 };
  }

  async deleteDraft(serverDraftId: string) {
    await this.call(`/drafts/${serverDraftId}`, { method: 'DELETE' }).catch(() => {});
  }

  async findDraftId(providerMessageId: string): Promise<string | undefined> {
    let pageToken: string | undefined;
    do {
      const page: { drafts?: { id: string; message: { id: string } }[]; nextPageToken?: string } = await this.call(`/drafts?maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`);
      const hit = page.drafts?.find((d) => d.message.id === providerMessageId);
      if (hit) return hit.id;
      pageToken = page.nextPageToken;
    } while (pageToken);
    return undefined;
  }

  async searchRemote(query: string): Promise<Message[]> {
    const params = new URLSearchParams({ q: query, maxResults: '50' });
    const page = await this.call<{ messages?: { id: string }[] }>(`/messages?${params}`);
    const msgs = await pool((page.messages || []).map((m) => m.id), CONCURRENCY, (id) => this.fetchMessage(id, false));
    return msgs.filter(Boolean) as Message[];
  }

  async addContact(a: Address): Promise<void> {
    try {
      await this.call('https://people.googleapis.com/v1/people:createContact', {
        method: 'POST',
        body: JSON.stringify({ ...(a.name ? { names: [{ unstructuredName: a.name }] } : {}), emailAddresses: [{ value: a.email }] }),
      }, 0, true);
    } catch (e) { this.scopeOr(e, 'Contacts'); }
  }

  async listContacts(): Promise<Address[]> {
    const out: Address[] = [];
    const collect = (people?: { names?: { displayName?: string }[]; emailAddresses?: { value: string }[]; photos?: { url?: string; default?: boolean }[]; addresses?: { formattedValue?: string }[] }[]) =>
      people?.forEach((p) => {
        const address = p.addresses?.find((x) => x.formattedValue?.trim())?.formattedValue?.replace(/\s*\n\s*/g, ', ').trim();
        p.emailAddresses?.forEach((e) => out.push({ name: p.names?.[0]?.displayName, email: e.value.toLowerCase(), photo: p.photos?.find((ph) => ph.url && !ph.default)?.url, ...(address ? { address } : {}) }));
      });
    try {
      let token: string | undefined;
      do {
        const r: { connections?: never[]; nextPageToken?: string } = await this.call(
          `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,photos,addresses&pageSize=1000${token ? `&pageToken=${token}` : ''}`,
        );
        collect(r.connections);
        token = r.nextPageToken;
      } while (token);
      token = undefined;
      do {
        const r: { otherContacts?: never[]; nextPageToken?: string } = await this.call(
          `https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses,photos&pageSize=1000${token ? `&pageToken=${token}` : ''}`,
        );
        collect(r.otherContacts);
        token = r.nextPageToken;
      } while (token);
    } catch (e) {
      console.warn('Contacts unavailable', e);
    }
    return out;
  }

  private calNames: string[] = [];
  knownCalendars(): string[] { return this.calNames; }

  async listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]> {
    const calendars = await gcal.listCalendars(this.gcall);
    const events: CalendarEvent[] = [];
    this.calNames = calendars.filter((c) => c.selected || c.primary).map((c) => c.summary);
    this.calIds = Object.fromEntries(calendars.map((c) => [c.summary, c.id]));
    this.writable = calendars.filter((c) => (c.selected || c.primary) && gcal.canWrite(c)).map((c) => c.summary);
    for (const cal of calendars.filter((c) => c.selected || c.primary)) {
      try {
        events.push(...(await gcal.listCalendarEvents(this.gcall, this.account.id, cal, fromMs, toMs)));
      } catch (err) {
        console.warn('Calendar unavailable', cal.summary, err);
      }
    }
    return events;
  }

  /** The shared Google calls (google/*.ts) go through this, so they get this account's token and pacing. */
  private gcall: gtasks.GoogleCall = <T,>(url: string, init: RequestInit = {}) => this.call<T>(url, init);

  private calIds: Record<string, string> = {};
  private writable: string[] = [];
  writableCalendars(): string[] { return this.writable; }

  /**
   * Changes one event, or with scope 'all' its whole series (the series' own times move by the same amount).
   * Guests are emailed unless notify is false. "This and following" is done by the app (end the series, make a new one).
   */
  async editEvent(ev: CalendarEvent, patch: EventPatch, opts: ChangeOptions = {}): Promise<void> {
    try { await gcal.editEvent(this.gcall, this.account.id, this.calIds, ev, patch, opts); } catch (e) { this.permissionOr(e); }
  }

  /** Deletes one event, or with scope 'all' its whole series. Already gone counts as done. */
  async deleteEvent(ev: CalendarEvent, opts: ChangeOptions = {}): Promise<void> {
    try { await gcal.deleteEvent(this.gcall, this.account.id, ev, opts); } catch (e) { this.permissionOr(e); }
  }

  async copyOfEvent(ev: CalendarEvent, opts: { series: boolean }): Promise<EventCopy> {
    try { return await gcal.copyOfEvent(this.gcall, this.account.id, ev, opts); } catch (e) { this.permissionOr(e); }
  }

  async createEvent(calendarName: string, copy: EventCopy): Promise<string> {
    try { return await gcal.createEvent(this.gcall, this.account.id, this.calIds[calendarName] || 'primary', copy); } catch (e) { this.permissionOr(e); }
  }

  async endSeries(ev: CalendarEvent): Promise<void> {
    try { await gcal.endSeries(this.gcall, this.account.id, ev); } catch (e) { this.permissionOr(e); }
  }

  /** The invitation as it sits in the primary calendar, found by its calendar id. */
  private async findInvite(uid: string) {
    const CAL = 'https://www.googleapis.com/calendar/v3';
    type Att = { email?: string; displayName?: string; self?: boolean; organizer?: boolean; resource?: boolean; responseStatus?: string };
    const r = await this.call<{ items?: { id: string; attendees?: Att[] }[] }>(`${CAL}/calendars/primary/events?iCalUID=${encodeURIComponent(uid)}&maxResults=5`);
    const ev = r.items?.[0];
    return ev ? { id: ev.id, attendees: ev.attendees || [] } : undefined;
  }

  private permissionOr(e: unknown): never {
    const err = e as Error & { status?: number };
    if (err.status === 403 && /scope|insufficient|permission/i.test(err.message) && !/quota|rateLimit/i.test(err.message)) throw new CalendarPermissionError();
    throw e;
  }

  async inviteStatus(uid: string): Promise<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] }> {
    const ev = await this.findInvite(uid);
    if (!ev) return { inCalendar: false };
    const me = ev.attendees.find((a) => a.self);
    const response = me?.responseStatus === 'accepted' || me?.responseStatus === 'declined' || me?.responseStatus === 'tentative' ? me.responseStatus : undefined;
    return { inCalendar: true, response, guests: guestsOf(ev.attendees).guests };
  }

  async respondToInvite(uid: string, status: Rsvp, note?: string): Promise<boolean> {
    const ev = await this.findInvite(uid);
    if (!ev || !ev.attendees.some((a) => a.self)) return false;
    try {
      await this.call(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.id)}?sendUpdates=all`, {
        method: 'PATCH',
        body: JSON.stringify({ attendees: answered(ev.attendees, status, note) }),
      });
    } catch (e) { this.permissionOr(e); }
    return true;
  }

  /** Answers an invitation from the calendar itself: your own line in the guest list gets the answer (and the note, as Google's comment). */
  async respondToEvent(event: CalendarEvent, status: Rsvp, note?: string): Promise<void> {
    try { await gcal.respondToEvent(this.gcall, this.account.id, event, status, note); } catch (e) { this.permissionOr(e); }
  }

  async addInviteToCalendar(invite: Invite): Promise<void> {
    const when = (ms: number) => (invite.allDay ? { date: ymd(ms) } : { dateTime: new Date(ms).toISOString() });
    try {
      await this.call('https://www.googleapis.com/calendar/v3/calendars/primary/events/import', {
        method: 'POST',
        body: JSON.stringify({
          iCalUID: invite.uid,
          summary: invite.title,
          location: invite.location,
          description: invite.description,
          start: when(invite.start),
          end: when(invite.allDay ? Math.max(invite.end, invite.start + 86400000) : invite.end),
          organizer: invite.organizer ? { email: invite.organizer.email, displayName: invite.organizer.name } : undefined,
          attendees: invite.attendees.map((a) => ({ email: a.email, displayName: a.name, responseStatus: a.email === this.account.email.toLowerCase() ? 'needsAction' : undefined })),
        }),
      });
    } catch (e) { this.permissionOr(e); }
  }

  private scopeOr(e: unknown, what: string): never {
    const err = e as Error & { status?: number };
    if (err.status === 403 && /scope|insufficient|permission/i.test(err.message) && !/quota|rateLimit/i.test(err.message)) throw new NeedsPermissionError(what);
    throw e;
  }

  async getAutoReply(): Promise<AutoReply> {
    type V = { enableAutoReply?: boolean; responseSubject?: string; responseBodyHtml?: string; responseBodyPlainText?: string; restrictToContacts?: boolean; restrictToDomain?: boolean; startTime?: string; endTime?: string };
    let v: V;
    try { v = await this.call<V>('/settings/vacation', {}, 0, true); } catch (e) { this.scopeOr(e, 'Out of Office'); }
    return {
      on: Boolean(v.enableAutoReply),
      start: v.startTime ? Number(v.startTime) : undefined,
      end: v.endTime ? Number(v.endTime) : undefined,
      subject: v.responseSubject || '',
      html: v.responseBodyHtml || (v.responseBodyPlainText ? v.responseBodyPlainText.split(/\n{2,}/).map((p) => `<p>${p}</p>`).join('') : ''),
      audience: v.restrictToDomain ? 'org' : v.restrictToContacts ? 'contacts' : 'all',
    };
  }

  async setAutoReply(r: AutoReply): Promise<void> {
    const body = {
      enableAutoReply: r.on,
      responseSubject: r.subject || '',
      responseBodyHtml: r.html,
      responseBodyPlainText: htmlToText(r.html),
      restrictToContacts: r.audience === 'contacts',
      restrictToDomain: r.audience === 'org' && isWorkAccount(this.account.email),
      ...(r.on && r.start ? { startTime: String(r.start) } : {}),
      ...(r.on && r.end ? { endTime: String(r.end) } : {}),
    };
    try { await this.call('/settings/vacation', { method: 'PUT', body: JSON.stringify(body) }, 0, true); } catch (e) { this.scopeOr(e, 'Out of Office'); }
  }

  async addAwayEvent(start: number, end: number, opts: { allDay: boolean; decline: boolean; message?: string }): Promise<string> {
    const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Google Workspace has a real "Out of office" event, which can decline invitations; it is always timed, never all day.
    if (isWorkAccount(this.account.email)) {
      try {
        const ev = await this.call<{ id: string }>(CAL, {
          method: 'POST',
          body: JSON.stringify({
            summary: 'Out of office',
            eventType: 'outOfOffice',
            start: { dateTime: new Date(start).toISOString(), timeZone: zone },
            end: { dateTime: new Date(end).toISOString(), timeZone: zone },
            outOfOfficeProperties: { autoDeclineMode: opts.decline ? 'declineOnlyNewConflictingInvitations' : 'declineNone', declineMessage: opts.message || 'I\'m away at this time.' },
          }),
        });
        return ev.id;
      } catch (e) {
        const err = e as Error & { status?: number };
        if (err.status !== 400) this.permissionOr(e);
        // Not a Workspace calendar after all: fall through to a plain event.
      }
    }
    try {
      const ev = await this.call<{ id: string }>(CAL, {
        method: 'POST',
        body: JSON.stringify({
          summary: 'Away',
          transparency: 'opaque',
          start: opts.allDay ? { date: ymd(start) } : { dateTime: new Date(start).toISOString() },
          end: opts.allDay ? { date: ymd(end) } : { dateTime: new Date(end).toISOString() },
          reminders: { useDefault: false, overrides: [] },
        }),
      });
      return ev.id;
    } catch (e) { this.permissionOr(e); }
  }

  async removeAwayEvent(id: string): Promise<void> {
    try { await this.call(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) {
      if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 410) return;
      throw e;
    }
  }

  async uploadLargeFile(name: string, mimeType: string, data: Uint8Array): Promise<string> {
    const token = await getGoogleAccessToken(this.account.email);
    const init = await httpFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(data.length),
      },
      body: JSON.stringify({ name, mimeType }),
    });
    const location = init.headers.get('location');
    if (!init.ok || !location) throw new Error(`Drive upload couldn't start (${init.status})`);
    const put = await httpFetch(location, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: data as unknown as BodyInit });
    if (!put.ok) throw new Error(`Drive upload failed (${put.status})`);
    const file = await put.json();
    await this.call(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    const meta = await this.call<{ webViewLink: string }>(`https://www.googleapis.com/drive/v3/files/${file.id}?fields=webViewLink`);
    return meta.webViewLink;
  }

  // ---- Google Tasks ----
  // Google Tasks keeps a due date but not a time, so a time goes on the first line of the notes ("Due 14:00").

  private async tasksCall<T>(url: string, init: RequestInit = {}): Promise<T> {
    try {
      return await this.call<T>(url.startsWith('http') ? url : `https://tasks.googleapis.com/tasks/v1${url}`, init, 0, true);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(err.message)) throw new TasksApiOffError();
      this.scopeOr(e, 'tasks');
    }
  }

  async listTaskLists(): Promise<TaskList[]> {
    return gtasks.listTaskLists(this.tcall, this.account);
  }

  /** Tasks calls: urgent (something the person just did) and with the Tasks wording for errors. */
  private tcall: gtasks.GoogleCall = <T,>(url: string, init: RequestInit = {}) => this.tasksCall<T>(url, init);

  async listTasks(list: TaskList, doneSince: number): Promise<Task[]> {
    return gtasks.listTasks(this.tcall, this.account, list, doneSince);
  }

  async createTask(list: TaskList, p: TaskPatch): Promise<Task> {
    return gtasks.createTask(this.tcall, this.account, list, p);
  }

  async updateTask(task: Task, p: TaskPatch): Promise<Task> {
    return gtasks.updateTask(this.tcall, this.account, task, p);
  }

  async deleteTask(task: Task): Promise<void> {
    return gtasks.deleteTask(this.tcall, task);
  }

  async createTaskList(name: string): Promise<TaskList> {
    return gtasks.createTaskList(this.tcall, this.account, name);
  }

  async renameTaskList(list: TaskList, name: string): Promise<TaskList> {
    return gtasks.renameTaskList(this.tcall, list, name);
  }

  async deleteTaskList(list: TaskList): Promise<void> {
    return gtasks.deleteTaskList(this.tcall, list);
  }
}
