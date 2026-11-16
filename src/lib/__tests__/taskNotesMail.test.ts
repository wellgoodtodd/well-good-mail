import { describe, expect, it } from 'vitest';
import { readNotes, writeNotes } from '../taskNotes';

const LINK = 'https://mail.google.com/mail/u/me%40example.com/#all/18c2f0a1b2c3d4e5';

describe('the email a task came from, in its notes', () => {
  it('writes and reads back the subject, link and Message-ID', () => {
    const text = writeNotes({ notes: 'Check the figures', mailSubject: 'Invoice 42', mailLink: LINK, messageRef: '<abc.123@mail.example.com>' });
    expect(text).toBe(`Check the figures\n\nFrom email: Invoice 42\n${LINK}\nMessage-ID: <abc.123@mail.example.com>`);
    expect(readNotes(text)).toEqual({ notes: 'Check the figures', minutes: undefined, mailSubject: 'Invoice 42', mailLink: LINK, messageRef: 'abc.123@mail.example.com' });
  });
  it('reads a Message-ID with no link (Microsoft and iCloud)', () => {
    const r = readNotes('From email: Hello\nMessage-ID: <x@y.com>');
    expect(r.mailSubject).toBe('Hello');
    expect(r.mailLink).toBeUndefined();
    expect(r.messageRef).toBe('x@y.com');
    expect(r.notes).toBe('');
  });
  it('still reads the older notes with only a link', () => {
    const r = readNotes(`From email: Hello\n${LINK}`);
    expect(r.mailLink).toBe(LINK);
    expect(r.messageRef).toBeUndefined();
  });
  it('leaves an ordinary line after the subject in the notes', () => {
    const r = readNotes('From email: Hello\nRing them back');
    expect(r.notes).toBe('Ring them back');
  });
});

describe('the Message-ID of an email a task is made from', () => {
  it('drops the < > and skips anything that is not one', async () => {
    const { rfcIdOf } = await import('../taskNotes');
    expect(rfcIdOf('<abc.123@mail.example.com>')).toBe('abc.123@mail.example.com');
    expect(rfcIdOf(' <x@y> ')).toBe('x@y');
    expect(rfcIdOf(undefined)).toBeUndefined();
    expect(rfcIdOf('not an id')).toBeUndefined();
  });
});
