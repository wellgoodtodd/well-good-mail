// Account colour palettes: each set reads well in light and dark, and its
// colours differ enough in lightness and hue to tell accounts apart.
import { SKINS } from './skins';

export interface Palette {
  id: string;
  name: string;
  colours: string[];
}

export const PALETTES: Palette[] = [
  { id: 'classic', name: 'Classic', colours: ['#3B82F6', '#F59E0B', '#10B981', '#A855F7', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'] },
  { id: 'calm', name: 'Calm', colours: ['#5B8DEF', '#E8A04F', '#4FB59A', '#9D7FE0', '#D9706B', '#4AA8C8', '#C97BB0', '#9BB55A'] },
  { id: 'highland', name: 'Highland', colours: ['#3D6E8F', '#C08A3E', '#5E8C61', '#8E6BA8', '#B5523B', '#7FA3B0', '#B07C93', '#A3A35C'] },
  { id: 'wgm', name: 'Well Good', colours: ['#EEC32A', '#1EAB8F', '#6B8CAE', '#C9442B', '#9A7FB5', '#7FA650', '#D98F4E', '#9A9A9A'] },
  { id: 'bold', name: 'Bold', colours: ['#2563EB', '#EA580C', '#16A34A', '#9333EA', '#DC2626', '#0891B2', '#DB2777', '#CA8A04'] },
  { id: 'pastel', name: 'Pastel', colours: ['#8AB4F8', '#F6C177', '#81D4B4', '#C3A6F2', '#F28B82', '#78D3E5', '#F5A3C7', '#C5E17A'] },
  { id: 'accessible', name: 'Colour blind friendly', colours: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#56B4E9', '#F0E442', '#999999'] },
  { id: 'earth', name: 'Earth', colours: ['#8C6A4F', '#C9A227', '#6A8E4E', '#A0522D', '#5F7A8A', '#B3876B', '#7D6B91', '#9C9A5E'] },
];

// Each colour theme also has its own account colours, found as skin-<id> (not listed with the others).
function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l2 = Math.min(0.82, Math.max(0.28, l + delta));
  const c = (1 - Math.abs(2 * l2 - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`.toUpperCase();
}

/**
 * The colour for the Nth account. The palette's own colours come first. After that the same colours come round again
 * as lighter, then darker versions, so no two accounts share a colour until there are far more than anyone has.
 */
export function colourFor(colours: string[], index: number): string {
  const n = colours.length;
  const base = colours[index % n];
  const round = Math.floor(index / n);
  if (!round) return base;
  const step = Math.ceil(round / 2) * 0.1;
  return shade(base, round % 2 ? step : -step);
}

export const paletteById = (id: string): Palette => {
  const skin = id.startsWith('skin-') ? SKINS.find((k) => `skin-${k.id}` === id) : undefined;
  return skin ? { id, name: skin.name, colours: skin.colours } : PALETTES.find((p) => p.id === id) || PALETTES[0];
};
