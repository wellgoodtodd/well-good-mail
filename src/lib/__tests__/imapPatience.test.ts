import { describe, expect, it } from 'vitest';
import { AuthError } from '../auth/google';
import { imapPaused, imapRefused, imapReset, imapWorked } from '../auth/imap';

describe('patience with refused IMAP sign ins', () => {
  it('a password that never worked is reported straight away', () => {
    const err = imapRefused('new@icloud.com', 'iCloud', new AuthError('refused'));
    expect(err).toBeInstanceOf(AuthError);
  });

  it('a password that worked before gets a pause and a busy message, not "sign in again"', () => {
    imapWorked('me@icloud.com');
    const err = imapRefused('me@icloud.com', 'iCloud', new AuthError('refused'));
    expect(err).not.toBeInstanceOf(AuthError);
    expect(err.message).toMatch(/iCloud isn't accepting sign ins/);
    expect(() => imapPaused('me@icloud.com', 'iCloud')).toThrow(/try again by itself/);
    imapReset('me@icloud.com');
    expect(() => imapPaused('me@icloud.com', 'iCloud')).not.toThrow();
  });

  it('other errors pass through', () => {
    imapWorked('x@icloud.com');
    const plain = new Error('Network down');
    expect(imapRefused('x@icloud.com', 'iCloud', plain)).toBe(plain);
  });
});
