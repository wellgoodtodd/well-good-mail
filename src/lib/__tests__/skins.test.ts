import { describe, it, expect } from 'vitest';
import { SKINS } from '../skins';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('colour themes', () => {
  it('have unique ids and enough different account colours', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) {
      expect(s.colours.length).toBeGreaterThanOrEqual(8);
      expect(new Set(s.colours).size).toBe(s.colours.length);
    }
  });
  it('keep text readable on every theme that overrides the colours', () => {
    for (const s of SKINS.filter((k) => k.vars['--bg'])) {
      expect(contrast(s.vars['--text'], s.vars['--bg'])).toBeGreaterThan(7);
      expect(contrast(s.vars['--text-muted'], s.vars['--bg'])).toBeGreaterThan(4.5);
      expect(contrast(s.vars['--text-faint'], s.vars['--bg'])).toBeGreaterThan(4);
    }
  });
  it('keep button text readable on the accent', () => {
    // Graphite keeps the original blue (white on it is about 3.7, fine for bold button text).
    for (const s of SKINS) expect(contrast(s.onAccent, s.accent)).toBeGreaterThan(3.5);
  });
  it('keep account colours visible against the background', () => {
    for (const s of SKINS.filter((k) => k.vars['--bg'])) {
      for (const c of s.colours) expect(contrast(c, s.vars['--bg'])).toBeGreaterThan(2.2);
    }
  });
});
