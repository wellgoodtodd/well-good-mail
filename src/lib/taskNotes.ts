// What Well Good Mail adds to a task's notes, so it shows on the phone too: the due time (Google Tasks keeps only
// the date) at the top, and the email it was made from at the bottom. Reading strips both back off.

const TIME_LINE = /^Due (\d{1,2}):(\d{2})\s*$/;
const MAIL_LINE = /^From email: (.*)$/;

export interface ReadNotes {
  notes: string;
  /** Minutes after midnight, from a "Due 14:00" first line. */
  minutes?: number;
  /** The subject from a "From email:" line. */
  mailSubject?: string;
}

export function readNotes(raw: string | undefined): ReadNotes {
  const lines = (raw || '').replace(/\r\n/g, '\n').split('\n');
  let minutes: number | undefined;
  const m = lines[0]?.match(TIME_LINE);
  if (m) {
    const h = Number(m[1]), mi = Number(m[2]);
    if (h < 24 && mi < 60) { minutes = h * 60 + mi; lines.shift(); }
  }
  let mailSubject: string | undefined;
  const at = lines.findIndex((l) => MAIL_LINE.test(l));
  if (at >= 0) {
    mailSubject = lines[at].match(MAIL_LINE)![1].trim();
    // The line after it is the link to the email, when there is one.
    const cut = lines[at + 1] && /^https?:\/\//.test(lines[at + 1].trim()) ? 2 : 1;
    lines.splice(at, cut);
  }
  return { notes: lines.join('\n').trim(), minutes, mailSubject };
}

export function writeNotes(p: { notes?: string; minutes?: number; mailSubject?: string; mailLink?: string }): string {
  const out: string[] = [];
  if (p.minutes !== undefined) out.push(`Due ${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`);
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
