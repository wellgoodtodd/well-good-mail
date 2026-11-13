// Place suggestions for an event's Location box. Everything comes from what's already on this computer: places used
// in the person's own events (and, when contacts carry them, contacts' addresses). No maps service, no network.

export interface Place {
  /** The place as it will go in the Location box. */
  place: string;
  /** For a contact's address, whose it is (shown in muted text). */
  name?: string;
  /** How many events used it. */
  uses: number;
  /** When it was last used (an event's start, never later than now). */
  last: number;
}

/** An event, as far as places are concerned. */
export interface PlaceSource { id?: string; accountId?: string; start: number; location?: string }

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Web links (video calls and the like) aren't places. */
export function isLinkPlace(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^www\./i.test(s) || /^\S+\.(com|net|org|io|us|co|uk)\/\S*$/i.test(s);
}

/**
 * The places used in these events, joined case-insensitively (the spelling used most often is kept), each once per
 * event: the same event from two copies (the store and the longer calendar copy) counts once.
 */
export function placesFromEvents(events: PlaceSource[], now = Date.now()): Place[] {
  const seen = new Set<string>();
  const by = new Map<string, { spellings: Map<string, number>; uses: number; last: number }>();
  for (const e of events) {
    const place = tidy(e.location || '');
    if (!place || isLinkPlace(place)) continue;
    const once = `${e.accountId ?? ''}|${e.id ?? ''}|${e.start}|${place.toLowerCase()}`;
    if (e.id && seen.has(once)) continue;
    seen.add(once);
    const key = place.toLowerCase();
    const p = by.get(key) ?? { spellings: new Map(), uses: 0, last: -Infinity };
    p.spellings.set(place, (p.spellings.get(place) ?? 0) + 1);
    p.uses += 1;
    // Future events (a repeating one, say) count as used now, so they don't push past ones down.
    p.last = Math.max(p.last, Math.min(e.start, now));
    by.set(key, p);
  }
  return [...by.values()].map((p) => ({
    place: [...p.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    uses: p.uses,
    last: p.last,
  }));
}

/** How well a place matches what's typed: 3 starts with it, 2 a word starts with it, 1 has it somewhere, 0 not at all. */
export function placeMatch(text: string, typed: string): number {
  const t = text.toLowerCase();
  const q = tidy(typed).toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s,()/-]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
}

/**
 * What to offer under the Location box. With nothing typed, the most recent places. Otherwise the ones that match,
 * best match first, then most used, then most recent; a contact's address comes after event places when it's a tie.
 * The place already in the box exactly isn't offered again.
 */
export function suggestPlaces(typed: string, places: Place[], contactPlaces: { place: string; name?: string }[] = [], max = 6): Place[] {
  const q = tidy(typed).toLowerCase();
  const all: Place[] = [...places];
  const have = new Set(places.map((p) => p.place.toLowerCase()));
  for (const c of contactPlaces) {
    const place = tidy(c.place);
    if (!place || have.has(place.toLowerCase())) continue;
    have.add(place.toLowerCase());
    all.push({ place, name: c.name, uses: 0, last: -Infinity });
  }
  if (!q) {
    return all.filter((p) => !p.name).sort((a, b) => b.last - a.last || b.uses - a.uses).slice(0, Math.min(max, 5));
  }
  return all
    .map((p) => ({ p, m: Math.max(placeMatch(p.place, q), p.name ? placeMatch(p.name, q) : 0) }))
    .filter(({ p, m }) => m > 0 && p.place.toLowerCase() !== q)
    .sort((a, b) => b.m - a.m || b.p.uses - a.p.uses || b.p.last - a.p.last || Number(Boolean(a.p.name)) - Number(Boolean(b.p.name)))
    .slice(0, max)
    .map(({ p }) => p);
}
