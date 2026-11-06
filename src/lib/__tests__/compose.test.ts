import { describe, expect, it } from 'vitest';
import { createDraft, switchMode, draftToOutgoing, subjectFor, autoRecipients } from '../compose';
import { buildRawMessage, parseAddressList, extractInlineImages, decodeHeader } from '../mime';
import type { Account, Message } from '../types';

const account: Account = {
  id: 'a1', kind: 'gmail', email: 'alex@studio.example', label: 'Studio', displayName: 'Alex Morgan', colour: '#000', order: 0, status: 'ok', retentionDays: 365, notify: 'all',
  aliases: [
    { email: 'alex@studio.example', name: 'Alex Morgan', isDefault: true, providerSignatureHtml: '<p>Alex</p>' },
    { email: 'accounts@studio.example', name: 'Studio Accounts', isDefault: false },
  ],
};
const ctx = { accounts: [account], defaultFromEmail: 'alex@studio.example', signatures: {}, signaturePlacement: 'above' as const };

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'a1|m1', accountId: 'a1', providerId: 'm1', threadId: 't1', labels: ['INBOX'],
  from: { name: 'Isla Grant', email: 'isla@glen.example' }, to: [{ email: 'accounts@studio.example' }], cc: [{ name: 'Ruaridh', email: 'r@glen.example' }, { email: 'alex@studio.example' }], bcc: [],
  subject: 'Invoice', snippet: 'hi', date: 0, unread: false, flagged: false, isDraft: false, hasAttachments: false, attachments: [], bodyHtml: '<p>hi</p>', bodyLoaded: true,
  messageIdHeader: '<abc@glen>', ...over,
});

describe('compose', () => {
  it('replies from the alias the email was sent to', () => {
    const d = createDraft('reply', msg(), ctx);
    expect(d.fromEmail).toBe('accounts@studio.example');
    expect(d.to.map((a) => a.email)).toEqual(['isla@glen.example']);
    expect(d.subject).toBe('Re: Invoice');
  });

  it('reply all includes everyone except me', () => {
    const r = autoRecipients('replyAll', msg(), [account]);
    expect(r.to.map((a) => a.email)).toEqual(['isla@glen.example']);
    expect(r.cc.map((a) => a.email)).toEqual(['r@glen.example']);
  });

  it('switching modes keeps the body and hand added recipients', () => {
    let d = createDraft('reply', msg(), ctx);
    d = { ...d, html: '<p>My words</p>', to: [...d.to, { email: 'extra@x.com' }], manualRecipients: [{ field: 'to', address: { email: 'extra@x.com' } }] };
    const all = switchMode(d, 'replyAll', msg(), [account]);
    expect(all.html).toBe('<p>My words</p>');
    expect(all.to.map((a) => a.email)).toContain('extra@x.com');
    expect(all.cc.map((a) => a.email)).toEqual(['r@glen.example']);
    const back = switchMode(all, 'reply', msg(), [account]);
    expect(back.cc).toEqual([]);
    expect(back.to.map((a) => a.email)).toEqual(['isla@glen.example', 'extra@x.com']);
    const fwd = switchMode(back, 'forward', msg(), [account]);
    expect(fwd.subject).toBe('Fwd: Invoice');
    expect(fwd.to.map((a) => a.email)).toEqual(['extra@x.com']);
    expect(fwd.includeSourceAttachments).toBe(true);
  });

  it('subjects do not stack prefixes', () => {
    expect(subjectFor('reply', 'Re: Hello')).toBe('Re: Hello');
    expect(subjectFor('forward', 'Re: Hello')).toBe('Fwd: Hello');
  });

  it('builds a threaded reply with the signature', () => {
    const d = { ...createDraft('reply', msg(), ctx), html: '<p>Thanks</p>', fromEmail: 'alex@studio.example' };
    const { message } = draftToOutgoing(d, msg(), ctx);
    expect(message.inReplyTo).toBe('<abc@glen>');
    expect(message.threadId).toBe('t1');
    expect(message.html).toContain('<p>Alex</p>');
    expect(message.text).toContain('Thanks');
  });
});

describe('mime', () => {
  it('parses address lists with quoted names', () => {
    expect(parseAddressList('"Grant, Isla" <isla@x.com>, bob@y.com')).toEqual([{ name: 'Grant, Isla', email: 'isla@x.com' }, { email: 'bob@y.com' }]);
  });

  it('decodes encoded headers', () => {
    expect(decodeHeader('=?UTF-8?B?Q2Fmw6kgQ8O5aWw=?=')).toBe('Café Cùil');
  });

  it('turns pasted images into inline attachments', () => {
    const { html, inline } = extractInlineImages('<p><img src="data:image/png;base64,iVBORw0KGgo="></p>');
    expect(inline).toHaveLength(1);
    expect(html).toContain('cid:');
  });

  it('builds a multipart message with attachments', () => {
    const raw = buildRawMessage({
      from: { name: 'Alex Morgan', email: 'alex@studio.example' }, to: [{ email: 'a@b.com' }], cc: [], bcc: [], subject: 'Héllo', html: '<p>Hi</p>', text: 'Hi',
      attachments: [{ filename: 'a.txt', mimeType: 'text/plain', data: new TextEncoder().encode('x') }],
    });
    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).toContain('multipart/mixed');
    expect(raw).toContain('multipart/alternative');
    expect(raw).toContain('filename="a.txt"');
  });
});
