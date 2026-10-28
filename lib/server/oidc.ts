import { createHash, createHmac, createPublicKey, verify as verifySig, type JsonWebKey } from 'crypto';
import { randomToken, safeEqual, serverSecret } from './security';
import { appUrl } from './mailer';
import type { IdentityProvider } from '@/types';

/*
 * "Continue with Google / Microsoft" — OpenID Connect authorization-code flow with PKCE (S256), state and
 * nonce. The ID token returned by the provider is checked here: RS256 signature against the provider's
 * published keys, issuer, audience, expiry, issue time and nonce. Accounts are keyed by the provider's
 * stable subject id ("sub"), never by email alone.
 *
 * A provider is offered only when its client id and secret are set:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT (common | organizations | consumers | <tenant id>)
 * Redirect URI to register with each provider: <APP_URL>/api/auth/oauth/<google|microsoft>/callback
 *
 * To add another OpenID Connect provider (e.g. LinkedIn "Sign In with LinkedIn using OpenID Connect"),
 * add an entry to PROVIDERS with its discovery URL, scopes and issuer rule, and extend IdentityProvider.
 */

interface ProviderDef {
  id: IdentityProvider;
  label: string;
  discovery: () => string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  scopes: string;
  /** Checks the "iss" claim (and tenant rules). */
  issuerOk: (iss: string, claims: Record<string, unknown>) => boolean;
  /** Whether the email in the token can be trusted as verified. */
  emailVerified: (claims: Record<string, unknown>) => boolean;
  extraAuthParams?: Record<string, string>;
}

const MS_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const msTenant = () => (process.env.MICROSOFT_TENANT || 'common').trim();

export const PROVIDERS: Record<IdentityProvider, ProviderDef> = {
  google: {
    id: 'google',
    label: 'Google',
    discovery: () => process.env.GOOGLE_DISCOVERY_URL || 'https://accounts.google.com/.well-known/openid-configuration',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    scopes: 'openid email profile',
    issuerOk: iss => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    emailVerified: c => c.email_verified === true || c.email_verified === 'true',
    extraAuthParams: { prompt: 'select_account' },
  },
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    discovery: () => process.env.MICROSOFT_DISCOVERY_URL || `https://login.microsoftonline.com/${encodeURIComponent(msTenant())}/v2.0/.well-known/openid-configuration`,
    clientId: () => process.env.MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
    scopes: 'openid email profile',
    issuerOk: (iss, c) => {
      const tid = String(c.tid || '');
      if (!/^[0-9a-f-]{36}$/i.test(tid) || iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return false;
      const t = msTenant().toLowerCase();
      if (t === 'consumers') return tid === MS_CONSUMER_TENANT;
      if (t === 'organizations') return tid !== MS_CONSUMER_TENANT;
      if (t === 'common') return true;
      return tid.toLowerCase() === t;
    },
    // Personal Microsoft accounts have verified addresses; work/school accounts only when the tenant says so.
    emailVerified: c => String(c.tid) === MS_CONSUMER_TENANT || c.xms_edov === true || c.xms_edov === '1' || c.email_verified === true,
    extraAuthParams: { prompt: 'select_account' },
  },
};

export function isProvider(p: string): p is IdentityProvider {
  return p === 'google' || p === 'microsoft';
}

export function providerConfigured(p: IdentityProvider): boolean {
  return !!(PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret());
}

export function configuredProviders(): IdentityProvider[] {
  return (Object.keys(PROVIDERS) as IdentityProvider[]).filter(providerConfigured);
}

export function redirectUri(p: IdentityProvider, origin?: string): string {
  return `${(process.env.OAUTH_REDIRECT_BASE || appUrl(origin)).replace(/\/$/, '')}/api/auth/oauth/${p}/callback`;
}

// ------------------------------------------------------------------ discovery & keys (cached 1 hour)

interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
const cache = (globalThis as unknown as { __acadOidc?: Map<string, { at: number; value: unknown }> }).__acadOidc ||= new Map();

async function getJson<T>(url: string, maxAgeMs = 3600_000, force = false): Promise<T> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < maxAgeMs) return hit.value as T;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
    const value = await r.json();
    cache.set(url, { at: Date.now(), value });
    return value as T;
  } finally {
    clearTimeout(timer);
  }
}

export function discovery(p: IdentityProvider): Promise<Discovery> {
  return getJson<Discovery>(PROVIDERS[p].discovery());
}

// ------------------------------------------------------------------ state cookie

export const STATE_COOKIE = 'acad_oauth';

export interface FlowState { p: IdentityProvider; state: string; nonce: string; verifier: string; next: string | null; mode: 'login' | 'link'; uid?: string; t: number }

const sign = (data: string) => createHmac('sha256', serverSecret()).update(`oauth:${data}`).digest('base64url');

export function encodeState(s: FlowState): string {
  const data = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function decodeState(cookie: string | undefined): FlowState | null {
  if (!cookie) return null;
  const [data, sig] = cookie.split('.');
  if (!data || !sig || !safeEqual(sign(data), sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString()) as FlowState;
    return Date.now() - s.t < 10 * 60_000 ? s : null;
  } catch {
    return null;
  }
}

/** Builds the provider's sign-in address for a new flow. */
export async function startFlow(p: IdentityProvider, opts: { next: string | null; mode: 'login' | 'link'; uid?: string; origin?: string }): Promise<{ url: string; cookie: string }> {
  const d = await discovery(p);
  const st: FlowState = { p, state: randomToken(24), nonce: randomToken(24), verifier: randomToken(48), next: opts.next, mode: opts.mode, uid: opts.uid, t: Date.now() };
  const challenge = createHash('sha256').update(st.verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: PROVIDERS[p].clientId()!, response_type: 'code', redirect_uri: redirectUri(p, opts.origin), scope: PROVIDERS[p].scopes,
    state: st.state, nonce: st.nonce, code_challenge: challenge, code_challenge_method: 'S256', ...(PROVIDERS[p].extraAuthParams || {}),
  });
  return { url: `${d.authorization_endpoint}?${params}`, cookie: encodeState(st) };
}

// ------------------------------------------------------------------ token exchange & ID token check

export interface VerifiedIdentity { provider: IdentityProvider; subject: string; email: string | null; emailVerified: boolean; name: string; tenant?: string }

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString()) as Record<string, unknown>;

/** Verifies an ID token's signature and claims. Throws on any problem. */
export async function verifyIdToken(p: IdentityProvider, idToken: string, nonce: string, now = Date.now()): Promise<Record<string, unknown>> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = b64json(parts[0]);
  const claims = b64json(parts[1]);
  if (header.alg !== 'RS256') throw new Error('unexpected signing algorithm');
  const d = await discovery(p);
  let jwks = await getJson<{ keys: (JsonWebKey & { kid?: string })[] }>(d.jwks_uri);
  let jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) { jwks = await getJson(d.jwks_uri, 0, true); jwk = jwks.keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('signing key not found');
  const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
  const ok = verifySig('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  checkClaims(p, claims, nonce, now);
  return claims;
}

/** Claim checks (separate so tests can exercise them). */
export function checkClaims(p: IdentityProvider, claims: Record<string, unknown>, nonce: string, now = Date.now()): void {
  const def = PROVIDERS[p];
  const clientId = def.clientId();
  const sec = Math.floor(now / 1000);
  if (!def.issuerOk(String(claims.iss || ''), claims)) throw new Error('wrong issuer');
  const aud = claims.aud;
  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId) && claims.azp === clientId))) throw new Error('wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp < sec - 60) throw new Error('token expired');
  if (typeof claims.iat === 'number' && claims.iat > sec + 300) throw new Error('token issued in the future');
  if (typeof claims.nbf === 'number' && claims.nbf > sec + 300) throw new Error('token not yet valid');
  if (!nonce || typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) throw new Error('nonce mismatch');
  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('no subject');
}

/** Exchanges the authorization code and returns the verified identity. */
export async function finishFlow(p: IdentityProvider, code: string, st: FlowState, origin?: string): Promise<VerifiedIdentity> {
  const def = PROVIDERS[p];
  const d = await discovery(p);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let tok: { id_token?: string; error?: string; error_description?: string };
  try {
    const r = await fetch(d.token_endpoint, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri(p, origin),
        client_id: def.clientId()!, client_secret: def.clientSecret()!, code_verifier: st.verifier,
      }).toString(),
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) throw new Error(`token exchange failed (${r.status} ${tok.error || ''})`);
  } finally {
    clearTimeout(timer);
  }
  const c = await verifyIdToken(p, tok.id_token!, st.nonce);
  const email = typeof c.email === 'string' ? c.email.toLowerCase() : typeof c.preferred_username === 'string' && /@/.test(c.preferred_username) && p === 'microsoft' ? c.preferred_username.toLowerCase() : null;
  return {
    provider: p, subject: String(c.sub), email, emailVerified: !!email && typeof c.email === 'string' && def.emailVerified(c),
    name: String(c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || ''), ...(c.tid ? { tenant: String(c.tid) } : {}),
  };
}
