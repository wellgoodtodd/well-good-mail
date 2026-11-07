// Google sign in for desktop apps: system browser + local loopback redirect
// with PKCE. Refresh tokens live in Windows Credential Manager.
import { create } from 'zustand';
import { httpFetch, invoke, isTauri, onTauriEvent, openExternal, secrets } from '../platform';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  // Lets the app answer invitations (Yes, No, Maybe) and add them to your calendar.
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

/**
 * The Google key (client ID and secret). People paste their own in the setup guide and it is kept in Windows
 * Credential Manager. A key built into the app (VITE_GOOGLE_*) is still used when nothing has been pasted.
 */
interface GoogleKeys { id?: string; secret?: string; /** true when the key came from the setup guide */ own: boolean }
export const useGoogleKeys = create<GoogleKeys>(() => ({
  id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined,
  own: false,
}));

const clientId = () => useGoogleKeys.getState().id;
const clientSecret = () => useGoogleKeys.getState().secret;

export const googleConfigured = () => Boolean(clientId());
export const useGoogleConfigured = () => useGoogleKeys((s) => Boolean(s.id));

/** Called once at start: pick up a key saved by the setup guide. */
export async function loadGoogleKeys(): Promise<void> {
  try {
    const id = await secrets.get('google-client-id');
    if (id) useGoogleKeys.setState({ id, secret: (await secrets.get('google-client-secret')) || undefined, own: true });
  } catch { /* no saved key */ }
}

export async function saveGoogleKeys(id: string, secret: string): Promise<void> {
  await secrets.set('google-client-id', id.trim());
  await secrets.set('google-client-secret', secret.trim());
  useGoogleKeys.setState({ id: id.trim(), secret: secret.trim(), own: true });
}

interface TokenSet {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenSet>();
const refreshing = new Map<string, Promise<string>>();

const secretKey = (email: string) => `google:${email.toLowerCase()}`;

function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66]).join('');
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const grantKey = (email: string) => `wgm.calwrite.${email.toLowerCase()}`;
/** Remembers whether Google said this sign in may edit calendar events (it comes back with every token). */
function noteScopes(email: string, scope: unknown) {
  if (typeof scope !== 'string') return;
  try { localStorage.setItem(grantKey(email), scope.split(' ').includes('https://www.googleapis.com/auth/calendar.events') ? '1' : '0'); } catch { /* storage unavailable */ }
}
/** true: allowed. false: this account signed in before the permission existed. undefined: not known yet. */
export function calendarEditAllowed(email: string): boolean | undefined {
  try { const v = localStorage.getItem(grantKey(email)); return v === '1' ? true : v === '0' ? false : undefined; } catch { return undefined; }
}

export class AuthError extends Error {
  needsSignIn = true;
}

/** Opens the browser for Google sign in. Resolves with the signed in email. */
export async function signInWithGoogle(loginHint?: string): Promise<{ email: string; name: string }> {
  if (!isTauri()) throw new Error('Google sign in works in the desktop app. Use demo mode in the browser.');
  const id = clientId();
  if (!id) throw new Error('Google sign in has not been set up yet. Open the setup guide first.');

  const port = await invoke<number>('start_oauth_listener');
  const redirectUri = `http://127.0.0.1:${port}`;
  const verifier = randomString();
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(24);

  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);

  const query = await new Promise<string>((resolve, reject) => {
    let unlisten: (() => void) | undefined;
    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error('Sign in timed out. Please try again.'));
    }, 5 * 60 * 1000);
    onTauriEvent<string>('oauth-callback', (q) => {
      clearTimeout(timer);
      unlisten?.();
      resolve(q);
    }).then((u) => {
      unlisten = u;
      openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });

  const result = new URLSearchParams(query);
  if (result.get('error')) throw new Error(`Google sign in was cancelled (${result.get('error')}).`);
  if (result.get('state') !== state) throw new Error('Sign in check failed. Please try again.');
  const code = result.get('code');
  if (!code) throw new Error('No sign in code came back from Google.');

  const body = new URLSearchParams({
    code,
    client_id: id,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const secret = clientSecret();
  if (secret) body.set('client_secret', secret);

  const res = await httpFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign in failed: ${json.error_description || json.error || res.status}`);

  const info = await (
    await httpFetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${json.access_token}` },
    })
  ).json();
  const email = String(info.email).toLowerCase();

  if (json.refresh_token) await secrets.set(secretKey(email), json.refresh_token);
  noteScopes(email, json.scope);
  tokenCache.set(email, { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 });
  return { email, name: info.name || email };
}

/** A valid access token for the account, refreshing when needed. */
export async function getGoogleAccessToken(email: string): Promise<string> {
  const key = email.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const pending = refreshing.get(key);
  if (pending) return pending;

  const p = (async () => {
    const refreshToken = await secrets.get(secretKey(key));
    if (!refreshToken) throw new AuthError(`Please sign in to ${email} again.`);
    const body = new URLSearchParams({
      client_id: clientId() || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const secret = clientSecret();
    if (secret) body.set('client_secret', secret);
    const res = await httpFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = await res.json();
    if (!res.ok) {
      // invalid_client and unauthorized_client mean the saved sign in belongs to a different Google key than the one now in use.
      if (['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(json.error)) throw new AuthError(`Please sign in to ${email} again.`);
      throw new Error(`Couldn't refresh sign in: ${json.error_description || json.error || res.status}`);
    }
    noteScopes(key, json.scope);
    tokenCache.set(key, { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 });
    return json.access_token as string;
  })();
  refreshing.set(key, p);
  try {
    return await p;
  } finally {
    refreshing.delete(key);
  }
}

export async function signOutGoogle(email: string): Promise<void> {
  const key = email.toLowerCase();
  const refreshToken = await secrets.get(secretKey(key));
  tokenCache.delete(key);
  await secrets.remove(secretKey(key));
  if (refreshToken) {
    httpFetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(() => {});
  }
}
