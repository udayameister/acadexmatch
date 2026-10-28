import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb, accountOf } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed } from '@/lib/server/auth';
import { isProvider } from '@/lib/server/oidc';
import { sendIdentityLinked } from '@/lib/server/authEmails';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removes a linked Google/Microsoft sign-in, if the account can still be signed in to another way. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const me = await currentUserId(req);
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider || '');
  if (body.action !== 'unlink' || !isProvider(provider)) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  const r = await withDb(me, (db, c) => {
    const u = accountOf(db, me);
    if (!u) return { error: 'Account not found.' };
    const rest = (u.identities || []).filter(i => i.provider !== provider);
    const otherWay = u.hasPassword !== false || (u.phone && u.phoneVerified) || rest.length > 0;
    if (!otherWay) return { error: 'Add a password or confirm a mobile number first, so you can still sign in.' };
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    c.set(STORAGE_KEYS.USERS, users.map(x => (x.id === me ? { ...x, identities: rest } : x)));
    StorageService.addAuditLog(`Removed ${provider} sign-in`, me, 'AUTHENTICATION');
    return { user: { ...u, identities: rest } };
  });
  if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  sendIdentityLinked(r.user!, provider, false).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
