// Microsoft 365 / Outlook.com sign in (public client, PKCE, loopback).
// Built ahead of time; not yet tested against a real account.
import { create } from 'zustand';
import { httpFetch, invoke, isTauri, onTauriEvent, openExternal, secrets } from '../platform';
import { AuthError } from './google';

export const MS_SCOPES = ['offline_access', 'openid', 'email', 'profile', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.Read', 'Contacts.Read', 'MailboxSettings.Read'];
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
/**
 * The shared "Well Good Mail" app registration. A client ID is public by design (it only says which app is asking),
 * so it is safe to ship. Personal Outlook, Hotmail and Live accounts can sign in with it straight away.
 * Work and school accounts may need their administrator to allow it, and can use their own ID instead.
 */
export const MICROSOFT_DEFAULT_ID = '054e814c-eff5-49be-b81f-3b221c1b8fa4';

/** The ID in use: one entered in the Microsoft setup guide (kept in Windows Credential Manager), or the shared one. */
export const useMicrosoftKeys = create<{ id?: string; own: boolean }>(() => ({ id: (import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined) || MICROSOFT_DEFAULT_ID, own: false }));
const clientId = () => useMicrosoftKeys.getState().id;
export const microsoftConfigured = () => Boolean(clientId());
export const useMicrosoftConfigured = () => useMicrosoftKeys((s) => Boolean(s.id));

export async function loadMicrosoftKeys(): Promise<void> {
  try {
    const id = await secrets.get('microsoft-client-id');
    if (id) useMicrosoftKeys.setState({ id, own: true });
  } catch { /* nothing saved */ }
}

export async function saveMicrosoftKey(id: string): Promise<void> {
  await secrets.set('microsoft-client-id', id.trim());
  useMicrosoftKeys.setState({ id: id.trim(), own: true });
}

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

/** The token request goes through the Rust side so it carries no Origin header (see token_post in lib.rs). */
async function tokenPost(body: string): Promise<{ ok: boolean; json: Record<string, any> }> {
  const [status, text] = await invoke<[number, string]>('token_post', { url: `${AUTHORITY}/token`, body });
  let json: Record<string, any> = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { ok: status >= 200 && status < 300, json };
}

export async function signInWithMicrosoft(): Promise<{ email: string; name: string }> {
  if (!isTauri()) throw new Error('Microsoft sign in works in the desktop app.');
  const id = clientId();
  if (!id) throw new Error('Microsoft sign in has not been set up yet. Open the Microsoft setup guide first.');
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
  const { ok, json } = await tokenPost(new URLSearchParams({ client_id: id, grant_type: 'authorization_code', code: r.get('code')!, redirect_uri: redirect, code_verifier: verifier }).toString());
  if (!ok) throw new Error(json.error_description || 'Microsoft sign in failed');
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
  const { ok, json } = await tokenPost(new URLSearchParams({ client_id: clientId() || '', grant_type: 'refresh_token', refresh_token: refresh, scope: MS_SCOPES.join(' ') }).toString());
  if (!ok) throw new AuthError(`Please sign in to ${email} again.`);
  if (json.refresh_token) await secrets.set(key(e), json.refresh_token);
  cache.set(e, { token: json.access_token, exp: Date.now() + (json.expires_in - 60) * 1000 });
  return json.access_token;
}

export async function signOutMicrosoft(email: string) {
  cache.delete(email.toLowerCase());
  await secrets.remove(key(email));
}
