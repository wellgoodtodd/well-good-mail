import { describe, expect, it } from 'vitest';
import { scopeAccountIds } from '../mailbox';

const groups = [{ id: 'g', name: 'Work', accountIds: ['a', 'c'] }];

describe('accounts left out of All Inboxes', () => {
  it('are missing from the combined view', () => {
    expect(scopeAccountIds({ type: 'all' }, ['a', 'b', 'c'], groups, ['b'])).toEqual(['a', 'c']);
  });
  it('still show on their own', () => {
    expect(scopeAccountIds({ type: 'account', accountId: 'b' }, ['a', 'b', 'c'], groups, ['b'])).toEqual(['b']);
  });
  it('still show in a group they were put in', () => {
    expect(scopeAccountIds({ type: 'group', groupId: 'g' }, ['a', 'b', 'c'], groups, ['c'])).toEqual(['a', 'c']);
  });
  it('change nothing when none are left out', () => {
    expect(scopeAccountIds({ type: 'all' }, ['a', 'b'], groups)).toEqual(['a', 'b']);
  });
});
