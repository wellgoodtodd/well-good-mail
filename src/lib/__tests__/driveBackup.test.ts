import { describe, it, expect } from 'vitest';
import { backupIsDue, backupName, buildBackup, parseBackup, settingsPatch, toPrune, defaultDeviceName } from '../driveBackup';
import { cleanFolderName, folderQuery, qName } from '../driveFolder';
import type { Account } from '../types';

const DAY = 86400000;
const acc = (over: Partial<Account> = {}): Account => ({
  id: 'a1', kind: 'gmail', email: 'me@example.com', label: 'Work', displayName: 'Me', colour: '#f60', aliases: [], order: 1,
  status: 'ok' as Account['status'], retentionDays: 365, notify: 'all', syncCursor: 'secret-cursor', photoUrl: 'data:x', ...over,
});

describe('buildBackup', () => {
  const all = { theme: 'dark', sendRules: [{ id: 'r1' }], mcp: { accounts: { a1: 'write' } }, demoMode: false, backupLastAt: 5, deviceName: 'Desk', set: () => {} };
  const b = buildBackup(all, [acc({ order: 2, email: 'b@example.com' }), acc({ imap: { host: 'imap.x', port: 993, smtpHost: 'smtp.x', smtpPort: 465, username: 'u' } })], 'Desk', 1000, '0.7.5');

  it('keeps settings and rules, but never the AI Connection or per-computer things', () => {
    expect(b.settings.theme).toBe('dark');
    expect(b.settings.sendRules).toEqual([{ id: 'r1' }]);
    expect(b.settings).not.toHaveProperty('mcp');
    expect(b.settings).not.toHaveProperty('demoMode');
    expect(b.settings).not.toHaveProperty('backupLastAt');
    expect(b.settings).not.toHaveProperty('deviceName');
    expect(b.settings).not.toHaveProperty('set');
  });

  it('lists accounts in order, with server details but no sync cursors or photos', () => {
    expect(b.accounts.map((a) => a.email)).toEqual(['me@example.com', 'b@example.com']);
    expect(b.accounts[0].imap?.host).toBe('imap.x');
    expect(JSON.stringify(b)).not.toContain('secret-cursor');
    expect(b.accounts[0]).not.toHaveProperty('photoUrl');
    expect(b).toMatchObject({ format: 'wgm-backup', version: 1, device: 'Desk', createdAt: 1000, appVersion: '0.7.5' });
  });

  it('reads back, and the patch takes only known settings', () => {
    const back = parseBackup(JSON.stringify(b));
    expect(settingsPatch(back, { theme: 'light', sendRules: [], mcp: {} })).toEqual({ theme: 'dark', sendRules: [{ id: 'r1' }] });
    // Even a hand-made file with mcp in it can't change the AI Connection.
    expect(settingsPatch({ ...back, settings: { mcp: { accounts: { a1: 'write' } } } }, { mcp: {} })).toEqual({});
  });

  it('refuses files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow("isn't a Well Good Mail backup");
    expect(() => parseBackup(JSON.stringify({ format: 'wgm-keys' }))).toThrow();
  });
});

describe('backupIsDue', () => {
  const now = 100 * DAY;
  it('never when off, straight away the first time', () => {
    expect(backupIsDue('off', 0, now)).toBe(false);
    expect(backupIsDue('week', 0, now)).toBe(true);
  });
  it('after a day, week or month, allowing a couple of hours early', () => {
    expect(backupIsDue('day', now - DAY + 3 * 3600000, now)).toBe(false);
    expect(backupIsDue('day', now - DAY + 3600000, now)).toBe(true);
    expect(backupIsDue('week', now - 6 * DAY, now)).toBe(false);
    expect(backupIsDue('week', now - 7 * DAY, now)).toBe(true);
    expect(backupIsDue('month', now - 29 * DAY, now)).toBe(false);
    expect(backupIsDue('month', now - 30 * DAY, now)).toBe(true);
  });
});

describe('toPrune', () => {
  const files = [1, 5, 3, 4, 2].map((n) => ({ id: `f${n}`, createdAt: n }));
  it('keeps the newest', () => expect(toPrune(files, 3).map((f) => f.id).sort()).toEqual(['f1', 'f2']));
  it('always keeps at least one', () => expect(toPrune(files, 0)).toHaveLength(4));
});

describe('names', () => {
  it('backup file names sort by date', () => expect(backupName(new Date(2026, 10, 16, 23, 50).getTime())).toBe('Well Good Mail backup 2026-11-16 2350.json'));
  it('a first computer name', () => expect(defaultDeviceName(new Date(2026, 10, 16).getTime())).toBe('Windows PC, added 16 Nov 2026'));
  it('folder names lose slashes and control characters', () => {
    expect(cleanFolderName(' Desk/PC\\one\n ')).toBe('Desk PC one');
    expect(cleanFolderName('   ')).toBe('This computer');
  });
  it('Drive searches quote names safely', () => {
    expect(qName("Todd's PC")).toBe("'Todd\\'s PC'");
    expect(folderQuery('Backups', 'abc')).toBe("name='Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'abc' in parents");
    expect(folderQuery('Well Good Mail')).toContain("appProperties has { key='wgm' and value='root' }");
  });
});
