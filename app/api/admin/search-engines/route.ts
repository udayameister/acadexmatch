import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { status, sync } from '@/lib/server/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Search engine submission status (admin only). */
export async function GET(req: NextRequest) {
  const no = await requireAdmin(req);
  if (no) return no;
  return NextResponse.json(await status(), { headers: { 'Cache-Control': 'no-store' } });
}

/** { action: 'changed' } submits new/changed pages; { action: 'all' } re-submits every public page. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const no = await requireAdmin(req);
  if (no) return no;
  const b = await req.json().catch(() => ({})) as { action?: string };
  const r = await sync({ force: b.action === 'all', reason: b.action === 'all' ? 'Submit all (admin)' : 'Submit changes (admin)' });
  return NextResponse.json({ ...r, status: await status() });
}
