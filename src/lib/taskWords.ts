// Quick add: "Ring the dentist Friday 3pm #studio" becomes a title, a due date and time, and a list.
import { en } from 'chrono-node';

export interface TaskWords {
  /** The title without the date words and the #list. */
  title: string;
  due?: number;
  hasTime: boolean;
  /** The words understood as a date, as typed (for highlighting). */
  dateText?: string;
  /** What followed a # (a list name, lower case). */
  listTag?: string;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function readTaskWords(text: string, now = Date.now()): TaskWords {
  let rest = text;
  let listTag: string | undefined;
  const tag = rest.match(/(^|\s)#([\p{L}\p{N}_-]+)/u);
  if (tag) {
    listTag = tag[2].toLowerCase();
    rest = (rest.slice(0, tag.index!) + rest.slice(tag.index! + tag[0].length)).trim();
  }
  // Only words that really name a day or time ("a second microphone" is not a time).
  const r = en.GB.parse(rest, new Date(now), { forwardDate: true }).find((x) => /\d|today|tomorrow|tonight|noon|midnight|\b(mon|tue|wed|thu|fri|sat|sun)|week|month|\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(x.text));
  if (!r) return { title: tidy(rest), hasTime: false, listTag };
  const hasTime = r.start.isCertain('hour');
  const hasDay = r.start.isCertain('day') || r.start.isCertain('weekday');
  if (!hasTime && !hasDay) return { title: tidy(rest), hasTime: false, listTag };
  let due = r.start.date().getTime();
  const day = new Date(due);
  const today = new Date(now);
  // "Friday" said on a Friday means next Friday, as people usually mean it.
  const word = r.text.toLowerCase();
  if (DAYS.some((d) => word.includes(d) || word.includes(d.slice(0, 3))) && !/\b(today|this)\b/.test(word) && day.toDateString() === today.toDateString()) due += 7 * 86400000;
  if (!hasTime) { const d = new Date(due); d.setHours(0, 0, 0, 0); due = d.getTime(); }
  // A time with no day that has already gone today means tomorrow.
  if (hasTime && !hasDay && due < now) due += 86400000;
  const title = tidy(rest.slice(0, r.index) + rest.slice(r.index + r.text.length));
  return { title: title || tidy(rest), due, hasTime, dateText: r.text, listTag };
}

function tidy(s: string): string {
  return s.replace(/\s+(at|on|by|for|from|due)\s*$/i, '').replace(/^\s*(on|by|due)\s+/i, '').replace(/\s{2,}/g, ' ').trim();
}
