// Plain words for what went wrong. Providers throw raw errors (JSON from Microsoft Graph, "Gmail 503: ...", network
// failures); people see a short sentence instead, and whether signing in again would fix it.
import type { ProviderKind } from './types';

export interface PlainError {
  /** A short sentence, ending in a full stop, like "Outlook didn't answer." */
  text: string;
  /** Signing in again (or once more, to allow something new) should fix it. */
  permission: boolean;
  /** Worth trying again in a moment: the service was busy or didn't answer. */
  retry: boolean;
}

/** The name people know the service by. */
export function serviceName(kind?: ProviderKind | string): string {
  if (kind === 'microsoft') return 'Outlook';
  if (kind === 'gmail') return 'Google';
  if (kind === 'imap') return 'The mail server';
  return 'The server';
}

/** Which service a raw error came from, when its words give it away. */
function kindFromText(raw: string): ProviderKind | undefined {
  if (/^\s*(Microsoft|Outlook)\b|graph\.microsoft|"code"\s*:\s*"(UnknownError|ServiceNotAvailable|ErrorAccessDenied|InvalidAuthenticationToken)/i.test(raw)) return 'microsoft';
  if (/^\s*(Gmail|Google)\b|googleapis/i.test(raw)) return 'gmail';
  return undefined;
}

const statusOf = (raw: string, given?: number): number | undefined => {
  if (given) return given;
  const m = /^\s*(?:Microsoft|Gmail|Google|Outlook|HTTP)\s+(\d{3})\b/i.exec(raw) || /\bstatus(?:\s*code)?\s*[:=]?\s*(\d{3})\b/i.exec(raw);
  return m ? Number(m[1]) : undefined;
};

/** Already plain: short, no JSON, no status code, no stack. Kept as it is. */
const looksPlain = (raw: string) => raw.length <= 140 && !/[{}[\]<>]|\b[1-5]\d\d\b|Error:|error_description|\bat\s+\S+\s*\(/.test(raw);

/**
 * Turns any error from a provider into plain words. `kind` is the account's type, for the service name when the
 * error itself doesn't say.
 */
export function plainError(err: unknown, kind?: ProviderKind | string): PlainError {
  const e = err as { message?: string; status?: number; needsPermission?: boolean; needsSignIn?: boolean } | undefined;
  const raw = (typeof err === 'string' ? err : e?.message || String(err ?? '')).replace(/\s+/g, ' ').trim();
  const service = serviceName(kind || kindFromText(raw));
  if (e && typeof e === 'object' && e.needsPermission) return { text: 'Needs one more sign in to allow this.', permission: true, retry: false };
  if ((e && typeof e === 'object' && e.needsSignIn) || /please sign in to .* again|sign in once more|needs one more sign in/i.test(raw)) {
    return { text: /once more|one more/i.test(raw) ? 'Needs one more sign in to allow this.' : `${service} needs you to sign in again.`, permission: true, retry: false };
  }
  const status = statusOf(raw, e && typeof e === 'object' ? e.status : undefined);
  const permissionWords = /AccessDenied|ErrorAccessDenied|insufficient|scope|InvalidAuthenticationToken|unauthori[sz]ed|forbidden|invalid_grant|consent/i;
  if (status === 401 || (status === 403 && !/quota|rateLimit/i.test(raw)) || (!status && permissionWords.test(raw))) {
    return { text: `${service} turned the request away. Signing in again should fix it.`, permission: true, retry: false };
  }
  if (status === 429 || /throttl|too many requests|rateLimit|quota/i.test(raw)) return { text: `${service} is busy right now.`, permission: false, retry: true };
  if ((status && status >= 500) || /UnknownError|ServiceNotAvailable|ServiceUnavailable|Bad Gateway|Gateway Time-?out|didn't answer|did not answer|backendError/i.test(raw)) {
    return { text: `${service} didn't answer.`, permission: false, retry: true };
  }
  if (/network|failed to fetch|fetch failed|error sending request|connection|timed? ?out|dns|offline|ECONN|ENOTFOUND|unreachable/i.test(raw)) {
    return { text: `Couldn't connect to ${service === 'The server' ? 'the server' : service === 'The mail server' ? 'the mail server' : service}. Check the internet connection.`, permission: false, retry: true };
  }
  if (raw && looksPlain(raw)) return { text: endStop(raw), permission: false, retry: true };
  return { text: `${service} had a problem.`, permission: false, retry: true };
}

const endStop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Splits "Name (raw message)", the way refreshEvents reports an account it couldn't reach. */
export function splitFailure(s: string): { name: string; raw: string } {
  const m = /^(.*?) \(([\s\S]*)\)$/.exec(s.trim());
  return m ? { name: m[1], raw: m[2] } : { name: s.trim(), raw: '' };
}

/**
 * The toast after refreshing calendars, when some accounts couldn't be reached. `failed` is what refreshEvents
 * returns; `accounts` gives each account's type, matched by name.
 */
export function calendarFailureText(failed: string[], accounts: { label?: string; email: string; kind: ProviderKind }[]): { text: string; permission: boolean } {
  const parts = failed.map((f) => {
    const { name, raw } = splitFailure(f);
    const acc = accounts.find((a) => (a.label || a.email) === name);
    const p = raw ? plainError(raw, acc?.kind) : { text: `${serviceName(acc?.kind)} didn't answer.`, permission: false, retry: true };
    return { name, ...p };
  });
  const permission = parts.some((p) => p.permission);
  if (parts.length === 1) {
    const p = parts[0];
    const body = p.text.replace(/\.$/, '');
    return { text: `${body} for ${p.name}. ${p.permission ? 'Sign in again to fix it.' : 'Try again in a moment.'}`, permission };
  }
  const same = parts.every((p) => p.text === parts[0].text);
  const names = parts.map((p) => p.name);
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  if (same) return { text: `${parts[0].text.replace(/\.$/, '')} for ${list}. ${permission ? 'Sign in again to fix it.' : 'Try again in a moment.'}`, permission };
  return { text: `Couldn't reach the calendar for ${list}. ${parts.map((p) => `${p.name}: ${p.text}`).join(' ')} ${permission ? 'Sign in again to fix it.' : 'Try again in a moment.'}`.trim(), permission };
}

/**
 * The whole toast for a calendar refresh that missed some accounts: plain words, Try again, and Sign in when that
 * would fix it (for the first account that needs it).
 */
export function calendarFailureToast(
  failed: string[],
  accounts: { id: string; label?: string; email: string; kind: ProviderKind }[],
  tryAgain: () => void,
  signIn: (accountId: string) => void,
): { text: string; ttl: number; actions: { label: string; run: () => void }[] } {
  const { text, permission } = calendarFailureText(failed, accounts);
  const actions = [{ label: 'Try again', run: tryAgain }];
  if (permission) {
    for (const f of failed) {
      const { name, raw } = splitFailure(f);
      const acc = accounts.find((a) => (a.label || a.email) === name);
      if (acc && raw && plainError(raw, acc.kind).permission) { actions.unshift({ label: 'Sign in', run: () => signIn(acc.id) }); break; }
    }
  }
  return { text, ttl: 15000, actions };
}
