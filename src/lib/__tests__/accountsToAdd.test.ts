import { describe, it, expect } from 'vitest';
import { missingAccounts } from '../accountsToAdd';

const here = [{ kind: 'gmail' as const, email: 'me@example.com' }];

describe('Accounts to add', () => {
  it('lists accounts from elsewhere that are not on this computer', () => {
    const found = [
      { email: 'Me@Example.com', kind: 'gmail', label: 'Me' },
      { email: 'work@example.org', kind: 'microsoft', label: 'Work', colour: '#336699' },
      { email: 'pics@icloud.com', kind: 'imap' },
      { email: 'odd@custom.example', kind: 'imap' },
      { email: 'own@custom.example', kind: 'imap', imap: { host: 'mail.custom.example', port: 993, smtpHost: 'mail.custom.example', smtpPort: 465, username: 'own' } },
      { email: 'demo@demo.example', kind: 'demo' },
      { email: 'phone@example.com' },
    ];
    const out = missingAccounts(found, here, [], 'other');
    expect(out.map((a) => `${a.kind}:${a.email}`)).toEqual(['microsoft:work@example.org', 'imap:pics@icloud.com', 'imap:own@custom.example', 'gmail:phone@example.com']);
    expect(out[0]).toMatchObject({ label: 'Work', colour: '#336699', from: 'other' });
  });

  it('leaves out ones you said are not for this computer, unless setting up from a backup', () => {
    const found = [{ email: 'work@example.org', kind: 'microsoft' }];
    expect(missingAccounts(found, here, ['microsoft:work@example.org'], 'other')).toEqual([]);
    expect(missingAccounts(found, here, ['microsoft:work@example.org'], 'backup')).toHaveLength(1);
    expect(missingAccounts('nonsense', here, [], 'other')).toEqual([]);
  });
});
