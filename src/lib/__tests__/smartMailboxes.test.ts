import { describe, expect, it } from 'vitest';
import { matchSmart, alternatives, type SmartMailbox } from '../smartMailboxes';
import type { Message } from '../types';
import type { MailProvider } from '../providers/provider';

const folders: Record<string, string> = { inbox: 'INBOX', bin: 'TRASH', junk: 'SPAM', sent: 'SENT', drafts: 'DRAFT', archive: '', flagged: 'STARRED' };
const provider = { systemFolderId: (f: string) => folders[f] || null } as unknown as MailProvider;
const NOW = Date.parse('2026-11-09T12:00:00Z');

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'a|1', accountId: 'a', providerId: '1', threadId: 't1', labels: ['INBOX'],
  from: { email: 'sam@bloom.co', name: 'Sam Smith' }, to: [{ email: 'todd@wellgood.media' }], cc: [], bcc: [],
  subject: 'Invoice for March', snippet: 'Here is the invoice', date: NOW - 2 * 86400000,
  unread: true, flagged: false, isDraft: false, hasAttachments: false, attachments: [], bodyLoaded: false, ...over,
} as Message);
const box = (rules: SmartMailbox['rules'], match: 'all' | 'any' = 'all', extra: Partial<SmartMailbox> = {}): SmartMailbox => ({ id: 's', name: 'S', match, rules, ...extra });
const ctx = { vips: new Set(['boss@x.com']), mine: new Set(['todd@wellgood.media']), now: NOW };

describe('Smart Mailboxes', () => {
  it('splits alternatives on commas and OR', () => {
    expect(alternatives('invoice OR receipt, Bill')).toEqual(['invoice', 'receipt', 'bill']);
  });
  it('matches sender, subject and words', () => {
    expect(matchSmart(msg(), box([{ field: 'from', value: '@bloom.co' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg(), box([{ field: 'from', value: 'other.com' }]), provider, ctx)).toBe(false);
    expect(matchSmart(msg(), box([{ field: 'subject', value: 'receipt OR invoice' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg(), box([{ field: 'words', value: 'here is' }]), provider, ctx)).toBe(true);
  });
  it('needs every rule for all, and one for any', () => {
    const rules: SmartMailbox['rules'] = [{ field: 'from', value: 'bloom' }, { field: 'status', value: 'flagged' }];
    expect(matchSmart(msg(), box(rules, 'all'), provider, ctx)).toBe(false);
    expect(matchSmart(msg(), box(rules, 'any'), provider, ctx)).toBe(true);
  });
  it('turns a rule round with not', () => {
    expect(matchSmart(msg(), box([{ field: 'status', value: 'unread', not: true }]), provider, ctx)).toBe(false);
    expect(matchSmart(msg(), box([{ field: 'from', value: 'other.com', not: true }]), provider, ctx)).toBe(true);
  });
  it('checks account, folder, attachments, date, important senders and mail to me', () => {
    expect(matchSmart(msg(), box([{ field: 'account', value: 'a' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg(), box([{ field: 'account', value: 'b' }]), provider, ctx)).toBe(false);
    expect(matchSmart(msg(), box([{ field: 'folder', value: 'inbox' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg(), box([{ field: 'attachments', value: '' }]), provider, ctx)).toBe(false);
    expect(matchSmart(msg(), box([{ field: 'date', value: '7' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg({ date: NOW - 40 * 86400000 }), box([{ field: 'date', value: '30' }]), provider, ctx)).toBe(false);
    expect(matchSmart(msg({ from: { email: 'boss@x.com' } }), box([{ field: 'status', value: 'vip' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg(), box([{ field: 'status', value: 'toMe' }]), provider, ctx)).toBe(true);
  });
  it('leaves out Bin, Junk and drafts unless asked', () => {
    const binned = msg({ labels: ['TRASH'] });
    expect(matchSmart(binned, box([{ field: 'from', value: 'bloom' }]), provider, ctx)).toBe(false);
    expect(matchSmart(binned, box([{ field: 'from', value: 'bloom' }], 'all', { includeBinJunk: true }), provider, ctx)).toBe(true);
    expect(matchSmart(binned, box([{ field: 'folder', value: 'bin' }]), provider, ctx)).toBe(true);
    expect(matchSmart(msg({ isDraft: true }), box([{ field: 'from', value: 'bloom' }]), provider, ctx)).toBe(false);
  });
  it('ignores empty rules so a half-made one does not hide everything', () => {
    expect(matchSmart(msg(), box([{ field: 'from', value: '  ' }]), provider, ctx)).toBe(true);
  });
});
