// Account colour palettes: each set reads well in light and dark, and its
// colours differ enough in lightness and hue to tell accounts apart.
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

export const paletteById = (id: string) => PALETTES.find((p) => p.id === id) || PALETTES[0];
