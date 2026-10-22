import { NextRequest, NextResponse } from 'next/server';
import { withDb, buildSnapshot } from '@/lib/server/db';
import { currentUserId } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the signed-in user (or an anonymous visitor) is allowed to see. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  const snap = await withDb(userId, db => buildSnapshot(db, userId));
  return NextResponse.json(snap, { headers: { 'Cache-Control': 'no-store' } });
}
