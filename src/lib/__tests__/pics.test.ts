import { describe, it, expect } from 'vitest';
import { renderEmail } from '../render';
describe('plain text pictures', () => {
  it('puts the picture back where the note was', () => {
    const r = renderEmail(undefined, 'Clock - £1895\n\n<IMG_8158.jpeg>\n\nNext <b>', { allowRemote: false, blockTrackers: true, dark: false, inlineImages: { 'name:IMG_8158.jpeg': 'data:image/jpeg;base64,AAAA' }, font: 'Rubik' });
    expect(r.html).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(r.html).toContain('Clock - £1895');
    expect(r.html).not.toContain('&lt;IMG_8158.jpeg&gt;');
  });
  it('leaves the note when there is no picture', () => {
    const r = renderEmail(undefined, '<IMG_1.jpeg>', { allowRemote: false, blockTrackers: true, dark: false, inlineImages: {}, font: 'Rubik' });
    expect(r.html).toContain('&lt;IMG_1.jpeg&gt;');
  });
});

describe('pictures in HTML emails', () => {
  it('puts the picture where an HTML email carries the same <name.jpeg> note', () => {
    const html = '<div>Clock<br>&lt;IMG_8158.jpeg&gt;<br>Next</div>';
    const r = renderEmail(html, undefined, { allowRemote: false, blockTrackers: true, dark: false, inlineImages: { 'name:IMG_8158.jpeg': 'data:image/jpeg;base64,AAAA' }, font: 'Rubik' });
    expect(r.html).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(r.html).not.toContain('&lt;IMG_8158.jpeg&gt;');
  });
});
