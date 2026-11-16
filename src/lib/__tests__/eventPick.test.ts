import { describe, it, expect } from 'vitest';
import { eventsForEmail, keyWords, searchEvents } from '../eventPick';
import type { CalendarEvent } from '../types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 16, 12);
let n = 0;
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: `e${++n}`, accountId: 'a', calendarName: 'Work', title: 'Something', start: NOW + DAY, end: NOW + DAY + 3600000, allDay: false, reminderMinutes: [], canEdit: true, ...over,
});
const email = { subject: 'Re: Board meeting agenda for Thursday', from: { email: 'Gordon@example.com', name: 'Gordon' }, to: [{ email: 'me@example.com' }], cc: [] };

describe('keyWords', () => {
  it('keeps the telling words', () => expect(keyWords('Re: Board meeting agenda for Thursday')).toEqual(['board', 'thursday']));
});

describe('eventsForEmail', () => {
  const board = ev({ title: 'Board meeting', start: NOW + 3 * DAY, end: NOW + 3 * DAY + 3600000 });
  const withGordon = ev({ title: 'Catch up', start: NOW + 10 * DAY, end: NOW + 10 * DAY + 3600000, guests: [{ email: 'gordon@example.com', name: 'Gordon' } as never] });
  const dentist = ev({ title: 'Dentist', start: NOW + 2 * DAY, end: NOW + 2 * DAY + 3600000 });
  const later = ev({ title: 'Holiday', start: NOW + 20 * DAY, end: NOW + 21 * DAY });
  const notMine = ev({ title: 'Board dinner', canEdit: false });
  const past = ev({ title: 'Old board thing', start: NOW - 30 * DAY, end: NOW - 30 * DAY + 3600000 });
  const r = eventsForEmail([later, dentist, withGordon, board, notMine, past], email, NOW);

  it('suggests events with the same people or words, and says why', () => {
    expect(r.suggested.map((p) => p.event.title).sort()).toEqual(['Board meeting', 'Catch up']);
    expect(r.suggested.find((p) => p.event.title === 'Catch up')?.why).toBe('With Gordon');
    expect(r.suggested.find((p) => p.event.title === 'Board meeting')?.why).toBe('Same subject');
  });
  it('then the next two weeks, soonest first, without repeats or events you cannot change', () => {
    expect(r.soon.map((p) => p.event.title)).toEqual(['Dentist']);
  });
  it('a day the email mentions counts', () => {
    const d = eventsForEmail([dentist], { ...email, subject: 'Hello' }, NOW, [dentist.start]);
    expect(d.suggested[0]?.why).toBe('On the day the email mentions');
  });
});

describe('searchEvents', () => {
  const a = ev({ title: 'Board meeting', start: NOW + 5 * DAY, end: NOW + 5 * DAY + 1 });
  const b = ev({ title: 'Board away day', start: NOW + 2 * DAY, end: NOW + 2 * DAY + 1 });
  const old = ev({ title: 'Board meeting', start: NOW - 5 * DAY, end: NOW - 5 * DAY + 1 });
  it('every word must match; coming ones first, then past ones', () => {
    expect(searchEvents([old, a, b], 'board', NOW).map((e) => e.id)).toEqual([b.id, a.id, old.id]);
    expect(searchEvents([old, a, b], 'board meet', NOW).map((e) => e.id)).toEqual([a.id, old.id]);
    expect(searchEvents([a], '  ', NOW)).toEqual([]);
  });
});
