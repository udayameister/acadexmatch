import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { sameOrigin, tooManyAttempts } from '@/lib/server/auth';
import { sendPasswordResetEmail } from '@/lib/server/authEmails';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends a reset link if the account exists. Always answers the same way, so it can't reveal who has an account. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (tooManyAttempts(`forgot|${email}|${req.headers.get('x-forwarded-for') || 'local'}`)) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Please wait 15 minutes.' }, { status: 429 });
  }
  const user = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.email === email));
  if (user) await sendPasswordResetEmail(user, req.nextUrl.origin);
  return NextResponse.json({ ok: true });
}
