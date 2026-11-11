import { describe, expect, it } from 'vitest';
import { describeRepeat, fromGraph, fromRrule, toGraph, toRrule } from '../recurrence';

const thu = new Date(2026, 10, 12, 19, 0).getTime(); // Thursday 12 Nov 2026, 19:00

describe('repeats', () => {
  it('reads a weekly rule with an end and writes it back', () => {
    const r = fromRrule('RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261217T235959Z', thu)!;
    expect(r).toMatchObject({ freq: 'weekly', interval: 1, days: ['TH'] });
    expect(new Date(r.until!).getDate()).toBe(17);
    expect(describeRepeat(r)).toBe('Every Thursday, until 17 Dec');
    expect(toRrule(r, true)).toBe('RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261217');
  });

  it('fills in the day for a plain weekly rule, and says every other', () => {
    const r = fromRrule('RRULE:FREQ=WEEKLY;INTERVAL=2', thu)!;
    expect(r.days).toEqual(['TH']);
    expect(describeRepeat(r)).toBe('Every other week, on Thursday');
  });

  it('turns "second Tuesday of the month" into Outlook and back', () => {
    const r = fromRrule('RRULE:FREQ=MONTHLY;BYDAY=2TU', thu)!;
    expect(r).toMatchObject({ freq: 'monthly', nth: 2, days: ['TU'] });
    const g = toGraph(r, thu, 'GMT Standard Time');
    expect(g.pattern).toMatchObject({ type: 'relativeMonthly', index: 'second', daysOfWeek: ['tuesday'] });
    expect(g.range.type).toBe('noEnd');
    expect(fromGraph(g)).toMatchObject({ freq: 'monthly', nth: 2, days: ['TU'] });
  });

  it('reads Outlook weekdays with an end date', () => {
    const r = fromGraph({ pattern: { type: 'weekly', interval: 1, daysOfWeek: ['friday', 'monday', 'tuesday', 'wednesday', 'thursday'] }, range: { type: 'endDate', startDate: '2026-11-02', endDate: '2026-12-18' } })!;
    expect(r.days).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
    expect(describeRepeat(r)).toMatch(/^Every weekday, until 18 Dec/);
    expect(toRrule(r, false)).toMatch(/^RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=2026121\dT\d{6}Z$/);
  });

  it('says no to rules it cannot copy faithfully', () => {
    expect(fromRrule('RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15', thu)).toBeUndefined();
    expect(fromRrule('RRULE:FREQ=HOURLY', thu)).toBeUndefined();
    expect(fromRrule('RRULE:FREQ=DAILY;BYHOUR=9', thu)).toBeUndefined();
  });
});
