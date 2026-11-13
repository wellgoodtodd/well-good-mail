import { describe, expect, it } from 'vitest';
import { readTaskWords } from '../taskWords';
import { readNotes, titleFromSubject, writeNotes } from '../taskNotes';
import { dueText, isForToday, isOverdue } from '../tasks';
import type { Task } from '../types';

// Friday 13 November 2026, 09:00 local.
const NOW = new Date(2026, 10, 13, 9, 0).getTime();
const at = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('quick add words', () => {
  it('reads a day and time and takes them out of the title', () => {
    const r = readTaskWords('Ring the dentist Friday 3pm', NOW);
    expect(r.title).toBe('Ring the dentist');
    expect(r.due).toBe(at(20, 15));
    expect(r.hasTime).toBe(true);
  });
  it('reads a day on its own as all day', () => {
    const r = readTaskWords('Order more gaffer tape next Tuesday', NOW);
    expect(r.title).toBe('Order more gaffer tape');
    expect(r.due).toBe(at(17));
    expect(r.hasTime).toBe(false);
  });
  it('reads a #list', () => {
    const r = readTaskWords('Order tape tomorrow #Studio', NOW);
    expect(r.listTag).toBe('studio');
    expect(r.title).toBe('Order tape');
    expect(r.due).toBe(at(14));
  });
  it('a time already gone today means tomorrow', () => {
    expect(readTaskWords('Call Sam at 8am', NOW).due).toBe(at(14, 8));
  });
  it('leaves a plain title alone', () => {
    const r = readTaskWords('Look into a second microphone', NOW);
    expect(r).toMatchObject({ title: 'Look into a second microphone', hasTime: false });
    expect(r.due).toBeUndefined();
  });
});

describe('task notes', () => {
  it('writes and reads back a time and an email', () => {
    const raw = writeNotes({ notes: 'Invoice attached', minutes: 14 * 60, mailSubject: 'Venue deposit', mailLink: 'https://mail.google.com/x' });
    expect(raw).toBe('Due 14:00\nInvoice attached\n\nFrom email: Venue deposit\nhttps://mail.google.com/x');
    expect(readNotes(raw)).toEqual({ notes: 'Invoice attached', minutes: 840, mailSubject: 'Venue deposit' });
  });
  it('reads notes with nothing added', () => {
    expect(readNotes('Just a note')).toEqual({ notes: 'Just a note', minutes: undefined, mailSubject: undefined });
  });
  it('takes Re: and Fwd: off a subject', () => {
    expect(titleFromSubject('Re: Fwd: RE: Venue deposit for March')).toBe('Venue deposit for March');
  });
});

describe('task days', () => {
  const t = (p: Partial<Task>): Task => ({ id: 'a|l|t', accountId: 'a', listId: 'a|l', providerId: 't', title: 'x', done: false, ...p });
  it('knows overdue and today', () => {
    expect(isOverdue(t({ due: at(11) }), NOW)).toBe(true);
    expect(isOverdue(t({ due: at(13) }), NOW)).toBe(false);
    expect(isForToday(t({ due: at(11) }), NOW)).toBe(true);
    expect(isForToday(t({ due: at(14) }), NOW)).toBe(false);
    expect(isForToday(t({ done: true, completedAt: at(13, 8) }), NOW)).toBe(true);
    expect(isForToday(t({ done: true, completedAt: at(12, 20) }), NOW)).toBe(false);
  });
  it('says when in words', () => {
    expect(dueText({ due: at(13, 14), hasTime: true }, NOW)).toBe('today, 14:00');
    expect(dueText({ due: at(14) }, NOW)).toBe('tomorrow');
  });
});
