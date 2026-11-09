import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth';
import { AI_MODELS, aiConfigured } from '@/lib/server/ai';
import { aiResumeStats } from '@/lib/server/aiResume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: is the AI key configured, which models run, and usage so far (never the key itself). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ configured: aiConfigured(), models: { chat: AI_MODELS.chat(), writer: AI_MODELS.writer(), improver: AI_MODELS.improver() }, stats: await aiResumeStats() }, { headers: { 'Cache-Control': 'no-store' } });
}
