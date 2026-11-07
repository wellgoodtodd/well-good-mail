import { describe, it, expect } from 'vitest';
import { SKINS, accentOn, buttonFill, contrastRatio } from '../skins';

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
  it('keep button text easy to read on the button colour', () => {
    // Buttons use the accent nudged until the text on them reaches 4.5, so any accent a person picks works.
    for (const s of SKINS) expect(contrastRatio(s.onAccent, buttonFill(s.accent, s.onAccent))).toBeGreaterThanOrEqual(4.5);
  });
  it('make the accent readable as link text on the page', () => {
    const link = accentOn('#3B82F6', '#ffffff');
    expect(contrastRatio(link, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentOn('#2563EB', '#1c1c1e'), '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
    expect(accentOn('#6EA8FE', '#1c1c1e')).toBe('#6EA8FE');
  });
  it('leave an accent alone when its text is already readable', () => {
    expect(buttonFill('#E0924F', '#2A1608')).toBe('#E0924F');
  });
  it('darken a blue that white text is too faint on', () => {
    const fill = buttonFill('#3B82F6', '#ffffff');
    expect(fill).not.toBe('#3B82F6');
    expect(contrastRatio('#ffffff', fill)).toBeGreaterThanOrEqual(4.5);
  });
  it('keep account colours visible against the background', () => {
    for (const s of SKINS.filter((k) => k.vars['--bg'])) {
      for (const c of s.colours) expect(contrast(c, s.vars['--bg'])).toBeGreaterThan(2.2);
    }
  });
});
