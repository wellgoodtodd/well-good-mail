import { describe, expect, it } from 'vitest';
import { snapMove, snapFor, ZOOMS } from '../../components/CalendarViews';
import { readTitle, repeatFields } from '../../components/NewEvent';
import { undoPatch } from '../eventFlows';
import { applyPatch } from '../mail';
import type { CalendarEvent, EventCopy } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('Dragging events', () => {
  it('snaps to 15 minutes, keeping an event that starts off the grid 5 past', () => {
    expect(snapMove(at(13, 10, 0), 22, 15)).toBe(at(13, 10, 15));
    expect(snapMove(at(13, 10, 5), 16, 15)).toBe(at(13, 10, 20));
    expect(snapMove(at(13, 10, 5), 31, 15)).toBe(at(13, 10, 35));
    expect(snapMove(at(13, 10, 5), -7, 15)).toBe(at(13, 10, 5));
  });
  it('snaps to 5 minutes only at the closest zoom', () => {
    expect(snapFor(48)).toBe(15);
    expect(snapFor(ZOOMS[ZOOMS.length - 1])).toBe(5);
  });
});

describe('Words in a new event title', () => {
  const now = at(12, 15); // Thu 12 Nov, 15:00
  const doubleClicked = at(20, 9); // Fri 20 Nov
  it('reads "today" from today, not from the day that was double-clicked', () => {
    const r = readTitle('Call Mum today at 6pm', doubleClicked, now)!;
    expect(r.start).toBe(at(12, 18));
    expect(r.rest).toBe('Call Mum');
  });
  it('keeps a time on its own on the day the event started on', () => {
    const r = readTitle('Lunch with Helen at 2pm', doubleClicked, now)!;
    expect(r.start).toBe(at(20, 14));
    expect(r.hasDay).toBe(false);
  });
  it('reads tomorrow', () => {
    expect(new Date(readTitle('Dentist tomorrow', doubleClicked, now)!.start!).getDate()).toBe(13);
  });
  it('ignores titles with no date or time', () => {
    expect(readTitle('Edit podcast', doubleClicked, now)).toBeUndefined();
  });
});

describe('Reading a series into the form', () => {
  const fri = at(13, 9);
  it('finds the presets', () => {
    expect(repeatFields({ freq: 'weekly', interval: 2, days: ['FR'] }, fri).repeat).toBe('fortnightly');
    expect(repeatFields({ freq: 'weekly', interval: 1, days: ['MO', 'TU', 'WE', 'TH', 'FR'] }, fri).repeat).toBe('weekdays');
    expect(repeatFields(undefined, fri).repeat).toBe('never');
  });
  it('uses Custom for anything else, with its end', () => {
    const f = repeatFields({ freq: 'weekly', interval: 2, days: ['MO', 'FR'], count: 5 }, fri);
    expect(f.repeat).toBe('custom');
    expect(f.custom).toMatchObject({ freq: 'weekly', interval: 2, days: ['MO', 'FR'] });
    expect(f.endRepeat).toBe('after');
    expect(f.count).toBe(5);
  });
});

describe('Changing events', () => {
  const ev = { id: 'a|c|1', accountId: 'a', calendarName: 'Work', title: 'Edit', start: at(13, 10), end: at(13, 11), allDay: false, reminderMinutes: [] } as CalendarEvent;
  it('can undo a move or a rename, but not changes to guests or the repeat', () => {
    expect(undoPatch(ev, { start: at(13, 12), end: at(13, 13) })).toEqual({ start: ev.start, end: ev.end, allDay: false });
    expect(undoPatch(ev, { title: 'New' })).toEqual({ title: 'Edit' });
    expect(undoPatch(ev, { guests: [] })).toBeUndefined();
  });
  it('puts the full form onto a copy for "this and all future events"', () => {
    const copy: EventCopy = { title: 'Edit', start: ev.start, end: ev.end, allDay: false, guests: [], video: true, repeat: { freq: 'weekly', interval: 1, days: ['FR'] } };
    const c = applyPatch(copy, { title: 'Edit day', video: false, alerts: [15], repeat: null });
    expect(c).toMatchObject({ title: 'Edit day', video: false, alerts: [15], repeat: undefined });
  });
});
