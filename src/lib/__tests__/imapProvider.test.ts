// Runs the IMAP provider against a small pretend mail server, so syncing, moving and sending can be checked
// without a real account. The pretend server answers the same commands the Rust side does (src-tauri/src/imapmail.rs).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Message } from '../types';

interface Copy { flags: string[]; raw: string }
type Server = { folders: Map<string, Map<number, Copy>>; next: Map<string, number>; sent: { from: string; to: string[]; raw: string }[]; validity: number; calls: string[] };

const server: Server = { folders: new Map(), next: new Map(), sent: [], validity: 1, calls: [] };

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

function put(folder: string, raw: string, flags: string[] = []): number {
  const f = server.folders.get(folder) || server.folders.set(folder, new Map()).get(folder)!;
  const uid = server.next.get(folder) || 1;
  server.next.set(folder, uid + 1);
  f.set(uid, { flags, raw });
  return uid;
}

const mail = (id: string, subject: string, extra = '', body = 'Hello there') =>
  `From: Sam <sam@example.com>\r\nTo: me@icloud.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@example.com>\r\nDate: Mon, 02 Nov 2026 10:00:00 +0000\r\n${extra}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

vi.mock('../platform', () => ({
  secrets: { get: async () => 'app-password', set: async () => {}, remove: async () => {} },
  invoke: async (cmd: string, args: Record<string, any>) => {
    server.calls.push(cmd);
    const folder = (n: string) => server.folders.get(n) || new Map<number, Copy>();
    switch (cmd) {
      case 'imap_folders':
        return [...server.folders.keys()].map((name) => ({ name, delimiter: '/', attrs: [] }));
      case 'imap_uids':
        return { validity: server.validity, uidnext: server.next.get(args.folder) || 1, uids: [...folder(args.folder).keys()].sort((a, b) => a - b) };
      case 'imap_flags':
        return (args.folders as string[]).map((f) => ({ folder: f, validity: server.validity, uidnext: server.next.get(f) || 1, exists: folder(f).size, flags: [...folder(f)].map(([u, c]) => [u, c.flags]), error: null }));
      case 'imap_headers':
        return (args.uids as number[]).filter((u) => folder(args.folder).has(u)).map((u) => ({ uid: u, flags: folder(args.folder).get(u)!.flags, received: 1, head: b64(folder(args.folder).get(u)!.raw) }));
      case 'imap_message':
        return b64(folder(args.folder).get(args.uid)!.raw);
      case 'imap_store':
        for (const u of args.uids as number[]) {
          const c = folder(args.folder).get(u);
          if (!c) continue;
          c.flags = [...c.flags.filter((f) => !(args.remove as string[]).includes(f)), ...(args.add as string[]).filter((f) => !c.flags.includes(f))];
        }
        return;
      case 'imap_move':
        for (const u of args.uids as number[]) {
          const c = folder(args.from).get(u);
          if (!c) continue;
          put(args.to, c.raw, [...c.flags]);
          if (!args.copy) folder(args.from).delete(u);
        }
        return;
      case 'imap_delete':
        for (const u of args.uids as number[]) folder(args.folder).delete(u);
        return;
      case 'imap_delete_by_id':
        for (const [u, c] of folder(args.folder)) if (c.raw.includes(`Message-ID: ${args.messageId}`)) folder(args.folder).delete(u);
        return;
      case 'imap_append':
        put(args.folder, unb64(args.raw), args.flags);
        return;
      case 'smtp_send':
        server.sent.push({ from: args.from, to: args.to, raw: unb64(args.raw) });
        return;
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  },
}));

const { ImapProvider } = await import('../providers/imap');

const account: Account = {
  id: 'imap-me@icloud.com', kind: 'imap', email: 'me@icloud.com', label: 'me', displayName: 'Me', colour: '#000', aliases: [], order: 0,
  status: 'ok', retentionDays: null, notify: 'all',
  imap: { host: 'imap.mail.me.com', port: 993, smtpHost: 'smtp.mail.me.com', smtpPort: 587, username: 'me@icloud.com' },
};

/** Plays the part of the app's message store: keeps what the provider hands over. */
function appStore() {
  const messages = new Map<string, Message>();
  return {
    messages,
    apply: (r: { upserted: Message[]; deleted: string[] }) => { r.upserted.forEach((m) => messages.set(m.id, m)); r.deleted.forEach((id) => messages.delete(id)); },
    provider: () => new ImapProvider(account, () => [...messages.values()]),
  };
}

const byFolder = (store: ReturnType<typeof appStore>, folder: string) => [...store.messages.values()].filter((m) => m.labels.includes(folder));

beforeEach(() => {
  server.folders.clear(); server.next.clear(); server.sent = []; server.validity = 1; server.calls = [];
  for (const f of ['INBOX', 'Drafts', 'Sent Messages', 'Deleted Messages', 'Junk', 'Archive']) server.folders.set(f, new Map());
});

async function firstSync(store: ReturnType<typeof appStore>) {
  const p = store.provider();
  await p.listFolders();
  const { cursor } = await p.fullSync(null, (batch) => { batch.forEach((m) => store.messages.set(m.id, m)); });
  return { p, cursor: cursor! };
}

describe('IMAP provider', () => {
  it('reads the mailbox on the first sync', async () => {
    put('INBOX', mail('a', 'First'));
    put('INBOX', mail('b', 'Second', 'References: <a@example.com>\r\nIn-Reply-To: <a@example.com>\r\n'), ['\\Seen']);
    const store = appStore();
    await firstSync(store);
    const inbox = byFolder(store, 'INBOX');
    expect(inbox).toHaveLength(2);
    const first = inbox.find((m) => m.subject === 'First')!;
    const second = inbox.find((m) => m.subject === 'Second')!;
    expect(first.unread).toBe(true);
    expect(first.labels).toContain('UNREAD');
    expect(second.unread).toBe(false);
    expect(first.threadId).toBe(second.threadId);
    expect(first.from).toEqual({ name: 'Sam', email: 'sam@example.com' });
    expect(first.snippet).toBe('Hello there');
  });

  it('finds the system folders', async () => {
    const p = appStore().provider();
    await p.listFolders();
    expect(p.systemFolderId('inbox')).toBe('INBOX');
    expect(p.systemFolderId('sent')).toBe('Sent Messages');
    expect(p.systemFolderId('bin')).toBe('Deleted Messages');
    expect(p.systemFolderId('archive')).toBe('Archive');
  });

  it('notices new mail, reads and deletions on later syncs', async () => {
    const a = put('INBOX', mail('a', 'One'));
    put('INBOX', mail('b', 'Two'));
    const store = appStore();
    const { p, cursor } = await firstSync(store);

    put('INBOX', mail('c', 'Three'));
    server.folders.get('INBOX')!.get(a)!.flags.push('\\Seen');
    server.folders.get('INBOX')!.delete(2);
    const r = await p.incrementalSync(cursor);
    store.apply(r);
    const subjects = byFolder(store, 'INBOX').map((m) => m.subject).sort();
    expect(subjects).toEqual(['One', 'Three']);
    expect(byFolder(store, 'INBOX').find((m) => m.subject === 'One')!.unread).toBe(false);
    expect(r.deleted).toHaveLength(1);
  });

  it('archives an email: the same email, now in Archive', async () => {
    put('INBOX', mail('a', 'Keep me'));
    const store = appStore();
    const { p, cursor } = await firstSync(store);
    const m = [...store.messages.values()][0];

    await p.modifyLabels([m], [], ['INBOX']);
    expect(server.folders.get('INBOX')!.size).toBe(0);
    expect(server.folders.get('Archive')!.size).toBe(1);

    const r = await p.incrementalSync(cursor);
    store.apply(r);
    expect(store.messages.size).toBe(1);
    const after = [...store.messages.values()][0];
    expect(after.id).toBe(m.id);
    expect(after.labels).toContain('Archive');
    expect(after.labels).not.toContain('INBOX');
    expect(r.deleted).toEqual([]);
  });

  it('files a copy in a folder and keeps it in the Inbox', async () => {
    put('INBOX', mail('a', 'Both places'));
    server.folders.set('Work', new Map());
    const store = appStore();
    const { p, cursor } = await firstSync(store);
    const m = [...store.messages.values()][0];

    await p.modifyLabels([m], ['Work'], []);
    expect(server.folders.get('INBOX')!.size).toBe(1);
    expect(server.folders.get('Work')!.size).toBe(1);
    const r = await p.incrementalSync(cursor);
    store.apply(r);
    expect(store.messages.size).toBe(1);
    expect([...store.messages.values()][0].labels).toEqual(expect.arrayContaining(['INBOX', 'Work']));
  });

  it('marks read and starred on every copy', async () => {
    put('INBOX', mail('a', 'Flags'));
    const store = appStore();
    const { p, cursor } = await firstSync(store);
    const m = [...store.messages.values()][0];
    await p.modifyLabels([m], ['FLAGGED'], ['UNREAD']);
    expect(server.folders.get('INBOX')!.get(1)!.flags.sort()).toEqual(['\\Flagged', '\\Seen']);
    const r = await p.incrementalSync(cursor);
    store.apply(r);
    const after = [...store.messages.values()][0];
    expect(after.unread).toBe(false);
    expect(after.flagged).toBe(true);
  });

  it('moves to the Bin and back', async () => {
    put('INBOX', mail('a', 'Bin me'));
    const store = appStore();
    const { p, cursor } = await firstSync(store);
    const m = [...store.messages.values()][0];
    await p.trash([m]);
    expect(server.folders.get('Deleted Messages')!.size).toBe(1);
    expect(server.folders.get('INBOX')!.size).toBe(0);
    store.apply(await p.incrementalSync(cursor));
    const inBin = [...store.messages.values()][0];
    expect(inBin.labels).toContain('Deleted Messages');
    await p.untrash([inBin]);
    expect(server.folders.get('INBOX')!.size).toBe(1);
    expect(server.folders.get('Deleted Messages')!.size).toBe(0);
  });

  it('reads the whole email and its attachments', async () => {
    const raw =
      'From: Sam <sam@example.com>\r\nTo: me@icloud.com\r\nSubject: Pic\r\nMessage-ID: <p@example.com>\r\nContent-Type: multipart/mixed; boundary="B"\r\n\r\n' +
      '--B\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSee attached\r\n' +
      '--B\r\nContent-Type: application/pdf; name="plan.pdf"\r\nContent-Disposition: attachment; filename="plan.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nSGVsbG8=\r\n--B--\r\n';
    put('INBOX', raw);
    const store = appStore();
    const { p } = await firstSync(store);
    const m = [...store.messages.values()][0];
    expect(m.hasAttachments).toBe(true);
    const body = await p.getBody(m);
    expect(body.text?.trim()).toBe('See attached');
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toMatchObject({ filename: 'plan.pdf', mimeType: 'application/pdf', inline: false });
    expect(new TextDecoder().decode(await p.getAttachment(m, body.attachments[0].id))).toBe('Hello');
  });

  it('sends by SMTP, keeps Bcc private, and files a copy in Sent', async () => {
    const store = appStore();
    const { p } = await firstSync(store);
    await p.send({
      from: { email: 'me@icloud.com', name: 'Me' },
      to: [{ email: 'a@example.com' }], cc: [], bcc: [{ email: 'secret@example.com' }],
      subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', attachments: [],
    });
    expect(server.sent).toHaveLength(1);
    expect(server.sent[0].to).toEqual(['a@example.com', 'secret@example.com']);
    expect(server.sent[0].raw).not.toMatch(/^Bcc:/im);
    expect(server.sent[0].raw).toMatch(/^Message-ID: <.+@icloud\.com>/im);
    const sentCopy = [...(server.folders.get('Sent Messages')!.values())][0];
    expect(sentCopy.flags).toContain('\\Seen');
    expect(sentCopy.raw).toMatch(/^Bcc:/im);
  });

  it('replaces a draft when it is saved again', async () => {
    const store = appStore();
    const { p } = await firstSync(store);
    const msg = { from: { email: 'me@icloud.com' }, to: [], cc: [], bcc: [], subject: 'Draft', html: '<p>x</p>', text: 'x', attachments: [] };
    const one = await p.saveDraft(msg);
    expect(server.folders.get('Drafts')!.size).toBe(1);
    const two = await p.saveDraft({ ...msg, subject: 'Draft 2' }, one.draftId);
    expect(server.folders.get('Drafts')!.size).toBe(1);
    expect(two.draftId).not.toBe(one.draftId);
    await p.deleteDraft(two.draftId);
    expect(server.folders.get('Drafts')!.size).toBe(0);
  });

  it('starts again when the server renumbers a folder', async () => {
    put('INBOX', mail('a', 'Before'));
    const store = appStore();
    const { p, cursor } = await firstSync(store);
    server.validity = 2;
    server.folders.get('INBOX')!.clear();
    server.next.set('INBOX', 1);
    put('INBOX', mail('z', 'After'));
    store.apply(await p.incrementalSync(cursor));
    expect(byFolder(store, 'INBOX').map((m) => m.subject)).toEqual(['After']);
  });

  it('asks for a full sync when the saved position is unreadable', async () => {
    const p = appStore().provider();
    expect((await p.incrementalSync('not json')).resetNeeded).toBe(true);
  });
});
