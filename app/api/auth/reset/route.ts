import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService, makePasswordHash } from '@/lib/storage';
import { withDb, deleteSessionsForUser } from '@/lib/server/db';
import { badOrigin, notAllowed, tooMany } from '@/lib/server/auth';
import { consumeTokenData, peekTokenData, revokeTokens } from '@/lib/server/mailer';
import { allow, clientIp } from '@/lib/server/security';
import { sendPasswordChanged } from '@/lib/server/authEmails';
import { passwordProblem } from '@/lib/passwordPolicy';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sets a new password from a reset link (email) or a reset authorisation (SMS code), and signs the account out everywhere. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  if (!allow(`reset-ip:${clientIp(req)}`, 20, 60 * 60_000)) return tooMany('Too many attempts. Please try again later.');
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || '').slice(0, 256);
  const via = body.via === 'phone' ? 'phone-reset' : 'reset';
  const token = String(body.token || '');
  const invalid = NextResponse.json({ ok: false, error: 'This reset link is invalid or has expired. Ask for a new one.' }, { status: 400 });
  const peek = await peekTokenData(token, via);
  const user = peek ? await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.id === peek.userId)) : undefined;
  if (!peek || !user) return invalid;
  const weak = passwordProblem(password, user);
  if (weak) return NextResponse.json({ ok: false, error: weak }, { status: 400 }); // the link stays valid for another try
  const rec = await consumeTokenData(token, via);
  if (!rec || rec.userId !== user.id) return invalid;
  const userId = user.id;
  const fresh = await makePasswordHash(password);
  await withDb(userId, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    // An emailed link also proves the address belongs to the user.
    c.set(STORAGE_KEYS.USERS, users.map(u => (u.id === userId ? { ...u, ...fresh, hasPassword: true, ...(via === 'reset' ? { emailVerified: true } : {}) } : u)));
    deleteSessionsForUser(db, userId);
    StorageService.addAuditLog(`Password reset (${via === 'reset' ? 'email link' : 'SMS code'})`, userId, 'AUTHENTICATION');
  }, { write: true });
  await revokeTokens(userId, ['reset', 'phone-reset']);
  sendPasswordChanged(user, 'reset').catch(() => undefined);
  return NextResponse.json({ ok: true });
}
