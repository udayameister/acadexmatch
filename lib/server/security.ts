import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { setPasswordHasher } from '@/lib/storage';

/*
 * Server-side security helpers: password hashing (scrypt), protected token storage, OTP codes,
 * a request limiter and the app's signing secret. Nothing here logs secrets.
 */

// ------------------------------------------------------------------ passwords (scrypt)

// OWASP minimum for scrypt: N=2^15 (32 MiB), r=8, p=3.
const SCRYPT = { N: 1 << 15, r: 8, p: 3, keylen: 32 } as const;
const PREFIX = 'scrypt';

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, keylen, { N: n, r, p, maxmem: 128 * n * r * (p + 1) + 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
}

/** "scrypt$32768$8$3$<salt b64>$<hash b64>" */
export async function hashPasswordStrong(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return [PREFIX, SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export function isStrongHash(stored: string | undefined): boolean {
  return !!stored && stored.startsWith(`${PREFIX}$`);
}

export async function verifyPasswordStrong(password: string, stored: string): Promise<boolean> {
  const [tag, n, r, p, salt, hash] = stored.split('$');
  if (tag !== PREFIX || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** New hashes created by StorageService on the server use scrypt; older PBKDF2 hashes still verify and are upgraded at sign-in. */
export function installPasswordHasher(): void {
  setPasswordHasher({ hash: hashPasswordStrong, verify: verifyPasswordStrong, isCurrent: isStrongHash });
}
installPasswordHasher();

// ------------------------------------------------------------------ tokens

/** Only this digest of a session token, reset token or OTP is stored. */
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed digest (HMAC) for short secrets like 6-digit codes, so a database copy cannot be brute-forced offline. */
export function keyedDigest(value: string, purpose: string): string {
  return createHmac('sha256', serverSecret()).update(`${purpose}:${value}`).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomDigits(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String(randomInt(0, 10));
  return s;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Secret for signing (OAuth state, OTP digests, unsubscribe links). Set AUTH_SECRET in production;
 * without it a random per-process secret is used (pending OAuth sign-ins are lost on restart).
 */
const g = globalThis as unknown as { __acadSecret?: string };
export function serverSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (!g.__acadSecret) {
    g.__acadSecret = randomBytes(32).toString('hex');
    if (process.env.NODE_ENV === 'production') console.warn('[AcadeXMatch] AUTH_SECRET is not set (or shorter than 32 characters). Using a temporary secret.');
  }
  return g.__acadSecret;
}

// ------------------------------------------------------------------ request limits

interface Bucket { n: number; reset: number }
const buckets = (globalThis as unknown as { __acadLimits?: Map<string, Bucket> }).__acadLimits ||= new Map();

/**
 * Counts one attempt for `key`. Returns false when more than `max` attempts happened within `windowMs`.
 * In memory per server process (preview and live apps count separately).
 */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 50_000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n++;
  return b.n <= max;
}

/** Seconds until `key` may be used again (0 when it may). */
export function retryAfter(key: string): number {
  const b = buckets.get(key);
  return b && b.reset > Date.now() ? Math.ceil((b.reset - Date.now()) / 1000) : 0;
}

export function resetLimit(key: string): void { buckets.delete(key); }

/**
 * Caller's IP as seen behind Cloudflare / the host's proxy: Cloudflare's header (which Cloudflare
 * overwrites), otherwise the address the nearest proxy appended (the last X-Forwarded-For entry; earlier
 * entries can be typed by the client, so they are not trusted for rate limits).
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean);
  return (req.headers.get('cf-connecting-ip') || xff?.[xff.length - 1] || req.headers.get('x-real-ip') || 'local').trim().slice(0, 64);
}

/** Short description of the browser for security emails ("Chrome on Windows"). */
export function deviceLabel(ua: string | null): string {
  const s = ua || '';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'A browser';
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iOS/.test(s) ? 'iOS' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'an unknown device';
  return `${browser} on ${os}`;
}

/** Same-site relative path only (prevents open redirects through ?next=). */
export function safeNext(next: string | null | undefined): string | null {
  const n = String(next || '');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n.slice(0, 500) : null;
}
