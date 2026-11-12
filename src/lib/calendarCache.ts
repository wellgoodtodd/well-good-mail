// A copy of the calendar on this computer, so Day, Week and Month show straight away instead of fetching each time.
// After starting, it quietly fills three months back and twelve ahead, and refreshes every few hours (and when you
// press Refresh). Going further than that fetches the extra weeks once and keeps them.
import { create } from 'zustand';
import { store } from './db';
import { eventsBetween, recentlyDeletedEvent } from './mail';
import type { CalendarEvent } from './types';

const KEY = 'calendar-range';
const DAY = 86400000;
const REFRESH_MS = 6 * 3600000;

interface Saved { from: number; to: number; at: number; events: CalendarEvent[] }

export const useCalCache = create<Saved & { loading: boolean }>(() => ({ from: 0, to: 0, at: 0, events: [], loading: false }));

let loaded = false;
async function loadSaved() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await store.kvGet<Saved>(KEY);
    if (s?.events) useCalCache.setState({ ...s });
  } catch { /* starts empty */ }
}

function save() {
  const { from, to, at, events } = useCalCache.getState();
  void store.kvSet(KEY, { from, to, at, events }).catch(() => undefined);
}

/** Fetches a stretch of time and puts it into the copy, replacing whatever the copy had for those days. */
async function fill(from: number, to: number) {
  const fresh = (await eventsBetween(from, to)).filter((e) => !recentlyDeletedEvent(e.id));
  const st = useCalCache.getState();
  const kept = st.events.filter((e) => e.end <= from || e.start >= to);
  const seen = new Set(kept.map((e) => e.id));
  const events = [...kept, ...fresh.filter((e) => !seen.has(e.id))];
  useCalCache.setState({ events, from: st.from ? Math.min(st.from, from) : from, to: Math.max(st.to, to) });
  save();
}

const startOfMonth = (t: number, add = 0) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + add, 1).getTime(); };

/** A refresh asked for while one is running: it runs again straight after, so a change made meanwhile isn't missed. */
let again = false;

/** The usual stretch: three months back to twelve ahead. */
export async function refreshCalendarCopy(): Promise<void> {
  await loadSaved();
  if (useCalCache.getState().loading) { again = true; return; }
  useCalCache.setState({ loading: true });
  try {
    const from = startOfMonth(Date.now(), -3);
    const to = startOfMonth(Date.now(), 13);
    await fill(from, to);
    useCalCache.setState({ at: Date.now() });
    save();
  } catch { /* tries again later */ } finally {
    useCalCache.setState({ loading: false });
  }
  if (again) { again = false; await refreshCalendarCopy(); }
}

/** Makes sure the copy covers these days; fetches only what's missing. */
export async function ensureCalendarRange(from: number, to: number) {
  await loadSaved();
  const st = useCalCache.getState();
  if (st.from && from >= st.from && to <= st.to) return;
  const gaps: [number, number][] = [];
  if (!st.from) gaps.push([from, to]);
  else {
    if (from < st.from) gaps.push([from, st.from]);
    if (to > st.to) gaps.push([st.to, to]);
  }
  for (const [a, b] of gaps) {
    // A little extra either side, so stepping a week further doesn't fetch again straight away.
    try { await fill(a - 31 * DAY, b + 31 * DAY); } catch { /* shows what it has */ }
  }
}

/** Events from the copy that touch these days. */
export const cachedBetween = (events: CalendarEvent[], from: number, to: number) => events.filter((e) => e.end > from && e.start < to);

let started = false;
/** After starting: load the saved copy at once, then fill it in the background and keep it fresh. */
export function startCalendarCopy() {
  if (started) return;
  started = true;
  void loadSaved().then(() => {
    const stale = Date.now() - useCalCache.getState().at > REFRESH_MS;
    setTimeout(() => void refreshCalendarCopy(), stale ? 20000 : REFRESH_MS);
  });
  setInterval(() => void refreshCalendarCopy(), REFRESH_MS);
}
