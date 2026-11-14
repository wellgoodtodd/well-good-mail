import { describe, expect, it } from 'vitest';
import { alertText, readAlerts, readNotes, writeNotes } from '../taskNotes';

describe('task alerts in the notes', () => {
  it('writes and reads them back', () => {
    const text = writeNotes({ notes: 'Bring the form', minutes: 9 * 60 + 30, alerts: [60, 0] });
    expect(text).toBe('Due 09:30\nAlert: at the time, 1 hour before\nBring the form');
    expect(readNotes(text)).toEqual({ notes: 'Bring the form', minutes: 570, mailSubject: undefined, alerts: [0, 60] });
  });

  it('keeps "none" apart from not set', () => {
    expect(readNotes('Due 14:00\nAlert: none').alerts).toEqual([]);
    expect(readNotes('Due 14:00\nCall back').alerts).toBeUndefined();
    expect(writeNotes({ minutes: 840, alerts: [] })).toBe('Due 14:00\nAlert: none');
    expect(writeNotes({ minutes: 840 })).toBe('Due 14:00');
  });

  it('only writes an alert line for a task with a time', () => {
    expect(writeNotes({ notes: 'x', alerts: [10] })).toBe('x');
  });

  it('reads the usual wordings and leaves other text in the notes', () => {
    expect(readAlerts('10 minutes before, 2 hours before')).toEqual([10, 120]);
    expect(readAlerts('1 day before and at the time')).toEqual([0, 1440]);
    expect(readNotes('Due 08:00\nAlert: whenever you like').notes).toBe('Alert: whenever you like');
    expect(alertText([2880, 15])).toBe('15 minutes before, 2 days before');
  });
});
