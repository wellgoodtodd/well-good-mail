import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ httpFetch: async () => new Response('[]'), isTauri: () => false }));

const { compareVersions, newerBeta } = await import('../betaNotice');

const rel = (tag: string, prerelease: boolean, draft = false) => ({
  tag_name: tag,
  prerelease,
  draft,
  html_url: `https://github.com/x/y/releases/tag/${tag}`,
  assets: [{ name: `Well.Good.Mail_${tag.slice(1)}_x64-setup.exe`, browser_download_url: `https://github.com/x/y/releases/download/${tag}/setup.exe` }],
});

describe('comparing versions', () => {
  it('puts a test build before the live version it leads to', () => {
    expect(compareVersions('0.6.4-beta.2', '0.6.4')).toBe(-1);
    expect(compareVersions('0.6.4', '0.6.4-beta.2')).toBe(1);
    expect(compareVersions('0.6.4-beta.1', '0.6.4-beta.2')).toBe(-1);
    expect(compareVersions('0.6.4-beta.10', '0.6.4-beta.9')).toBe(1);
    expect(compareVersions('0.6.5-beta.1', '0.6.4')).toBe(1);
    expect(compareVersions('0.6.3', '0.6.3')).toBe(0);
    expect(compareVersions('0.7.0', '0.6.9')).toBe(1);
  });
});

describe('finding a newer test build', () => {
  const all = [rel('v0.6.4', false), rel('v0.6.4-beta.2', true), rel('v0.6.4-beta.1', true), rel('v0.6.5-beta.1', true), rel('v0.6.3', false), rel('v0.6.6-beta.1', true, true)];
  it('on a live version, shows only test builds newer than it', () => {
    expect(newerBeta(all, '0.6.4')?.version).toBe('0.6.5-beta.1');
    expect(newerBeta(all, '0.6.5')).toBeUndefined();
    expect(newerBeta(all, '0.6.3')?.version).toBe('0.6.5-beta.1');
  });
  it('on a test build, shows a later one and links the installer', () => {
    const found = newerBeta(all, '0.6.4-beta.1');
    expect(found?.version).toBe('0.6.5-beta.1');
    expect(found?.downloadUrl).toContain('setup.exe');
    expect(found?.notesUrl).toContain('/releases/tag/v0.6.5-beta.1');
  });
  it('shows nothing when you already have the newest, and ignores drafts', () => {
    expect(newerBeta([rel('v0.6.4-beta.2', true), rel('v0.6.6-beta.1', true, true)], '0.6.4-beta.2')).toBeUndefined();
  });
});
