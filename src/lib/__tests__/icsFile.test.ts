import { describe, expect, it } from 'vitest';
import { eventFromIcs } from '../invites';

const file = (body: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', body, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

describe('eventFromIcs', () => {
  it('reads the title, times, place and notes', () => {
    const ev = eventFromIcs(file(['UID:abc', 'SUMMARY:Dentist', 'DTSTART:20261120T100000Z', 'DTEND:20261120T103000Z', 'LOCATION:High Street', 'DESCRIPTION:Bring the form'].join('\r\n')));
    expect(ev).toMatchObject({ title: 'Dentist', allDay: false, location: 'High Street', notes: 'Bring the form' });
    expect(ev!.end - ev!.start).toBe(30 * 60000);
  });

  it('reads a file with no UID', () => {
    expect(eventFromIcs(file(['SUMMARY:Table for two', 'DTSTART:20261120T190000Z', 'DTEND:20261120T210000Z'].join('\r\n')))?.title).toBe('Table for two');
  });

  it('gives a timed event with no length an hour', () => {
    const ev = eventFromIcs(file(['UID:x', 'SUMMARY:Call', 'DTSTART:20261120T100000Z'].join('\r\n')))!;
    expect(ev.end - ev.start).toBe(3600000);
  });

  it('adds a video link to the notes when it is not already there', () => {
    const ev = eventFromIcs(file(['UID:x', 'SUMMARY:Catch up', 'DTSTART:20261120T100000Z', 'DTEND:20261120T110000Z', 'LOCATION:https://meet.google.com/abc-defg-hij'].join('\r\n')))!;
    expect(ev.notes).toBeUndefined();
  });

  it('gives nothing for a file with no event', () => {
    expect(eventFromIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeUndefined();
  });
});
