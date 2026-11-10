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
}

/** Senders that are machines, not people: newsletters, receipts, notifications. */
const MACHINE = /(no-?reply|do-?not-?reply|newsletter|notifications?|mailer|bounce|receipts?|billing|invoice|orders?|info|news|marketing|support|updates?|alerts?|hello|team)@/i;

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

const cleanSubject = (s: string) => s.replace(/^((re|fwd?|fw|aw)\s*:\s*)+/i, '').trim();

/**
 * The event an email suggests, or undefined when it isn't fairly sure. It needs a definite day and a time, in the
 * future (and after the email was sent), from a person, in the writer's own words.
 */
export function suggestEvent(m: Pick<Message, 'from' | 'subject' | 'date' | 'listUnsubscribe'>, bodyText: string, now = Date.now(), calendar: CalendarEvent[] = []): Suggestion | undefined {
  if (MACHINE.test(m.from.email) || m.listUnsubscribe) return undefined;
  // The subject counts too: "Five a side on Thursday?" with "7pm kick off" in the email.
  const own = ownWords(bodyText);
  if (!own.trim()) return undefined;
  const text = `${cleanSubject(m.subject)}\n${own}`;
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
    if (start <= now || start <= (m.date || 0) || start > now + 270 * 86400000) continue;
    end = end && end > start ? end : start + 60 * 60000;
    // Already in the calendar at that time: nothing to suggest.
    if (calendar.some((e) => Math.abs(e.start - start) < 5 * 60000)) return undefined;
    const title = cleanSubject(m.subject).replace(/[?!.]+$/, '') || 'Event';
    return { title, start, end, phrase, meetingUrl: findMeetingUrl(text) };
  }
  return undefined;
}

export const whenWords = (s: { start: number; end: number }) => {
  const d = new Date(s.start);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${t(s.start)} to ${t(s.end)}`;
};
