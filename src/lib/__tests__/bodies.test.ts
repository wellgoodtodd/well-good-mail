import { beforeEach, describe, expect, it } from 'vitest';
import { BODY_CACHE_SIZE, cachedBodyCount, clearBodyCache, listOnly, peekBody, rememberBody, withCachedBody } from '../bodyCache';
import { store } from '../db';
import { importMessages, loadBody, savedCopy, useMail } from '../mail';
import { createDraft, quotedBodyOf, switchMode } from '../compose';
import type { Message } from '../types';

const msg = (n: number, over: Partial<Message> = {}): Message => ({
  id: `acc|${n}`, accountId: 'acc', providerId: String(n), threadId: `t${n}`, labels: ['INBOX'],
  from: { email: 'sam@bloom.co', name: 'Sam' }, to: [{ email: 'me@x.com' }], cc: [], bcc: [],
  subject: `Subject ${n}`, snippet: `Preview ${n}`, date: 1_700_000_000_000 + n,
  unread: true, flagged: false, isDraft: false, hasAttachments: false, attachments: [], bodyLoaded: false, ...over,
});
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  clearBodyCache();
  await store.wipe();
  useMail.setState({ messages: {}, accounts: [] });
});

describe('Recently opened bodies', () => {
  it('keeps the last 50 opened and lets the oldest go', () => {
    for (let i = 0; i < BODY_CACHE_SIZE + 10; i++) rememberBody(`m${i}`, { text: `body ${i}` });
    expect(cachedBodyCount()).toBe(BODY_CACHE_SIZE);
    expect(peekBody('m0')).toBeUndefined();
    expect(peekBody('m9')).toBeUndefined();
    expect(peekBody('m10')?.text).toBe('body 10');
  });
  it('counts reading one as a use, so it stays', () => {
    for (let i = 0; i < BODY_CACHE_SIZE; i++) rememberBody(`m${i}`, { text: `body ${i}` });
    peekBody('m0');
    rememberBody('new', { text: 'new' });
    expect(peekBody('m0')?.text).toBe('body 0');
    expect(peekBody('m1')).toBeUndefined();
  });
  it('lists an email without its body text, keeping everything else', () => {
    const full = msg(1, { bodyHtml: '<p>Hi</p>', bodyText: 'Hi', bodyLoaded: true, attachments: [{ id: 'a', filename: 'x.pdf', mimeType: 'application/pdf', size: 3, inline: false }] });
    const listed = listOnly(full);
    expect('bodyHtml' in listed || 'bodyText' in listed).toBe(false);
    expect(listed.attachments).toHaveLength(1);
    expect(listed.bodyLoaded).toBe(true);
    expect(withCachedBody(listed).bodyHtml).toBeUndefined();
    rememberBody(full.id, { html: '<p>Hi</p>', text: 'Hi' });
    expect(withCachedBody(listed).bodyHtml).toBe('<p>Hi</p>');
  });
});

describe('Saving emails without their bodies', () => {
  it('keeps the saved body when only the list details change', async () => {
    await store.putMessages([msg(1, { bodyHtml: '<b>Full</b>', bodyText: 'Full', bodyLoaded: true })]);
    await store.putMessages([listOnly(msg(1, { bodyLoaded: true, unread: false }))]);
    const row = await store.getMessage('acc|1');
    expect(row?.unread).toBe(false);
    expect(row?.bodyHtml).toBe('<b>Full</b>');
    expect(row?.bodyLoaded).toBe(true);
  });
  it('keeps the saved body and attachments when a sync brings the email without one', async () => {
    const att = [{ id: 'a', filename: 'x.pdf', mimeType: 'application/pdf', size: 3, inline: false }];
    await store.putMessages([msg(1, { bodyText: 'Full', bodyLoaded: true, attachments: att, hasAttachments: true })]);
    await store.putMessages([msg(1, { bodyLoaded: false, labels: ['INBOX', 'STARRED'] })]);
    const row = await store.getMessage('acc|1');
    expect(row?.bodyText).toBe('Full');
    expect(row?.bodyLoaded).toBe(true);
    expect(row?.attachments).toEqual(att);
    expect(row?.labels).toContain('STARRED');
  });
  it('never saves an email as loaded without a body to show', async () => {
    await store.putMessages([listOnly(msg(1, { bodyLoaded: true }))]);
    expect((await store.getMessage('acc|1'))?.bodyLoaded).toBe(false);
  });
  it('reads the cache a slice at a time', async () => {
    await store.putMessages(Array.from({ length: 25 }, (_, i) => msg(i)));
    const first = await store.messagesAfter(undefined, 10);
    const second = await store.messagesAfter(first[first.length - 1].id, 10);
    const third = await store.messagesAfter(second[second.length - 1].id, 10);
    expect([first.length, second.length, third.length]).toEqual([10, 10, 5]);
    expect(new Set([...first, ...second, ...third].map((m) => m.id)).size).toBe(25);
  });
});

describe('Loading a body when an email is opened', () => {
  it('keeps list details only in the store and reads the body back when opened', async () => {
    await importMessages([msg(1, { bodyHtml: '<p>Hello there</p>', bodyText: 'Hello there', bodyLoaded: true })]);
    const inStore = useMail.getState().messages['acc|1'];
    expect(inStore.bodyLoaded).toBe(true);
    expect(inStore.bodyHtml).toBeUndefined();
    expect(inStore.bodyText).toBeUndefined();
    // Straight away (still being saved) and later from the database, with nothing in memory.
    expect((await loadBody('acc|1'))?.bodyHtml).toBe('<p>Hello there</p>');
    await settle();
    clearBodyCache();
    const opened = await loadBody('acc|1');
    expect(opened?.bodyText).toBe('Hello there');
    expect(opened?.subject).toBe('Subject 1');
    expect(peekBody('acc|1')?.html).toBe('<p>Hello there</p>');
    // Opening doesn't put the body back in the store.
    expect(useMail.getState().messages['acc|1'].bodyHtml).toBeUndefined();
  });
  it('gives an empty body as loaded, not as missing', async () => {
    await importMessages([msg(2, { bodyText: '', bodyLoaded: true })]);
    await settle();
    clearBodyCache();
    const opened = await loadBody('acc|2');
    expect(opened?.bodyLoaded).toBe(true);
    expect(opened?.bodyText).toBe('');
  });
  it('a later flag change keeps the body in the database', async () => {
    await importMessages([msg(3, { bodyHtml: '<p>Keep me</p>', bodyLoaded: true })]);
    await settle();
    await store.putMessages([{ ...useMail.getState().messages['acc|3'], flagged: true }]);
    clearBodyCache();
    expect((await loadBody('acc|3'))?.bodyHtml).toBe('<p>Keep me</p>');
  });
  it('savedCopy reads only what is saved here', async () => {
    await importMessages([msg(4), msg(5, { bodyText: 'Saved', bodyLoaded: true })]);
    await settle();
    clearBodyCache();
    expect((await savedCopy('acc|4'))?.bodyText).toBeUndefined();
    expect((await savedCopy('acc|5'))?.bodyText).toBe('Saved');
    expect(await savedCopy('acc|nope')).toBeUndefined();
  });
  it('holds far less in the store for a big mailbox', async () => {
    const body = 'x'.repeat(20_000);
    const many = Array.from({ length: 300 }, (_, i) => msg(100 + i, { bodyHtml: `<p>${body}</p>`, bodyText: body, bodyLoaded: true }));
    await importMessages(many);
    const held = JSON.stringify(useMail.getState().messages).length;
    expect(held).toBeLessThan(many.length * 1000);
    expect(JSON.stringify(many).length).toBeGreaterThan(many.length * 40_000);
  });
});

describe('Switching Reply to Forward without the body in memory', () => {
  const ctx = { accounts: [], signatures: {}, defaultFromEmail: 'me@x.com' } as unknown as Parameters<typeof createDraft>[2];
  it('keeps the full quoted text from the draft', () => {
    const full = msg(9, { bodyHtml: '<p>The whole <b>email</b></p>', bodyLoaded: true });
    const reply = createDraft('reply', full, ctx);
    expect(quotedBodyOf(reply.quotedHtml)).toBe('<p>The whole <b>email</b></p>');
    const forward = switchMode(reply, 'forward', listOnly(full), []);
    expect(forward.quotedHtml).toContain('<p>The whole <b>email</b></p>');
    expect(forward.quotedHtml).not.toContain('Preview 9');
    expect(quotedBodyOf(forward.quotedHtml)).toBe('<p>The whole <b>email</b></p>');
    const back = switchMode(forward, 'reply', listOnly(full), []);
    expect(back.quotedHtml).toBe(reply.quotedHtml);
  });
});
