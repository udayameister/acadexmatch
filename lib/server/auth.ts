import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionUserId, withDb, accountOf, createSession } from './db';
import { deviceLabel, clientIp } from './security';
import { sendNewSignIn } from './authEmails';
import { prefsOf } from './notifications';
import { StorageService, toPublicUser } from '@/lib/storage';
import type { User, UserAccount } from '@/types';

/** Signed-in user's id from the session cookie, or null. */
export function currentUserId(req: NextRequest): Promise<string | null> {
  return sessionUserId(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Returns a 403 response unless the request comes from a signed-in platform administrator. */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const id = await currentUserId(req);
  const isAdmin = id ? await withDb(id, db => accountOf(db, id)?.role === 'super_admin') : false;
  return isAdmin ? null : NextResponse.json({ error: 'Only the platform administrator can do this.' }, { status: 403 });
}

/** `maxAge` undefined = cookie ends when the browser closes ("Remember me" off). */
export function setSessionCookie(res: NextResponse, req: NextRequest, token: string, maxAge: number | undefined): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production' && !/^(localhost|127\.)/.test(req.headers.get('host') || ''),
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Mutating requests must be same-origin JSON calls from the app itself. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}

// Simple in-memory limit on sign-in attempts: 10 per email+IP per 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.until < now) { attempts.set(key, { n: 1, until: now + 15 * 60_000 }); return false; }
  a.n++;
  return a.n > 10;
}
export function clearAttempts(key: string): void { attempts.delete(key); }

// ------------------------------------------------------------------ sign-in helpers


/** Creates a session, sets the cookie and (for a new device) emails a sign-in alert. */
export async function completeSignIn(req: NextRequest, userId: string, method: string, remember = true): Promise<NextResponse> {
  const device = deviceLabel(req.headers.get('user-agent'));
  const { token, maxAge, isNewDevice } = await createSession(userId, { remember, device, ip: clientIp(req), method });
  const acc = await withDb(userId, db => {
    StorageService.addAuditLog(`Signed in (${method})`, userId, 'AUTHENTICATION');
    return accountOf(db, userId) as UserAccount | undefined;
  });
  if (acc && isNewDevice && prefsOf(acc).loginAlerts) sendNewSignIn(acc, device, method).catch(() => undefined);
  const res = NextResponse.json({ success: true, user: acc ? (toPublicUser(acc) as User) : null });
  setSessionCookie(res, req, token, maxAge);
  return res;
}

export function tooMany(message: string, retrySeconds?: number): NextResponse {
  return NextResponse.json({ success: false, ok: false, error: message }, { status: 429, headers: retrySeconds ? { 'Retry-After': String(retrySeconds) } : undefined });
}

export function notAllowed(): NextResponse {
  return NextResponse.json({ success: false, ok: false, error: 'Not allowed' }, { status: 403 });
}

/** Rejects calls that are not same-origin JSON POSTs from the site. */
export function badOrigin(req: NextRequest): boolean {
  return !sameOrigin(req) || (req.method === 'POST' && req.headers.get('content-type')?.split(';')[0] !== 'application/json');
}
