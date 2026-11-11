// Microsoft 365 / Outlook.com via Microsoft Graph.
// Built so a 365 account can be added later; not yet tested with a real one.
// Graph has folders rather than labels, so each message carries its folder id
// plus two pseudo labels: UNREAD and FLAGGED.
import { getMicrosoftAccessToken } from '../auth/microsoft';
import { bytesToBase64, buildRawMessage, base64ToBytes } from '../mime';
import { httpFetch } from '../platform';
import type { Account, Address, Alias, CalendarEvent, EventGuest, EventCopy, EventPatch, GuestAnswer, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
import { NeedsPermissionError, type MailProvider, type MessageBody, type SyncResult } from './provider';
import type { AutoReply } from '../ooo';
import { findMeetingUrl } from '../meetings';
import { cleanPreview } from '../cleanText';
import { fromGraph, outlookTimeZone, toGraph, type GraphRecurrence } from '../recurrence';

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

/** The guest list and your own answer from a Microsoft calendar event. */
export function graphGuests(
  e: { isOrganizer?: boolean; responseStatus?: { response?: string }; organizer?: { emailAddress?: { name?: string; address?: string } }; attendees?: { status?: { response?: string }; emailAddress?: { name?: string; address?: string } }[] },
  own: string[],
): Pick<CalendarEvent, 'guests' | 'myResponse'> {
  const mine = new Set(own.map((a) => a.toLowerCase()));
  const answer = (r?: string): GuestAnswer => (r === 'accepted' || r === 'organizer' ? 'yes' : r === 'declined' ? 'no' : r === 'tentativelyAccepted' ? 'maybe' : 'waiting');
  const org = e.organizer?.emailAddress?.address?.toLowerCase();
  const list: EventGuest[] = [];
  for (const a of e.attendees || []) {
    const email = a.emailAddress?.address?.toLowerCase();
    if (!email || list.some((g) => g.email === email)) continue;
    list.push({ email, name: a.emailAddress?.name || undefined, answer: answer(a.status?.response), organiser: email === org || undefined, self: mine.has(email) || undefined });
  }
  if (org && !list.some((g) => g.email === org) && list.length) list.unshift({ email: org, name: e.organizer?.emailAddress?.name || undefined, answer: 'yes', organiser: true, self: mine.has(org) || undefined });
  if (!list.length) return {};
  const me = list.find((g) => g.self);
  return { guests: list.slice(0, 60), myResponse: me?.answer ?? (e.isOrganizer ? 'yes' : e.responseStatus ? answer(e.responseStatus.response) : undefined) };
}

export class MicrosoftProvider implements MailProvider {
  private folderIds: Partial<Record<SystemFolder, string>> = {};
  constructor(public readonly account: Account) {}

  systemFolderId(f: SystemFolder) {
    if (f === 'flagged') return 'FLAGGED';
    return this.folderIds[f] || null;
  }

  hydrate(folders: Folder[]) {
    for (const f of folders) if (f.system && f.system !== 'flagged') this.folderIds[f.system] = f.id;
  }

  private async call<T>(url: string, init: RequestInit = {}, extra?: string[]): Promise<T> {
    const token = await getMicrosoftAccessToken(this.account.email, extra);
    const res = await httpFetch(url.startsWith('http') ? url : G + url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // A token without the newer permission (mailbox settings, calendar, contacts) is turned away: one more sign in fixes it.
      if (extra?.length && res.status === 403 && /AccessDenied|scope|permission/i.test(text)) throw new NeedsPermissionError();
      const err = new Error(`Microsoft ${res.status}: ${text}`) as Error & { status?: number };
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
      snippet: cleanPreview(g.bodyPreview || '', 300),
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
    // After a restart the folder ids are unknown until they are looked up; without them nothing shows as Inbox or Sent.
    if (!this.folderIds.inbox) await this.listFolders();
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

  async addContact(a: Address): Promise<void> {
    const name = a.name || a.email.split('@')[0];
    const [given, ...rest] = name.split(' ');
    await this.call('/me/contacts', {
      method: 'POST',
      body: JSON.stringify({ displayName: name, givenName: given, surname: rest.join(' ') || undefined, emailAddresses: [{ address: a.email, name }] }),
    }, ['Contacts.ReadWrite']);
  }

  async listContacts(): Promise<Address[]> {
    const page = await this.call<{ value: { displayName?: string; emailAddresses: { address: string }[] }[] }>('/contacts?$top=500');
    return page.value.flatMap((c) => c.emailAddresses.map((e) => ({ name: c.displayName, email: e.address.toLowerCase() })));
  }

  private calNames: string[] = [];
  knownCalendars(): string[] { return this.calNames; }

  async getAutoReply(): Promise<AutoReply> {
    type When = { dateTime?: string; timeZone?: string };
    const s = await this.call<{ automaticRepliesSetting?: { status?: string; externalAudience?: string; scheduledStartDateTime?: When; scheduledEndDateTime?: When; internalReplyMessage?: string; externalReplyMessage?: string } }>('/mailboxSettings', {}, ['MailboxSettings.ReadWrite']);
    const a = s.automaticRepliesSetting || {};
    const at = (w?: When) => (w?.dateTime ? new Date(w.dateTime.replace(/Z?$/, w.timeZone === 'UTC' || !w.timeZone ? 'Z' : '')).getTime() : undefined);
    const scheduled = a.status === 'scheduled';
    const inside = a.internalReplyMessage || '';
    const outside = a.externalReplyMessage || '';
    return {
      on: a.status === 'alwaysEnabled' || scheduled,
      start: scheduled ? at(a.scheduledStartDateTime) : undefined,
      end: scheduled ? at(a.scheduledEndDateTime) : undefined,
      html: inside,
      audience: a.externalAudience === 'none' ? 'org' : 'all',
      outsideAudience: a.externalAudience === 'contactsOnly' ? 'contacts' : a.externalAudience === 'none' ? 'none' : 'all',
      outsideHtml: outside && outside !== inside ? outside : undefined,
    };
  }

  async setAutoReply(r: AutoReply): Promise<void> {
    const when = (ms: number) => ({ dateTime: new Date(ms).toISOString().replace(/Z$/, ''), timeZone: 'UTC' });
    const outsideAudience = r.audience === 'org' ? 'none' : r.audience === 'contacts' ? 'contactsOnly' : r.outsideAudience === 'contacts' ? 'contactsOnly' : r.outsideAudience === 'none' ? 'none' : 'all';
    const scheduled = r.on && Boolean(r.end);
    await this.call('/mailboxSettings', {
      method: 'PATCH',
      body: JSON.stringify({
        automaticRepliesSetting: {
          status: !r.on ? 'disabled' : scheduled ? 'scheduled' : 'alwaysEnabled',
          externalAudience: outsideAudience,
          internalReplyMessage: r.html,
          externalReplyMessage: r.outsideHtml || r.html,
          ...(scheduled ? { scheduledStartDateTime: when(r.start || Date.now()), scheduledEndDateTime: when(r.end!) } : {}),
        },
      }),
    }, ['MailboxSettings.ReadWrite']);
  }

  async addAwayEvent(start: number, end: number, opts: { allDay: boolean }): Promise<string> {
    const day = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00`; };
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ev = await this.call<{ id: string }>('/events', {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Away',
        showAs: 'oof',
        isAllDay: opts.allDay,
        isReminderOn: false,
        start: opts.allDay ? { dateTime: day(start), timeZone: zone } : { dateTime: new Date(start).toISOString().replace(/Z$/, ''), timeZone: 'UTC' },
        end: opts.allDay ? { dateTime: day(end), timeZone: zone } : { dateTime: new Date(end).toISOString().replace(/Z$/, ''), timeZone: 'UTC' },
      }),
    }, ['Calendars.ReadWrite']);
    return ev.id;
  }

  async addInviteToCalendar(invite: import('../invites').Invite): Promise<string> {
    const when = (ms: number) => ({ dateTime: new Date(ms).toISOString().replace(/Z$/, ''), timeZone: 'UTC' });
    const made = await this.call<{ id: string }>('/events', {
      method: 'POST',
      body: JSON.stringify({
        subject: invite.title,
        start: when(invite.start),
        end: when(invite.end),
        isAllDay: invite.allDay,
        location: invite.location ? { displayName: invite.location } : undefined,
        body: invite.description ? { contentType: 'text', content: invite.description } : undefined,
        transactionId: invite.uid.slice(0, 100),
      }),
    }, ['Calendars.ReadWrite']);
    return made.id;
  }

  async updateAddedEvent(ref: string, invite: import('../invites').Invite): Promise<void> {
    const when = (ms: number) => ({ dateTime: new Date(ms).toISOString().replace(/Z$/, ''), timeZone: 'UTC' });
    await this.call(`/events/${encodeURIComponent(ref)}`, {
      method: 'PATCH',
      body: JSON.stringify({ subject: invite.title, start: when(invite.start), end: when(invite.end), isAllDay: invite.allDay }),
    }, ['Calendars.ReadWrite']);
  }

  async removeAwayEvent(id: string): Promise<void> {
    try { await this.call(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['Calendars.ReadWrite']); } catch (e) {
      if ((e as { status?: number }).status === 404) return;
      throw e;
    }
  }

  async listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]> {
    // Every page, not just the first 250 (a busy calendar passes that within weeks, and later events went missing).
    type Page = { '@odata.nextLink'?: string; value: { id: string; subject: string; seriesMasterId?: string | null; start: { dateTime: string }; end: { dateTime: string }; isAllDay: boolean; isReminderOn: boolean; reminderMinutesBeforeStart: number; webLink: string; location?: { displayName?: string }; bodyPreview?: string; onlineMeeting?: { joinUrl?: string } | null; onlineMeetingUrl?: string | null; isOrganizer?: boolean; responseStatus?: { response?: string }; organizer?: { emailAddress?: { name?: string; address?: string } }; attendees?: { type?: string; status?: { response?: string }; emailAddress?: { name?: string; address?: string } }[] }[] };
    const all: Page['value'] = [];
    let url: string | undefined = `/calendarView?startDateTime=${new Date(fromMs).toISOString()}&endDateTime=${new Date(toMs).toISOString()}&$top=250`;
    while (url) {
      const page: Page = await this.call<Page>(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      all.push(...page.value);
      url = page['@odata.nextLink'];
    }
    this.calNames = ['Calendar'];
    return all.map((e) => ({
      id: `${this.account.id}|${e.id}`,
      accountId: this.account.id,
      calendarName: 'Calendar',
      title: e.subject,
      start: new Date(e.start.dateTime + 'Z').getTime(),
      end: new Date(e.end.dateTime + 'Z').getTime(),
      allDay: e.isAllDay,
      location: e.location?.displayName,
      description: e.bodyPreview?.slice(0, 600) || undefined,
      meetingUrl: e.onlineMeeting?.joinUrl || e.onlineMeetingUrl || findMeetingUrl(e.location?.displayName, e.bodyPreview),
      reminderMinutes: e.isReminderOn ? [e.reminderMinutesBeforeStart] : [],
      htmlLink: e.webLink,
      ...graphGuests(e, [this.account.email, ...(this.account.aliases || []).map((a) => a.email)]),
      canEdit: e.isOrganizer !== false,
      recurring: Boolean(e.seriesMasterId),
    }));
  }

  writableCalendars(): string[] { return ['Calendar']; }

  async editEvent(ev: CalendarEvent, patch: EventPatch): Promise<void> {
    const id = ev.id.slice(this.account.id.length + 1);
    const allDay = patch.allDay ?? ev.allDay;
    const start = patch.start ?? ev.start;
    const end = patch.end ?? ev.end;
    const pad = (n: number) => String(n).padStart(2, '0');
    const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`; };
    const when = (ms: number) => (allDay ? { dateTime: localDay(ms), timeZone: 'UTC' } : { dateTime: new Date(ms).toISOString().replace(/Z$/, ''), timeZone: 'UTC' });
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.subject = patch.title;
    if (patch.location !== undefined) body.location = { displayName: patch.location };
    if (patch.description !== undefined) body.body = { contentType: 'text', content: patch.description };
    if (patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined) {
      body.isAllDay = allDay;
      body.start = when(start);
      body.end = when(allDay ? Math.max(end, start + 86400000) : end);
    }
    if (Object.keys(body).length) await this.call(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }, ['Calendars.ReadWrite']);
  }

  async deleteEvent(ev: CalendarEvent): Promise<void> {
    const id = ev.id.slice(this.account.id.length + 1);
    await this.call(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' }, ['Calendars.ReadWrite']);
  }

  async copyOfEvent(ev: CalendarEvent, opts: { series: boolean }): Promise<EventCopy> {
    const id = ev.id.slice(this.account.id.length + 1);
    type GEv = { subject?: string; body?: { content?: string }; location?: { displayName?: string }; isOnlineMeeting?: boolean; onlineMeeting?: { joinUrl?: string } | null; seriesMasterId?: string | null; recurrence?: GraphRecurrence | null; start: { dateTime: string }; attendees?: { type?: string; emailAddress?: { name?: string; address?: string } }[] };
    const e = await this.call<GEv>(`/events/${encodeURIComponent(id)}?$select=subject,body,location,isOnlineMeeting,onlineMeeting,seriesMasterId,attendees`, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    const me = [this.account.email, ...(this.account.aliases || []).map((a) => a.email)].map((x) => x.toLowerCase());
    const copy: EventCopy = {
      title: e.subject || ev.title,
      start: ev.start,
      end: ev.end,
      allDay: ev.allDay,
      location: e.location?.displayName || undefined,
      description: e.body?.content?.trim() || undefined,
      guests: (e.attendees || []).filter((a) => a.type !== 'resource' && a.emailAddress?.address && !me.includes(a.emailAddress.address.toLowerCase())).map((a) => ({ email: a.emailAddress!.address!, name: a.emailAddress!.name })),
      video: Boolean(e.isOnlineMeeting || e.onlineMeeting?.joinUrl),
    };
    if (opts.series && e.seriesMasterId) {
      const master = await this.call<GEv>(`/events/${encodeURIComponent(e.seriesMasterId)}?$select=recurrence`);
      const rep = fromGraph(master.recurrence);
      if (!rep) copy.repeatUnsupported = true;
      else {
        if (rep.count) {
          // A set number of times: from this one on, that ends on the day of the last one.
          let last = ev.start;
          let url: string | undefined = `/events/${encodeURIComponent(e.seriesMasterId)}/instances?startDateTime=${new Date(ev.start).toISOString()}&endDateTime=${new Date(ev.start + 20 * 365 * 86400000).toISOString()}&$select=start&$top=500`;
          while (url) {
            const page: { value: { start: { dateTime: string } }[]; '@odata.nextLink'?: string } = await this.call(url, { headers: { Prefer: 'outlook.timezone="UTC"' } });
            for (const i of page.value) last = Math.max(last, new Date(i.start.dateTime + 'Z').getTime());
            url = page['@odata.nextLink'];
          }
          delete rep.count;
          const d = new Date(last); d.setHours(0, 0, 0, 0); rep.until = d.getTime();
        }
        copy.repeat = rep;
      }
    }
    return copy;
  }

  async createEvent(_calendarName: string, copy: EventCopy): Promise<string> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const tz = outlookTimeZone();
    const local = (ms: number, midnight = false) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${midnight ? '00:00' : `${pad(d.getHours())}:${pad(d.getMinutes())}`}:00`; };
    const when = (ms: number) => ({ dateTime: local(ms, copy.allDay), timeZone: tz });
    const body: Record<string, unknown> = {
      subject: copy.title,
      body: copy.description ? { contentType: 'text', content: copy.description } : undefined,
      location: copy.location ? { displayName: copy.location } : undefined,
      isAllDay: copy.allDay,
      start: when(copy.start),
      end: when(copy.allDay ? Math.max(copy.end, copy.start + 86400000) : copy.end),
      attendees: copy.guests.length ? copy.guests.map((g) => ({ type: 'required', emailAddress: { address: g.email, name: g.name || g.email } })) : undefined,
      recurrence: copy.repeat ? toGraph(copy.repeat, copy.start, tz) : undefined,
    };
    const make = (extra: Record<string, unknown>) => this.call<{ id: string }>('/events', { method: 'POST', body: JSON.stringify({ ...body, ...extra }) }, ['Calendars.ReadWrite']);
    let made: { id: string };
    // Personal Outlook accounts can't always make a Teams link: then it's made without one.
    if (copy.video) { try { made = await make({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' }); } catch { made = await make({}); } }
    else made = await make({});
    return `${this.account.id}|${made.id}`;
  }

  async endSeries(ev: CalendarEvent): Promise<void> {
    const id = ev.id.slice(this.account.id.length + 1);
    const one = await this.call<{ seriesMasterId?: string | null }>(`/events/${encodeURIComponent(id)}?$select=seriesMasterId`);
    if (!one.seriesMasterId) { await this.deleteEvent(ev); return; }
    const masterUrl = `/events/${encodeURIComponent(one.seriesMasterId)}`;
    const master = await this.call<{ recurrence?: GraphRecurrence | null }>(`${masterUrl}?$select=recurrence`);
    const r = master.recurrence;
    const pad = (n: number) => String(n).padStart(2, '0');
    const dayBefore = new Date(ev.start); dayBefore.setHours(0, 0, 0, 0); dayBefore.setDate(dayBefore.getDate() - 1);
    const endDate = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;
    if (!r || endDate < r.range.startDate) { await this.call(masterUrl, { method: 'DELETE' }, ['Calendars.ReadWrite']); return; }
    const range = { ...r.range, type: 'endDate', endDate };
    delete (range as { numberOfOccurrences?: number }).numberOfOccurrences;
    await this.call(masterUrl, { method: 'PATCH', body: JSON.stringify({ recurrence: { pattern: r.pattern, range } }) }, ['Calendars.ReadWrite']);
  }
}
