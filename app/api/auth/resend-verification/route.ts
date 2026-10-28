import { NextRequest, NextResponse } from 'next/server';
import { withDb, accountOf } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed, tooMany } from '@/lib/server/auth';
import { allow } from '@/lib/server/security';
import { sendVerificationEmail } from '@/lib/server/authEmails';
import { emailConfigured } from '@/lib/server/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const id = await currentUserId(req);
  const me = id ? await withDb(id, db => accountOf(db, id)) : undefined;
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  if (me.emailVerified !== false) return NextResponse.json({ ok: true, already: true });
  if (!allow(`verify-resend:${me.id}`, 1, 60_000) || !allow(`verify-resend-h:${me.id}`, 5, 60 * 60_000)) return tooMany('Please wait a minute before asking again.', 60);
  if (!emailConfigured()) return NextResponse.json({ ok: false, error: 'Email sending is not switched on yet. Please try again later.' }, { status: 503 });
  const r = await sendVerificationEmail(me, req.nextUrl.origin);
  const failed = !r || r.status === 'failed';
  return NextResponse.json({ ok: !failed, error: failed ? 'The email could not be sent. Please try again later.' : undefined });
}
