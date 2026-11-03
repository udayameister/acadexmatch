import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, requireAdmin } from '@/lib/server/auth';
import { getResumeSettings, resumeStats, saveResumeSettings } from '@/lib/server/resumes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: resume checker settings and aggregate statistics. No resume content is available here. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ settings: await getResumeSettings(), stats: await resumeStats() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json({ ok: true, settings: await saveResumeSettings(body?.settings) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
