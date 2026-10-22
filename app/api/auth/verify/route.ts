import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { consumeToken } from '@/lib/server/mailer';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Confirms an email address from the link in the verification email. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = await consumeToken(String(body.token || ''), 'verify');
  if (!userId) return NextResponse.json({ ok: false, error: 'This link is invalid or has expired. Sign in and ask for a new one.' }, { status: 400 });
  await withDb(userId, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    c.set(STORAGE_KEYS.USERS, users.map(u => (u.id === userId ? { ...u, emailVerified: true } : u)));
  });
  return NextResponse.json({ ok: true });
}
