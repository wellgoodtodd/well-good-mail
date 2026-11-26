import { describe, expect, it } from 'vitest';
import { parseAppLink, threadLink } from '../appLinks';
import { hubLabelName } from '../hubProjects';

describe('wellgoodmail: links', () => {
  it('reads a conversation link, with or without the address encoded', () => {
    expect(parseAppLink('wellgoodmail://thread/sam@example.com/18c2f0a')).toEqual({ kind: 'thread', account: 'sam@example.com', threadId: '18c2f0a' });
    expect(parseAppLink(threadLink('sam@example.com', '18c2f0a'))).toEqual({ kind: 'thread', account: 'sam@example.com', threadId: '18c2f0a' });
    expect(parseAppLink('WellGoodMail://thread/sam%40example.com/18c2f0a/')).toEqual({ kind: 'thread', account: 'sam@example.com', threadId: '18c2f0a' });
  });

  it('reads a calendar day as local midnight', () => {
    expect(parseAppLink('wellgoodmail://calendar/2026-12-03')).toEqual({ kind: 'day', day: new Date(2026, 11, 3).getTime() });
    expect(parseAppLink('wellgoodmail://calendar/3-12-2026')).toBeUndefined();
  });

  it('reads an event link in either form', () => {
    expect(parseAppLink('wellgoodmail://calendar/event/abc123')).toEqual({ kind: 'event', eventId: 'abc123' });
    expect(parseAppLink('wellgoodmail://event/abc123')).toEqual({ kind: 'event', eventId: 'abc123' });
  });

  it('ignores anything else', () => {
    expect(parseAppLink('mailto:sam@example.com')).toBeUndefined();
    expect(parseAppLink('wellgoodmail://thread/sam@example.com')).toBeUndefined();
  });
});

describe('Hub project names', () => {
  it('puts Hub/ in front once', () => {
    expect(hubLabelName(' 1234 Smith wedding ')).toBe('Hub/1234 Smith wedding');
    expect(hubLabelName('hub/1234')).toBe('Hub/1234');
    expect(hubLabelName('/1234/')).toBe('Hub/1234');
  });
});
