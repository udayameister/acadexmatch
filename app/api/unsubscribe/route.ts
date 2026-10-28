import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { allow, clientIp } from '@/lib/server/security';
import { CATEGORY_LABEL, prefsOf, unsubscribeSigValid, type Category } from '@/lib/server/notifications';
import { tooMany } from '@/lib/server/auth';
import type { NotificationPrefs, UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPTIONAL: Category[] = ['applications', 'statusUpdates', 'interviews', 'jobAlerts', 'deadlineReminders', 'recruiter', 'announcements', 'marketing'];

/**
 * Unsubscribes from one optional email category with the signed link from an email
 * (also used by mail apps' one-click "Unsubscribe", RFC 8058). No sign-in needed.
 */
export async function POST(req: NextRequest) {
  if (!allow(`unsub:${clientIp(req)}`, 30, 60 * 60_000)) return tooMany('Too many requests.');
  const q = req.nextUrl.searchParams;
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const u = String(body.u || q.get('u') || ''), c = String(body.c || q.get('c') || '') as Category, s = String(body.s || q.get('s') || '');
  if (!OPTIONAL.includes(c) || !u || !unsubscribeSigValid(u, c, s)) return NextResponse.json({ ok: false, error: 'This unsubscribe link is not valid.' }, { status: 400 });
  const done = await withDb(u, (db, ctx) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    const acc = users.find(x => x.id === u);
    if (!acc) return false;
    const prefs = { ...prefsOf(acc), [c as keyof NotificationPrefs]: false };
    ctx.set(STORAGE_KEYS.USERS, users.map(x => (x.id === u ? { ...x, notificationPrefs: prefs, ...(c === 'marketing' ? { marketingConsent: false } : {}) } : x)));
    StorageService.addAuditLog(`Unsubscribed from ${CATEGORY_LABEL[c]} emails`, u, 'AUTHENTICATION');
    return true;
  });
  return NextResponse.json({ ok: done, category: CATEGORY_LABEL[c] }, { status: done ? 200 : 404 });
}
