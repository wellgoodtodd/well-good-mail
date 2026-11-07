import { describe, expect, it, vi } from 'vitest';

vi.mock('../mail', () => ({ toast: () => {} }));
const store = new Map<string, string>();
vi.mock('../platform', () => ({
  saveFile: async () => {},
  secrets: { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: string) => { store.set(k, v); }, remove: async () => {} },
}));

const { backupDue, importKeys } = await import('../backup');

const DAY = 86400000;

describe('reminding people to back up their keys', () => {
  it('asks when there are keys and no backup yet', () => {
    expect(backupDue(true, 0)).toBe(true);
  });
  it('does not ask when there are no keys of their own', () => {
    expect(backupDue(false, 0)).toBe(false);
  });
  it('stays quiet for a year after a backup', () => {
    const now = 1000 * DAY;
    expect(backupDue(true, now - 30 * DAY, now)).toBe(false);
    expect(backupDue(true, now - 400 * DAY, now)).toBe(true);
  });
});

describe('restoring keys from a file', () => {
  const file = (obj: unknown) => ({ text: async () => JSON.stringify(obj) }) as unknown as File;
  it('puts the keys back', async () => {
    const n = await importKeys(file({ format: 'wgm-keys', version: 1, exportedAt: 1, keys: { 'google-client-id': 'id.apps.googleusercontent.com', 'google-client-secret': 'shh', 'other': 'ignored' } }));
    expect(n).toBe(2);
    expect(store.get('google-client-id')).toBe('id.apps.googleusercontent.com');
    expect(store.has('other')).toBe(false);
  });
  it('refuses a file that is not a keys file', async () => {
    await expect(importKeys(file({ hello: 1 }))).rejects.toThrow(/keys file/);
  });
});
