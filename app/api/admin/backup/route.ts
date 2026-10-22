import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { currentUserId, requireAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full backup (admin only). Includes password hashes so accounts can be restored. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const userId = await currentUserId(req);
  const data = await withDb(userId, () => StorageService.exportAllData());
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="acadexmatch-backup-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
