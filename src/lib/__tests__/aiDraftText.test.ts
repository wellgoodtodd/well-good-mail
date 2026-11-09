import { describe, expect, it, vi } from 'vitest';
vi.mock('../db', () => ({ store: {} }));
vi.mock('../mail', () => ({ useMail: { getState: () => ({}) }, providerFor: () => undefined, queueSend: vi.fn(), loadBody: vi.fn() }));
vi.mock('../compose', () => ({ draftToOutgoing: vi.fn(), createDraft: vi.fn() }));
vi.mock('../composeActions', () => ({ composeContext: vi.fn() }));
import { htmlToText, textToHtml, isSimple, writerLabel } from '../mcp/aiDrafts';

describe('AI draft quick edits', () => {
  it('turns text into paragraphs and back', () => {
    const html = textToHtml('Hi Sam,\n\nThe shoot is £850 & lunch.\nThanks');
    expect(html).toBe('<p>Hi Sam,</p><p>The shoot is £850 &amp; lunch.<br>Thanks</p>');
    expect(htmlToText(html)).toBe('Hi Sam,\n\nThe shoot is £850 & lunch.\nThanks');
  });
  it('only offers a quick edit for plain drafts', () => {
    expect(isSimple('<p>Hi</p><div>there<br></div>')).toBe(true);
    expect(isSimple('<p>Hi <b>there</b></p>')).toBe(false);
    expect(isSimple('<p>Hi</p><blockquote>old</blockquote>')).toBe(false);
  });
  it('names writers for Gmail labels', () => {
    expect(writerLabel('Claude Desktop')).toBe('Claude');
    expect(writerLabel('Claude Code')).toBe('Claude');
    expect(writerLabel('EA')).toBe('EA');
  });
});
