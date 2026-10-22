import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { runJobAlerts } from '@/lib/server/jobAlerts';
import { sendDeadlineReminders } from '@/lib/server/deadlineReminders';
import { withDb } from '@/lib/server/db';
import { STORAGE_KEYS } from '@/lib/storage';
import type { JobAlert } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const alerts = await withDb(null, db => (db[STORAGE_KEYS.JOB_ALERTS] as JobAlert[]) || []);
  return NextResponse.json({ total: alerts.length, active: alerts.filter(a => a.active).length, users: new Set(alerts.map(a => a.userId)).size });
}

/** Sends due job alerts and deadline reminders now (ignores the time of day and the daily/weekly schedule). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const alerts = await runJobAlerts({ force: true });
  const reminders = await sendDeadlineReminders({ force: true });
  return NextResponse.json({ ...alerts, reminders });
}
