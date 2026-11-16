// Which events to offer for "Add to event…" on an attachment: the ones that look like they go with the email first
// (the same people, words from the subject, the date it mentions), then what's coming up, soonest first.
import type { CalendarEvent, Message } from './types';

const DAY = 86400000;
const SMALL = new Set(['about', 'after', 'again', 'agenda', 'with', 'from', 'your', 'this', 'that', 'have', 'will', 'meeting', 'minutes', 'notes', 'call', 're', 'fw', 'fwd', 'the', 'and', 'for', 'our', 'into', 'week', 'today', 'tomorrow']);

/** The words in a subject or title worth matching on: four letters or more, not everyday ones. */
export function keyWords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/^(re|fw|fwd):\s*/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !SMALL.has(w)))];
}

export interface Pickable { event: CalendarEvent; why?: string }

/**
 * Events an email's file could go on. `suggested`: within a week before and two months after, sharing a person or a
 * word with the email, or on a day the email mentions (best first). `soon`: the rest of the next two weeks.
 */
export function eventsForEmail(events: CalendarEvent[], m: Pick<Message, 'subject' | 'from' | 'to' | 'cc'>, now: number, mentionedDays: number[] = []): { suggested: Pickable[]; soon: Pickable[] } {
  const usable = events.filter((e) => e.canEdit && !e.cancelled);
  const people = new Set([m.from, ...(m.to || []), ...(m.cc || [])].map((a) => a?.email?.toLowerCase()).filter(Boolean) as string[]);
  const words = keyWords(m.subject || '');
  const days = new Set(mentionedDays.map((d) => new Date(d).toDateString()));
  const scored: { p: Pickable; score: number }[] = [];
  for (const e of usable) {
    if (e.end < now - 7 * DAY || e.start > now + 60 * DAY) continue;
    let score = 0;
    let why: string | undefined;
    const guest = (e.guests || []).find((g) => people.has(g.email.toLowerCase()));
    if (guest || (e.organiser && !e.organiser.self && people.has(e.organiser.email.toLowerCase()))) { score += 3; why = `With ${guest?.name || guest?.email || e.organiser?.name || e.organiser?.email}`; }
    const shared = keyWords(e.title).filter((w) => words.includes(w));
    if (shared.length) { score += 2 * shared.length; why ??= 'Same subject'; }
    if (days.has(new Date(e.start).toDateString())) { score += 2; why ??= 'On the day the email mentions'; }
    if (score) scored.push({ p: { event: e, why }, score: score - Math.abs(e.start - now) / (30 * DAY) });
  }
  const suggested = scored.sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.p);
  const taken = new Set(suggested.map((s) => s.event.id));
  const soon = usable.filter((e) => !taken.has(e.id) && e.end >= now && e.start <= now + 14 * DAY).sort((a, b) => a.start - b.start).map((event) => ({ event }));
  return { suggested, soon };
}

/** Events whose title (or place) has every word typed, soonest from now first, past ones after. */
export function searchEvents(events: CalendarEvent[], query: string, now: number): CalendarEvent[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = events.filter((e) => e.canEdit && !e.cancelled && terms.every((t) => `${e.title} ${e.location || ''}`.toLowerCase().includes(t)));
  return hits.sort((a, b) => (a.end < now ? 1 : 0) - (b.end < now ? 1 : 0) || (a.end < now ? b.start - a.start : a.start - b.start)).slice(0, 30);
}
