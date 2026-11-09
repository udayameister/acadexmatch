import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId } from '@/lib/server/auth';
import { allow } from '@/lib/server/security';
import { overview, startSession, getSession, setJob, chat, build, improve, publicSession } from '@/lib/server/aiResume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const noStore = { 'Cache-Control': 'no-store' };

/** GET: price, credits and sessions; ?id= one session (chat, runs). */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const r = await getSession(userId, id);
    return 'session' in r ? NextResponse.json({ session: publicSession(r.session) }, { headers: noStore }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const o = await overview(userId);
  return 'error' in o ? NextResponse.json({ error: o.error }, { status: o.status }) : NextResponse.json(o, { headers: noStore });
}

/** POST actions: start | job | message | build | improve. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`ai-resume:${userId}`, 30, 60_000)) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 30_000) return NextResponse.json({ error: 'That is too long.' }, { status: 400 });
  const b = (() => { try { return JSON.parse(raw); } catch { return {}; } })() as { action?: string; id?: string; text?: string };
  const id = String(b.id || '');
  const r =
    b.action === 'start' ? await startSession(userId)
      : b.action === 'job' ? await setJob(userId, id, String(b.text || ''))
        : b.action === 'message' ? await chat(userId, id, String(b.text || ''))
          : b.action === 'build' ? await build(userId, id)
            : b.action === 'improve' ? await improve(userId, id)
              : { ok: false as const, error: 'Unknown action', status: 400 };
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { session, ...rest } = r;
  return NextResponse.json({ ...rest, ok: true, session: publicSession(session) });
}
