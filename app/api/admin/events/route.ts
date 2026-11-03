import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId, requireAdmin } from '@/lib/server/auth';
import { withDb } from '@/lib/server/db';
import { reviewEvent } from '@/lib/server/events';
import { STORAGE_KEYS, DEFAULT_PLAN_SETTINGS, StorageService } from '@/lib/storage';
import type { PlanSettings } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: review event advertisements and set their prices. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const no = await requireAdmin(req);
  if (no) return no;
  const adminId = (await currentUserId(req))!;
  const body = await req.json().catch(() => null) as { action?: string; id?: string; decision?: string; note?: string; eventPriceInr?: number; conferencePriceInr?: number } | null;
  if (body?.action === 'review' && typeof body.id === 'string' && ['approve', 'reject', 'waive'].includes(String(body.decision))) {
    const r = await reviewEvent(adminId, body.id, body.decision as 'approve' | 'reject' | 'waive', body.note);
    return r.ok ? NextResponse.json({ ok: true, event: r.event }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (body?.action === 'prices') {
    const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 1_000_000 ? Math.round(v) : null);
    const ev = price(body.eventPriceInr), conf = price(body.conferencePriceInr);
    if (ev === null || conf === null) return NextResponse.json({ error: 'Enter both prices in rupees.' }, { status: 400 });
    await withDb(adminId, (db, c) => {
      const s: PlanSettings = { ...DEFAULT_PLAN_SETTINGS, ...((db[STORAGE_KEYS.PLAN_SETTINGS] as Partial<PlanSettings>) || {}), eventPriceInr: ev, conferencePriceInr: conf };
      c.set(STORAGE_KEYS.PLAN_SETTINGS, s);
      StorageService.addAuditLog(`Event advertisement prices set: FDP/workshop/seminar ₹${ev}, conference ₹${conf}`, 'plan-settings', 'AUTHENTICATION');
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
