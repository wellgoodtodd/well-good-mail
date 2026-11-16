import { describe, expect, it } from 'vitest';
import { emailsInNotes, notesWithEmail } from '../google/calendarApi';

const email = { subject: 'Board meeting', link: 'https://mail.google.com/mail/u/me%40example.com/#all/abc123' };

describe('an event linked to the email it came from', () => {
  it('adds the line once, after any notes', () => {
    expect(notesWithEmail(undefined, email)).toBe(`From email: Board meeting\n${email.link}`);
    const once = notesWithEmail('Bring the accounts', email);
    expect(once).toBe(`Bring the accounts\n\nFrom email: Board meeting\n${email.link}`);
    expect(notesWithEmail(once, email)).toBe(once);
  });

  it('without a link, matches by subject', () => {
    const once = notesWithEmail('', { subject: 'Lunch' });
    expect(once).toBe('From email: Lunch');
    expect(notesWithEmail(once, { subject: 'Lunch' })).toBe(once);
  });

  it('reads the emails back from the notes, plain or as Google keeps them', () => {
    expect(emailsInNotes(`Notes\n\nFrom email: Board meeting\n${email.link}`)).toEqual(['Board meeting', email.link]);
    expect(emailsInNotes(`From email: Board meeting<br><a href="${email.link}">${email.link}</a>`)).toContain('Board meeting');
    expect(emailsInNotes('Nothing here')).toBeUndefined();
  });
});
