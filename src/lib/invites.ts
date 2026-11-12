// Calendar invitations that arrive by email: reading the .ics, and building the reply for Yes, No and Maybe.
import { findMeetingUrl } from './meetings';
import type { CalendarEvent, GuestAnswer } from './types';
import { parseProp, parseTime, unescapeText, unfold } from './dav';

export type Rsvp = 'accepted' | 'declined' | 'tentative';

export interface InvitePerson { email: string; name?: string; status?: string }

export interface Invite {
  /** REQUEST (an invitation), CANCEL, REPLY (someone answered) or PUBLISH. */
  method: string;
  uid: string;
  sequence: number;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  description?: string;
  meetingUrl?: string;
  organizer?: InvitePerson;
  attendees: InvitePerson[];
  /** The original start and end lines, so a reply can repeat them exactly. */
  startLine: string;
  endLine?: string;
}

const personOf = (p: { params: Record<string, string>; value: string }): InvitePerson | undefined => {
  const email = p.value.replace(/^mailto:/i, '').trim().toLowerCase();
  if (!email.includes('@')) return undefined;
  return { email, name: p.params.CN ? unescapeText(p.params.CN) : undefined, status: p.params.PARTSTAT?.toUpperCase() };
};

/** The first event in some calendar text, or undefined when it isn't an invitation we can read. */
export function parseInvite(ics: string): Invite | undefined {
  let method = '';
  let inEvent = false;
  let done = false;
  let inAlarm = false;
  const ev: Partial<Invite> & { attendees: InvitePerson[] } = { attendees: [] };
  let startMs = NaN;
  let endMs = NaN;
  let duration = '';
  for (const line of unfold(ics).split(/\r?\n/)) {
    if (!line || done) continue;
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { inEvent = true; continue; }
    if (upper === 'END:VEVENT') { done = true; continue; }
    if (upper === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (upper === 'END:VALARM') { inAlarm = false; continue; }
    if (line.indexOf(':') < 0 || inAlarm) continue;
    const p = parseProp(line);
    if (!inEvent) { if (p.name === 'METHOD') method = p.value.trim().toUpperCase(); continue; }
    if (p.name === 'UID') ev.uid = p.value.trim();
    else if (p.name === 'SEQUENCE') ev.sequence = Number(p.value) || 0;
    else if (p.name === 'SUMMARY') ev.title = unescapeText(p.value);
    else if (p.name === 'LOCATION') ev.location = unescapeText(p.value) || undefined;
    else if (p.name === 'DESCRIPTION') ev.description = unescapeText(p.value) || undefined;
    else if (p.name === 'DTSTART') { const t = parseTime(p.value, p.params); startMs = t.ms; ev.allDay = t.allDay; ev.startLine = line; }
    else if (p.name === 'DTEND') { endMs = parseTime(p.value, p.params).ms; ev.endLine = line; }
    else if (p.name === 'DURATION') duration = p.value;
    else if (p.name === 'ORGANIZER') ev.organizer = personOf(p);
    else if (p.name === 'ATTENDEE') { const a = personOf(p); if (a) ev.attendees.push(a); }
  }
  if (!ev.uid || !Number.isFinite(startMs) || !ev.startLine) return undefined;
  if (!Number.isFinite(endMs)) {
    const m = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
    endMs = m ? startMs + ((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) * 60000 : ev.allDay ? startMs + 86400000 : startMs;
  }
  return {
    method: method || 'PUBLISH',
    uid: ev.uid,
    sequence: ev.sequence || 0,
    title: ev.title || '(no title)',
    start: startMs,
    end: endMs,
    allDay: Boolean(ev.allDay),
    location: ev.location,
    description: ev.description,
    meetingUrl: findMeetingUrl(ev.location, ev.description),
    organizer: ev.organizer,
    attendees: ev.attendees,
    startLine: ev.startLine,
    endLine: ev.endLine,
  };
}

/** Which of the invited people is you, going by the addresses this account answers to. */
export function whichIsMe(invite: Invite, mine: string[]): InvitePerson | undefined {
  const set = new Set(mine.map((m) => m.toLowerCase()));
  return invite.attendees.find((a) => set.has(a.email));
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Calendar text for an answer to an invitation (METHOD:REPLY), to email back to the organiser. */
export function buildReply(invite: Invite, me: InvitePerson, status: Rsvp, now = Date.now()): string {
  const part = status.toUpperCase();
  return [
    'BEGIN:VCALENDAR',
    'PRODID:-//Well Good Media//Well Good Mail//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${stamp(now)}`,
    invite.startLine,
    ...(invite.endLine ? [invite.endLine] : []),
    ...(invite.organizer ? [`ORGANIZER:mailto:${invite.organizer.email}`] : []),
    `ATTENDEE;PARTSTAT=${part}${me.name ? `;CN=${escapeText(me.name)}` : ''}:mailto:${me.email}`,
    `SUMMARY:${escapeText(invite.title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** The words for each answer: the button (Accept / Maybe / Decline, as in Apple Calendar and Outlook), the reply subject, and how it reads afterwards. */
export const RSVP_WORDS: Record<Rsvp, { label: string; subject: string; past: string }> = {
  accepted: { label: 'Accept', subject: 'Accepted', past: 'Going' },
  declined: { label: 'Decline', subject: 'Declined', past: 'Not going' },
  tentative: { label: 'Maybe', subject: 'Tentatively accepted', past: 'Maybe' },
};

/** The order the answer buttons go in. */
export const RSVP_ORDER: Rsvp[] = ['accepted', 'tentative', 'declined'];

/** Turns the PARTSTAT from an invitation into one of our answers, if the person has already replied. */
export function statusOf(p?: InvitePerson): Rsvp | undefined {
  switch (p?.status) {
    case 'ACCEPTED': return 'accepted';
    case 'DECLINED': return 'declined';
    case 'TENTATIVE': return 'tentative';
    default: return undefined;
  }
}

// ---------- Invitations in one place ----------

/** A calendar answer as one of ours (waiting is no answer yet). */
export const rsvpOfAnswer = (a?: GuestAnswer): Rsvp | undefined => (a === 'yes' ? 'accepted' : a === 'no' ? 'declined' : a === 'maybe' ? 'tentative' : undefined);
export const answerOfRsvp = (r: Rsvp): GuestAnswer => (r === 'accepted' ? 'yes' : r === 'declined' ? 'no' : 'maybe');

/** An event someone else invited you to: you're a guest on it and not the organiser. */
export function isInvitation(e: CalendarEvent): boolean {
  if (!e.myResponse || e.organiser?.self) return false;
  const me = e.guests?.find((g) => g.self);
  if (me?.organiser) return false;
  // Something you made with no guests has no answer to give.
  return Boolean(e.organiser || e.guests?.some((g) => !g.self));
}

/** The same invitation on two of your calendars counts once. */
export const inviteKey = (e: CalendarEvent) => `${e.title.trim().toLowerCase()}|${e.start}|${e.end}|${e.allDay}`;

export interface InvitationLists {
  /** Not answered yet (and cancelled ones still in your calendar), soonest first. */
  fresh: CalendarEvent[];
  /** Answered, still to come, soonest first. */
  replied: CalendarEvent[];
}

/** Splits upcoming invitations into New and Replied. Past events drop off. */
export function invitationLists(events: CalendarEvent[], now = Date.now()): InvitationLists {
  const seen = new Map<string, CalendarEvent>();
  for (const e of events) {
    if (e.end <= now || !isInvitation(e)) continue;
    const k = inviteKey(e);
    const have = seen.get(k);
    // Keep the copy still waiting for an answer, so it isn't hidden by an answered twin.
    if (!have || (have.myResponse !== 'waiting' && e.myResponse === 'waiting')) seen.set(k, e);
  }
  const all = [...seen.values()].sort((a, b) => a.start - b.start);
  return {
    fresh: all.filter((e) => e.cancelled || e.myResponse === 'waiting'),
    replied: all.filter((e) => !e.cancelled && e.myResponse !== 'waiting'),
  };
}

/** How many invitations wait for an answer (cancelled ones are left out of the count). */
export const newInvitationCount = (l: InvitationLists) => l.fresh.filter((e) => !e.cancelled).length;

/** The first other event at the same time that you're going to (or might), for "Clashes with...". All-day events don't clash. */
export function clashFor(inv: CalendarEvent, events: CalendarEvent[]): CalendarEvent | undefined {
  if (inv.allDay || inv.cancelled) return undefined;
  const k = inviteKey(inv);
  return events
    .filter((e) => e.id !== inv.id && !e.allDay && !e.cancelled && !e.declined && e.myResponse !== 'no' && inviteKey(e) !== k && e.start < inv.end && e.end > inv.start)
    .sort((a, b) => a.start - b.start)[0];
}

/** Every copy of an invitation (yours on several addresses), so one answer goes to all of them. */
export const copiesOf = (inv: CalendarEvent, events: CalendarEvent[]) => {
  const k = inviteKey(inv);
  const list = events.filter((e) => inviteKey(e) === k && isInvitation(e));
  return list.length ? list : [inv];
};
