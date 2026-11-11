// Sign in for IMAP accounts (iCloud, Yahoo, Fastmail and others). There is no web sign in for these: the person makes
// an app password with their provider and pastes it in. It is kept in Windows Credential Manager, never in the cache.
import { invoke, isTauri, secrets } from '../platform';
import { AuthError } from './google';
import type { Account } from '../types';
import type { ImapFolderInfo } from '../imapUtil';

export type ImapSettings = NonNullable<Account['imap']>;

export interface ImapConn { host: string; port: number; user: string; pass: string }

const key = (email: string) => `imap:${email.toLowerCase()}`;

export const getImapPassword = (email: string) => secrets.get(key(email));
export const saveImapPassword = (email: string, password: string) => secrets.set(key(email), password);
export const removeImapPassword = (email: string) => secrets.remove(key(email));

/** Turns what the Rust side says into something readable. A refused password becomes a "sign in again" error. */
export function mailError(e: unknown): Error {
  const text = e instanceof Error ? e.message : String(e);
  if (/^AUTH:/i.test(text) || /authentication (failed|credentials)|invalid credentials|username and password not accepted/i.test(text)) {
    return new AuthError('The email service did not accept the password. Make a new app password and enter it again.');
  }
  return new Error(text);
}

/** Signs in with the password and lists the folders. If this works, the account details are right. */
export async function testImap(settings: ImapSettings, password: string): Promise<ImapFolderInfo[]> {
  if (!isTauri()) throw new Error('Adding this kind of account works in the desktop app.');
  try {
    return await invoke<ImapFolderInfo[]>('imap_folders', { conn: { host: settings.host, port: settings.port, user: settings.username, pass: password } });
  } catch (e) {
    const err = mailError(e);
    if (err instanceof AuthError) {
      throw new AuthError('The email service did not accept the password. Check it was copied in full. If you have just tried several times, the service may be pausing sign ins for a while: wait about an hour, then try the same password again rather than making another.');
    }
    throw err;
  }
}

// ---------- patience with refused sign ins ----------
// A mail service that sees a lot of sign ins can refuse them for a while, even with the right password. When a
// password has worked before, a refusal pauses this account for a few minutes and says the service is busy. Only
// refusals that keep coming for an hour mean the password really has stopped working.

const PAUSE_MS = 5 * 60000;
const GIVE_UP_MS = 60 * 60000;
const firstRefused = new Map<string, number>();
const pausedUntil = new Map<string, number>();
const okKey = (email: string) => `wgm-imap-ok:${email.toLowerCase()}`;

function workedBefore(email: string): boolean {
  try { return Boolean(localStorage.getItem(okKey(email))); } catch { return false; }
}

/** A sign in worked: forget any refusals. */
export function imapWorked(email: string) {
  firstRefused.delete(email);
  pausedUntil.delete(email);
  try { localStorage.setItem(okKey(email), String(Date.now())); } catch { /* fine */ }
}

/** A new password was entered: start afresh. */
export const imapReset = (email: string) => { firstRefused.delete(email); pausedUntil.delete(email); };

const busy = (name: string) => new Error(`${name} isn't accepting sign ins for a few minutes (this happens after a lot of them). Well Good Mail will try again by itself. There's no need to make a new password.`);

/** Before contacting the server: still in a pause? */
export function imapPaused(email: string, name: string) {
  const until = pausedUntil.get(email);
  if (until && Date.now() < until) throw busy(name);
}

/** After a refusal: a pause and "busy", or, after an hour of them (or for a password that never worked), sign in again. */
export function imapRefused(email: string, name: string, err: Error): Error {
  if (!(err instanceof AuthError) || !workedBefore(email)) return err;
  const first = firstRefused.get(email) ?? Date.now();
  firstRefused.set(email, first);
  if (Date.now() - first >= GIVE_UP_MS) return err;
  pausedUntil.set(email, Date.now() + PAUSE_MS);
  return busy(name);
}
