import { describe, expect, it } from 'vitest';
import { parseMailto } from '../mailtoLink';

describe('mailto links', () => {
  it('reads addresses, subject and body', () => {
    const p = parseMailto('mailto:jo@studio.example,sam@glen.example?cc=ann@x.example&subject=Hello%20there&body=Line%20one%0ALine%20two');
    expect(p.to.map((a) => a.email)).toEqual(['jo@studio.example', 'sam@glen.example']);
    expect(p.cc.map((a) => a.email)).toEqual(['ann@x.example']);
    expect(p.subject).toBe('Hello there');
    expect(p.body).toBe('Line one\nLine two');
  });
  it('copes with a bare address', () => {
    expect(parseMailto('MAILTO:jo@studio.example').to[0].email).toBe('jo@studio.example');
  });
});
