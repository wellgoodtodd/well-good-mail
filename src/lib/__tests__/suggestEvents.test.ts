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
  it('skips what is already in the calendar', () => {
    const start = new Date(2026, 10, 16, 19, 30).getTime();
    const cal = [{ id: 'e', accountId: 'a', calendarName: 'c', title: 'Quiz', start, end: start + 3600000, allDay: false, reminderMinutes: [] }];
    expect(suggestEvent(from('sam@example.com'), 'Monday 16th November at 7.30pm', NOW, cal)).toBeUndefined();
  });
});

describe('suggested events from the subject', () => {
  it('joins a day in the subject with a time in the email', () => {
    const s = suggestEvent({ from: { email: 'jamie@example.com', name: 'Jamie' }, subject: 'Five a side on Thursday?', date: NOW - 3600000 }, 'We are a man down this week. Fancy it? Same pitch, 7pm kick off.', NOW);
    expect(new Date(s!.start).getDay()).toBe(4);
    expect(new Date(s!.start).getHours()).toBe(19);
  });
});
