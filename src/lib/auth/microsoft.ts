// Microsoft 365 / Outlook.com sign in (public client, PKCE, loopback).
// Built ahead of time; not yet tested against a real account.
import { httpFetch, invoke, isTauri, onTauriEvent, openExternal, secrets } from '../platform';
import { AuthError } from './google';

export const MS_SCOPES = ['offline_access', 'openid', 'email', 'profile', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.Read', 'Contacts.Read', 'MailboxSettings.Read'];
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const clientId = () => import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
export const microsoftConfigured = () => Boolean(clientId());

const cache = new Map<string, { token: string; exp: number }>();
const key = (email: string) => `microsoft:${email.toLowerCase()}`;

function rand(n = 64) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[x % 66]).join('');
}
async function challenge(v: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signInWithMicrosoft(): Promise<{ email: string; name: string }> {
  if (!isTauri()) throw new Error('Microsoft sign in works in the desktop app.');
  const id = clientId();
  if (!id) throw new Error('Microsoft client ID missing (VITE_MICROSOFT_CLIENT_ID). See the setup guide.');
  const port = await invoke<number>('start_oauth_listener');
  const redirect = `http://localhost:${port}`;
  const verifier = rand();
  const state = rand(24);
  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirect,
    scope: MS_SCOPES.join(' '),
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  });
  const query = await new Promise<string>((resolve) => {
    onTauriEvent<string>('oauth-callback', resolve).then(() => openExternal(`${AUTHORITY}/authorize?${params}`));
  });
  const r = new URLSearchParams(query);
  if (r.get('state') !== state || !r.get('code')) throw new Error('Microsoft sign in was cancelled.');
  const res = await httpFetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, grant_type: 'authorization_code', code: r.get('code')!, redirect_uri: redirect, code_verifier: verifier }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || 'Microsoft sign in failed');
  const me = await (await httpFetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${json.access_token}` } })).json();
  const email = String(me.mail || me.userPrincipalName).toLowerCase();
  await secrets.set(key(email), json.refresh_token);
  cache.set(email, { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 });
  return { email, name: me.displayName || email };
}

export async function getMicrosoftAccessToken(email: string): Promise<string> {
  const e = email.toLowerCase();
  const c = cache.get(e);
  if (c && c.exp > Date.now()) return c.token;
  const refresh = await secrets.get(key(e));
  if (!refresh) throw new AuthError(`Please sign in to ${email} again.`);
  const res = await httpFetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId() || '', grant_type: 'refresh_token', refresh_token: refresh, scope: MS_SCOPES.join(' ') }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new AuthError(`Please sign in to ${email} again.`);
  if (json.refresh_token) await secrets.set(key(e), json.refresh_token);
  cache.set(e, { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 });
  return json.access_token;
}

export async function signOutMicrosoft(email: string) {
  cache.delete(email.toLowerCase());
  await secrets.remove(key(email));
}
