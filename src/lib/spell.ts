// Spelling suggestions for the right-click menu in a message. The red underline comes from Windows; this finds the
// right word. British, American, Canadian or Australian English (Hunspell dictionaries from wordlist.sourceforge.net,
// MIT and BSD), whichever is chosen in Settings › Composing. Only that one is loaded, the first time it's needed,
// plus your own words from Add to dictionary.
import { settings, useSettings } from './settings';

interface Speller { correct(word: string): boolean; suggest(word: string): string[]; add(word: string): unknown }
export type SpellLang = 'en-GB' | 'en-US' | 'en-CA' | 'en-AU';

export const SPELL_LANGS: { id: SpellLang; name: string }[] = [
  { id: 'en-GB', name: 'English (UK)' },
  { id: 'en-US', name: 'English (US)' },
  { id: 'en-CA', name: 'English (Canada)' },
  { id: 'en-AU', name: 'English (Australia)' },
];

// Each dictionary is its own small download inside the app, fetched only when it's the one in use.
const FILES: Record<SpellLang, () => Promise<[{ default: string }, { default: string }]>> = {
  'en-GB': () => Promise.all([import('../assets/dict/en-GB.aff?raw'), import('../assets/dict/en-GB.dic?raw')]),
  'en-US': () => Promise.all([import('../assets/dict/en-US.aff?raw'), import('../assets/dict/en-US.dic?raw')]),
  'en-CA': () => Promise.all([import('../assets/dict/en-CA.aff?raw'), import('../assets/dict/en-CA.dic?raw')]),
  'en-AU': () => Promise.all([import('../assets/dict/en-AU.aff?raw'), import('../assets/dict/en-AU.dic?raw')]),
};

const spellers = new Map<SpellLang, Promise<Speller | null>>();
const lang = (): SpellLang => (settings().spellLang && FILES[settings().spellLang] ? settings().spellLang : 'en-GB');

/** Loads the chosen dictionary (once each). Resolves null if it can't. */
export function loadSpeller(which: SpellLang = lang()): Promise<Speller | null> {
  let p = spellers.get(which);
  if (!p) {
    p = Promise.all([FILES[which](), import('nspell')]).then(([[aff, dic], nspell]) => {
      const s = (nspell.default as unknown as (d: { aff: string; dic: string }) => Speller)({ aff: aff.default, dic: dic.default });
      for (const w of settings().spellWords || []) s.add(w);
      return s;
    }).catch(() => null);
    spellers.set(which, p);
  }
  return p;
}

const strip = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Suggestions for a word, or none when it's spelt right (or isn't a word, like a number or an address). */
export async function suggestFor(word: string): Promise<string[] | null> {
  const w = strip(word);
  if (!w || w.length < 2 || /\d|@|\//.test(w)) return null;
  const s = await loadSpeller();
  if (!s || s.correct(w)) return null;
  return s.suggest(w).slice(0, 5);
}

/** Never underline or suggest for this word again (kept in Settings, so it follows you to other computers). */
export function addToDictionary(word: string) {
  const w = strip(word);
  if (!w) return;
  for (const p of spellers.values()) void p.then((s) => s?.add(w));
  const list = settings().spellWords || [];
  if (!list.includes(w)) useSettings.getState().set({ spellWords: [...list, w] });
}
