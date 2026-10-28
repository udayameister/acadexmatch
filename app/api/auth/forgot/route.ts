import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { badOrigin, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { sendPasswordResetEmail } from '@/lib/server/authEmails';
import { notify } from '@/lib/server/notifications';
import { appUrl } from '@/lib/server/mailer';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends a reset link if the account exists. Always answers the same way, so it can't reveal who has an account. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const ip = clientIp(req);
  if (!allow(`forgot:${email}`, 3, 60 * 60_000) || !allow(`forgot-ip:${ip}`, 10, 60 * 60_000)) {
    return tooMany('Too many requests. Please wait an hour and try again.');
  }
  const user = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.email === email));
  if (user && user.hasPassword === false) {
    // Accounts created with Google/Microsoft have no password to reset.
    const p = (user.identities || []).map(i => (i.provider === 'google' ? 'Google' : 'Microsoft')).join(' or ') || 'Google or Microsoft';
    await notify({
      key: `forgot-social:${user.id}:${Date.now().toString(36)}`, category: 'security', user, kind: 'reset-social',
      subject: 'Signing in to AcadeXMatch', heading: 'Your account has no password',
      paragraphs: [`Hello ${user.name},`, `Someone asked to reset the password of your AcadeXMatch account. Your account signs in with ${p}, so there is no password to reset.`, `Use “Continue with ${p}” on the sign-in page. Once signed in, you can add a password on your account page.`],
      button: { label: 'Go to sign in', url: `${appUrl(req.nextUrl.origin)}/login` },
    }).catch(() => undefined);
  } else if (user) {
    await sendPasswordResetEmail(user, req.nextUrl.origin).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
