import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { badOrigin, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { consumeToken } from '@/lib/server/mailer';
import { sendEmailVerifiedConfirmation } from '@/lib/server/authEmails';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Confirms an email address from the link in the verification email. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  if (!allow(`verify-link:${clientIp(req)}`, 30, 60 * 60_000)) return tooMany('Too many attempts. Please try again later.');
  const body = await req.json().catch(() => ({}));
  const userId = await consumeToken(String(body.token || ''), 'verify');
  if (!userId) return NextResponse.json({ ok: false, error: 'This link is invalid or has expired. Sign in and ask for a new one.' }, { status: 400 });
  const user = await withDb(userId, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    const u = users.find(x => x.id === userId);
    if (!u) return undefined;
    const was = u.emailVerified;
    c.set(STORAGE_KEYS.USERS, users.map(x => (x.id === userId ? { ...x, emailVerified: true } : x)));
    if (was === false) StorageService.addAuditLog('Email address confirmed', userId, 'AUTHENTICATION');
    return was === false ? { ...u, emailVerified: true } : undefined;
  });
  if (user) sendEmailVerifiedConfirmation(user).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
