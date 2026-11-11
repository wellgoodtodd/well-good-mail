// Any mailbox that speaks IMAP and SMTP: iCloud, Yahoo, Fastmail, AOL and others.
//
// The Rust side (src-tauri/src/imapmail.rs) makes the connections and hands back raw data. This file works out what it
// means. Three things differ from Gmail:
//  - An email lives in folders, and a copy in two folders is two separate messages on the server. They are joined
//    back into one here by their Message-ID, so "filed in a folder" behaves like a Gmail label.
//  - There are no conversations, so they are built from the References and In-Reply-To headers (see imapUtil.ts).
//  - Sending doesn't save a copy to Sent, so a copy is filed there after sending.
import PostalMime, { type Address as PostalAddress, type Email } from 'postal-mime';
import { AuthError } from '../auth/google';
import { getImapPassword, mailError, imapPaused, imapRefused, imapWorked, type ImapConn } from '../auth/imap';
import { imapDate, isSyncable, labelsFor, leafName, decodeFolderName, mergeCopies, messageKey, previewOf, summariseFlags, systemFolders, threadFor, type ImapFolderInfo } from '../imapUtil';
import { fetchContacts, fetchEvents, type DavAuth } from '../dav';
import { base64ToBytes, buildRawMessage, bytesToBase64 } from '../mime';
import { invoke } from '../platform';
import type { Account, Address, Alias, CalendarEvent, Folder, Message, OutgoingMessage, SystemFolder } from '../types';
import type { MailProvider, MessageBody, SyncResult } from './provider';

interface FolderState { folder: string; validity: number; uidnext: number; exists: number; flags: [number, string[]][]; error: string | null }
interface RawMessage { uid: number; flags: string[]; received: number | null; head: string }
interface UidList { validity: number; uidnext: number; uids: number[] }
interface SearchHit { folder: string; uids: number[] }

/** What was seen in each folder at the last sync. If the validity number changes, the server has renumbered the folder. */
interface Cursor { v: 1; f: Record<string, { validity: number; uidnext: number }> }

const BATCH = 100;
const isFlagLabel = (l: string) => l === 'UNREAD' || l === 'FLAGGED' || l === 'STARRED';

const flat = (list: PostalAddress[] | undefined): Address[] =>
  (list || []).flatMap((a) => (a.group ? a.group : [a])).filter((a) => a.address).map((a) => ({ name: a.name || undefined, email: a.address.toLowerCase() }));
const one = (a: PostalAddress | undefined): Address => flat(a ? [a] : [])[0] || { email: '' };

const headerOf = (e: Email, name: string) => e.headers.find((h) => h.key === name)?.value;

function bytesOf(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === 'string') return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

/** Removes one header (and its folded lines) from a raw email. */
function withoutHeader(raw: string, name: string): string {
  const end = raw.search(/\r?\n\r?\n/);
  const head = end < 0 ? raw : raw.slice(0, end);
  const rest = end < 0 ? '' : raw.slice(end);
  return head.replace(new RegExp(`^${name}:[^\\r\\n]*(\\r?\\n[ \\t][^\\r\\n]*)*\\r?\\n?`, 'im'), '') + rest;
}

export class ImapProvider implements MailProvider {
  private infos: ImapFolderInfo[] = [];
  private sys: Partial<Record<SystemFolder, string>> = {};
  private parsed = new Map<string, Email>();
  /** Called after a change that moves emails between folders, so the list can catch up with the server. */
  onChanged?: () => void;
  /** The Inbox watcher (IDLE) is running for this account. */
  private watching = false;

  constructor(public readonly account: Account, private known: () => Message[] = () => []) {}

  // ---------- plumbing ----------

  private settings() {
    const s = this.account.imap;
    if (!s) throw new Error('This account has no mail server details.');
    return s;
  }

  private async conn(): Promise<ImapConn> {
    const s = this.settings();
    const pass = await getImapPassword(this.account.email);
    if (!pass) throw new AuthError('The password for this account is missing. Enter it again.');
    return { host: s.host, port: s.port, user: s.username, pass };
  }

  /** The service's name for messages: iCloud, or the server's own name. */
  private serviceName() {
    const host = this.settings().host;
    return /me\.com|icloud/i.test(host) ? 'iCloud' : /yahoo/i.test(host) ? 'Yahoo' : /fastmail/i.test(host) ? 'Fastmail' : /aol/i.test(host) ? 'AOL' : 'The mail server';
  }

  private async run<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    const email = this.account.email;
    imapPaused(email, this.serviceName());
    let out: T;
    try {
      out = await invoke<T>(cmd, { conn: await this.conn(), ...args });
    } catch (e) {
      throw imapRefused(email, this.serviceName(), mailError(e));
    }
    imapWorked(email);
    this.watch();
    return out;
  }

  /** Starts the Inbox watcher once a sign in has worked: new mail then arrives within seconds. */
  private watch() {
    if (this.watching) return;
    this.watching = true;
    void this.conn().then((conn) => invoke('imap_watch', { id: this.account.id, conn })).catch(() => { this.watching = false; });
  }

  hydrate(folders: Folder[]) {
    for (const f of folders) if (f.system && f.system !== 'flagged') this.sys[f.system] = f.id;
  }

  private mine = () => this.known().filter((m) => m.accountId === this.account.id);

  private async ensureFolders(force = false) {
    if (this.infos.length && !force) return;
    this.infos = await this.run<ImapFolderInfo[]>('imap_folders');
    this.sys = systemFolders(this.infos);
  }

  private get syncNames(): string[] {
    const host = this.settings().host;
    return this.infos.filter((f) => isSyncable(f, host)).map((f) => f.name);
  }

  systemFolderId(f: SystemFolder): string | null {
    if (f === 'flagged') return 'FLAGGED';
    return this.sys[f] || null;
  }

  async listFolders(): Promise<Folder[]> {
    await this.ensureFolders(true);
    const host = this.settings().host;
    const bySystem = new Map(Object.entries(this.sys).map(([k, v]) => [v, k as SystemFolder]));
    const out: Folder[] = this.infos
      .filter((f) => isSyncable(f, host))
      .map((f) => ({
        id: f.name,
        accountId: this.account.id,
        name: decodeFolderName(leafName(f.name, f.delimiter)),
        system: bySystem.get(f.name),
        unread: 0,
        depth: f.delimiter ? f.name.split(f.delimiter).length - 1 : 0,
      }));
    out.push({ id: 'FLAGGED', accountId: this.account.id, name: 'Flagged', system: 'flagged', unread: 0, depth: 0 });
    return out;
  }

  async listAliases(): Promise<Alias[]> {
    return [{ email: this.account.email, name: this.account.displayName, isDefault: true }];
  }

  // ---------- turning raw emails into messages ----------

  /** Reads a batch of emails (headers and the start of each body) into messages. */
  private async toMessages(folder: string, raws: RawMessage[], seen: Map<string, string>): Promise<Message[]> {
    const out: Message[] = [];
    for (const raw of raws) {
      let e: Email | undefined;
      try { e = await PostalMime.parse(base64ToBytes(raw.head)); } catch { /* unreadable: shown with what we know */ }
      const flags = summariseFlags([raw.flags]);
      const messageId = e?.messageId;
      const id = messageKey(messageId, folder, raw.uid);
      const parsedDate = e?.date ? Date.parse(e.date) : NaN;
      const type = (e && headerOf(e, 'content-type')) || '';
      out.push({
        id: `${this.account.id}|${id}`,
        accountId: this.account.id,
        providerId: id,
        threadId: threadFor({ messageId, inReplyTo: e?.inReplyTo, references: e?.references }, seen, `x${id}`),
        labels: labelsFor([folder], flags.unread, flags.flagged),
        locations: { [folder]: raw.uid },
        from: one(e?.from),
        to: flat(e?.to),
        cc: flat(e?.cc),
        bcc: flat(e?.bcc),
        replyTo: flat(e?.replyTo),
        deliveredTo: e?.deliveredTo,
        subject: e?.subject || '(no subject)',
        snippet: e ? previewOf(e.text, e.html) : '',
        date: Number.isFinite(parsedDate) ? parsedDate : raw.received || Date.now(),
        unread: flags.unread,
        flagged: flags.flagged,
        isDraft: flags.draft,
        hasAttachments: /multipart\/(mixed|signed|report|parallel)/i.test(type),
        attachments: [],
        bodyLoaded: false,
        messageIdHeader: messageId,
        references: e?.references,
        inReplyTo: e?.inReplyTo,
        listUnsubscribe: e ? headerOf(e, 'list-unsubscribe') : undefined,
        listUnsubscribePost: e ? /one-click/i.test(headerOf(e, 'list-unsubscribe-post') || '') : undefined,
      });
    }
    return out;
  }

  private threadIndex(): Map<string, string> {
    const seen = new Map<string, string>();
    for (const m of this.mine()) if (m.messageIdHeader) seen.set(m.messageIdHeader.toLowerCase(), m.threadId);
    return seen;
  }

  // ---------- syncing ----------

  async fullSync(sinceDays: number | null, onBatch: (msgs: Message[]) => Promise<void> | void) {
    await this.ensureFolders(true);
    const since = sinceDays ? imapDate(Date.now() - sinceDays * 86400000) : undefined;
    const cursor: Cursor = { v: 1, f: {} };
    const seen = this.threadIndex();
    // Emails already held (from an earlier attempt that was cut short) keep their place, and the same email found in a second folder is joined to it.
    const held = new Map<string, Message>(this.mine().map((m) => [m.providerId, m]));
    const have = new Set(this.mine().flatMap((m) => Object.entries(m.locations || {}).map(([f, u]) => `${f}\u0000${u}`)));
    let failed: Error | undefined;
    // The Inbox first, then Sent, then the rest, so a new account shows its newest mail first.
    const rank = (f: string) => (f === this.sys.inbox || /^inbox$/i.test(f) ? 0 : f === this.sys.sent ? 1 : 2);
    const order = [...this.syncNames].sort((a, b) => rank(a) - rank(b));
    let firstBatch = true;
    for (const folder of order) {
      let list: UidList;
      try {
        list = await this.run<UidList>('imap_uids', { folder, since });
      } catch (e) {
        if (e instanceof AuthError) throw e;
        failed = e as Error;
        continue;
      }
      cursor.f[folder] = { validity: list.validity, uidnext: list.uidnext };
      const todo = list.uids.filter((u) => !have.has(`${folder}\u0000${u}`)).reverse(); // newest first
      for (let i = 0; i < todo.length;) {
        // A small first batch, so something shows within seconds.
        const size = firstBatch ? 25 : BATCH;
        firstBatch = false;
        const raws = await this.run<RawMessage[]>('imap_headers', { folder, uids: todo.slice(i, i + size) });
        i += size;
        const batch = (await this.toMessages(folder, raws, seen)).map((m) => {
          const merged = mergeCopies(held.get(m.providerId), m);
          held.set(m.providerId, merged);
          return merged;
        });
        await onBatch(batch);
      }
    }
    if (!Object.keys(cursor.f).length && failed) throw failed;
    return { cursor: JSON.stringify(cursor) };
  }

  async incrementalSync(cursorText: string): Promise<SyncResult> {
    let cursor: Cursor;
    try {
      cursor = JSON.parse(cursorText);
      if (cursor.v !== 1) throw new Error('old');
    } catch {
      return { upserted: [], labelChanges: [], deleted: [], resetNeeded: true };
    }
    await this.ensureFolders();
    const names = this.syncNames;
    const states = await this.run<FolderState[]>('imap_flags', { folders: names });
    const seen = this.threadIndex();
    const next: Cursor = { v: 1, f: {} };

    // Working copies of every email we hold, changed as the folders are compared.
    const work = new Map<string, Message>(this.mine().map((m) => [m.providerId, { ...m, locations: { ...(m.locations || {}) } }]));
    const touched = new Set<string>();
    const where = new Map<string, Map<number, string>>(); // folder -> uid -> providerId
    for (const m of work.values()) {
      for (const [f, u] of Object.entries(m.locations || {})) {
        (where.get(f) || where.set(f, new Map()).get(f)!).set(u, m.providerId);
      }
    }
    const dropFolder = (folder: string, uid?: number) => {
      for (const [u, pid] of [...(where.get(folder) || [])]) {
        if (uid !== undefined && u !== uid) continue;
        const m = work.get(pid);
        if (m?.locations) { delete m.locations[folder]; touched.add(pid); }
        where.get(folder)!.delete(u);
      }
    };
    const serverFlags = new Map<string, Map<number, string[]>>();

    for (const st of states) {
      const prev = cursor.f[st.folder];
      if (st.error) { if (prev) next.f[st.folder] = prev; continue; }
      const flags = new Map(st.flags);
      serverFlags.set(st.folder, flags);
      let fresh: number[];
      if (!prev || prev.validity !== st.validity) {
        // A new folder, or one the server has renumbered: forget our copies and read it again.
        dropFolder(st.folder);
        const since = this.account.retentionDays ? imapDate(Date.now() - this.account.retentionDays * 86400000) : undefined;
        fresh = (await this.run<UidList>('imap_uids', { folder: st.folder, since })).uids;
      } else {
        const mine = where.get(st.folder) || new Map<number, string>();
        for (const u of [...mine.keys()]) if (!flags.has(u)) dropFolder(st.folder, u);
        fresh = [...flags.keys()].filter((u) => u >= prev.uidnext && !(where.get(st.folder)?.has(u)));
      }
      fresh.sort((a, b) => b - a);
      for (let i = 0; i < fresh.length; i += BATCH) {
        const raws = await this.run<RawMessage[]>('imap_headers', { folder: st.folder, uids: fresh.slice(i, i + BATCH) });
        for (const m of await this.toMessages(st.folder, raws, seen)) {
          const merged = mergeCopies(work.get(m.providerId), m);
          work.set(m.providerId, merged);
          touched.add(m.providerId);
          for (const [f, u] of Object.entries(m.locations || {})) (where.get(f) || where.set(f, new Map()).get(f)!).set(u, m.providerId);
        }
      }
      next.f[st.folder] = { validity: st.validity, uidnext: st.uidnext };
    }

    // Read, starred and draft marks, from whichever copies the server confirmed.
    for (const m of work.values()) {
      const copies: string[][] = [];
      for (const [f, u] of Object.entries(m.locations || {})) {
        const fl = serverFlags.get(f)?.get(u);
        if (fl) copies.push(fl);
      }
      if (!copies.length) continue;
      const s = summariseFlags(copies);
      if (s.unread !== m.unread || s.flagged !== m.flagged || (s.draft && !m.isDraft)) {
        m.unread = s.unread; m.flagged = s.flagged; m.isDraft = m.isDraft || s.draft;
        touched.add(m.providerId);
      }
    }

    const upserted: Message[] = [];
    const deleted: string[] = [];
    for (const pid of touched) {
      const m = work.get(pid)!;
      if (!Object.keys(m.locations || {}).length) { deleted.push(m.id); continue; }
      upserted.push({ ...m, labels: labelsFor(Object.keys(m.locations!), m.unread, m.flagged) });
    }
    return { upserted, labelChanges: [], deleted, cursor: JSON.stringify(next) };
  }

  // ---------- reading one email ----------

  private async fetchParsed(msg: Message): Promise<Email> {
    const hit = this.parsed.get(msg.providerId);
    if (hit) return hit;
    const locs = Object.entries(msg.locations || {});
    if (!locs.length) throw new Error('This email is no longer on the server.');
    // Prefer a copy that is not in the Bin or Junk.
    const [folder, uid] = locs.find(([f]) => f !== this.sys.bin && f !== this.sys.junk) || locs[0];
    const b64 = await this.run<string>('imap_message', { folder, uid });
    const email = await PostalMime.parse(base64ToBytes(b64));
    if (this.parsed.size >= 6) this.parsed.delete(this.parsed.keys().next().value as string);
    this.parsed.set(msg.providerId, email);
    return email;
  }

  async getBody(msg: Message): Promise<MessageBody> {
    const e = await this.fetchParsed(msg);
    const html = e.html;
    const attachments = e.attachments.map((a, i) => {
      const contentId = a.contentId?.replace(/[<>]/g, '');
      let inline = Boolean(a.related) || (a.disposition === 'inline' && Boolean(contentId));
      if (inline && !(html && contentId && html.toLowerCase().includes(`cid:${contentId.toLowerCase()}`))) inline = false;
      return { id: String(i), filename: a.filename || 'attachment', mimeType: a.mimeType || 'application/octet-stream', size: bytesOf(a.content).byteLength, contentId, inline };
    });
    return { html, text: e.text, attachments };
  }

  async getAttachment(msg: Message, attachmentId: string): Promise<Uint8Array> {
    const e = await this.fetchParsed(msg);
    const a = e.attachments[Number(attachmentId)];
    if (!a) throw new Error('That attachment could not be found.');
    return bytesOf(a.content);
  }

  // ---------- changing things ----------

  private locations = (m: Message): [string, number][] => Object.entries(m.locations || {});

  async modifyLabels(msgs: Message[], add: string[], remove: string[]) {
    await this.ensureFolders();
    const flagAdd: string[] = [];
    const flagRemove: string[] = [];
    if (add.includes('UNREAD')) flagRemove.push('\\Seen');
    if (remove.includes('UNREAD')) flagAdd.push('\\Seen');
    if (add.includes('FLAGGED') || add.includes('STARRED')) flagAdd.push('\\Flagged');
    if (remove.includes('FLAGGED') || remove.includes('STARRED')) flagRemove.push('\\Flagged');
    const addFolders = add.filter((l) => !isFlagLabel(l));
    const removeFolders = remove.filter((l) => !isFlagLabel(l));
    const inbox = this.sys.inbox || 'INBOX';

    const stores = new Map<string, number[]>();
    const moves = new Map<string, { from: string; to: string; uids: number[]; copy: boolean }>();
    const deletes = new Map<string, number[]>();
    const push = <T,>(map: Map<string, T[]>, k: string, v: T) => (map.get(k) || map.set(k, []).get(k)!).push(v);
    const plan = (m: Message, to: string, from: string[] | null) => {
      const locs = this.locations(m);
      if (!locs.length) return;
      const sources = locs.filter(([f]) => (from ? from.includes(f) : true));
      if (locs.some(([f]) => f === to)) {
        for (const [f, u] of sources) if (f !== to) push(deletes, f, u);
        return;
      }
      const [first, ...rest] = sources.length ? sources : locs.slice(0, 1);
      const key = `${first[0]}\u0000${to}`;
      const mv = moves.get(key) || moves.set(key, { from: first[0], to, uids: [], copy: false }).get(key)!;
      mv.uids.push(first[1]);
      for (const [f, u] of rest) push(deletes, f, u);
    };

    for (const m of msgs) {
      const locs = this.locations(m);
      if (flagAdd.length || flagRemove.length) for (const [f, u] of locs) push(stores, f, u);
      const dest = addFolders.find((f) => !locs.some(([lf]) => lf === f));
      if (dest) {
        if (removeFolders.length) plan(m, dest, removeFolders);
        else if (locs.length) {
          const key = `${locs[0][0]}\u0000${dest}`;
          const mv = moves.get(key) || moves.set(key, { from: locs[0][0], to: dest, uids: [], copy: true }).get(key)!;
          mv.uids.push(locs[0][1]);
        }
      } else if (removeFolders.length && !addFolders.length) {
        // Taking a folder off: archive it if that was the Inbox, otherwise drop that copy (or archive if it is the only one).
        const here = locs.filter(([f]) => removeFolders.includes(f));
        if (removeFolders.includes(inbox) && locs.some(([f]) => f === inbox)) plan(m, this.sys.archive || 'Archive', [inbox]);
        else if (here.length && locs.length > here.length) for (const [f, u] of here) push(deletes, f, u);
        else if (here.length) plan(m, this.sys.archive || 'Archive', removeFolders);
      }
    }

    for (const [folder, uids] of stores) await this.run('imap_store', { folder, uids, add: flagAdd, remove: flagRemove });
    for (const mv of moves.values()) await this.run('imap_move', { from: mv.from, to: mv.to, uids: mv.uids, copy: mv.copy });
    for (const [folder, uids] of deletes) await this.run('imap_delete', { folder, uids });
    if (moves.size || deletes.size) this.onChanged?.();
  }

  async trash(msgs: Message[]) {
    await this.ensureFolders();
    const bin = this.sys.bin;
    if (!bin) throw new Error('This account has no Bin folder to move emails to.');
    await this.modifyLabels(msgs, [bin], msgs.flatMap((m) => Object.keys(m.locations || {})).filter((f) => f !== bin));
  }

  async untrash(msgs: Message[]) {
    await this.ensureFolders();
    const bin = this.sys.bin;
    await this.modifyLabels(msgs, [this.sys.inbox || 'INBOX'], bin ? [bin] : []);
  }

  // ---------- sending and drafts ----------

  private async smtpConn() {
    const c = await this.conn();
    const s = this.settings();
    return { host: s.smtpHost, port: s.smtpPort, user: c.user, pass: c.pass };
  }

  /** Adds a Message-ID of our own (SMTP servers here don't), so the sent copy and drafts can be found again. */
  private withMessageId(raw: string, from: string): { raw: string; id: string } {
    const existing = raw.match(/^Message-ID:\s*(<[^>\r\n]+>)/im);
    if (existing) return { raw, id: existing[1] };
    const domain = from.split('@')[1] || 'wellgoodmail.app';
    const id = `<${crypto.randomUUID()}@${domain}>`;
    return { raw: `Message-ID: ${id}\r\n${raw}`, id };
  }

  async send(msg: OutgoingMessage) {
    await this.ensureFolders();
    const { raw } = this.withMessageId(buildRawMessage(msg), msg.from.email);
    const recipients = [...msg.to, ...msg.cc, ...msg.bcc].map((a) => a.email).filter(Boolean);
    if (!recipients.length) throw new Error('Add at least one recipient.');
    try {
      await invoke('smtp_send', { conn: await this.smtpConn(), from: msg.from.email, to: recipients, raw: bytesToBase64(new TextEncoder().encode(withoutHeader(raw, 'Bcc'))) });
    } catch (e) {
      throw mailError(e);
    }
    // Gmail saves its own copy; the others don't, so one is filed here.
    if (!/gmail\.com$/i.test(this.settings().host)) {
      try {
        await this.run('imap_append', { folder: this.sys.sent || 'Sent', raw: bytesToBase64(new TextEncoder().encode(raw)), flags: ['\\Seen'] });
        this.onChanged?.();
      } catch { /* the email was sent; only the copy in Sent failed */ }
    }
    return { providerId: '', threadId: msg.threadId || '' };
  }

  async saveDraft(msg: OutgoingMessage, serverDraftId?: string) {
    await this.ensureFolders();
    const { raw, id } = this.withMessageId(buildRawMessage(msg), msg.from.email);
    const folder = this.sys.drafts || 'Drafts';
    await this.run('imap_append', { folder, raw: bytesToBase64(new TextEncoder().encode(raw)), flags: ['\\Draft', '\\Seen'] });
    if (serverDraftId) await this.deleteDraft(serverDraftId);
    return { draftId: id };
  }

  async deleteDraft(serverDraftId: string) {
    await this.ensureFolders();
    await this.run('imap_delete_by_id', { folder: this.sys.drafts || 'Drafts', messageId: serverDraftId }).catch(() => {});
  }

  async findDraftId(providerMessageId: string) {
    return this.mine().find((m) => m.providerId === providerMessageId)?.messageIdHeader;
  }

  // ---------- search, contacts, calendar ----------

  async searchRemote(query: string): Promise<Message[]> {
    await this.ensureFolders();
    // Gmail style operators (from:, in:) mean nothing here; search the words.
    const text = query.replace(/\b[\w-]+:("[^"]*"|\S+)/g, ' ').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    const wanted = [this.sys.inbox, this.sys.archive, this.sys.sent].filter(Boolean) as string[];
    const hits = await this.run<SearchHit[]>('imap_search', { folders: wanted, text });
    const seen = this.threadIndex();
    const out: Message[] = [];
    for (const h of hits) {
      const raws = await this.run<RawMessage[]>('imap_headers', { folder: h.folder, uids: h.uids });
      out.push(...(await this.toMessages(h.folder, raws, seen)));
    }
    return out;
  }

  /** Contacts and calendars are available for iCloud, using the same app password as the mail. */
  private async davAuth(): Promise<DavAuth | null> {
    const s = this.settings();
    if (!/(^|\.)mail\.me\.com$/i.test(s.host)) return null;
    const pass = await getImapPassword(this.account.email);
    return pass ? { user: s.appleId || s.username, pass } : null;
  }

  async listContacts(): Promise<Address[]> {
    const auth = await this.davAuth();
    return auth ? fetchContacts(auth) : [];
  }

  async listEvents(fromMs: number, toMs: number): Promise<CalendarEvent[]> {
    const auth = await this.davAuth();
    return auth ? fetchEvents(auth, this.account.id, fromMs, toMs, [this.account.email, ...(this.account.aliases || []).map((a) => a.email)]) : [];
  }
}
