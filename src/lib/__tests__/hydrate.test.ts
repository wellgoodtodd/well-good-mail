import { describe, expect, it } from 'vitest';
import { MicrosoftProvider } from '../providers/microsoft';
import { ImapProvider } from '../providers/imap';
import type { Account, Folder } from '../types';

const base = { label: 'x', displayName: 'X', colour: '#000', aliases: [], order: 0, status: 'ok' as const, retentionDays: null, notify: 'all' as const };
const folder = (id: string, system: Folder['system']): Folder => ({ id, accountId: 'a', name: id, system, unread: 0, depth: 0 });

describe('folders known straight after the app starts', () => {
  it('Microsoft: Inbox and Sent are known from what was saved', () => {
    const p = new MicrosoftProvider({ ...base, id: 'microsoft-x', kind: 'microsoft', email: 'x@outlook.com' } as Account);
    expect(p.systemFolderId('inbox')).toBeNull();
    p.hydrate([folder('AAA', 'inbox'), folder('BBB', 'sent'), folder('FLAGGED', 'flagged'), folder('CCC', undefined)]);
    expect(p.systemFolderId('inbox')).toBe('AAA');
    expect(p.systemFolderId('sent')).toBe('BBB');
    expect(p.systemFolderId('flagged')).toBe('FLAGGED');
  });
  it('IMAP: the same', () => {
    const p = new ImapProvider({ ...base, id: 'imap-x', kind: 'imap', email: 'x@icloud.com' } as Account);
    p.hydrate([folder('INBOX', 'inbox'), folder('Sent Messages', 'sent')]);
    expect(p.systemFolderId('inbox')).toBe('INBOX');
    expect(p.systemFolderId('sent')).toBe('Sent Messages');
  });
});
