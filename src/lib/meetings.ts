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
  const byKey = new Map<string, CalendarEvent>();
  for (const e of events) {
    const k = `${e.title.trim().toLowerCase()}|${e.start}|${e.end}|${e.allDay}`;
    const have = byKey.get(k);
    if (!have) { byKey.set(k, { ...e, accountIds: [e.accountId] }); continue; }
    if (!have.accountIds!.includes(e.accountId)) have.accountIds!.push(e.accountId);
    if (!have.meetingUrl && e.meetingUrl) have.meetingUrl = e.meetingUrl;
  }
  return [...byKey.values()];
}

/** Meetings with a video link that start within the next few minutes (or have started and not ended). */
export function meetingsSoon(events: CalendarEvent[], now = Date.now(), leadMinutes = 5): CalendarEvent[] {
  return dedupeEvents(events)
    .filter((e) => e.meetingUrl && !e.allDay && e.start - leadMinutes * 60000 <= now && e.end > now)
    .sort((a, b) => a.start - b.start);
}
