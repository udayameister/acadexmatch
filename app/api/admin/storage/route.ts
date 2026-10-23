import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { storageStatus } from '@/lib/server/persist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Where the data is kept and whether the database is reachable (admin only). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await storageStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
