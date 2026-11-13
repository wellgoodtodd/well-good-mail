import { describe, expect, it } from 'vitest';
import { signInsFromKeys } from '../mail/accounts';

describe('finding accounts from the sign-ins Windows kept', () => {
  const keys = [
    'google-client-id',
    'google-client-secret',
    'google:b@gmail.example',
    'google:A@Gmail.Example',
    'microsoft:work@company.example',
    'imap:someone@icloud.com',
    'imap:me@custom-server.example',
    'microsoft-client-id',
  ];

  it('lists Google, Microsoft and known IMAP services, Google first, and leaves out keys and custom servers', () => {
    expect(signInsFromKeys(keys, [])).toEqual([
      { kind: 'gmail', email: 'a@gmail.example' },
      { kind: 'gmail', email: 'b@gmail.example' },
      { kind: 'microsoft', email: 'work@company.example' },
      { kind: 'imap', email: 'someone@icloud.com' },
    ]);
  });

  it('skips accounts already in the app', () => {
    const have = [{ kind: 'gmail' as const, email: 'B@gmail.example' }, { kind: 'imap' as const, email: 'someone@icloud.com' }];
    expect(signInsFromKeys(keys, have).map((s) => s.email)).toEqual(['a@gmail.example', 'work@company.example']);
  });
});
