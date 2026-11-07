import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ notify: async () => {}, flashTaskbar: () => {}, invoke: async () => {}, isTauri: () => false }));
vi.mock('../db', () => ({ store: { kvGet: async () => undefined, kvSet: async () => {} } }));

const { findMeetingUrl, meetingService, meetingsSoon } = await import('../meetings');
const { meetingAlertsDue } = await import('../reminders');
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
  it('shows the bar from 5 minutes before until the end', () => {
    const e = ev({ meetingUrl: 'https://meet.google.com/a-b-c', start: now + 5 * min, end: now + 35 * min });
    expect(meetingsSoon([e], now)).toHaveLength(1);
    expect(meetingsSoon([{ ...e, start: now + 6 * min }], now)).toHaveLength(0);
    expect(meetingsSoon([{ ...e, start: now - 40 * min, end: now - 10 * min }], now)).toHaveLength(0);
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
