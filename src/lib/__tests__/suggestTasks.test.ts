import { describe, it, expect } from 'vitest';
import { suggestTask, taskTitleFrom } from '../suggestTasks';

// Monday 16 November 2026, 12:00.
const now = new Date(2026, 10, 16, 12, 0).getTime();
const from = (email: string, name = 'Alison Grant') => ({ from: { email, name }, date: now - 3600000, listUnsubscribe: undefined });
const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('suggested tasks', () => {
  it('finds a request with a day it is wanted by', () => {
    const s = suggestTask(from('alison@example.com'), 'Hi Todd,\n\nCould you send me the updated venue list by Friday? Just the shortlist is fine.\n\nThanks', now)!;
    expect(s.due).toBe(day(2026, 10, 20));
    expect(s.title).toBe('Send Alison the updated venue list');
    expect(s.phrase).toContain('by Friday');
  });

  it('needs both an ask and a deadline', () => {
    expect(suggestTask(from('alison@example.com'), 'The venue list is ready. See you Friday.', now)).toBeUndefined();
    expect(suggestTask(from('alison@example.com'), 'Could you send me the venue list when you get a chance?', now)).toBeUndefined();
  });

  it('leaves out machines, mailing lists, quoted emails and days already gone', () => {
    expect(suggestTask(from('noreply@example.com'), 'Please pay by Friday.', now)).toBeUndefined();
    expect(suggestTask({ ...from('alison@example.com'), listUnsubscribe: 'mailto:x@example.com' }, 'Please reply by Friday.', now)).toBeUndefined();
    expect(suggestTask(from('alison@example.com'), 'Thanks!\n\nOn Mon, 9 Nov 2026, Sam wrote:\n> Could you send the deck by Friday?', now)).toBeUndefined();
    expect(suggestTask({ ...from('alison@example.com'), date: day(2026, 10, 2) }, 'Could you send the deck by Wednesday?', now)).toBeUndefined();
  });

  it('tidies the request into a task title', () => {
    expect(taskTitleFrom('Please could you check the invoice', 'Sam')).toBe('Check the invoice');
    expect(taskTitleFrom('I need you to sign the form, please.', 'Sam')).toBe('Sign the form');
    expect(taskTitleFrom('Can you let me know your availability', 'Sam')).toBe('Let Sam know your availability');
    expect(taskTitleFrom('Could we get vertical cuts', 'Kirsty')).toBe('Get Kirsty vertical cuts');
  });
});
