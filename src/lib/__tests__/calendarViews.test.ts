import { describe, expect, it } from 'vitest';
import { isoWeek, layoutLanes, weekStartOf } from '../../components/CalendarViews';

describe('calendar views', () => {
  it('works out ISO week numbers', () => {
    expect(isoWeek(new Date(2026, 10, 10))).toBe(46);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });
  it('finds the start of the week', () => {
    expect(weekStartOf(new Date(2026, 10, 11), false).getDate()).toBe(9);
    expect(weekStartOf(new Date(2026, 10, 11), true).getDate()).toBe(8);
  });
  it('puts overlapping events side by side', () => {
    const h = 3600000;
    const lanes = layoutLanes([{ id: 'a', start: 9 * h, end: 10 * h }, { id: 'b', start: 9.5 * h, end: 11 * h }, { id: 'c', start: 12 * h, end: 13 * h }]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 1 });
  });
});
