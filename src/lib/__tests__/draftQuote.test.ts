import { describe, expect, it } from 'vitest';
import { latestOnly, pullOutQuote, quoteStats } from '../compose';
import type { Draft } from '../types';

const thread =
  '<div class="gmail_quote gmail_quote_container"><div class="gmail_attr">On Tue, Maria wrote:<br></div>' +
  '<blockquote class="gmail_quote"><div>Which date suits?</div><br>' +
  '<div class="gmail_quote"><div class="gmail_attr">On Mon, Alex wrote:<br></div><blockquote class="gmail_quote"><div>Thanks, please send details.</div>' +
  '<div class="gmail_quote"><div class="gmail_attr">On Fri, Maria wrote:<br></div><blockquote class="gmail_quote">The hall is free.</blockquote></div></blockquote></div></blockquote></div>';

const draft = (html: string, extra: Partial<Draft> = {}) => ({ id: 'd', mode: 'new', html, quotedHtml: '', includeQuote: true, ...extra }) as unknown as Draft;

describe('a reopened draft with its thread inside', () => {
  it('moves a marked quote out of the body, keeping your words and the signature place free', () => {
    const d = pullOutQuote(draft(`<div dir="ltr"><p>The 21st works.</p>${thread}</div>`));
    expect(d.html).toContain('The 21st works.');
    expect(d.html).not.toContain('Which date suits');
    expect(d.quotedHtml).toContain('Which date suits');
    expect(d.quotedHtml).toContain('The hall is free');
    expect(d.includeQuote).toBe(true);
  });

  it('leaves a blockquote you typed yourself alone, and drafts that already have a quote', () => {
    const own = draft('<p>As you said:</p><blockquote>quoted by me</blockquote><p>and more</p>');
    expect(pullOutQuote(own)).toBe(own);
    const had = draft(`<p>Hi</p>${thread}`, { quotedHtml: '<p>q</p>' });
    expect(pullOutQuote(had)).toBe(had);
  });

  it('counts the emails and keeps only the latest', () => {
    expect(quoteStats(thread)).toEqual({ emails: 3, long: true });
    expect(quoteStats('<div class="wgm-quote"><p>On x wrote:</p><blockquote>Short</blockquote></div>')).toEqual({ emails: 1, long: false });
    const cut = latestOnly(thread);
    expect(cut).toContain('Which date suits?');
    expect(cut).not.toContain('please send details');
    expect(cut).not.toContain('The hall is free');
    expect(quoteStats(cut).emails).toBe(1);
  });
});
