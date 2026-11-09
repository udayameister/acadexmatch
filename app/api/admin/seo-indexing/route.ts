import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { googleIndexingStatus, syncGoogleIndexing } from '@/lib/server/googleIndexing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: Google Indexing API status (never the key) and "submit now". */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await googleIndexingStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const r = await syncGoogleIndexing({ max: 100 });
  return NextResponse.json({ result: r, status: await googleIndexingStatus() });
}
