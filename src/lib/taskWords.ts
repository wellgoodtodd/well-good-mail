// Quick add: "Ring the dentist Friday 3pm #studio" becomes a title, a due date and time, and a list.
// Also everyday British ways of saying a time: "this morning at 930", "tonight", "Friday morning", "half 9",
// "quarter to 6", and "at 2" meaning the afternoon.
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
type Part = 'morning' | 'afternoon' | 'evening' | 'night';
/** The time a part of the day means when no time is said. */
const PART_HOUR: Record<Part, number> = { morning: 9, afternoon: 14, evening: 18, night: 19 };
const DAY_WORD = String.raw`(?:today|tomorrow|(?:next\s+|this\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)`;

/** "930" → "9:30" when it's clearly a time: after "at", or after a day or part of the day. */
function colonTimes(s: string): string {
  const fix = (h: string, m: string) => (Number(h) <= 23 && Number(m) <= 59 ? `${Number(h)}:${m}` : null);
  return s
    .replace(new RegExp(String.raw`\b(at|${DAY_WORD}|morning|afternoon|evening|tonight)\s+(\d{1,2})(\d{2})\b`, 'gi'), (all, w: string, h: string, m: string) => {
      const t = fix(h, m);
      return t ? `${w} ${t}` : all;
    });
}

/** "half 9" → "9:30", "quarter past 4" → "4:15", "quarter to 6" → "5:45". */
function spokenTimes(s: string): string {
  return s
    .replace(/\bhalf\s+(?:past\s+)?(\d{1,2})\b/gi, (_, h: string) => `${h}:30`)
    .replace(/\bquarter\s+past\s+(\d{1,2})\b/gi, (_, h: string) => `${h}:15`)
    .replace(/\bquarter\s+to\s+(\d{1,2})\b/gi, (_, h: string) => `${((Number(h) + 10) % 12) + 1}:45`);
}

/** Takes out a part of the day ("this morning", "tonight", "Friday evening"), leaving any day word for chrono. */
function takePart(s: string): { rest: string; part?: Part; today: boolean; said?: string } {
  const m = s.match(new RegExp(String.raw`\b(?:this\s+(morning|afternoon|evening)|(tonight)|(${DAY_WORD})\s+(morning|afternoon|evening|night))\b`, 'i'));
  if (!m) return { rest: s, today: false };
  const part = (m[1] || (m[2] ? 'night' : m[4])).toLowerCase() as Part;
  const rest = m[3] ? s.slice(0, m.index!) + m[3] + s.slice(m.index! + m[0].length) : s.slice(0, m.index!) + s.slice(m.index! + m[0].length);
  return { rest, part, today: !m[3], said: m[0] };
}

export function readTaskWords(text: string, now = Date.now()): TaskWords {
  let rest = text;
  let listTag: string | undefined;
  const tag = rest.match(/(^|\s)#([\p{L}\p{N}_-]+)/u);
  if (tag) {
    listTag = tag[2].toLowerCase();
    rest = (rest.slice(0, tag.index!) + rest.slice(tag.index! + tag[0].length)).trim();
  }
  rest = colonTimes(spokenTimes(rest));
  const p = takePart(rest);
  rest = p.rest;
  // Only words that really name a day or time ("a second microphone" is not a time).
  const r = en.GB.parse(rest, new Date(now), { forwardDate: true }).find((x) => /\d|today|tomorrow|tonight|noon|midnight|\b(mon|tue|wed|thu|fri|sat|sun)|week|month|\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i.test(x.text));

  // Only a part of the day ("ring mum tonight"): today at that part's usual time.
  if (!r) {
    if (!p.part) return { title: tidy(rest), hasTime: false, listTag };
    const d = new Date(now);
    d.setHours(PART_HOUR[p.part], 0, 0, 0);
    return { title: tidy(rest) || tidy(text), due: d.getTime(), hasTime: true, dateText: p.said, listTag };
  }

  let hasTime = r.start.isCertain('hour');
  const hasDay = r.start.isCertain('day') || r.start.isCertain('weekday') || p.today;
  if (!hasTime && !hasDay && !p.part) return { title: tidy(rest), hasTime: false, listTag };
  const when = r.start.date();
  if (p.today && !(r.start.isCertain('day') || r.start.isCertain('weekday'))) {
    const t = new Date(now);
    when.setFullYear(t.getFullYear(), t.getMonth(), t.getDate());
  }
  if (hasTime && !r.start.isCertain('meridiem')) {
    const h = when.getHours();
    // "at 8" said with tonight or the evening means 8pm; on its own, 1 to 7 means the afternoon.
    if (h < 12 && (p.part === 'afternoon' || p.part === 'evening' || p.part === 'night' || (!p.part && h >= 1 && h <= 7))) when.setHours(h + 12);
  }
  if (!hasTime && p.part) { when.setHours(PART_HOUR[p.part], 0, 0, 0); hasTime = true; }
  let due = when.getTime();
  const day = new Date(due);
  const today = new Date(now);
  // "Friday" said on a Friday means next Friday, as people usually mean it.
  const word = r.text.toLowerCase();
  if (DAYS.some((d) => word.includes(d) || word.includes(d.slice(0, 3))) && !/\b(today|this)\b/.test(word) && day.toDateString() === today.toDateString()) due += 7 * 86400000;
  if (!hasTime) { const d = new Date(due); d.setHours(0, 0, 0, 0); due = d.getTime(); }
  // A time with no day that has already gone today means tomorrow.
  if (hasTime && !hasDay && due < now) due += 86400000;
  const title = tidy(rest.slice(0, r.index) + rest.slice(r.index + r.text.length));
  return { title: title || tidy(rest), due, hasTime, dateText: p.said ? `${p.said} ${r.text}` : r.text, listTag };
}

function tidy(s: string): string {
  return s.replace(/\s+(at|on|by|for|from|due)\s*$/i, '').replace(/^\s*(on|by|due)\s+/i, '').replace(/\s{2,}/g, ' ').trim();
}
