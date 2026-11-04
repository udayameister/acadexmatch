import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId, requireAdmin } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { withDb, accountOf } from '@/lib/server/db';
import { STORAGE_KEYS } from '@/lib/storage';
import { jobViewCounts, jobViewSeries, recordJobView } from '@/lib/server/jobViews';
import type { Job } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Counts a visit to a vacancy page. Anyone may call it; the counts themselves are admin-only. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const ip = clientIp(req);
  if (!allow(`jobview:${ip}`, 60, 60_000)) return NextResponse.json({ ok: true, counted: false });
  const body = await req.json().catch(() => null) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const userId = await currentUserId(req);
  const { exists, admin } = await withDb(userId, db => ({
    exists: ((db[STORAGE_KEYS.JOBS] as Job[]) || []).some(j => j.id === jobId),
    admin: userId ? accountOf(db, userId)?.role === 'super_admin' : false,
  }));
  // The administrator's own visits and unknown ids are not counted.
  if (!exists || admin) return NextResponse.json({ ok: true, counted: false });
  const counted = await recordJobView(jobId, { ip, ua: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true, counted });
}

/** Administrator only: views for every vacancy, or a 30-day series for one (?id=). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get('id');
  const all = await jobViewCounts();
  if (id) return NextResponse.json({ since: all.since, views: all.jobs[id] || { total: 0, today: 0, last7: 0 }, series: await jobViewSeries(id, 30) }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(all, { headers: { 'Cache-Control': 'no-store' } });
}
