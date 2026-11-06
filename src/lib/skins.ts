// Colour themes ("skins"). Each one restyles the whole app and brings its own account colours.
// Graphite and Paper are the original dark and light looks, so they need no overrides.
// The list order is the order of the picker (four columns, so each column is a pair: Graphite/Ash, Chocolate/Teal, Midnight/Violet, Paper/Sand).
export interface Skin {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  /** A few words, shown under the name. */
  blurb: string;
  accent: string;
  /** Text colour that sits on the accent. */
  onAccent: string;
  /** Account colours that sit well on this theme. */
  colours: string[];
  /** Overrides for the CSS variables in app.css. */
  vars: Record<string, string>;
}

const base = (bg: string, side: string, elev: string, subtle: string, border: string, strong: string, text: string, muted: string, faint: string) => ({
  '--bg': bg, '--bg-list': bg, '--bg-sidebar': side, '--toolbar': side, '--bg-elev': elev, '--bg-input': elev,
  '--bg-subtle': subtle, '--border': border, '--border-strong': strong, '--text': text, '--text-muted': muted, '--text-faint': faint,
});

export const SKINS: Skin[] = [
  {
    id: 'graphite', name: 'Graphite', mode: 'dark', blurb: 'Dark grey', accent: '#3B82F6', onAccent: '#ffffff', vars: {},
    colours: ['#5B8DEF', '#E8A04F', '#4FB59A', '#9D7FE0', '#D9706B', '#4AA8C8', '#C97BB0', '#9BB55A'],
  },
  {
    id: 'chocolate', name: 'Chocolate', mode: 'dark', blurb: 'Warm brown', accent: '#E0924F', onAccent: '#2A1608',
    colours: ['#E0924F', '#C9B458', '#7FAE8A', '#C97AA0', '#D96C5A', '#6FA3B8', '#A98BD0', '#B5A07A'],
    vars: base('#2a1f1a', '#211711', '#35271f', '#261c17', '#4a392f', '#62503f', '#f1e6dc', '#bba898', '#ad9a8a'),
  },
  {
    id: 'midnight', name: 'Midnight', mode: 'dark', blurb: 'Deep navy', accent: '#38BDF8', onAccent: '#04202E',
    colours: ['#38BDF8', '#F5B94B', '#4ADE9A', '#B38CF7', '#F47C7C', '#7DD3FC', '#F08CC0', '#A3E635'],
    vars: base('#0f1626', '#0a101d', '#17203a', '#0d1422', '#222d4a', '#33426b', '#e6ecfa', '#9aa8c7', '#8d9bbb'),
  },
  {
    id: 'paper', name: 'Paper', mode: 'light', blurb: 'Light and crisp', accent: '#2563EB', onAccent: '#ffffff', vars: {},
    colours: ['#3B6FE0', '#E8920F', '#1F9E78', '#8B4FE0', '#D94A4A', '#0F8FB0', '#C2478A', '#6E9A1E'],
  },
  {
    id: 'ash', name: 'Ash', mode: 'dark', blurb: 'Lighter grey', accent: '#6EA8FE', onAccent: '#0B1D3A',
    colours: ['#7AA7F5', '#F2B45A', '#5CC6A6', '#B497F2', '#F08A8A', '#6CC3DE', '#E59BC4', '#B3CC6A'],
    vars: base('#2f3237', '#272a2f', '#383c42', '#2b2e33', '#454a52', '#5a606a', '#eceef0', '#b0b5bc', '#a2a7ae'),
  },
  {
    id: 'teal', name: 'Teal', mode: 'dark', blurb: 'Deep teal', accent: '#2FB7A8', onAccent: '#05201D',
    colours: ['#2FB7A8', '#E5B84F', '#6AA7E0', '#C98BD9', '#EC7D6B', '#8CCB6A', '#E58FB0', '#7C9CF0'],
    vars: base('#12292b', '#0d1f21', '#183436', '#0f2426', '#25474a', '#356064', '#e2f1f0', '#9bbbb9', '#8dafac'),
  },
  {
    id: 'violet', name: 'Violet', mode: 'dark', blurb: 'Dark violet', accent: '#A78BFA', onAccent: '#1A0F3A',
    colours: ['#A78BFA', '#F0A86A', '#5FC9B0', '#E87AA6', '#6FA8F0', '#C8D45E', '#E0807A', '#7FD0E0'],
    vars: base('#231c33', '#1a1427', '#2c2440', '#201a2f', '#3b3256', '#53476f', '#ece6f7', '#b1a6cb', '#a498c0'),
  },
  {
    id: 'sand', name: 'Sand', mode: 'light', blurb: 'Warm and light', accent: '#C8553D', onAccent: '#ffffff',
    colours: ['#C8553D', '#D99A1E', '#4F8F5B', '#7A5BB0', '#3E7CB1', '#B04E7C', '#7C8A2E', '#8A6A4E'],
    vars: base('#fbf6ee', '#f1e8d9', '#fffaf2', '#f6efe2', '#e6dccb', '#cfc2ab', '#2b241c', '#6b5f50', '#75695a'),
  },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id) || SKINS[0];

/** The variables a skin overrides (used to clear them when the skin changes). */
export const SKIN_VARS = ['--bg', '--bg-list', '--bg-sidebar', '--toolbar', '--bg-elev', '--bg-input', '--bg-subtle', '--border', '--border-strong', '--text', '--text-muted', '--text-faint'];
