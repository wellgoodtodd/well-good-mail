import { describe, expect, it, vi } from 'vitest';
vi.mock('../mail', () => ({ openScreen: vi.fn() }));
import { defaultSendTime, parseDateTime } from '../../components/SendLaterPicker';

describe('Send later picker', () => {
  it('starts an hour from now, on the next five minutes', () => {
    const now = new Date(2026, 10, 9, 20, 7, 30).getTime();
    expect(new Date(defaultSendTime(now)).toTimeString().slice(0, 5)).toBe('21:10');
  });
  it('reads typed UK dates and times', () => {
    expect(parseDateTime('10/11/2026', '00:05')).toBe(new Date(2026, 10, 10, 0, 5).getTime());
    expect(parseDateTime('1/2/27', '9.30')).toBe(new Date(2027, 1, 1, 9, 30).getTime());
    expect(parseDateTime('31/02/2026', '10:00')).toBeUndefined();
    expect(parseDateTime('10/11/2026', '25:00')).toBeUndefined();
  });
});
