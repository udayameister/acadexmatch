import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService, checkAccountPassword, makePasswordHash } from '@/lib/storage';
import { withDb, accountOf, revokeSessions, sessionInfo, SESSION_COOKIE } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed, tooMany } from '@/lib/server/auth';
import { allow } from '@/lib/server/security';
import { revokeTokens } from '@/lib/server/mailer';
import { sendPasswordChanged } from '@/lib/server/authEmails';
import { passwordProblem } from '@/lib/passwordPolicy';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changes the password (needs the current one), or adds a first password to an account created with
 * Google/Microsoft (needs a sign-in in the last 15 minutes). Other sessions are signed out and the
 * user gets a security email.
 */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const me = await currentUserId(req);
  const u = me ? await withDb(me, db => accountOf(db, me)) : undefined;
  if (!u) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  if (!allow(`pw-change:${u.id}`, 8, 60 * 60_000)) return tooMany('Too many attempts. Please try again later.');
  const body = await req.json().catch(() => ({}));
  const next = String(body.next || '').slice(0, 256);
  const setting = u.hasPassword === false;
  if (setting) {
    const s = await sessionInfo(req.cookies.get(SESSION_COOKIE)?.value);
    if (!s || Date.now() - s.createdAt > 15 * 60_000) return NextResponse.json({ ok: false, reauth: true, error: 'For your security, sign out and sign in again, then add the password within 15 minutes.' }, { status: 403 });
  } else if (!(await checkAccountPassword(u, String(body.current || '').slice(0, 256))).ok) {
    return NextResponse.json({ ok: false, error: 'Your current password is not correct.' }, { status: 403 });
  }
  const weak = passwordProblem(next, u);
  if (weak) return NextResponse.json({ ok: false, error: weak }, { status: 400 });
  const fresh = await makePasswordHash(next);
  await withDb(u.id, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    c.set(STORAGE_KEYS.USERS, users.map(x => (x.id === u.id ? { ...x, ...fresh, hasPassword: true } : x)));
    StorageService.addAuditLog(setting ? 'Password added' : 'Password changed', u.id, 'AUTHENTICATION');
  }, { write: true });
  await revokeSessions(u.id, { allExcept: req.cookies.get(SESSION_COOKIE)?.value });
  await revokeTokens(u.id, ['reset', 'phone-reset']);
  sendPasswordChanged(u, setting ? 'set' : 'change').catch(() => undefined);
  return NextResponse.json({ ok: true });
}
