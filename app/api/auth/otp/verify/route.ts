import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { badOrigin, completeSignIn, currentUserId, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { verifyChallenge, type OtpPurpose } from '@/lib/server/otp';
import { createToken } from '@/lib/server/mailer';
import { sendPhoneChanged } from '@/lib/server/authEmails';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Checks an SMS / email code and completes the step it was sent for. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  if (!allow(`otp-verify:${clientIp(req)}`, 30, 15 * 60_000)) return tooMany('Too many attempts. Please wait 15 minutes.');
  const body = await req.json().catch(() => ({}));
  const purpose = String(body.purpose) as OtpPurpose;
  if (!['login', 'reset', 'verify-phone', 'admin-mfa'].includes(purpose)) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  const v = await verifyChallenge(String(body.challengeId || ''), String(body.code || ''), purpose);
  if (!v.ok || !v.userId) return NextResponse.json({ ok: false, success: false, error: v.error || 'That code is not correct.' }, { status: 400 });
  const remember = v.data?.remember !== false;

  if (purpose === 'login') return completeSignIn(req, v.userId, 'SMS code', remember);
  if (purpose === 'admin-mfa') return completeSignIn(req, v.userId, 'password and email code', remember);
  if (purpose === 'reset') {
    const token = await createToken(v.userId, 'phone-reset', 10 / 60);
    return NextResponse.json({ ok: true, resetToken: token });
  }
  // verify-phone: only for the signed-in owner of the challenge.
  const me = await currentUserId(req);
  if (me !== v.userId) return NextResponse.json({ ok: false, error: 'Please sign in again.' }, { status: 401 });
  const phone = String(v.data?.phone || v.target);
  const user = await withDb(me, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    if (users.some(u => u.phone === phone && u.phoneVerified && u.id !== me)) return null;
    const next = users.map(u => (u.id === me ? { ...u, phone, phoneVerified: true } : u));
    c.set(STORAGE_KEYS.USERS, next);
    StorageService.addAuditLog('Mobile number confirmed', me, 'AUTHENTICATION');
    return next.find(u => u.id === me);
  });
  if (!user) return NextResponse.json({ ok: false, error: 'This number is already confirmed on another account.' }, { status: 409 });
  sendPhoneChanged(user, phone).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
