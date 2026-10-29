import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/storage';
import { withDb, emailProven } from '@/lib/server/db';
import { badOrigin, completeSignIn, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp, resetLimit, retryAfter } from '@/lib/server/security';
import { startChallenge } from '@/lib/server/otp';
import { emailConfigured } from '@/lib/server/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrators confirm a code sent by email after their password, once email delivery is proven to work. */
const adminNeedsCode = () => process.env.ADMIN_EMAIL_CODE !== 'off' && emailConfigured() && withDb(null, db => emailProven(db));

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const remember = body.remember !== false;
  const ip = clientIp(req);
  // Limits: per address and IP (guessing), per IP (credential stuffing), per address (distributed guessing).
  const keys = [`login:${email}|${ip}`, `login-ip:${ip}`, `login-email:${email}`];
  if (!allow(keys[0], 10, 15 * 60_000) || !allow(keys[1], 60, 15 * 60_000) || !allow(keys[2], 30, 60 * 60_000)) {
    return tooMany('Too many sign-in attempts. Please wait 15 minutes and try again.', Math.max(retryAfter(keys[0]), 60));
  }
  const result = await withDb(null, () => StorageService.login(email, String(body.password || '').slice(0, 256)));
  if (!result.success) return NextResponse.json({ success: false, error: 'Incorrect email or password.' }, { status: 401 });
  resetLimit(keys[0]);
  if (result.user.role === 'super_admin' && (await adminNeedsCode())) {
    const r = await startChallenge({ purpose: 'admin-mfa', channel: 'email', target: result.user.email, userId: result.user.id, ip, data: { remember }, name: result.user.name });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status || 400 });
    return NextResponse.json({ success: false, mfa: { challengeId: r.challengeId, channel: 'email', resendIn: r.resendIn } });
  }
  return completeSignIn(req, result.user.id, 'email and password', remember);
}
