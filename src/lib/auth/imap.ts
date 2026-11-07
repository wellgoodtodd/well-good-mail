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
    throw mailError(e);
  }
}
