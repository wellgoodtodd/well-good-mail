import { describe, it, expect } from 'vitest';
import { looksFromPhone } from '../settingsSync';

const accounts = [
  { id: 'gmail-todd@wellgood.media', email: 'todd@wellgood.media', kind: 'gmail' as const, label: 'WGM', colour: '#3b82f6' },
  { id: 'gmail-tbweller@gmail.com', email: 'tbweller@gmail.com', kind: 'gmail' as const, label: 'Tbweller', colour: '#a855f7' },
  { id: 'microsoft-todd@wellgood.media', email: 'todd@wellgood.media', kind: 'microsoft' as const, label: 'Microsoft WGM', colour: '#06b6d4' },
];
const sent = [
  { email: 'todd@wellgood.media', kind: 'gmail', label: 'WGM', colour: '#3b82f6' },
  { email: 'tbweller@gmail.com', kind: 'gmail', label: 'Tbweller', colour: '#a855f7' },
];

describe('nicknames and colours changed on the phone', () => {
  it('takes a nickname and colour the phone changed', () => {
    const r = looksFromPhone([{ email: 'TODD@wellgood.media', kind: 'gmail', label: 'Work', colour: '#ef4444' }], accounts, sent);
    expect(r).toEqual([{ id: 'gmail-todd@wellgood.media', email: 'todd@wellgood.media', patch: { label: 'Work', colour: '#ef4444' } }]);
  });

  it('leaves alone what matches what this computer last sent', () => {
    expect(looksFromPhone(sent, accounts, sent)).toEqual([]);
  });

  it('clears a nickname the phone removed, and keeps the colour when the phone gives none', () => {
    const r = looksFromPhone([{ email: 'tbweller@gmail.com', kind: 'gmail' }], accounts, sent);
    expect(r).toEqual([{ id: 'gmail-tbweller@gmail.com', email: 'tbweller@gmail.com', patch: { label: '' } }]);
  });

  it('takes an entry the phone added for a Google account on this computer, even with nothing sent before', () => {
    const r = looksFromPhone([{ email: 'todd@wellgood.media', label: 'Studio' }], accounts, []);
    expect(r).toEqual([{ id: 'gmail-todd@wellgood.media', email: 'todd@wellgood.media', patch: { label: 'Studio' } }]);
  });

  it('ignores other kinds of account, accounts not here, and nonsense', () => {
    expect(looksFromPhone([{ email: 'todd@wellgood.media', kind: 'microsoft', label: 'X' }, { email: 'nobody@example.com', kind: 'gmail', label: 'Y' }, null, 'z'], accounts, sent)).toEqual([]);
    expect(looksFromPhone(undefined, accounts, sent)).toEqual([]);
  });
});
