import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb, accountOf } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed } from '@/lib/server/auth';
import { historyFor, prefsOf, PREF_DEFAULTS } from '@/lib/server/notifications';
import type { NotificationPrefs, UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEYS = Object.keys(PREF_DEFAULTS) as (keyof NotificationPrefs)[];

/** The user's email preferences and their own notification history. */
export async function GET(req: NextRequest) {
  const me = await currentUserId(req);
  const u = me ? await withDb(me, db => accountOf(db, me)) : undefined;
  if (!u) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  return NextResponse.json({ ok: true, role: u.role, emailVerified: u.emailVerified !== false, prefs: prefsOf(u), history: await historyFor(u.id, 100) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const me = await currentUserId(req);
  if (!me) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const incoming = (body.prefs || {}) as Record<string, unknown>;
  const prefs: NotificationPrefs = {};
  for (const k of KEYS) if (typeof incoming[k] === 'boolean') prefs[k] = incoming[k] as boolean;
  const saved = await withDb(me, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    const u = users.find(x => x.id === me);
    if (!u) return null;
    const merged = { ...prefsOf(u), ...prefs };
    c.set(STORAGE_KEYS.USERS, users.map(x => (x.id === me ? { ...x, notificationPrefs: merged, marketingConsent: merged.marketing } : x)));
    StorageService.addAuditLog('Notification settings updated', me, 'AUTHENTICATION');
    return merged;
  });
  if (!saved) return NextResponse.json({ ok: false, error: 'Account not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, prefs: saved });
}
