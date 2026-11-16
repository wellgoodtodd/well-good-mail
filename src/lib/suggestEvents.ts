// Suggested events: when an email from a person mentions a future date with a time ("Monday 16th November at
// 7.30pm"), offer to put it in the calendar. Read on this computer with a date-reading library: no AI, no server.
import { en } from 'chrono-node';
import { findMeetingUrl } from './meetings';
import type { CalendarEvent, Message } from './types';

export interface Suggestion {
  title: string;
  start: number;
  end: number;
  /** The words it found, as written. */
  phrase: string;
  meetingUrl?: string;
  /** True when the email gave an end time too ("7:15 – 9:15pm"); otherwise the end is an hour after the start. */
  endGiven?: boolean;
  /** Already in your calendar: the card says so, and what the email has that the event doesn't, instead of offering it again. */
  existing?: CalendarEvent;
}

/** Senders that are machines, not people: newsletters, receipts, notifications. */
export const MACHINE = /(no-?reply|do-?not-?reply|newsletter|notifications?|mailer|bounce|receipts?|billing|invoice|orders?|info|news|marketing|support|updates?|alerts?|hello|team)@/i;

/** The writer's own words: quoted earlier emails and signatures cut off. */
export function ownWords(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^On .{6,120} wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*(Original Message|Forwarded message)/i.test(line.trim()) || /^From:\s.+/i.test(line.trim())) break;
    if (/^--\s*$/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').slice(0, 5000);
}

const SMALL = new Set(['with', 'from', 'about', 'this', 'that', 'your', 'tonight', 'today', 'tomorrow', 'meeting', 'call', 'chat', 'catch', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
/** The words that say what something is: four letters or more, not days, months or "meeting". */
const wordsOf = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !SMALL.has(w));

const cleanSubject = (s: string) =>s.replace(/^((re|fwd?|fw|aw)\s*:\s*)+/i, '').trim();

/**
 * The event an email suggests, or undefined when it isn't fairly sure. It needs a definite day and a time, in the
 * future (and after the email was sent), from a person, in the writer's own words.
 */
export function suggestEvent(m: Pick<Message, 'from' | 'subject' | 'date' | 'listUnsubscribe'>, bodyText: string, now = Date.now(), calendar: CalendarEvent[] = []): Suggestion | undefined {
  if (MACHINE.test(m.from.email) || m.listUnsubscribe) return undefined;
  // The subject counts too: "Five a side on Thursday?" with "7pm kick off" in the email.
  const own = ownWords(bodyText);
  if (!own.trim()) return undefined;
  // The email on its own first: a subject like "Quiz night" can run into the first line ("night Monday 16th…")
  // and hide its time. Then with the subject in front, for a day in the subject and a time in the email.
  return findIn(m, own, now, calendar) || findIn(m, `${cleanSubject(m.subject)}\n${own}`, now, calendar);
}

function findIn(m: Pick<Message, 'subject' | 'date'>, text: string, now: number, calendar: CalendarEvent[]): Suggestion | undefined {
  const results = en.GB.parse(text, new Date(m.date || now), { forwardDate: true });
  const hasDay = (c: (typeof results)[number]['start']) => c.isCertain('day') || c.isCertain('weekday');
  for (const [i, r] of results.entries()) {
    const s = r.start;
    let start: number;
    let end: number | undefined;
    let phrase = r.text;
    if (s.isCertain('hour') && hasDay(s)) {
      // A day and a time together: "Friday at 3pm", "16 Nov 19:30".
      start = s.date().getTime();
      end = r.end && r.end.isCertain('hour') ? r.end.date().getTime() : undefined;
    } else if (hasDay(s) && !s.isCertain('hour')) {
      // A day, then a time close after it: "on Thursday? Same pitch, 7pm kick off".
      const t = results.slice(i + 1).find((x) => x.start.isCertain('hour'));
      if (!t || !t.start.isCertain('hour') || hasDay(t.start) || t.index - (r.index + r.text.length) > 80) continue;
      const d = s.date();
      d.setHours(t.start.get('hour') ?? 0, t.start.get('minute') ?? 0, 0, 0);
      start = d.getTime();
      end = t.end && t.end.isCertain('hour') ? start + (t.end.date().getTime() - t.start.date().getTime()) : undefined;
      const gap = text.slice(r.index + r.text.length, t.index);
      phrase = gap.length <= 6 ? `${r.text}${gap}${t.text}`.replace(/\s+/g, ' ') : `${r.text.trim()} … ${t.text.trim()}`;
    } else continue;
    if (phrase.length < 6) continue;
    // Still shown for a quarter of an hour after it starts, for the link when you're running late.
    if (start <= now - 15 * 60000 || start <= (m.date || 0) || start > now + 270 * 86400000) continue;
    const endGiven = Boolean(end && end > start);
    end = endGiven ? end! : start + 60 * 60000;
    const title = cleanSubject(m.subject).replace(/[?!.]+$/, '') || 'Event';
    const meetingUrl = findMeetingUrl(text);
    // Already in the calendar: plainly the same thing (a word of its title in the subject, or the same link) on the
    // same day within two hours, so a time that moved still finds it. The nearest wins. Something else at that time
    // doesn't count.
    const words = new Set(wordsOf(m.subject));
    const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
    const existing = calendar
      .filter((e) => !e.allDay && !e.cancelled && sameDay(e.start, start) && Math.abs(e.start - start) <= 2 * 3600000
        && ((meetingUrl && e.meetingUrl === meetingUrl) || wordsOf(e.title).some((w) => words.has(w))))
      .sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))[0];
    return { title, start, end, phrase, meetingUrl, ...(endGiven ? { endGiven } : {}), ...(existing ? { existing } : {}) };
  }
  return undefined;
}

export const whenWords = (s: { start: number; end: number }) => {
  const d = new Date(s.start);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${t(s.start)} to ${t(s.end)}`;
};

/** What an email has that the event already in your calendar doesn't: its meeting link, or a different time. */
export function eventDifferences(found: Pick<Suggestion, 'start' | 'end' | 'endGiven' | 'meetingUrl'>, ev: Pick<CalendarEvent, 'start' | 'end' | 'meetingUrl' | 'location'>): { patch: { start?: number; end?: number; location?: string }; lines: string[] } {
  const patch: { start?: number; end?: number; location?: string } = {};
  const lines: string[] = [];
  if (found.meetingUrl && !ev.meetingUrl) {
    patch.location = ev.location ? `${ev.location} · ${found.meetingUrl}` : found.meetingUrl;
    lines.push(`The email has a ${meetingKind(found.meetingUrl)} link`);
  }
  const end = found.endGiven ? found.end : found.start + (ev.end - ev.start);
  if (Math.abs(found.start - ev.start) >= 60000 || Math.abs(end - ev.end) >= 60000) {
    patch.start = found.start;
    patch.end = end;
    const t = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    lines.push(`The email says ${t(found.start)} to ${t(end)}`);
  }
  return { patch, lines };
}

const meetingKind = (url: string) => (/meet\.google/i.test(url) ? 'Google Meet' : /zoom\./i.test(url) ? 'Zoom' : /teams\./i.test(url) ? 'Teams' : 'meeting');
