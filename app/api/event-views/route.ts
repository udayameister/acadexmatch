import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId, requireAdmin } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { withDb, accountOf } from '@/lib/server/db';
import { STORAGE_KEYS } from '@/lib/storage';
import { eventViewCounts, eventViewSeries, recordEventAction, type EventAction } from '@/lib/server/eventViews';
import type { AcademicEvent } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY = { total: 0, today: 0, last7: 0, register: 0, brochure: 0 };

/**
 * Counts a visit to an event page, or a click on its Register / Brochure link ({ eventId, action }).
 * Anyone may call it; the counts themselves are admin-only.
 */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const ip = clientIp(req);
  if (!allow(`eventview:${ip}`, 60, 60_000)) return NextResponse.json({ ok: true, counted: false });
  const body = await req.json().catch(() => null) as { eventId?: unknown; action?: unknown } | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const action: EventAction = body?.action === 'register' || body?.action === 'brochure' ? body.action : 'view';
  const userId = await currentUserId(req);
  const { exists, admin } = await withDb(userId, db => ({
    exists: ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).some(e => e.id === eventId),
    admin: userId ? accountOf(db, userId)?.role === 'super_admin' : false,
  }));
  // The administrator's own visits and unknown ids are not counted.
  if (!exists || admin) return NextResponse.json({ ok: true, counted: false });
  const counted = await recordEventAction(eventId, action, { ip, ua: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true, counted });
}

/** Administrator only: counts for every event, or a 30-day series for one (?id=). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get('id');
  const all = await eventViewCounts();
  if (id) return NextResponse.json({ since: all.since, views: all.events[id] || EMPTY, series: await eventViewSeries(id, 30) }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(all, { headers: { 'Cache-Control': 'no-store' } });
}
