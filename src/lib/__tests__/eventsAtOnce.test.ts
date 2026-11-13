import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteEvent, editEvent, patched, sameSeries, touched } from '../mail/calendar';
import { providers, useMail } from '../mail/store';
import { organiserCopy } from '../eventFlows';
import { dedupeEvents } from '../meetings';
import type { CalendarEvent } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const ev = (id: string, d: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, accountId: 'a', calendarName: 'Work', title: 'Stand-up', start: at(d, 9), end: at(d, 9, 30), allDay: false, reminderMinutes: [], canEdit: true, ...extra,
});

describe('Series', () => {
  const weekly = [13, 20, 27].map((d) => ev(`w${d}`, d, { recurring: true, seriesId: 's1' }));
  const other = ev('x', 20, { recurring: true, seriesId: 's2' });
  it('finds this one on, and the whole series', () => {
    const list = [...weekly, other];
    expect(touched(weekly[1], 'following', list).map((e) => e.id)).toEqual(['w20', 'w27']);
    expect(touched(weekly[1], 'all', list).map((e) => e.id)).toEqual(['w13', 'w20', 'w27']);
    expect(touched(weekly[1], 'one', list).map((e) => e.id)).toEqual(['w20']);
  });
  it('matches by name and time of day when the calendar gives no series id', () => {
    const a = ev('1', 13, { recurring: true });
    expect(sameSeries(a, ev('2', 20, { recurring: true }))).toBe(true);
    expect(sameSeries(a, ev('3', 20, { recurring: true, title: 'Other' }))).toBe(false);
  });
  it('moves every one by the same amount', () => {
    const moved = patched(weekly[2], weekly[1], { start: at(20, 10), end: at(20, 10, 30) });
    expect(moved.start).toBe(at(27, 10));
    expect(moved.end).toBe(at(27, 10, 30));
  });
});

describe('Changes show at once', () => {
  beforeEach(() => { useMail.setState({ events: [ev('e1', 13), ev('e2', 14)], accounts: [] }); providers.clear(); });

  it('shows a move before the calendar answers, and puts it back if the calendar refuses', async () => {
    let refuse: (e: Error) => void = () => {};
    providers.set('a', { editEvent: () => new Promise((_, no) => { refuse = no; }), listEvents: async () => [] } as never);
    const saving = editEvent(useMail.getState().events[0], { start: at(13, 11), end: at(13, 11, 30) });
    await vi.waitFor(() => expect(useMail.getState().events.find((e) => e.id === 'e1')!.start).toBe(at(13, 11)));
    refuse(new Error('Forbidden'));
    await expect(saving).rejects.toThrow('Forbidden');
    expect(useMail.getState().events.find((e) => e.id === 'e1')!.start).toBe(at(13, 9));
    expect(useMail.getState().events).toHaveLength(2);
  });

  it('takes a deleted event off at once, and brings it back if the delete fails', async () => {
    let refuse: (e: Error) => void = () => {};
    providers.set('a', { deleteEvent: () => new Promise((_, no) => { refuse = no; }), listEvents: async () => [] } as never);
    const going = deleteEvent(useMail.getState().events[1]);
    await vi.waitFor(() => expect(useMail.getState().events.map((e) => e.id)).toEqual(['e1']));
    refuse(new Error('Offline'));
    await expect(going).rejects.toThrow('Offline');
    expect(useMail.getState().events.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });
});

describe('Cancelling a meeting on several of your calendars', () => {
  it("deletes the organiser's own copy, not a guest's", () => {
    const org = { email: 'todd@example.com', self: true };
    const guestCopy = ev('a|guest@example.com|abc', 13, { organiser: org, guests: [{ email: 'guest@example.com', answer: 'yes' }] });
    const own = ev('a|todd@example.com|abc', 13, { organiser: org, guests: [{ email: 'guest@example.com', answer: 'yes' }] });
    expect(organiserCopy(guestCopy, [guestCopy, own]).id).toBe(own.id);
    expect(organiserCopy(own, [guestCopy, own]).id).toBe(own.id);
  });
  it('shows the copy you can change, so it can be dragged', () => {
    const theirs = ev('b|1', 13, { accountId: 'b', canEdit: false });
    const mine = ev('a|1', 13, { canEdit: true });
    const [one] = dedupeEvents([theirs, mine]);
    expect(one.canEdit).toBe(true);
    expect(one.accountIds).toEqual(['b', 'a']);
  });
});
