import { describe, expect, it } from 'vitest';
import { stripOwnSignature } from '../compose';
import { splitQuote } from '../mcp/aiDrafts';

const SIG = '<div><b>Todd Weller</b><br>Founder &amp; Creative Director</div><div>Well Good Media</div>';
const QUOTE = '<div class="wgm-quote"><p>On Tue, 10 Nov, Elena wrote:</p><blockquote><p>Hi</p><div class="wgm-signature">Elena\'s sig</div></blockquote></div>';

describe('taking our own signature out of a draft brought back from the server', () => {
  it('removes the signature block the app added, and keeps signatures in the quote', () => {
    const html = `<div dir="ltr"><p>Hi Elena,</p><p>All the best,</p><div class="wgm-signature">${SIG}</div>${QUOTE}</div>`;
    const out = stripOwnSignature(html);
    expect(out).not.toContain('Founder');
    expect(out).toContain('All the best,');
    expect(out).toContain('Elena\'s sig');
  });

  it('removes a copy that lost its markup, matching its words', () => {
    const html = '<p>Hi Elena,</p><p>All the best,</p><p><strong>Todd Weller</strong>Founder &amp; Creative Director</p><p>Well Good Media</p>' + QUOTE;
    const out = stripOwnSignature(html, SIG);
    expect(out).not.toContain('Founder');
    expect(out).toContain('All the best,');
    expect(out).toContain('wrote:');
  });

  it('leaves a draft alone when its end is not the signature', () => {
    const html = '<p>Hi,</p><p>Thanks, Todd</p>';
    expect(stripOwnSignature(html, SIG)).toBe(html);
  });

  it('splits the quote at the app\'s own quote, so "On ... wrote:" is not in the editable part', () => {
    const { own, quote } = splitQuote(`<p>Hi</p>${QUOTE}`);
    expect(own).toBe('<p>Hi</p>');
    expect(quote).toContain('wrote:');
  });
});
