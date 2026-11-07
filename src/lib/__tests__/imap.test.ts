import { describe, it, expect } from 'vitest';
import { decodeFolderName, hashId, imapDate, labelsFor, leafName, mergeCopies, messageKey, presetForEmail, previewOf, summariseFlags, systemFolders, threadFor, isSyncable } from '../imapUtil';
import type { Message } from '../types';

const info = (name: string, attrs: string[] = [], delimiter: string | null = '/') => ({ name, delimiter, attrs });

describe('IMAP services', () => {
  it('recognises iCloud addresses', () => {
    expect(presetForEmail('Someone@ME.com')?.id).toBe('icloud');
    expect(presetForEmail('a@icloud.com')?.host).toBe('imap.mail.me.com');
    expect(presetForEmail('a@mac.com')?.id).toBe('icloud');
  });
  it('recognises other services and leaves unknown ones alone', () => {
    expect(presetForEmail('a@yahoo.co.uk')?.id).toBe('yahoo');
    expect(presetForEmail('a@fastmail.com')?.id).toBe('fastmail');
    expect(presetForEmail('a@example.org')).toBeUndefined();
    expect(presetForEmail('not an address')).toBeUndefined();
  });
});

describe('folders', () => {
  it('finds iCloud style folders by name', () => {
    const sys = systemFolders([info('INBOX'), info('Drafts'), info('Sent Messages'), info('Deleted Messages'), info('Junk'), info('Archive'), info('Notes')]);
    expect(sys).toEqual({ inbox: 'INBOX', drafts: 'Drafts', sent: 'Sent Messages', bin: 'Deleted Messages', junk: 'Junk', archive: 'Archive' });
  });
  it('prefers what the server says over names', () => {
    const sys = systemFolders([info('INBOX'), info('Outgoing', ['\\Sent']), info('Sent'), info('Old stuff', ['\\Archive'])]);
    expect(sys.sent).toBe('Outgoing');
    expect(sys.archive).toBe('Old stuff');
  });
  it('copes with folders nested under INBOX', () => {
    const sys = systemFolders([info('INBOX', [], '.'), info('INBOX.Sent', [], '.'), info('INBOX.Trash', [], '.')]);
    expect(sys.sent).toBe('INBOX.Sent');
    expect(sys.bin).toBe('INBOX.Trash');
    expect(leafName('INBOX.Sent', '.')).toBe('Sent');
  });
  it('ignores folders that cannot be opened', () => {
    expect(systemFolders([info('INBOX'), info('Sent', ['\\Noselect'])]).sent).toBeUndefined();
    expect(isSyncable(info('Parent', ['\\Noselect']), 'imap.example.com')).toBe(false);
  });
  it('skips the iCloud Notes folder, but only on iCloud', () => {
    expect(isSyncable(info('Notes'), 'imap.mail.me.com')).toBe(false);
    expect(isSyncable(info('Notes'), 'imap.fastmail.com')).toBe(true);
  });
  it('reads folder names written in IMAP UTF-7', () => {
    expect(decodeFolderName('Caf&AOk-')).toBe('Café');
    expect(decodeFolderName('R&AOQ-ksm&APY-rg&AOU-s')).toBe('Räksmörgås');
    expect(decodeFolderName('Tom &- Jerry')).toBe('Tom & Jerry');
    expect(decodeFolderName('Plain')).toBe('Plain');
  });
});

describe('ids and conversations', () => {
  it('gives the same id to the same Message-ID in any folder', () => {
    expect(messageKey('<abc@x.com>', 'INBOX', 4)).toBe(messageKey('<ABC@x.com>', 'Archive', 99));
    expect(messageKey('<abc@x.com>', 'INBOX', 4)).not.toBe(messageKey('<abd@x.com>', 'INBOX', 4));
  });
  it('falls back to folder and number when there is no Message-ID', () => {
    expect(messageKey(undefined, 'INBOX', 4)).not.toBe(messageKey(undefined, 'INBOX', 5));
    expect(messageKey(undefined, 'INBOX', 4)).not.toBe(messageKey(undefined, 'Sent', 4));
  });
  it('hashes consistently', () => {
    expect(hashId('hello')).toBe(hashId('hello'));
    expect(hashId('hello')).not.toBe(hashId('hellp'));
  });
  it('puts a reply in the conversation of the email it answers', () => {
    const seen = new Map<string, string>();
    const first = threadFor({ messageId: '<a@x>' }, seen, 'x1');
    const reply = threadFor({ messageId: '<b@x>', inReplyTo: '<a@x>', references: '<a@x>' }, seen, 'x2');
    const second = threadFor({ messageId: '<c@x>', inReplyTo: '<b@x>', references: '<a@x> <b@x>' }, seen, 'x3');
    expect(reply).toBe(first);
    expect(second).toBe(first);
  });
  it('names a conversation the same whichever email arrives first', () => {
    const early = threadFor({ messageId: '<c@x>', references: '<a@x> <b@x>' }, new Map(), 'x');
    const root = threadFor({ messageId: '<a@x>' }, new Map(), 'y');
    expect(early).toBe(root);
  });
  it('joins a reply to a conversation it only points at by In-Reply-To', () => {
    const seen = new Map<string, string>([['<b@x>', 'tfound']]);
    expect(threadFor({ messageId: '<c@x>', inReplyTo: '<b@x>' }, seen, 'x')).toBe('tfound');
  });
  it('keeps unrelated emails apart', () => {
    const seen = new Map<string, string>();
    expect(threadFor({ messageId: '<a@x>' }, seen, 'x1')).not.toBe(threadFor({ messageId: '<b@x>' }, seen, 'x2'));
  });
});

describe('flags and labels', () => {
  it('builds labels from folders and marks', () => {
    expect(labelsFor(['INBOX'], true, false)).toEqual(['INBOX', 'UNREAD']);
    expect(labelsFor(['INBOX', 'Work'], false, true)).toEqual(['INBOX', 'Work', 'FLAGGED']);
  });
  it('is unread or flagged if any copy is', () => {
    expect(summariseFlags([['\\Seen'], []]).unread).toBe(true);
    expect(summariseFlags([['\\Seen'], ['\\Seen', '\\Flagged']])).toEqual({ unread: false, flagged: true, draft: false });
    expect(summariseFlags([['\\Draft', '\\Seen']]).draft).toBe(true);
  });
  it('writes dates for searches', () => {
    expect(imapDate(Date.UTC(2026, 0, 5))).toBe('05-Jan-2026');
    expect(imapDate(Date.UTC(2026, 10, 7))).toBe('07-Nov-2026');
  });
});

describe('previews', () => {
  it('uses text when there is some', () => {
    expect(previewOf('Hello   there\n\nfriend', '<p>ignored</p>')).toBe('Hello there friend');
  });
  it('strips HTML when there is only HTML', () => {
    expect(previewOf('', '<style>p{}</style><p>Fish &amp; chips</p><script>x()</script>')).toBe('Fish & chips');
  });
  it('keeps it short', () => {
    expect(previewOf('a '.repeat(300), undefined).length).toBeLessThanOrEqual(160);
  });
});

describe('the same email in two folders', () => {
  const base: Message = {
    id: 'a|m1', accountId: 'a', providerId: 'm1', threadId: 't', labels: ['INBOX', 'UNREAD'], locations: { INBOX: 5 },
    from: { email: 'x@y.z' }, to: [], cc: [], bcc: [], subject: 's', snippet: '', date: 1, unread: true, flagged: false,
    isDraft: false, hasAttachments: false, attachments: [], bodyLoaded: true, bodyText: 'kept',
  };
  it('becomes one email in both places', () => {
    const copy: Message = { ...base, labels: ['Work'], locations: { Work: 9 }, unread: false, bodyLoaded: false, bodyText: undefined };
    const merged = mergeCopies(base, copy);
    expect(merged.locations).toEqual({ INBOX: 5, Work: 9 });
    expect(merged.labels).toEqual(['INBOX', 'Work', 'UNREAD']);
    expect(merged.bodyText).toBe('kept');
  });
  it('returns the incoming email when there is nothing to merge with', () => {
    expect(mergeCopies(undefined, base)).toBe(base);
  });
});
