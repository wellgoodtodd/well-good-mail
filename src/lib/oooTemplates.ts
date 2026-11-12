// Out of Office templates, like Lightroom presets: a name and the parts of the plan it keeps. Applying one changes
// only those parts. Dates are kept as a weekday and a length ("a Friday, back 3 days later"), never fixed days, so a
// template never goes out of date.
import { dayStart, ymd, type OooMessage, type OooPlan } from './ooo';

export type OooPart =
  | 'subject' | 'message' | 'outside'
  | 'mode' | 'days' | 'times'
  | 'audience' | 'outsideAudience'
  | 'addEvent' | 'remindBefore' | 'decline' | 'pauseAlerts' | 'awaySummary'
  | 'accounts' | 'own';

/** The groups in the Save dialog, each ticked whole or one part at a time. */
export const PART_GROUPS: { id: string; label: string; parts: { id: OooPart; label: string }[] }[] = [
  { id: 'message', label: 'Message', parts: [{ id: 'subject', label: 'Subject' }, { id: 'message', label: 'Away message' }, { id: 'outside', label: 'Message for people outside my organisation' }] },
  { id: 'when', label: 'When', parts: [{ id: 'mode', label: 'Until I turn it off, or between dates' }, { id: 'days', label: 'Which days' }, { id: 'times', label: 'Part-day times' }] },
  { id: 'who', label: 'Who gets it', parts: [{ id: 'audience', label: 'Who gets it' }, { id: 'outsideAudience', label: 'Outside my organisation (Microsoft)' }] },
  { id: 'away', label: "While I'm away", parts: [{ id: 'addEvent', label: 'Away event in my calendar' }, { id: 'remindBefore', label: 'Remind me the day before it ends' }, { id: 'decline', label: 'Decline new invitations' }, { id: 'pauseAlerts', label: 'Pause new-mail alerts' }, { id: 'awaySummary', label: '"While you were away" when I\'m back' }] },
  { id: 'accounts', label: 'Accounts', parts: [{ id: 'accounts', label: 'Which accounts are ticked' }, { id: 'own', label: "Each account's own message" }] },
];

export const ALL_PARTS: OooPart[] = PART_GROUPS.flatMap((g) => g.parts.map((p) => p.id));

/** The days away as a pattern: the weekday of the first day (0 Sunday) and how many days later you're back. */
export interface OooDays { weekday: number; length: number }

export interface OooTemplate {
  id: string;
  name: string;
  parts: OooPart[];
  /** Subject, message and outside message are kept apart, so each can be ticked on its own. */
  message?: Partial<OooMessage>;
  values: Partial<Omit<OooPlan, 'message' | 'firstDay' | 'backOn'>>;
  days?: OooDays;
  /** The template it was copied from, if any. */
  copiedFrom?: string;
}

const DAY = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The days between two YYYY-MM-DD dates, ignoring the clock change. */
const daysBetween = (a: string, b: string) => Math.round((dayStart(b) - dayStart(a)) / DAY);

/** A template from the plan as it is now, keeping only the ticked parts. `editing` is the account whose own message is showing. */
export function templateFromPlan(name: string, parts: OooPart[], plan: OooPlan, opts: { id?: string; editing?: string } = {}): OooTemplate {
  const has = (p: OooPart) => parts.includes(p);
  const msg = opts.editing && plan.own[opts.editing] ? plan.own[opts.editing] : plan.message;
  const message: Partial<OooMessage> = {};
  if (has('subject')) message.subject = msg.subject;
  if (has('message')) message.html = msg.html;
  if (has('outside') && msg.outsideHtml) message.outsideHtml = msg.outsideHtml;
  const values: OooTemplate['values'] = {};
  if (has('mode')) values.mode = plan.mode;
  if (has('times')) { values.useTimes = plan.useTimes; values.startTime = plan.startTime; values.backTime = plan.backTime; }
  if (has('audience')) values.audience = plan.audience;
  if (has('outsideAudience')) { values.outsideAudience = plan.outsideAudience; values.outsideDifferent = plan.outsideDifferent; }
  for (const k of ['addEvent', 'remindBefore', 'decline', 'pauseAlerts', 'awaySummary'] as const) if (has(k)) values[k] = plan[k];
  if (has('accounts')) values.accounts = [...plan.accounts];
  if (has('own')) values.own = JSON.parse(JSON.stringify(plan.own));
  const days = has('days') && plan.firstDay && plan.backOn
    ? { weekday: new Date(dayStart(plan.firstDay)).getDay(), length: Math.max(1, daysBetween(plan.firstDay, plan.backOn)) }
    : undefined;
  return { id: opts.id || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), parts: ALL_PARTS.filter(has), message: Object.keys(message).length ? message : undefined, values, days };
}

/** The next day on or after today that falls on the weekday, as YYYY-MM-DD. */
export function nextWeekday(weekday: number, now = Date.now()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return ymd(d.getTime());
}

/**
 * The plan with a template's parts put in. The message parts go to the message being edited (an account's own one,
 * or the default). Days become the next matching dates, which can still be changed.
 */
export function applyTemplate(plan: OooPlan, t: OooTemplate, opts: { editing?: string; now?: number } = {}): OooPlan {
  const next: OooPlan = { ...plan, ...t.values };
  if (t.values.own) next.own = JSON.parse(JSON.stringify(t.values.own));
  if (t.message && Object.keys(t.message).length) {
    const onOwn = opts.editing && next.own[opts.editing];
    const base = onOwn ? next.own[opts.editing!] : next.message;
    const merged = { ...base, ...t.message };
    if (onOwn) next.own = { ...next.own, [opts.editing!]: merged }; else next.message = merged;
  }
  if (t.days) {
    next.firstDay = nextWeekday(t.days.weekday, opts.now);
    next.backOn = ymd(dayStart(next.firstDay) + t.days.length * DAY + 12 * 3600000);
    if (!t.values.mode) next.mode = 'dates';
  }
  return next;
}

/** "Fridays, back 3 days later (Monday)", with times when the template keeps them. */
export function daysWords(d: OooDays, times?: { useTimes?: boolean; startTime?: string; backTime?: string }): string {
  const back = WEEKDAYS[(d.weekday + d.length) % 7];
  const t = times?.useTimes;
  const later = d.length === 1 ? 'the next day' : d.length === 7 ? 'a week later' : d.length % 7 === 0 ? `${d.length / 7} weeks later` : `${d.length} days later`;
  return `From a ${WEEKDAYS[d.weekday]}${t ? ` at ${times!.startTime}` : ''}, back ${later} (${back}${t ? ` at ${times!.backTime}` : ''})`;
}

/** A short line saying what a template sets: "Message · From a Friday at 13:00 … · Everyone". */
export function templateSummary(t: OooTemplate, accountName: (id: string) => string = (id) => id): string {
  const out: string[] = [];
  if (t.message?.html || t.message?.subject) out.push(t.message.html ? 'Message' : 'Subject');
  if (t.days) out.push(daysWords(t.days, t.values.useTimes !== undefined ? t.values : undefined));
  else if (t.values.mode === 'open') out.push('Until I turn it off');
  else if (t.values.useTimes) out.push(`${t.values.startTime} to ${t.values.backTime}`);
  if (t.values.audience) out.push(t.values.audience === 'contacts' ? 'Contacts only' : t.values.audience === 'org' ? 'My organisation only' : 'Everyone');
  if (t.parts.some((p) => ['addEvent', 'remindBefore', 'decline', 'pauseAlerts', 'awaySummary'].includes(p))) out.push("While I'm away options");
  if (t.values.accounts) out.push(t.values.accounts.length ? t.values.accounts.map(accountName).join(', ') : 'No accounts');
  return out.join(' · ') || 'Nothing ticked';
}

/** Which parts a template changes, in a few words for the menu: "message · when · who". */
export function partsWords(t: OooTemplate): string {
  const groups = PART_GROUPS.filter((g) => g.parts.some((p) => t.parts.includes(p.id)));
  return groups.map((g) => (g.id === 'away' ? 'extras' : g.id === 'who' ? 'who' : g.label.toLowerCase())).join(' · ');
}

/** A copy with a new id and "copy" on the name, kept clear of names already used. */
export function copyTemplate(t: OooTemplate, taken: string[]): OooTemplate {
  let name = `${t.name} copy`;
  for (let n = 2; taken.some((x) => x.toLowerCase() === name.toLowerCase()); n++) name = `${t.name} copy ${n}`;
  return { ...JSON.parse(JSON.stringify(t)), id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, copiedFrom: t.name };
}

/** The template with this name, ignoring capitals and spaces at the ends. */
export const findTemplate = (list: OooTemplate[], name: string) => list.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());

/** Plain JSON with the keys in order, so two values that mean the same compare equal. */
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : x));

/** One part of a template, as the value that matters for comparing. */
function partValue(t: OooTemplate, p: OooPart): unknown {
  const v = t.values;
  switch (p) {
    case 'subject': return t.message?.subject;
    case 'message': return t.message?.html;
    case 'outside': return t.message?.outsideHtml || undefined;
    case 'days': return t.days;
    case 'times': return [v.useTimes, v.startTime, v.backTime];
    case 'outsideAudience': return [v.outsideAudience, v.outsideDifferent];
    case 'accounts': return v.accounts ? [...v.accounts].sort() : undefined;
    default: return v[p as 'mode' | 'audience' | 'addEvent' | 'own'];
  }
}

/**
 * The parts a template keeps that are set differently on the page now, for the Changed pill. `editing` is the account
 * whose own message the template went into when it was applied, if any.
 */
export function templateChanges(t: OooTemplate, plan: OooPlan, editing?: string): OooPart[] {
  const now = templateFromPlan(t.name, t.parts, plan, { id: t.id, editing });
  return t.parts.filter((p) => stable(partValue(now, p)) !== stable(partValue(t, p)));
}

/** The groups those parts belong to, in words: "the message and who gets it". */
export function changedWords(parts: OooPart[]): string {
  const names: Record<string, string> = { message: 'the message', when: 'when', who: 'who gets it', away: "what happens while you're away", accounts: 'the accounts' };
  const groups = PART_GROUPS.filter((g) => g.parts.some((p) => parts.includes(p.id))).map((g) => names[g.id]);
  return groups.length <= 1 ? groups.join('') : `${groups.slice(0, -1).join(', ')} and ${groups[groups.length - 1]}`;
}

/** The template on the page again: the parts it keeps, saved from the page as it is now. */
export function updateTemplateFromPlan(t: OooTemplate, plan: OooPlan, editing?: string): OooTemplate {
  return { ...templateFromPlan(t.name, t.parts, plan, { id: t.id, editing }), copiedFrom: t.copiedFrom };
}
