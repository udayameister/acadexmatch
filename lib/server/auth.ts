import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionUserId, withDb, accountOf } from './db';

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

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string, maxAge: number): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge,
  });
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
