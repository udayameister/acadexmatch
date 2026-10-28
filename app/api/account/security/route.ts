import { NextRequest, NextResponse } from 'next/server';
import { withDb, accountOf, listSessions, revokeSessions, SESSION_COOKIE } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed } from '@/lib/server/auth';
import { smsConfigured } from '@/lib/server/sms';
import { configuredProviders } from '@/lib/server/oidc';
import { StorageService } from '@/lib/storage';
import { maskPhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's sign-in methods and active sessions (no secrets). */
export async function GET(req: NextRequest) {
  const me = await currentUserId(req);
  const u = me ? await withDb(me, db => accountOf(db, me)) : undefined;
  if (!u) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  const sessions = await listSessions(u.id, req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    ok: true,
    email: u.email, emailVerified: u.emailVerified !== false,
    phone: u.phone || null, phoneMasked: maskPhone(u.phone), phoneVerified: !!u.phoneVerified,
    hasPassword: u.hasPassword !== false,
    identities: (u.identities || []).map(i => ({ provider: i.provider, email: i.email || null, linkedAt: i.linkedAt })),
    available: { sms: smsConfigured(), providers: configuredProviders() },
    sessions,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Signs out one session, or every session except this one. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const me = await currentUserId(req);
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const current = req.cookies.get(SESSION_COOKIE)?.value;
  let n = 0;
  if (body.action === 'revoke-others') n = await revokeSessions(me, { allExcept: current });
  else if (body.action === 'revoke' && typeof body.id === 'string' && /^[0-9a-f]{16}$/.test(body.id)) n = await revokeSessions(me, { id: body.id, allExcept: current });
  else return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  if (n) await withDb(me, () => StorageService.addAuditLog(`Signed out ${n} other session(s)`, me, 'AUTHENTICATION'));
  return NextResponse.json({ ok: true, revoked: n });
}
