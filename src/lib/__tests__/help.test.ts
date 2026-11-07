import { describe, expect, it } from 'vitest';
import { TOPICS, countItems, matches, searchHelp } from '../helpTopics';

describe('searching Help', () => {
  it('shows everything when nothing is typed', () => {
    expect(searchHelp('')).toBe(TOPICS);
    expect(searchHelp('   ')).toBe(TOPICS);
  });
  it('finds an answer by a word in its question', () => {
    const found = searchHelp('undo');
    expect(found.flatMap((t) => t.items.map((i) => i.q))).toContain('Undo and redo');
  });
  it('finds an answer by a keyword that is not in its text', () => {
    expect(searchHelp('hotmail').flatMap((t) => t.items.map((i) => i.q))).toContain('Add another account');
  });
  it('needs every word to match', () => {
    expect(countItems(searchHelp('print pdf'))).toBeGreaterThan(0);
    expect(countItems(searchHelp('print zzzzqq'))).toBe(0);
  });
  it('ignores capital letters', () => {
    expect(countItems(searchHelp('ICLOUD'))).toBe(countItems(searchHelp('icloud')));
  });
  it('drops topics with nothing left', () => {
    const found = searchHelp('block sender');
    expect(found.every((t) => t.items.length > 0)).toBe(true);
    expect(found.length).toBeLessThan(TOPICS.length);
  });
  it('matches a single item', () => {
    expect(matches({ q: 'How to print', a: 'Press Ctrl+P.' }, 'print')).toBe(true);
    expect(matches({ q: 'How to print', a: 'Press Ctrl+P.' }, 'scan')).toBe(false);
  });
  it('writes in British English and never uses a long dash', () => {
    const text = TOPICS.flatMap((t) => [t.title, t.blurb, ...t.items.flatMap((i) => [i.q, i.a])]).join(' ');
    expect(text).not.toMatch(/—|–/);
    expect(text).not.toMatch(/\b(color|organize|recognize)\b/i);
  });
});
