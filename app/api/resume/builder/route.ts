import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { deleteDraft, getDraft, saveDraft } from '@/lib/server/resumes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const d = await getDraft(userId, req.nextUrl.searchParams.get('id') || '');
  return d ? NextResponse.json({ draft: d }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
}

/** Save (create/update, optionally pre-filled from an analysis) or delete one of the user's own drafts. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`resume-builder:${userId}:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many changes. Please wait a minute.' }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: 'The resume is too long.' }, { status: 400 });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })() as { action?: string; id?: string; label?: unknown; template?: unknown; data?: unknown; fromAnalysis?: string } | null;
  if (body?.action === 'delete' && typeof body.id === 'string') {
    return (await deleteDraft(userId, body.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  }
  if (body?.action === 'save') {
    const r = await saveDraft(userId, { id: typeof body.id === 'string' ? body.id : undefined, label: body.label, template: body.template, data: body.data, fromAnalysis: typeof body.fromAnalysis === 'string' ? body.fromAnalysis : undefined });
    return r.ok ? NextResponse.json({ ok: true, draft: r.draft }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
