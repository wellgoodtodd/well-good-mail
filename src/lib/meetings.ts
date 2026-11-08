// Finding the video call in a calendar event (Teams, Zoom, Google Meet, Webex), and which meetings are about to start.
import type { CalendarEvent } from './types';

const PATTERNS: { service: string; re: RegExp }[] = [
  { service: 'Teams', re: /https:\/\/teams\.(?:microsoft\.com\/(?:l\/meetup-join|meet)|live\.com\/meet)\/[^\s<>"')\]]+/i },
  { service: 'Zoom', re: /https:\/\/[a-z0-9-]*\.?(?:zoom\.us|zoomgov\.com)\/(?:j|my|wc\/join)\/[^\s<>"')\]]+/i },
  { service: 'Google Meet', re: /https:\/\/meet\.google\.com\/[a-z0-9-]{3,}(?:\?[^\s<>"')\]]*)?/i },
  { service: 'Webex', re: /https:\/\/[a-z0-9-]+\.webex\.com\/[^\s<>"')\]]+/i },
];

/** The first video call link in any of the given texts. */
export function findMeetingUrl(...texts: (string | undefined)[]): string | undefined {
  const joined = texts.filter(Boolean).join('\n').replace(/&amp;/g, '&');
  let best: { index: number; url: string } | undefined;
  for (const p of PATTERNS) {
    const m = joined.match(p.re);
    if (m && m.index !== undefined && (!best || m.index < best.index)) best = { index: m.index, url: m[0].replace(/[.,;]+$/, '') };
  }
  return best?.url;
}

/** "Teams", "Zoom" and so on, for a link. */
export function meetingService(url: string): string {
  return PATTERNS.find((p) => p.re.test(url))?.service || 'video call';
}

/** The same event on two of your calendars (you are invited on both addresses, or a shared holiday calendar) counts once. */
export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const byKey = new Map<string, { event: CalendarEvent; answers: (CalendarEvent['myResponse'])[] }>();
  for (const e of events) {
    const k = `${e.title.trim().toLowerCase()}|${e.start}|${e.end}|${e.allDay}`;
    const have = byKey.get(k);
    if (!have) { byKey.set(k, { event: { ...e, accountIds: [e.accountId] }, answers: [e.myResponse] }); continue; }
    have.answers.push(e.myResponse);
    if (!have.event.accountIds!.includes(e.accountId)) have.event.accountIds!.push(e.accountId);
    if (!have.event.meetingUrl && e.meetingUrl) have.event.meetingUrl = e.meetingUrl;
    if (!have.event.guests?.length && e.guests?.length) have.event.guests = e.guests;
  }
  return [...byKey.values()].map(({ event, answers }) => {
    // Only a "No" on every copy counts as declined. One Yes, Maybe or no answer anywhere keeps the alerts.
    const declined = answers.length > 0 && answers.every((a) => a === 'no');
    return { ...event, declined, myResponse: declined ? 'no' : answers.find((a) => a && a !== 'no') ?? event.myResponse };
  });
}

/** A meeting shows in the banner from a few minutes before it starts until this long after the start. */
export const BANNER_GRACE_MINUTES = 10;

/** Meetings with a video link that start within the next few minutes (or started a moment ago). Meetings you said No to are left out. */
export function meetingsSoon(events: CalendarEvent[], now = Date.now(), leadMinutes = 5): CalendarEvent[] {
  return dedupeEvents(events)
    .filter((e) => e.meetingUrl && !e.allDay && !e.declined && e.start - leadMinutes * 60000 <= now && e.end > now && e.start + BANNER_GRACE_MINUTES * 60000 > now)
    .sort((a, b) => a.start - b.start);
}

export type MeetingPhase =
  | { phase: 'before'; minutes: number }
  | { phase: 'now' }
  | { phase: 'late'; minutes: number }
  | { phase: 'long' };

/** Where a meeting is in time: coming, starting now (the first minute), started 1 to 4 minutes ago, or already started. */
export function meetingPhase(start: number, now: number): MeetingPhase {
  const ms = start - now;
  if (ms > 0) return { phase: 'before', minutes: Math.max(1, Math.ceil(ms / 60000)) };
  const gone = -ms;
  if (gone < 60000) return { phase: 'now' };
  if (gone < 5 * 60000) return { phase: 'late', minutes: Math.floor(gone / 60000) };
  return { phase: 'long' };
}

/** The words for the banner. */
export function meetingPhaseText(p: MeetingPhase): string {
  switch (p.phase) {
    case 'before': return `starts in ${p.minutes} ${p.minutes === 1 ? 'minute' : 'minutes'}`;
    case 'now': return 'is starting now';
    case 'late': return `started ${p.minutes} ${p.minutes === 1 ? 'minute' : 'minutes'} ago`;
    default: return 'has already started';
  }
}

/** Which calendar an event belongs to, for hiding and showing calendars. */
export const calendarKey = (e: { accountId: string; calendarName: string }) => `${e.accountId}|${e.calendarName}`;

/** Events from calendars you haven't hidden. */
export function visibleEvents(events: CalendarEvent[], hidden: string[]): CalendarEvent[] {
  if (!hidden.length) return events;
  const off = new Set(hidden);
  return events.filter((e) => !off.has(calendarKey(e)));
}

const ANSWER_WORD = { yes: 'Yes', no: 'No', maybe: 'Maybe', waiting: 'Waiting' } as const;
export const guestAnswerWord = (a: keyof typeof ANSWER_WORD) => ANSWER_WORD[a];

/** "3 yes, 1 maybe, 1 no, 2 waiting", only the kinds that are there. */
export function guestTally(guests: { answer: keyof typeof ANSWER_WORD }[]): { answer: keyof typeof ANSWER_WORD; n: number }[] {
  return (['yes', 'maybe', 'no', 'waiting'] as const).map((answer) => ({ answer, n: guests.filter((g) => g.answer === answer).length })).filter((t) => t.n > 0);
}

/** Plain text for pasting an invitation into Slack, WhatsApp or an email. */
export function inviteText(e: CalendarEvent): string {
  const d = new Date(e.start);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const lines = [e.title, e.allDay ? `${day}, all day` : `${day}, ${t(e.start)} to ${t(e.end)}`];
  if (e.location && !e.location.startsWith('http')) lines.push(`Where: ${e.location}`);
  if (e.meetingUrl) lines.push(`${meetingService(e.meetingUrl)}: ${e.meetingUrl}`);
  return lines.join('\n');
}
