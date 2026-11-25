// How fast the app talks to Gmail, per account.
//
// Google limits each person to a number of "quota units" a minute (6,000 on the Standard tier), and each kind of
// request costs a different number of units. So requests are spaced by what they cost, not counted one by one:
// fetching an email costs more than checking for changes. The speed starts at two thirds of the limit, so two
// computers syncing the same account still fit. When Google says "too fast", the speed halves and the account
// remembers a ceiling just under where that happened, so a big first sync settles at a speed Google accepts
// instead of hitting the limit again and again. The ceiling is kept between runs, and creeps back up slowly after
// long clean spells in case Google allows more.

/** Units a minute to aim for at first: two thirds of the 6,000 Standard tier limit. */
export const START_RATE = 4000;
export const MIN_RATE = 300;
export const MAX_RATE = 5500;
/** Clean requests before the speed rises a step towards the ceiling. */
const STEP_AFTER = 100;
/** Clean requests at the ceiling before the ceiling itself is raised a little. */
const CEILING_AFTER = 2000;
const STORE_KEY = 'wgm-gmail-pace';

export interface Pace { next: number; hold: number; rate: number; ceiling: number; calm: number; atCeiling: number }
const paces = new Map<string, Pace>();

function readCeilings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, number>; } catch { return {}; }
}
function saveCeiling(key: string, ceiling: number) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readCeilings(), [key]: Math.round(ceiling) })); } catch { /* not kept: fine */ }
}

export function paceFor(key: string): Pace {
  let p = paces.get(key);
  if (!p) {
    const learnt = readCeilings()[key];
    const ceiling = learnt ? Math.max(MIN_RATE, Math.min(MAX_RATE, learnt)) : MAX_RATE;
    paces.set(key, (p = { next: 0, hold: 0, rate: Math.min(START_RATE, ceiling), ceiling, calm: 0, atCeiling: 0 }));
  }
  return p;
}

/** For tests. */
export function resetPaces() { paces.clear(); }

/**
 * Gmail's cost in quota units for a request, from Google's published list. Anything not listed counts as 5,
 * which is what most reads cost.
 */
export function gmailCost(url: string, method = 'GET'): number {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/gmail\/v1\/users\/me/, '').split('?')[0];
  const m = method.toUpperCase();
  if (/\/messages\/send$|\/drafts\/send$/.test(path)) return 100;
  if (/\/messages\/batch(Modify|Delete)$/.test(path)) return 50;
  if (/^\/history/.test(path)) return 2;
  if (/^\/(profile|labels|settings)/.test(path) && m === 'GET') return 1;
  if (/^\/threads\/[^/]+$/.test(path) && m === 'GET') return 10;
  if (/^\/drafts/.test(path)) return m === 'PUT' ? 15 : m === 'GET' ? 5 : 10;
  return 5;
}

/** How long a request of this cost takes up at the account's current speed. */
export const gapFor = (p: Pace, cost: number) => (cost / p.rate) * 60000;

/**
 * Waits for this account's next turn. Something the person just clicked on goes straight away (only a quota pause
 * holds it), but still uses up its share, so the background queue behind it waits a little longer.
 */
export async function throttle(key: string, cost: number, urgent = false, now = Date.now()) {
  const p = paceFor(key);
  const gap = gapFor(p, cost);
  if (urgent) {
    p.next = Math.max(now, p.next) + gap;
    if (p.hold > now) await new Promise((r) => setTimeout(r, p.hold - now));
    return;
  }
  const slot = Math.max(now, p.next);
  p.next = slot + gap;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

/**
 * Gmail said we were too fast: pause this account, halve its speed and remember a ceiling just under where it
 * happened. Several requests often fail together, so only the first in a pause slows things down.
 */
export function backOff(key: string, pauseMs: number, now = Date.now()) {
  const p = paceFor(key);
  const fresh = p.hold <= now;
  p.next = Math.max(p.next, now + pauseMs);
  p.hold = Math.max(p.hold, now + pauseMs);
  p.calm = 0;
  p.atCeiling = 0;
  if (!fresh) return;
  p.ceiling = Math.max(MIN_RATE, Math.min(p.ceiling, p.rate * 0.8));
  p.rate = Math.max(MIN_RATE, p.rate / 2);
  saveCeiling(key, p.ceiling);
}

/** A clean run lets the speed rise again, up to the ceiling; a long clean spell at the ceiling raises it a little. */
export function allClear(key: string) {
  const p = paceFor(key);
  if (p.rate < p.ceiling) {
    if (++p.calm >= STEP_AFTER) { p.rate = Math.min(p.ceiling, p.rate * 1.15); p.calm = 0; }
    return;
  }
  if (p.ceiling < MAX_RATE && ++p.atCeiling >= CEILING_AFTER) {
    p.ceiling = Math.min(MAX_RATE, p.ceiling * 1.05);
    p.atCeiling = 0;
    saveCeiling(key, p.ceiling);
  }
}

/** How hard the app is currently pacing an account's requests, for the Diagnostics page. */
export function paceInfo(key: string): { unitsPerMinute: number; pausedUntil: number } | undefined {
  const p = paces.get(key);
  return p ? { unitsPerMinute: Math.round(p.rate), pausedUntil: p.hold > Date.now() ? p.hold : 0 } : undefined;
}
