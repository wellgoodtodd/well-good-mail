import { describe, it, expect } from 'vitest';
import { tidyForEditor } from '../../components/editorExtensions';
describe('tidyForEditor', () => {
  it('keeps lines apart when a signature is made of divs and tables', () => {
    const out = tidyForEditor('<div dir="ltr"><div><b>Alex Morgan</b></div><div>Founder</div><table><tbody><tr><td>Phone</td><td>07429</td></tr></tbody></table></div>');
    expect(out).toContain('<p><b>Alex Morgan</b></p>');
    expect(out).toContain('<p>Founder</p>');
    expect(out).toContain('<p>Phone</p>');
    expect(out).not.toContain('<div');
    expect(out).not.toContain('<table');
  });
  it('leaves plain paragraphs and line breaks alone', () => {
    expect(tidyForEditor('<p>One<br>Two</p>')).toBe('<p>One<br>Two</p>');
  });
});
