import { describe, expect, it } from 'vitest';
import { ownWords, suggestEvent } from '../suggestEvents';

const NOW = new Date(2026, 10, 10, 12, 0).getTime(); // Tue 10 Nov 2026
const from = (email: string, name = 'Sam') => ({ from: { email, name }, subject: 'Re: Quiz night', date: NOW - 3600000 });

describe('suggested events', () => {
  it('finds a day and a time in a person\'s email', () => {
    const s = suggestEvent(from('sam@example.com'), 'Hi Alex, see you Monday 16th November at 7.30pm, online.', NOW);
    expect(s?.title).toBe('Quiz night');
    expect(new Date(s!.start).getDate()).toBe(16);
    expect(new Date(s!.start).getHours()).toBe(19);
    expect(s!.end - s!.start).toBe(3600000);
  });
  it('reads a weekday with a time', () => {
    const s = suggestEvent(from('jamie@example.com'), 'Five a side on Thursday? Same pitch, 7pm kick off.', NOW);
    expect(new Date(s!.start).getDay()).toBe(4);
  });
  it('needs both a day and a time', () => {
    expect(suggestEvent(from('sam@example.com'), 'Can we talk on Thursday?', NOW)).toBeUndefined();
    expect(suggestEvent(from('sam@example.com'), 'Call me at 3pm.', NOW)).toBeUndefined();
  });
  it('ignores newsletters, receipts and the past', () => {
    expect(suggestEvent(from('noreply@shop.com'), 'Sale ends Friday 13 November at 9pm', NOW)).toBeUndefined();
    expect(suggestEvent({ ...from('sam@example.com'), listUnsubscribe: '<mailto:x>' }, 'Webinar Friday 13 November at 9pm', NOW)).toBeUndefined();
    expect(suggestEvent(from('sam@example.com'), 'It was great on Monday 2 November at 7pm', NOW)).toBeUndefined();
  });
  it('leaves out quoted earlier emails', () => {
    expect(ownWords('Sounds good.\n\nOn Mon, 9 Nov 2026 at 10:00, Sam wrote:\n> Friday 13 November at 7pm?')).toBe('Sounds good.\n');
    expect(suggestEvent(from('sam@example.com'), 'Sounds good.\n> Friday 13 November at 7pm?', NOW)).toBeUndefined();
  });
  it('points to what is already in the calendar, with the link the email has', () => {
    const start = new Date(2026, 10, 16, 19, 30).getTime();
    const cal = [{ id: 'e', accountId: 'a', calendarName: 'c', title: 'Quiz', start, end: start + 3600000, allDay: false, reminderMinutes: [] }];
    const s = suggestEvent(from('sam@example.com'), 'Monday 16th November at 7.30pm', NOW, cal);
    expect(s?.existing?.id).toBe('e');
    // An agenda email: the date with a superscript "th", a second time line, and a Meet link.
    const agenda = ['Folks,', 'Agenda for Board meeting, Monday 16th  November at 7.30pm online', '', 'Board Meeting',
      'Monday, November 16 · 7:15 – 9:15pm', 'Video call link: https://meet.google.com/abc-defg-hij', 'Apologies', 'Minutes'].join('\n');
    const a = suggestEvent(from('sam@example.com'), agenda, NOW, cal);
    expect(a?.existing?.id).toBe('e');
    expect(a?.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(suggestEvent(from('sam@example.com'), agenda, NOW)?.existing).toBeUndefined();
    // Something else at that time isn't the same event: it's still suggested.
    const other = [{ ...cal[0], title: 'Bins out' }];
    const o = suggestEvent(from('sam@example.com'), 'Monday 16th November at 7.30pm', NOW, other);
    expect(o?.title).toBe('Quiz night');
    expect(o?.existing).toBeUndefined();
  });
});

describe('suggested events from the subject', () => {
  it('joins a day in the subject with a time in the email', () => {
    const s = suggestEvent({ from: { email: 'jamie@example.com', name: 'Jamie' }, subject: 'Five a side on Thursday?', date: NOW - 3600000 }, 'We are a man down this week. Fancy it? Same pitch, 7pm kick off.', NOW);
    expect(new Date(s!.start).getDay()).toBe(4);
    expect(new Date(s!.start).getHours()).toBe(19);
  });
});
