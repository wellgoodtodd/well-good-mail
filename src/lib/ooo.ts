// Out of Office: the plain rules, kept free of the app so they can be tested. The reply itself is set inside each
// account (Gmail's vacation responder, Microsoft's automatic replies), so it keeps working with this computer off.
import type { Account } from './types';

/** Who gets the reply. "org" is people in your own organisation only (Google Workspace and Microsoft 365). */
export type OooAudience = 'all' | 'contacts' | 'org';
/** Microsoft only: who outside your organisation gets a reply. */
export type OooOutside = 'all' | 'contacts' | 'none';

/** What an account itself holds, in the same shape for Gmail and Microsoft. */
export interface AutoReply {
  on: boolean;
  /** Replies start (ms). None: straight away. */
  start?: number;
  /** Replies stop (ms). None: until turned off. */
  end?: number;
  /** Gmail only. */
  subject?: string;
  html: string;
  audience: OooAudience;
  /** Microsoft: a separate message for people outside your organisation. None: the same message. */
  outsideHtml?: string;
  outsideAudience?: OooOutside;
}

export interface OooMessage { subject: string; html: string; /** Microsoft: own message for outside the organisation. */ outsideHtml?: string }

export interface OooPlan {
  /** Accounts ticked for the next Turn on. */
  accounts: string[];
  mode: 'open' | 'dates';
  /** First day away, YYYY-MM-DD. Replies start at 00:00 (or startTime). */
  firstDay: string;
  /** The day you're back, YYYY-MM-DD. Replies stop at 00:00 that day (or backTime). */
  backOn: string;
  useTimes: boolean;
  startTime: string;
  backTime: string;
  audience: OooAudience;
  outsideAudience: OooOutside;
  /** Microsoft: use a different message for people outside the organisation. */
  outsideDifferent: boolean;
  /** The default away message. */
  message: OooMessage;
  /** Accounts with their own message instead of the default. */
  own: Record<string, OooMessage>;
  /** Accounts' own messages put aside while "Different message for each account" is off, so switching it back on brings them back. */
  ownParked?: Record<string, OooMessage>;
  /** The saved template last applied on the page (and the account message it went into), for the Changed pill. */
  lastTemplate?: { id: string; editing?: string };
  /** The template picked for each account's tab ("" for the shared message), so switching tabs shows that tab's own. */
  tabTemplates?: Record<string, string>;
  addEvent: boolean;
  remindBefore: boolean;
  decline: boolean;
  pauseAlerts: boolean;
  awaySummary: boolean;
}

/** What Well Good Mail itself remembers about a time away it turned on, for the extras (event, reminder, summary). */
export interface OooActive {
  accounts: string[];
  start: number;
  end?: number;
  /** Calendar events made for it, by account. */
  events: Record<string, string>;
  reminded?: boolean;
  /** "While you were away" has been shown. */
  summarised?: boolean;
  pauseAlerts?: boolean;
  awaySummary?: boolean;
}

export const BACK_TOKEN = '[back date]';

export const TEMPLATES: { id: string; name: string; subject: string; html: string }[] = [
  { id: 'away', name: 'Away', subject: 'Away, back on [back date]', html: `<p>Thanks for your email. I'm away and back on ${BACK_TOKEN}, with little access to email until then. I'll reply when I'm back.</p>` },
  { id: 'holiday', name: 'Holiday', subject: 'On holiday', html: `<p>Thanks for your email. I'm on holiday and back on ${BACK_TOKEN}. I'll reply as soon as I can when I'm back.</p>` },
  { id: 'conference', name: 'Conference', subject: 'At a conference', html: `<p>Thanks for your email. I'm at a conference until ${BACK_TOKEN} and checking email less often than usual. I'll reply as soon as I can.</p>` },
  { id: 'sick', name: 'Off sick', subject: 'Out of the office', html: '<p>Thanks for your email. I\'m off sick at the moment and not checking email. I\'ll reply when I\'m back.</p>' },
];

export const defaultPlan = (): OooPlan => {
  const today = ymd(Date.now());
  return {
    accounts: [],
    mode: 'dates',
    firstDay: today,
    backOn: ymd(Date.now() + 7 * 86400000),
    useTimes: false,
    startTime: '09:00',
    backTime: '09:00',
    audience: 'all',
    outsideAudience: 'all',
    outsideDifferent: false,
    message: { subject: TEMPLATES[0].subject, html: TEMPLATES[0].html },
    own: {},
    addEvent: true,
    remindBefore: true,
    decline: true,
    pauseAlerts: false,
    awaySummary: true,
  };
};

const pad = (n: number) => String(n).padStart(2, '0');
/** A time as YYYY-MM-DD in local time. */
export function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Local midnight (plus an optional HH:MM) of a YYYY-MM-DD day. */
export function dayStart(day: string, time?: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = (time || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
}

/** When replies start and stop for a plan. */
export function windowOf(p: Pick<OooPlan, 'mode' | 'firstDay' | 'backOn' | 'useTimes' | 'startTime' | 'backTime'>, now = Date.now()): { start?: number; end?: number } {
  if (p.mode === 'open') return {};
  const start = dayStart(p.firstDay, p.useTimes ? p.startTime : undefined);
  const end = dayStart(p.backOn, p.useTimes ? p.backTime : undefined);
  return { start: start <= now ? undefined : start, end };
}

/** Anything wrong with the dates, in plain words, or undefined. */
export function planProblem(p: OooPlan, now = Date.now()): string | undefined {
  if (!p.accounts.length) return 'Tick at least one account.';
  if (p.mode === 'open') return undefined;
  if (!p.firstDay || !p.backOn) return 'Choose your first day away and the day you\'re back.';
  const start = dayStart(p.firstDay, p.useTimes ? p.startTime : undefined);
  const end = dayStart(p.backOn, p.useTimes ? p.backTime : undefined);
  if (end <= start) return 'The day you\'re back needs to be after your first day away.';
  if (end <= now) return 'The day you\'re back has already passed.';
  return undefined;
}

const dayWords = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const longDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const timeWords = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** One plain sentence saying exactly when replies start and stop. */
export function whenSentence(p: OooPlan, now = Date.now()): string {
  if (p.mode === 'open') return 'Replies start as soon as you turn it on, and stop when you turn it off.';
  if (!p.firstDay || !p.backOn) return '';
  const start = dayStart(p.firstDay, p.useTimes ? p.startTime : undefined);
  const end = dayStart(p.backOn, p.useTimes ? p.backTime : undefined);
  if (end <= start) return '';
  const from = start <= now ? 'Replies start as soon as you turn it on' : p.useTimes ? `Replies start on ${dayWords(start)} at ${timeWords(start)}` : `Replies start on ${dayWords(start)} (from midnight)`;
  const lastDay = end - 1;
  const to = p.useTimes ? `stop on ${dayWords(end)} at ${timeWords(end)}` : `stop at the end of ${dayWords(lastDay)}`;
  return `${from}, and ${to}. You're back on ${dayWords(end)}, and it switches itself off then.`;
}

/** The back date as written into a message: "Monday 23 November". */
export const backDateWords = (end?: number) => (end ? longDay(end) : '');

/** Swaps the [back date] marker for the real date (or a plain phrase when there isn't one). */
export function fillBackDate(text: string, end?: number): string {
  return text.split(BACK_TOKEN).join(end ? backDateWords(end) : 'soon');
}

/** The message an account will use: its own, or the default. */
export const messageFor = (p: OooPlan, accountId: string): OooMessage => p.own[accountId] || p.message;

/** "Different message for each account" is on: an account that's switched on has its own message. */
export const perAccountOn = (p: OooPlan): boolean => p.accounts.some((id) => Boolean(p.own[id]));

/**
 * Switches "Different message for each account" on or off. On: every switched-on account gets its own message, the
 * one put aside earlier or else a copy of the shared one. Off: the own messages are put aside (not lost), so the
 * shared message is used everywhere until it's switched back on.
 */
export function setPerAccount(p: OooPlan, on: boolean): OooPlan {
  if (on) {
    const own = { ...p.own };
    const parked = { ...(p.ownParked || {}) };
    for (const id of p.accounts) {
      if (own[id]) continue;
      own[id] = parked[id] ? { ...parked[id] } : { ...p.message };
      delete parked[id];
    }
    return { ...p, own, ownParked: parked };
  }
  return { ...p, own: {}, ownParked: { ...(p.ownParked || {}), ...p.own } };
}

/** Switches one account on or off. With different messages on, an account switched on gets its own message too. */
export function setAccountOn(p: OooPlan, id: string, on: boolean): OooPlan {
  if (!on) return { ...p, accounts: p.accounts.filter((x) => x !== id) };
  if (p.accounts.includes(id)) return p;
  const perAccount = perAccountOn(p);
  const next = { ...p, accounts: [...p.accounts, id] };
  return perAccount ? setPerAccount(next, true) : next;
}

/** What a kind of account can do. */
export interface OooSupport {
  /** Set inside the account itself. */
  native: boolean;
  /** "People in my organisation only" is available. */
  org: boolean;
  /** A separate message for outside the organisation (Microsoft). */
  outside: boolean;
  /** Decline new invitations while away (Google Workspace). */
  decline: boolean;
  /** The reply has its own subject line (Gmail). */
  subject: boolean;
  /** Where to set it instead, for accounts the app can't set. */
  webUrl?: string;
  webName?: string;
}

const CONSUMER = /@(gmail|googlemail|outlook|hotmail|live|msn|icloud|me|mac|yahoo|aol)\./i;
export const isWorkAccount = (email: string) => !CONSUMER.test(email);

export function oooSupport(a: Pick<Account, 'kind' | 'email' | 'imap'>): OooSupport {
  const work = isWorkAccount(a.email);
  if (a.kind === 'gmail') return { native: true, org: work, outside: false, decline: work, subject: true };
  if (a.kind === 'microsoft') return { native: true, org: work, outside: true, decline: false, subject: false };
  if (a.kind === 'demo') return { native: true, org: true, outside: false, decline: true, subject: true };
  const host = a.imap?.host || '';
  if (/icloud|me\.com/i.test(host) || /@(icloud|me|mac)\./i.test(a.email)) return { native: false, org: false, outside: false, decline: false, subject: false, webUrl: 'https://www.icloud.com/mail/', webName: 'iCloud Mail on the web' };
  if (/yahoo/i.test(host)) return { native: false, org: false, outside: false, decline: false, subject: false, webUrl: 'https://mail.yahoo.com/', webName: 'Yahoo Mail on the web' };
  if (/fastmail/i.test(host)) return { native: false, org: false, outside: false, decline: false, subject: false, webUrl: 'https://app.fastmail.com/settings/', webName: 'Fastmail settings' };
  return { native: false, org: false, outside: false, decline: false, subject: false };
}

/** An account's state in a few words, for its chip and the sidebar. */
export function stateWords(r: AutoReply | undefined, now = Date.now()): { state: 'off' | 'on' | 'scheduled'; words: string } {
  if (!r || !r.on || (r.end && r.end <= now)) return { state: 'off', words: 'Off' };
  if (r.start && r.start > now) return { state: 'scheduled', words: `Scheduled from ${dayWords(r.start)}` };
  return { state: 'on', words: r.end ? `On until ${dayWords(r.end - 1)}` : 'On' };
}

/** True while replies are going out now. */
export const isAway = (r: AutoReply | undefined, now = Date.now()) => stateWords(r, now).state === 'on';

/** Plain text from the message HTML, for Gmail's plain-text copy and previews. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text (from an AI app) to simple paragraphs. */
export function textToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Words that mark a calendar event as time off, for suggesting out of office. */
export const AWAY_WORDS = /\b(holiday|holidays|annual leave|vacation|leave|out of (the )?office|ooo|time off|away|pto)\b/i;
