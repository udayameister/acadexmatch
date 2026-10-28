import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, checkAccountPassword } from '@/lib/storage';
import { withDb, accountOf } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed } from '@/lib/server/auth';
import { clientIp } from '@/lib/server/security';
import { startChallenge } from '@/lib/server/otp';
import { normalisePhone, maskPhone } from '@/lib/phone';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sends an SMS code.
 *  purpose "login" / "reset": to a confirmed number. The answer is the same whether or not the number
 *    belongs to an account (unknown numbers get no SMS), so it cannot be used to find out who is registered.
 *  purpose "verify-phone": signed in; confirms the account's number (or a new one — then the password is required).
 */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const body = await req.json().catch(() => ({}));
  const purpose = body.purpose;
  const ip = clientIp(req);
  const phone = normalisePhone(String(body.phone || ''), (String(body.country || 'IN').toUpperCase() as 'IN'));
  if (!phone.ok) return NextResponse.json({ ok: false, error: phone.error }, { status: 400 });
  const e164 = phone.e164!;

  if (purpose === 'login' || purpose === 'reset') {
    const user = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.phone === e164 && u.phoneVerified));
    const r = await startChallenge({ purpose, channel: 'sms', target: e164, userId: user?.id, ip, decoy: !user, data: { remember: body.remember !== false } });
    if (!r.ok) return NextResponse.json(r, { status: r.status || 400 });
    return NextResponse.json({ ok: true, challengeId: r.challengeId, resendIn: r.resendIn, sentTo: maskPhone(e164), note: 'If this number is confirmed on an AcadeXMatch account, a code is on its way.' });
  }

  if (purpose === 'verify-phone') {
    const id = await currentUserId(req);
    const me = id ? await withDb(id, db => accountOf(db, id)) : undefined;
    if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
    const takenBy = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.phone === e164 && u.phoneVerified && u.id !== me.id));
    if (takenBy) return NextResponse.json({ ok: false, error: 'This number is already confirmed on another account.' }, { status: 409 });
    // Changing to a different number needs the password (when the account has one).
    if (me.phone && me.phoneVerified && me.phone !== e164 && me.hasPassword !== false) {
      if (!(await checkAccountPassword(me, String(body.password || ''))).ok) return NextResponse.json({ ok: false, needPassword: true, error: 'Enter your current password to change your mobile number.' }, { status: 403 });
    }
    const r = await startChallenge({ purpose: 'verify-phone', channel: 'sms', target: e164, userId: me.id, ip, data: { phone: e164 } });
    if (!r.ok) return NextResponse.json(r, { status: r.status || 400 });
    return NextResponse.json({ ok: true, challengeId: r.challengeId, resendIn: r.resendIn, sentTo: maskPhone(e164) });
  }
  return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
}
