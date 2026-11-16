// Suggested tasks: when a person asks you for something by a day ("Could you send me the venue list by Friday?"),
// offer to make it a task due then. Read on this computer, no AI, no server. Events (a day and a time) win: an email
// that suggests an event doesn't also suggest a task.
import { MACHINE, ownWords } from './suggestEvents';
import { readTaskWords } from './taskWords';
import type { Message } from './types';

export interface TaskSuggestion {
  title: string;
  /** Midnight of the day it's due. */
  due: number;
  /** The sentence it came from, as written. */
  phrase: string;
}

const DAY = 86400000;
const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Someone asking for something. */
const ASKING = /\b(could|can|would|will)\s+you\b|\b(could|can)\s+we\s+(please\s+)?(get|have)\b|\bplease\b|\b(i|we)\s+need\s+(you|it|this|that|them)\b|\bneed\s+(it|this|that|them)\b|\blet\s+me\s+know\b|\bget\s+back\s+to\s+me\b|\bsend\s+(me|us|over)\b/i;
/** A deadline: "by Friday", "before the 20th", "no later than Monday", "by end of day". */
const DEADLINE = /\b(by|before|no\s+later\s+than|due)\s+(the\s+)?(end\s+of|close\s+of|today|tomorrow|tonight|this|next|mon|tue|wed|thu|fri|sat|sun|\d{1,2}(st|nd|rd|th)?\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/** "Could you please send me the venue list" → "Send Alison the venue list". */
export function taskTitleFrom(sentence: string, senderFirst: string): string {
  let t = sentence.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(hi|hey|hello|dear)\b[^,!]*[,!]\s*/i, '');
  t = t.replace(/^(so|also|and|just|oh|ok(ay)?|great|thanks)[,]?\s+/i, '');
  t = t.replace(/^(could|can|would|will)\s+you\s+(please\s+|kindly\s+|possibly\s+|just\s+)*/i, '');
  t = t.replace(/^(please|kindly)\s+(could\s+you\s+)?/i, '');
  // "Could we get vertical cuts" → "Get Kirsty vertical cuts".
  const weGet = /^(could|can)\s+we\s+(please\s+)?(get|have)\s+/i.exec(t);
  if (weGet) t = `Get ${senderFirst ? `${senderFirst} ` : ''}${t.slice(weGet[0].length)}`;
  t = t.replace(/^(i|we)\s+need\s+you\s+to\s+/i, '');
  t = t.replace(/^(i'?d|we'?d)\s+(be\s+grateful\s+if\s+you\s+could|love\s+(it\s+)?if\s+you\s+could)\s+/i, '');
  t = t.replace(/[,\s]*(please|thanks|thank you)\s*[?.!]*$/i, '');
  t = t.replace(/[?.!,;:\s]+$/, '');
  t = t.replace(/\s+(by|before|no later than|due|on)\s*$/i, '');
  t = t.replace(/[?.!,;:\s]+$/, '');
  if (senderFirst) t = t.replace(/\bme\b/g, senderFirst).replace(/\bmy\b/g, `${senderFirst}'s`);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The task an email suggests, or undefined when it isn't fairly sure: a sentence in the writer's own words that both
 * asks for something and gives a day it's wanted by, from a person, due today or later (within three months).
 */
export function suggestTask(m: Pick<Message, 'from' | 'date' | 'listUnsubscribe'>, bodyText: string, now = Date.now()): TaskSuggestion | undefined {
  if (MACHINE.test(m.from.email) || m.listUnsubscribe) return undefined;
  const own = ownWords(bodyText);
  if (!own.trim()) return undefined;
  const sentences = own.split(/(?<=[.?!])\s+|\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 25);
  const first = (m.from.name || '').trim().split(/\s+/)[0] || '';
  for (const s of sentences) {
    if (s.length > 300 || !ASKING.test(s) || !DEADLINE.test(s)) continue;
    // Read from the day the email was sent: "by Friday" in Thursday's email is that Friday.
    const w = readTaskWords(s, m.date || now);
    if (w.due === undefined) continue;
    const due = midnight(w.due);
    if (due < midnight(now) || due > now + 90 * DAY) continue;
    const title = taskTitleFrom(w.title, first).slice(0, 120);
    if (title.length < 4) continue;
    return { title, due, phrase: s };
  }
  return undefined;
}

export const dueWords = (due: number, now = Date.now()) => {
  const today = midnight(now);
  if (due === today) return 'Today';
  if (due === today + DAY) return 'Tomorrow';
  return new Date(due).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};
