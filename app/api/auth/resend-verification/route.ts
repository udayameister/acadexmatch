import { NextRequest, NextResponse } from 'next/server';
import { withDb, accountOf } from '@/lib/server/db';
import { currentUserId, sameOrigin, tooManyAttempts } from '@/lib/server/auth';
import { sendVerificationEmail } from '@/lib/server/authEmails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const id = await currentUserId(req);
  const me = id ? await withDb(id, db => accountOf(db, id)) : undefined;
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  if (me.emailVerified !== false) return NextResponse.json({ ok: true, already: true });
  if (tooManyAttempts(`verify|${me.id}`)) return NextResponse.json({ ok: false, error: 'Please wait a few minutes before asking again.' }, { status: 429 });
  const r = await sendVerificationEmail(me, req.nextUrl.origin);
  return NextResponse.json({ ok: r.status !== 'failed', status: r.status, error: r.status === 'failed' ? 'The email could not be sent. Please try again later.' : undefined });
}
