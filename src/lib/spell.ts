// Spelling suggestions for the right-click menu in a message. The red underline comes from Windows; this finds the
// right word. British English (the -ise dictionary from wordlist.sourceforge.net), loaded the first time it's
// needed, plus your own words from Add to dictionary.
import { settings, useSettings } from './settings';

interface Speller { correct(word: string): boolean; suggest(word: string): string[]; add(word: string): Speller }

let speller: Speller | null = null;
let loading: Promise<Speller | null> | null = null;

/** Loads the dictionary (once). Resolves null if it can't. */
export function loadSpeller(): Promise<Speller | null> {
  if (speller) return Promise.resolve(speller);
  loading ??= Promise.all([
    import('../assets/dict/en-GB.aff?raw'),
    import('../assets/dict/en-GB.dic?raw'),
    import('nspell'),
  ]).then(([aff, dic, nspell]) => {
    const make = (nspell as unknown as { default: (d: { aff: string; dic: string }) => Speller }).default;
    speller = make({ aff: aff.default, dic: dic.default });
    for (const w of settings().spellWords || []) speller.add(w);
    return speller;
  }).catch(() => null);
  return loading;
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
  speller?.add(w);
  const list = settings().spellWords || [];
  if (!list.includes(w)) useSettings.getState().set({ spellWords: [...list, w] });
}
