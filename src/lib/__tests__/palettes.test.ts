import { describe, it, expect } from 'vitest';
import { PALETTES, colourFor } from '../palettes';

describe('account colours beyond the palette', () => {
  it('uses the palette colours first, in order', () => {
    const p = PALETTES[0];
    p.colours.forEach((c, i) => expect(colourFor(p.colours, i)).toBe(c));
  });
  it('gives the first 24 accounts a different colour each', () => {
    for (const p of PALETTES) {
      const used = Array.from({ length: 24 }, (_, i) => colourFor(p.colours, i));
      expect(new Set(used).size).toBe(24);
      used.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/i));
    }
  });
});
