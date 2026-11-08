import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ notify: async () => {}, flashTaskbar: () => {}, invoke: async () => {}, isTauri: () => false }));
vi.mock('../db', () => ({ store: { kvGet: async () => undefined, kvSet: async () => {} } }));

const { findMeetingUrl, meetingService, meetingsSoon, dedupeEvents, meetingPhase, meetingPhaseText, visibleEvents, guestTally, inviteText } = await import('../meetings');
const { meetingAlertsDue, dueReminders, alertMute } = await import('../reminders');
const { graphGuests } = await import('../providers/microsoft');
const { parseEvents } = await import('../dav');
import type { CalendarEvent } from '../types';

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: 'a', accountId: 'x', calendarName: 'Cal', title: 'Call', start: 0, end: 0, allDay: false, reminderMinutes: [], ...over });

describe('finding the video call', () => {
  it('spots Teams, Zoom, Meet and Webex links', () => {
    expect(findMeetingUrl('Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7b%7d now')).toContain('teams.microsoft.com/l/meetup-join');
    expect(findMeetingUrl('https://us02web.zoom.us/j/123456789?pwd=abc.')).toBe('https://us02web.zoom.us/j/123456789?pwd=abc');
    expect(findMeetingUrl(undefined, 'see https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
    expect(findMeetingUrl('https://acme.webex.com/meet/sam')).toContain('webex.com');
  });
  it('ignores ordinary links', () => {
    expect(findMeetingUrl('https://example.com/zoom', 'Room 4')).toBeUndefined();
  });
  it('names the service', () => {
    expect(meetingService('https://meet.google.com/abc-defg-hij')).toBe('Google Meet');
    expect(meetingService('https://x.zoom.us/j/1')).toBe('Zoom');
  });
  it('reads the link from a calendar file', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Sync\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T103000Z\r\nDESCRIPTION:Join https://us02web.zoom.us/j/99\\nThanks\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const [e] = parseEvents(ics, 'Cal', 'acc');
    expect(e.meetingUrl).toBe('https://us02web.zoom.us/j/99');
  });
});

describe('meetings that are about to start', () => {
  const now = 1_000_000_000;
  const min = 60000;
  it('shows the bar from 5 minutes before until 10 minutes after the start', () => {
    const e = ev({ meetingUrl: 'https://meet.google.com/a-b-c', start: now + 5 * min, end: now + 35 * min });
    expect(meetingsSoon([e], now)).toHaveLength(1);
    expect(meetingsSoon([{ ...e, start: now + 6 * min }], now)).toHaveLength(0);
    expect(meetingsSoon([{ ...e, start: now - 40 * min, end: now - 10 * min }], now)).toHaveLength(0);
    expect(meetingsSoon([{ ...e, start: now - 9 * min }], now)).toHaveLength(1);
    expect(meetingsSoon([{ ...e, start: now - 11 * min }], now)).toHaveLength(0);
  });
  it('leaves out a meeting you said No to, but not Yes, Maybe or no answer', () => {
    const e = ev({ meetingUrl: 'https://meet.google.com/a-b-c', start: now + 3 * min, end: now + 33 * min });
    expect(meetingsSoon([{ ...e, myResponse: 'no' }], now)).toHaveLength(0);
    for (const r of ['yes', 'maybe', 'waiting', undefined] as const) expect(meetingsSoon([{ ...e, myResponse: r }], now)).toHaveLength(1);
    expect(meetingAlertsDue([{ ...e, myResponse: 'no' }], now)).toEqual([]);
  });
  it('moves from before, to starting now, to started minutes ago, to already started', () => {
    const s = 5_000_000;
    expect(meetingPhase(s, s - 5 * min + 1)).toEqual({ phase: 'before', minutes: 5 });
    expect(meetingPhase(s, s - 20_000)).toEqual({ phase: 'before', minutes: 1 });
    expect(meetingPhase(s, s)).toEqual({ phase: 'now' });
    expect(meetingPhase(s, s + 59_000)).toEqual({ phase: 'now' });
    expect(meetingPhase(s, s + min)).toEqual({ phase: 'late', minutes: 1 });
    expect(meetingPhase(s, s + 4 * min + 30_000)).toEqual({ phase: 'late', minutes: 4 });
    expect(meetingPhase(s, s + 5 * min)).toEqual({ phase: 'long' });
    expect(meetingPhaseText({ phase: 'late', minutes: 2 })).toBe('started 2 minutes ago');
    expect(meetingPhaseText({ phase: 'now' })).toBe('is starting now');
  });
  it('never shows it for events without a video link', () => {
    expect(meetingsSoon([ev({ start: now + min, end: now + 30 * min })], now)).toHaveLength(0);
  });
  it('notifies at 15 and again at 5 minutes, once each', () => {
    const e = ev({ meetingUrl: 'https://x.zoom.us/j/1', start: now + 14 * min, end: now + 40 * min });
    expect(meetingAlertsDue([e], now).map((a) => a.minutes)).toEqual([15]);
    expect(meetingAlertsDue([{ ...e, start: now + 4 * min }], now).map((a) => a.minutes)).toEqual([5]);
    expect(meetingAlertsDue([{ ...e, start: now + 30 * min }], now)).toEqual([]);
  });
});

describe('the same event on several calendars', () => {
  it('shows once and remembers every account it is on', () => {
    const a = ev({ id: '1', accountId: 'wgm', title: 'Test meeting', start: 1000, end: 2000 });
    const b = ev({ id: '2', accountId: 'tb', title: 'test meeting ', start: 1000, end: 2000, meetingUrl: 'https://meet.google.com/abc-defg-hij' });
    const other = ev({ id: '3', accountId: 'tb', title: 'Something else', start: 1000, end: 2000 });
    const out = dedupeEvents([a, b, other]);
    expect(out).toHaveLength(2);
    expect(out[0].accountIds).toEqual(['wgm', 'tb']);
    expect(out[0].meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(out[1].accountIds).toEqual(['tb']);
  });
});

describe('answers across merged calendars', () => {
  const a = ev({ id: '1', accountId: 'wgm', title: 'Pitch', start: 1000, end: 2000, myResponse: 'no' });
  const b = ev({ id: '2', accountId: 'tb', title: 'Pitch', start: 1000, end: 2000, myResponse: 'no' });
  it('counts as declined only when every copy says No', () => {
    expect(dedupeEvents([a, b])[0].declined).toBe(true);
    expect(dedupeEvents([a, { ...b, myResponse: 'yes' }])[0].declined).toBe(false);
    expect(dedupeEvents([a, { ...b, myResponse: 'yes' }])[0].myResponse).toBe('yes');
    expect(dedupeEvents([a, { ...b, myResponse: undefined }])[0].declined).toBe(false);
    expect(dedupeEvents([a])[0].declined).toBe(true);
  });
});

describe('hiding calendars', () => {
  it('leaves out events on calendars you switched off', () => {
    const events = [ev({ id: '1', accountId: 'a', calendarName: 'Work' }), ev({ id: '2', accountId: 'a', calendarName: 'Holidays' }), ev({ id: '3', accountId: 'b', calendarName: 'Work' })];
    expect(visibleEvents(events, []).map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(visibleEvents(events, ['a|Holidays']).map((e) => e.id)).toEqual(['1', '3']);
  });
});

describe('guests and copying an invite', () => {
  it('counts answers in a fixed order and skips empty kinds', () => {
    const g = [{ answer: 'no' as const }, { answer: 'yes' as const }, { answer: 'yes' as const }, { answer: 'waiting' as const }];
    expect(guestTally(g)).toEqual([{ answer: 'yes', n: 2 }, { answer: 'no', n: 1 }, { answer: 'waiting', n: 1 }]);
  });
  it('writes plain text with the title, time and link', () => {
    const start = new Date(2026, 10, 9, 14, 8).getTime();
    const t = inviteText(ev({ title: 'Beta test', start, end: start + 30 * 60000, meetingUrl: 'https://meet.google.com/abc-defg-hij' }));
    expect(t.split('\n')[0]).toBe('Beta test');
    expect(t).toContain('14:08 to 14:38');
    expect(t).toContain('Google Meet: https://meet.google.com/abc-defg-hij');
  });
});

describe('hidden calendars and alerts', () => {
  const now = 1_000_000_000;
  it('keeps ordinary events quiet on hidden calendars, but never video meetings', () => {
    const plain = ev({ id: 'p', accountId: 'a', calendarName: 'Holidays', start: now - 1000, end: now + 60000, reminderMinutes: [0] });
    const call = ev({ id: 'v', accountId: 'a', calendarName: 'Holidays', title: 'Call', start: now - 1000, end: now + 60000, reminderMinutes: [0], meetingUrl: 'https://meet.google.com/a-b-c' });
    expect(dueReminders([plain, call], [], new Set(), now).map((r) => r.id.split('|')[1]).sort()).toEqual(['p', 'v']);
    expect(dueReminders([plain, call], [], new Set(), now, alertMute({ hiddenCalendars: ['a|Holidays'], hiddenCalendarsAlerts: 'meetings' })).map((r) => r.id.split('|')[1])).toEqual(['v']);
    expect(dueReminders([plain, call], [], new Set(), now, alertMute({ hiddenCalendars: ['a|Holidays'], hiddenCalendarsAlerts: 'none' }))).toEqual([]);
    expect(dueReminders([plain, call], [], new Set(), now, alertMute({ hiddenCalendars: ['a|Holidays'], hiddenCalendarsAlerts: 'all' })).length).toBe(2);
  });
  it('follows the setting', () => {
    expect(alertMute({ hiddenCalendars: ['a|X'], hiddenCalendarsAlerts: 'meetings' })).toEqual({ ordinary: ['a|X'], all: [] });
    expect(alertMute({ hiddenCalendars: ['a|X'], hiddenCalendarsAlerts: 'none' })).toEqual({ ordinary: ['a|X'], all: ['a|X'] });
    expect(alertMute({ hiddenCalendars: ['a|X'], hiddenCalendarsAlerts: 'all' })).toEqual({ ordinary: [], all: [] });
  });
});

describe('muting video meetings from hidden calendars', () => {
  const now = 1_000_000_000;
  const min = 60000;
  it('silences the banner and notifications only when everything is muted', () => {
    const e = ev({ accountId: 'a', calendarName: 'Work', meetingUrl: 'https://meet.google.com/a-b-c', start: now + 3 * min, end: now + 33 * min });
    expect(meetingsSoon([e], now, 5, [])).toHaveLength(1);
    expect(meetingsSoon([e], now, 5, ['a|Work'])).toHaveLength(0);
    expect(meetingAlertsDue([e], now, [15, 5], ['a|Work'])).toEqual([]);
    expect(meetingAlertsDue([e], now, [15, 5], [])).toHaveLength(1);
  });
  it('still alerts when another account has the same meeting on a calendar that is not hidden', () => {
    const a = ev({ id: '1', accountId: 'a', calendarName: 'Work', title: 'Sync', meetingUrl: 'https://meet.google.com/a-b-c', start: now + 3 * min, end: now + 33 * min });
    const b = ev({ id: '2', accountId: 'b', calendarName: 'Work', title: 'Sync', meetingUrl: 'https://meet.google.com/a-b-c', start: now + 3 * min, end: now + 33 * min });
    expect(meetingsSoon([a, b], now, 5, ['a|Work'])).toHaveLength(1);
  });
});

describe('guest lists from iCloud and Microsoft', () => {
  it('reads attendees and your answer from a calendar file', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Review', 'DTSTART:20261110T100000Z', 'DTEND:20261110T103000Z', 'ORGANIZER;CN=Sam:mailto:sam@x.com', 'ATTENDEE;CN=Sam;PARTSTAT=ACCEPTED:mailto:sam@x.com', 'ATTENDEE;CN=Me;PARTSTAT=TENTATIVE:mailto:me@icloud.com', 'ATTENDEE;PARTSTAT=DECLINED:mailto:lee@x.com', 'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:kim@x.com', 'ATTENDEE;CUTYPE=ROOM;PARTSTAT=ACCEPTED:mailto:room@x.com', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const [e] = parseEvents(ics, 'Home', 'acc', ['Me@iCloud.com']);
    expect(e.guests?.map((g) => [g.email, g.answer])).toEqual([['sam@x.com', 'yes'], ['me@icloud.com', 'maybe'], ['lee@x.com', 'no'], ['kim@x.com', 'waiting']]);
    expect(e.guests?.find((g) => g.self)?.email).toBe('me@icloud.com');
    expect(e.guests?.find((g) => g.organiser)?.email).toBe('sam@x.com');
    expect(e.myResponse).toBe('maybe');
  });
  it('gives no guests when nobody was invited', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Alone\r\nDTSTART:20261110T100000Z\r\nDTEND:20261110T103000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const [e] = parseEvents(ics, 'Home', 'acc', ['me@icloud.com']);
    expect(e.guests).toBeUndefined();
  });
  it('reads Microsoft attendees and answers', () => {
    const out = graphGuests({
      isOrganizer: false,
      responseStatus: { response: 'accepted' },
      organizer: { emailAddress: { name: 'Sam', address: 'Sam@x.com' } },
      attendees: [
        { status: { response: 'accepted' }, emailAddress: { name: 'Me', address: 'me@outlook.com' } },
        { status: { response: 'declined' }, emailAddress: { address: 'lee@x.com' } },
        { status: { response: 'notResponded' }, emailAddress: { address: 'kim@x.com' } },
        { status: { response: 'tentativelyAccepted' }, emailAddress: { address: 'jo@x.com' } },
      ],
    }, ['Me@outlook.com']);
    expect(out.guests?.map((g) => [g.email, g.answer])).toEqual([['sam@x.com', 'yes'], ['me@outlook.com', 'yes'], ['lee@x.com', 'no'], ['kim@x.com', 'waiting'], ['jo@x.com', 'maybe']]);
    expect(out.guests?.[0].organiser).toBe(true);
    expect(out.myResponse).toBe('yes');
  });
});
