import { describe, expect, it } from 'vitest';
import { readTaskWords } from '../taskWords';

// Saturday 14 November 2026, 8am.
const NOW = new Date(2026, 10, 14, 8, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const read = (t: string, now = NOW) => { const r = readTaskWords(t, now); return { title: r.title, due: r.due, hasTime: r.hasTime }; };

describe('quick add understands everyday times', () => {
  it('reads a time written without a colon after "at" or a day', () => {
    expect(read('call dentist this morning at 930')).toEqual({ title: 'call dentist', due: at(14, 9, 30), hasTime: true });
    expect(read('call dentist tomorrow at 930')).toEqual({ title: 'call dentist', due: at(15, 9, 30), hasTime: true });
    expect(read('call dentist tomorrow 1145')).toEqual({ title: 'call dentist', due: at(15, 11, 45), hasTime: true });
  });

  it('gives a part of the day a time when none is said', () => {
    expect(read('ring mum tonight')).toEqual({ title: 'ring mum', due: at(14, 19), hasTime: true });
    expect(read('pay rent friday morning')).toEqual({ title: 'pay rent', due: at(20, 9), hasTime: true });
    expect(read('call the bank this afternoon')).toEqual({ title: 'call the bank', due: at(14, 14), hasTime: true });
    expect(read('book tickets tomorrow evening')).toEqual({ title: 'book tickets', due: at(15, 18), hasTime: true });
  });

  it('puts a small hour in the afternoon or evening when that is meant', () => {
    expect(read('email Sam next Tuesday at 2')).toEqual({ title: 'email Sam', due: at(17, 14), hasTime: true });
    expect(read('call Jo tonight at 8')).toEqual({ title: 'call Jo', due: at(14, 20), hasTime: true });
    expect(read('call Jo tomorrow morning at 8')).toEqual({ title: 'call Jo', due: at(15, 8), hasTime: true });
    expect(read('call Jo at 8am tomorrow').due).toBe(at(15, 8));
  });

  it('understands half and quarter', () => {
    expect(read('buy milk at half 9 tomorrow')).toEqual({ title: 'buy milk', due: at(15, 9, 30), hasTime: true });
    expect(read('meet Ali at quarter past 4 today')).toEqual({ title: 'meet Ali', due: at(14, 16, 15), hasTime: true });
    expect(read('leave at quarter to 6 tonight')).toEqual({ title: 'leave', due: at(14, 17, 45), hasTime: true });
  });

  it('leaves numbers that are not times alone', () => {
    expect(read('order 930 labels')).toEqual({ title: 'order 930 labels', due: undefined, hasTime: false });
    expect(read('read chapter 1145 of the manual')).toMatchObject({ title: 'read chapter 1145 of the manual', due: undefined });
    expect(read('fix the morning routine doc')).toMatchObject({ title: 'fix the morning routine doc', due: undefined });
  });
});
