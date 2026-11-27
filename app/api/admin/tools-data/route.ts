import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { deleteCall, deleteExam, deleteNotice, getToolsData, saveCall, saveExam, saveNotice } from '@/lib/server/toolsData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: the funding calendar and NET / SET hub data. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await getToolsData(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as { action?: string; item?: Record<string, unknown>; prevId?: string; id?: string };
  const prev = b.prevId ? String(b.prevId) : undefined;
  try {
    switch (b.action) {
      case 'saveCall': return NextResponse.json(await saveCall(b.item || {}, prev));
      case 'deleteCall': return NextResponse.json(await deleteCall(String(b.id || '')));
      case 'saveExam': return NextResponse.json(await saveExam(b.item || {}, prev));
      case 'deleteExam': return NextResponse.json(await deleteExam(String(b.id || '')));
      case 'saveNotice': return NextResponse.json(await saveNotice(b.item || {}, prev));
      case 'deleteNotice': return NextResponse.json(await deleteNotice(String(b.id || '')));
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
