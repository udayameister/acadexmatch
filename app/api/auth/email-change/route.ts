import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, checkAccountPassword } from '@/lib/storage';
import { withDb, accountOf, sessionInfo, SESSION_COOKIE } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed, tooMany } from '@/lib/server/auth';
import { allow } from '@/lib/server/security';
import { sendEmailChangeLinks } from '@/lib/server/authEmails';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Starts an email change: needs the password (or, for accounts without one, a sign-in in the last 15 minutes). */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const id = await currentUserId(req);
  const me = id ? await withDb(id, db => accountOf(db, id)) : undefined;
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  if (!allow(`email-change:${me.id}`, 5, 60 * 60_000)) return tooMany('Too many requests. Please try again later.');
  if (me.role === 'super_admin') return NextResponse.json({ ok: false, error: 'The administrator address is changed from the admin console.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const newEmail = String(body.newEmail || '').trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
  if (newEmail === me.email) return NextResponse.json({ ok: false, error: 'That is already your email address.' }, { status: 400 });
  if (me.hasPassword !== false) {
    if (!(await checkAccountPassword(me, String(body.password || ''))).ok) return NextResponse.json({ ok: false, error: 'Your current password is not correct.' }, { status: 403 });
  } else {
    const s = await sessionInfo(req.cookies.get(SESSION_COOKIE)?.value);
    if (!s || Date.now() - s.createdAt > 15 * 60_000) return NextResponse.json({ ok: false, reauth: true, error: 'For your security, sign out and sign in again, then change the address within 15 minutes.' }, { status: 403 });
  }
  const taken = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).some(u => u.email === newEmail));
  // Same answer whether or not the address is taken; the confirmation step checks again.
  if (!taken) await sendEmailChangeLinks(me, newEmail, req.nextUrl.origin);
  return NextResponse.json({ ok: true, message: `If ${newEmail} can be used, we sent a confirmation link to it. Your address changes once you click it.` });
}
