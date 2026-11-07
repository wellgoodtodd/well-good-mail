import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ isTauri: () => false }));
vi.mock('../settings', () => ({ settings: () => ({ autoUpdate: true }) }));

const { isBetaVersion } = await import('../updater');

describe('test builds', () => {
  it('are recognised by the word after the number', () => {
    expect(isBetaVersion('0.6.3-beta.1')).toBe(true);
    expect(isBetaVersion('1.0.0-rc.2')).toBe(true);
  });
  it('are not confused with normal versions', () => {
    expect(isBetaVersion('0.6.2')).toBe(false);
    expect(isBetaVersion(undefined)).toBe(false);
    expect(isBetaVersion('browser preview')).toBe(false);
  });
});
