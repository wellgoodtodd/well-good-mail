// A short log of what went wrong recently (errors, warnings, and messages the app showed), kept on this computer
// for problem reports. It never holds email text: only the app's own messages. The last 200 lines, for 3 days.
const KEY = 'wgm-activity-log';
const KEEP_MS = 3 * 86400000;
const MAX = 200;

export interface LogLine { at: number; kind: 'error' | 'warn' | 'note'; text: string }

let lines: LogLine[] = [];
try { lines = (JSON.parse(localStorage.getItem(KEY) || '[]') as LogLine[]).filter((l) => Date.now() - l.at < KEEP_MS); } catch { lines = []; }

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* fine */ } }, 500);
}

/** Text from anything: an Error's message and the first lines of its stack, or the thing itself. */
function describe(parts: unknown[]): string {
  return parts.map((p) => (p instanceof Error ? `${p.message}${p.stack ? ` | ${p.stack.split('\n').slice(1, 3).map((s) => s.trim()).join(' | ')}` : ''}` : typeof p === 'string' ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 400);
}

export function logLine(kind: LogLine['kind'], ...parts: unknown[]) {
  lines.push({ at: Date.now(), kind, text: describe(parts) });
  if (lines.length > MAX) lines = lines.slice(-MAX);
  save();
}

export const activityLog = () => lines.slice();

/** The log as plain text, oldest first. */
export function logText(): string {
  return lines.map((l) => `${new Date(l.at).toISOString()} ${l.kind.toUpperCase()} ${l.text}`).join('\n') || '(nothing logged)';
}

let started = false;
/** Starts collecting: console errors and warnings, and anything that fails without being caught. */
export function startActivityLog() {
  if (started) return;
  started = true;
  const err = console.error.bind(console);
  const warn = console.warn.bind(console);
  console.error = (...a: unknown[]) => { logLine('error', ...a); err(...a); };
  console.warn = (...a: unknown[]) => { logLine('warn', ...a); warn(...a); };
  window.addEventListener('error', (e) => logLine('error', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => logLine('error', 'Unhandled:', e.reason));
}
