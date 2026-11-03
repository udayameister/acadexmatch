import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, requireAdmin } from '@/lib/server/auth';
import { digestStatus, discardPending, maybeSendDigest, saveDigestSettings } from '@/lib/server/newPostDigest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: the "new on AcadeXMatch" email to candidates (status, settings, send now). */
export async function GET(req: NextRequest) {
  const no = await requireAdmin(req);
  if (no) return no;
  return NextResponse.json(await digestStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const no = await requireAdmin(req);
  if (no) return no;
  const body = await req.json().catch(() => null) as { action?: string; enabled?: boolean; quietMinutes?: number; minGapHours?: number } | null;
  if (body?.action === 'settings') await saveDigestSettings({ enabled: body.enabled, quietMinutes: body.quietMinutes, minGapHours: body.minGapHours });
  else if (body?.action === 'send') {
    const run = await maybeSendDigest({ force: true });
    if (!run) return NextResponse.json({ ...(await digestStatus()), message: 'Nothing new to send: the waiting posts have closed or been removed.' });
  } else if (body?.action === 'discard') await discardPending();
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  return NextResponse.json(await digestStatus());
}
