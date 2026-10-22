import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, hashPassword, randomSalt } from '@/lib/storage';
import { withDb, deleteSessionsForUser } from '@/lib/server/db';
import { sameOrigin } from '@/lib/server/auth';
import { consumeToken } from '@/lib/server/mailer';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sets a new password from a reset link and signs the account out everywhere. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || '');
  if (password.length < 8) return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
  const userId = await consumeToken(String(body.token || ''), 'reset');
  if (!userId) return NextResponse.json({ ok: false, error: 'This reset link is invalid or has expired. Ask for a new one.' }, { status: 400 });
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  await withDb(userId, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    // Clicking the emailed link also proves the address belongs to the user.
    c.set(STORAGE_KEYS.USERS, users.map(u => (u.id === userId ? { ...u, salt, passwordHash, emailVerified: true } : u)));
    deleteSessionsForUser(db, userId);
  }, { write: true });
  return NextResponse.json({ ok: true });
}
