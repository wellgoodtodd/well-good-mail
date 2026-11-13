import { describe, expect, it } from 'vitest';
import { buildReply, looksLikeInvitation, parseInvite, whichIsMe, statusOf } from '../invites';

const ICS = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'DTSTART:20261107T225100Z',
  'DTEND:20261107T232100Z',
  'UID:s6bhrjcak9itu3i13a5mtn512g@google.com',
  'SEQUENCE:0',
  'SUMMARY:Well Good Mail test meeting',
  'DESCRIPTION:Join with Google Meet: https://meet.google.com/avr-eksc-pju\\nSee you there\\, all.',
  'ORGANIZER;CN=Todd Weller:mailto:todd@wellgood.media',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=tbweller@gmail.com:mailto:tbweller@gmail.com',
  'ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN=Todd Weller:mailto:todd@wellgood.media',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('reading an invitation', () => {
  it('finds the event, the organiser, the guests and the video link', () => {
    const i = parseInvite(ICS)!;
    expect(i.method).toBe('REQUEST');
    expect(i.title).toBe('Well Good Mail test meeting');
    expect(i.start).toBe(Date.UTC(2026, 10, 7, 22, 51));
    expect(i.end).toBe(Date.UTC(2026, 10, 7, 23, 21));
    expect(i.meetingUrl).toBe('https://meet.google.com/avr-eksc-pju');
    expect(i.organizer).toEqual({ email: 'todd@wellgood.media', name: 'Todd Weller', status: undefined });
    expect(i.attendees.map((a) => a.email)).toEqual(['tbweller@gmail.com', 'todd@wellgood.media']);
    expect(i.description).toContain('See you there, all.');
  });

  it('ignores text that is not an invitation', () => {
    expect(parseInvite('hello there')).toBeUndefined();
    expect(parseInvite('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:No time\r\nEND:VEVENT\r\nEND:VCALENDAR')).toBeUndefined();
  });

  it('works out which guest is you, whatever the capital letters', () => {
    const i = parseInvite(ICS)!;
    expect(whichIsMe(i, ['TBWeller@gmail.com'])?.email).toBe('tbweller@gmail.com');
    expect(whichIsMe(i, ['someone@else.com'])).toBeUndefined();
    expect(statusOf(whichIsMe(i, ['todd@wellgood.media']))).toBe('accepted');
    expect(statusOf(whichIsMe(i, ['tbweller@gmail.com']))).toBeUndefined();
  });
});

describe('answering an invitation by email', () => {
  it('builds a reply the organiser’s calendar understands', () => {
    const i = parseInvite(ICS)!;
    const out = buildReply(i, { email: 'tbweller@gmail.com', name: 'Todd' }, 'tentative', Date.UTC(2026, 10, 7, 22, 0, 0));
    expect(out).toContain('METHOD:REPLY');
    expect(out).toContain('UID:s6bhrjcak9itu3i13a5mtn512g@google.com');
    expect(out).toContain('DTSTART:20261107T225100Z');
    expect(out).toContain('DTSTAMP:20261107T220000Z');
    expect(out).toContain('ORGANIZER:mailto:todd@wellgood.media');
    expect(out).toContain('ATTENDEE;PARTSTAT=TENTATIVE;CN=Todd:mailto:tbweller@gmail.com');
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('spotting an invitation before its body is read', () => {
  const att = (filename: string, mimeType: string) => ({ filename, mimeType });
  it('knows a calendar file among the attachments', () => {
    expect(looksLikeInvitation({ subject: 'Team lunch', attachments: [att('invite.ics', 'application/octet-stream')] })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Team lunch', attachments: [att('x', 'text/calendar; method=REQUEST')] })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Team lunch', attachments: [att('menu.pdf', 'application/pdf')] })).toBe(false);
  });
  it('knows the usual invitation subjects', () => {
    expect(looksLikeInvitation({ subject: 'Invitation: Planning @ Fri 14 Nov 2026 10am (GMT)' })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Updated invitation: Planning' })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Canceled event: Planning' })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Cancelled event with note: Planning' })).toBe(true);
    expect(looksLikeInvitation({ subject: 'Re: Invitation: Planning' })).toBe(false);
    expect(looksLikeInvitation({ subject: 'Your invitation to our sale' })).toBe(false);
  });
});
