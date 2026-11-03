import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { deleteEvent, saveEvent } from '@/lib/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed-in users: create, edit or delete their own event advertisement (FDP, workshop, seminar, conference). */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`events:${userId}:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: 'Too many changes. Please wait a minute.' }, { status: 429 });
  const body = await req.json().catch(() => null) as { action?: string; id?: string; event?: unknown } | null;
  if (body?.action === 'save') {
    if (JSON.stringify(body.event || {}).length > 20_000) return NextResponse.json({ error: 'The listing is too long.' }, { status: 400 });
    const r = await saveEvent(userId, body.event, typeof body.id === 'string' ? body.id : undefined);
    return r.ok ? NextResponse.json({ ok: true, event: r.event }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (body?.action === 'delete' && typeof body.id === 'string') {
    const r = await deleteEvent(userId, body.id);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
