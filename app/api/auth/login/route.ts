import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/storage';
import { withDb, createSession } from '@/lib/server/db';
import { setSessionCookie, sameOrigin, tooManyAttempts, clearAttempts } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, error: 'Not allowed' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const key = `${email}|${req.headers.get('x-forwarded-for') || 'local'}`;
  if (tooManyAttempts(key)) {
    return NextResponse.json({ success: false, error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }, { status: 429 });
  }
  const result = await withDb(null, () => StorageService.login(email, String(body.password || '')));
  if (!result.success) return NextResponse.json(result, { status: 401 });
  clearAttempts(key);
  const { token, maxAge } = await createSession(result.user.id);
  const res = NextResponse.json(result);
  setSessionCookie(res, req, token, maxAge);
  return res;
}
