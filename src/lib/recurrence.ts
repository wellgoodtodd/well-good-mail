// How a repeating event repeats, in one shape the app understands, so a series can be copied between a Google
// calendar (RRULE lines) and an Outlook one (Graph's pattern and range). Rules that don't fit the common shapes
// come back undefined, and the caller says it can't be copied rather than copying it wrongly.
import type { Repeat } from './types';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const GRAPH_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const GRAPH_INDEX: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayStartOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const sortDays = (days: string[]) => [...new Set(days)].sort((a, b) => DAYS.indexOf(a as never) - DAYS.indexOf(b as never));

/** Reads an RRULE line ("RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261217T235959Z"). */
export function fromRrule(line: string, startMs: number): Repeat | undefined {
  const parts: Record<string, string> = {};
  for (const bit of line.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = bit.split('=');
    if (k && v !== undefined) parts[k.toUpperCase()] = v.toUpperCase();
  }
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'COUNT', 'UNTIL', 'WKST']);
  if (Object.keys(parts).some((k) => !known.has(k))) return undefined;
  const freq = ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as Record<string, Repeat['freq'] | undefined>)[parts.FREQ];
  if (!freq) return undefined;
  const rep: Repeat = { freq, interval: Math.max(1, Number(parts.INTERVAL || 1)) };
  const start = new Date(startMs);
  if (parts.BYDAY) {
    const items = parts.BYDAY.split(',');
    const nths = items.map((x) => /^([+-]?\d)?([A-Z]{2})$/.exec(x));
    if (nths.some((m) => !m || !DAYS.includes(m[2] as never))) return undefined;
    const withNumber = nths.filter((m) => m![1]);
    if (freq === 'weekly' || freq === 'daily') {
      if (withNumber.length) return undefined;
      rep.freq = 'weekly';
      rep.days = sortDays(nths.map((m) => m![2]));
    } else {
      // Monthly or yearly "on the second Tuesday": one day, numbered there or by BYSETPOS.
      if (items.length !== 1) return undefined;
      const n = Number(nths[0]![1] || parts.BYSETPOS || 0);
      if (![1, 2, 3, 4, -1].includes(n)) return undefined;
      rep.nth = n;
      rep.days = [nths[0]![2]];
    }
  } else if (freq === 'weekly') rep.days = [DAYS[start.getDay()]];
  if (freq === 'monthly' || freq === 'yearly') {
    if (parts.BYMONTHDAY) { if (parts.BYMONTHDAY.includes(',') || Number(parts.BYMONTHDAY) < 1) return undefined; rep.monthDay = Number(parts.BYMONTHDAY); }
    else if (!rep.nth) rep.monthDay = start.getDate();
    if (freq === 'yearly') { if (parts.BYMONTH?.includes(',')) return undefined; rep.month = Number(parts.BYMONTH || start.getMonth() + 1); }
  }
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
    if (!m) return undefined;
    // The last day it happens on, as a local day.
    const t = /T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(parts.UNTIL);
    const at = t
      ? (t[4] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], +t[3]) : new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], +t[3]).getTime())
      : new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    rep.until = dayStartOf(at);
  }
  if (parts.COUNT) rep.count = Number(parts.COUNT);
  return rep;
}

/** The RRULE line for a repeat. All-day series end on a date; timed ones at the end of that day, in UTC as Google wants. */
export function toRrule(rep: Repeat, allDay: boolean): string {
  const bits = [`FREQ=${rep.freq.toUpperCase()}`];
  if (rep.interval > 1) bits.push(`INTERVAL=${rep.interval}`);
  if (rep.days?.length) bits.push(`BYDAY=${rep.nth ? `${rep.nth}${rep.days[0]}` : rep.days.join(',')}`);
  if (rep.monthDay && (rep.freq === 'monthly' || rep.freq === 'yearly')) bits.push(`BYMONTHDAY=${rep.monthDay}`);
  if (rep.month && rep.freq === 'yearly') bits.push(`BYMONTH=${rep.month}`);
  if (rep.until !== undefined) {
    const d = new Date(rep.until);
    if (allDay) bits.push(`UNTIL=${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`);
    else { const e = new Date(dayStartOf(rep.until) + 86400000 - 1000); bits.push(`UNTIL=${e.getUTCFullYear()}${pad(e.getUTCMonth() + 1)}${pad(e.getUTCDate())}T${pad(e.getUTCHours())}${pad(e.getUTCMinutes())}${pad(e.getUTCSeconds())}Z`); }
  } else if (rep.count) bits.push(`COUNT=${rep.count}`);
  return `RRULE:${bits.join(';')}`;
}

export interface GraphRecurrence {
  pattern: { type: string; interval: number; daysOfWeek?: string[]; dayOfMonth?: number; month?: number; index?: string; firstDayOfWeek?: string };
  range: { type: string; startDate: string; endDate?: string; numberOfOccurrences?: number; recurrenceTimeZone?: string };
}

/** Reads Outlook's pattern and range. */
export function fromGraph(r: GraphRecurrence | null | undefined): Repeat | undefined {
  if (!r?.pattern) return undefined;
  const p = r.pattern;
  const days = (p.daysOfWeek || []).map((d) => DAYS[GRAPH_DAYS.indexOf(d.toLowerCase())]).filter(Boolean);
  const nth = p.index ? Number(Object.keys(GRAPH_INDEX).find((k) => GRAPH_INDEX[Number(k)] === p.index)) : undefined;
  let rep: Repeat;
  switch (p.type) {
    case 'daily': rep = { freq: 'daily', interval: p.interval || 1 }; break;
    case 'weekly': rep = { freq: 'weekly', interval: p.interval || 1, days: sortDays(days) }; break;
    case 'absoluteMonthly': rep = { freq: 'monthly', interval: p.interval || 1, monthDay: p.dayOfMonth }; break;
    case 'relativeMonthly': if (days.length !== 1 || !nth) return undefined; rep = { freq: 'monthly', interval: p.interval || 1, days, nth }; break;
    case 'absoluteYearly': rep = { freq: 'yearly', interval: p.interval || 1, monthDay: p.dayOfMonth, month: p.month }; break;
    case 'relativeYearly': if (days.length !== 1 || !nth) return undefined; rep = { freq: 'yearly', interval: p.interval || 1, days, nth, month: p.month }; break;
    default: return undefined;
  }
  if (r.range?.type === 'endDate' && r.range.endDate) { const [y, m, d] = r.range.endDate.split('-').map(Number); rep.until = new Date(y, m - 1, d).getTime(); }
  if (r.range?.type === 'numbered' && r.range.numberOfOccurrences) rep.count = r.range.numberOfOccurrences;
  return rep;
}

/** Outlook's pattern and range for a repeat starting at startMs. */
export function toGraph(rep: Repeat, startMs: number, timeZone: string): GraphRecurrence {
  const days = (rep.days || []).map((d) => GRAPH_DAYS[DAYS.indexOf(d as never)]);
  const interval = rep.interval;
  let pattern: GraphRecurrence['pattern'];
  if (rep.freq === 'daily') pattern = { type: 'daily', interval };
  else if (rep.freq === 'weekly') pattern = { type: 'weekly', interval, daysOfWeek: days.length ? days : [GRAPH_DAYS[new Date(startMs).getDay()]], firstDayOfWeek: 'monday' };
  else if (rep.freq === 'monthly') pattern = rep.nth ? { type: 'relativeMonthly', interval, daysOfWeek: days, index: GRAPH_INDEX[rep.nth] } : { type: 'absoluteMonthly', interval, dayOfMonth: rep.monthDay || new Date(startMs).getDate() };
  else pattern = rep.nth ? { type: 'relativeYearly', interval, daysOfWeek: days, index: GRAPH_INDEX[rep.nth], month: rep.month || new Date(startMs).getMonth() + 1 } : { type: 'absoluteYearly', interval, dayOfMonth: rep.monthDay || new Date(startMs).getDate(), month: rep.month || new Date(startMs).getMonth() + 1 };
  const range: GraphRecurrence['range'] = rep.until !== undefined
    ? { type: 'endDate', startDate: ymd(startMs), endDate: ymd(rep.until), recurrenceTimeZone: timeZone }
    : rep.count ? { type: 'numbered', startDate: ymd(startMs), numberOfOccurrences: rep.count, recurrenceTimeZone: timeZone }
      : { type: 'noEnd', startDate: ymd(startMs), recurrenceTimeZone: timeZone };
  return { pattern, range };
}

const DAY_NAMES: Record<string, string> = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
const ORDINAL: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const th = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** "Every Thursday, until 17 Dec", "Every other Monday", "On the 1st of every month". */
export function describeRepeat(rep: Repeat): string {
  const every = (unit: string) => (rep.interval === 1 ? `Every ${unit}` : rep.interval === 2 ? `Every other ${unit}` : `Every ${rep.interval} ${unit}s`);
  let words: string;
  const dayList = (rep.days || []).map((d) => DAY_NAMES[d]);
  const joined = dayList.length > 1 ? `${dayList.slice(0, -1).join(', ')} and ${dayList[dayList.length - 1]}` : dayList[0];
  if (rep.freq === 'daily') words = every('day');
  else if (rep.freq === 'weekly') words = dayList.length === 5 && !dayList.includes('Saturday') && !dayList.includes('Sunday') && rep.interval === 1 ? 'Every weekday' : `${every(rep.interval === 1 ? joined || 'week' : 'week')}${rep.interval > 1 && joined ? `, on ${joined}` : ''}`;
  else if (rep.freq === 'monthly') words = rep.nth ? `On the ${ORDINAL[rep.nth]} ${joined} of ${rep.interval === 1 ? 'every month' : `every ${rep.interval} months`}` : `On the ${th(rep.monthDay || 1)} of ${rep.interval === 1 ? 'every month' : `every ${rep.interval} months`}`;
  else words = rep.nth ? `Every year on the ${ORDINAL[rep.nth]} ${joined} of ${MONTHS[(rep.month || 1) - 1]}` : `Every year on ${rep.monthDay} ${MONTHS[(rep.month || 1) - 1]}`;
  if (rep.until !== undefined) words += `, until ${new Date(rep.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(rep.until).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}`;
  else if (rep.count) words += `, ${rep.count} times`;
  return words;
}

/** Windows' name for the time zone, which Outlook understands everywhere; the IANA name otherwise. */
export function outlookTimeZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const map: Record<string, string> = {
    'Europe/London': 'GMT Standard Time', 'Europe/Dublin': 'GMT Standard Time', 'Europe/Lisbon': 'GMT Standard Time',
    'Europe/Paris': 'Romance Standard Time', 'Europe/Brussels': 'Romance Standard Time', 'Europe/Madrid': 'Romance Standard Time',
    'Europe/Berlin': 'W. Europe Standard Time', 'Europe/Amsterdam': 'W. Europe Standard Time', 'Europe/Rome': 'W. Europe Standard Time', 'Europe/Zurich': 'W. Europe Standard Time', 'Europe/Stockholm': 'W. Europe Standard Time', 'Europe/Oslo': 'W. Europe Standard Time',
    'America/New_York': 'Eastern Standard Time', 'America/Toronto': 'Eastern Standard Time', 'America/Chicago': 'Central Standard Time', 'America/Denver': 'Mountain Standard Time', 'America/Los_Angeles': 'Pacific Standard Time', 'America/Vancouver': 'Pacific Standard Time',
    'Australia/Sydney': 'AUS Eastern Standard Time', 'Australia/Melbourne': 'AUS Eastern Standard Time', 'Australia/Brisbane': 'E. Australia Standard Time', 'Australia/Perth': 'W. Australia Standard Time', 'Pacific/Auckland': 'New Zealand Standard Time',
    UTC: 'UTC',
  };
  return map[tz] || tz;
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
