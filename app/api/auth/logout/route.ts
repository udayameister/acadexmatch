import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/storage';
import { withDb, deleteSession, SESSION_COOKIE, sessionUserId } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await sessionUserId(token);
  if (userId) await withDb(userId, () => { StorageService.logout(); });
  await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
