// What Well Good Mail adds to a task's notes, so it shows on the phone too: the due time (Google Tasks keeps only
// the date) and its alerts at the top, and the email it was made from at the bottom. Reading strips them back off.
// (Older versions of the app see the "Alert:" line as part of the notes and keep it as it is.)

const TIME_LINE = /^Due (\d{1,2}):(\d{2})\s*$/;
const ALERT_LINE = /^Alerts?: (.*)$/i;
const MAIL_LINE = /^From email: (.*)$/;

export interface ReadNotes {
  notes: string;
  /** Minutes after midnight, from a "Due 14:00" first line. */
  minutes?: number;
  /** Minutes before the due time, from an "Alert: at the time, 1 hour before" line. Empty is "Alert: none";
   *  left out means none was set (a task with a time then alerts at the time). */
  alerts?: number[];
  /** The subject from a "From email:" line. */
  mailSubject?: string;
  /** The link to the email in Gmail, from the line after "From email:". */
  mailLink?: string;
}

export function readNotes(raw: string | undefined): ReadNotes {
  const lines = (raw || '').replace(/\r\n/g, '\n').split('\n');
  let minutes: number | undefined;
  const m = lines[0]?.match(TIME_LINE);
  if (m) {
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 24 && mi < 60) { minutes = h * 60 + mi; lines.shift(); }
  }
  let alerts: number[] | undefined;
  const al = lines[0]?.match(ALERT_LINE);
  const read = al ? readAlerts(al[1]) : undefined;
  if (read) { alerts = read; lines.shift(); }
  let mailSubject: string | undefined;
  let mailLink: string | undefined;
  const at = lines.findIndex((l) => MAIL_LINE.test(l));
  if (at >= 0) {
    mailSubject = lines[at].match(MAIL_LINE)![1].trim();
    // The line after it is the link to the email, when there is one.
    const cut = lines[at + 1] && /^https?:\/\//.test(lines[at + 1].trim()) ? 2 : 1;
    if (cut === 2) mailLink = lines[at + 1].trim();
    lines.splice(at, cut);
  }
  return { notes: lines.join('\n').trim(), minutes, mailSubject, ...(mailLink ? { mailLink } : {}), ...(alerts ? { alerts } : {}) };
}

const UNIT: Record<string, number> = { minute: 1, min: 1, hour: 60, hr: 60, day: 1440, week: 10080 };

/** "at the time, 10 minutes before, 1 hour before" → [0, 10, 60]; "none" → []. Anything else isn't an alert line. */
export function readAlerts(text: string): number[] | undefined {
  const t = text.trim().toLowerCase();
  if (t === 'none') return [];
  const out: number[] = [];
  for (const part of t.split(/\s*(?:,|\band\b)\s*/).filter(Boolean)) {
    if (/^at (?:the )?time$/.test(part)) { out.push(0); continue; }
    const m = part.match(/^(\d{1,5}) (minute|min|hour|hr|day|week)s? before$/);
    if (!m) return undefined;
    out.push(Number(m[1]) * UNIT[m[2]]);
  }
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : undefined;
}

/** [0, 60] → "at the time, 1 hour before"; [] → "none". */
export function alertText(alerts: number[]): string {
  if (!alerts.length) return 'none';
  return [...new Set(alerts)].sort((a, b) => a - b).map((m) => {
    if (m === 0) return 'at the time';
    if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? 'day' : 'days'} before`;
    if (m % 60 === 0) return `${m / 60} ${m === 60 ? 'hour' : 'hours'} before`;
    return `${m} ${m === 1 ? 'minute' : 'minutes'} before`;
  }).join(', ');
}

export function writeNotes(p: { notes?: string; minutes?: number; alerts?: number[]; mailSubject?: string; mailLink?: string }): string {
  const out: string[] = [];
  if (p.minutes !== undefined) out.push(`Due ${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`);
  if (p.minutes !== undefined && p.alerts) out.push(`Alert: ${alertText(p.alerts)}`);
  if (p.notes?.trim()) out.push(p.notes.trim());
  if (p.mailSubject) {
    if (out.length) out.push('');
    out.push(`From email: ${p.mailSubject}`);
    if (p.mailLink) out.push(p.mailLink);
  }
  return out.join('\n');
}

/** The subject as a task title: Re:, Fwd: and the like taken off. */
export function titleFromSubject(subject: string): string {
  let s = subject.trim();
  for (;;) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|wg|tr)\s*(\[\d+\])?\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.trim() || subject.trim() || 'Task';
}

/** A time written at the end of a title, as AI apps sometimes do: "Call Stevie (3:00pm)", "Pick up the girls (18:40)",
 *  "Check this (2pm)". Gives the title without it and the minutes after midnight. Needs a colon or am/pm, so
 *  "(2)" or "(2026)" stay as they are. */
export function timeInTitle(title: string): { title: string; minutes: number } | undefined {
  const m = title.match(/\s*\((?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\)\s*$/i);
  if (!m || (!m[2] && !m[3])) return undefined;
  let h = Number(m[1]);
  const mi = Number(m[2] || 0);
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (mi > 59 || (ap ? h < 1 || h > 12 : h > 23)) return undefined;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const rest = title.slice(0, m.index).trim();
  return rest ? { title: rest, minutes: h * 60 + mi } : undefined;
}
