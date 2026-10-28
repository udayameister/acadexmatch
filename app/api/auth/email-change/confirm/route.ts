import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { badOrigin, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { consumeTokenData } from '@/lib/server/mailer';
import { sendEmailChanged } from '@/lib/server/authEmails';
import type { CandidateProfile, UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Completes an email change from the link sent to the new address. */
export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  if (!allow(`email-confirm:${clientIp(req)}`, 20, 60 * 60_000)) return tooMany('Too many attempts. Please try again later.');
  const body = await req.json().catch(() => ({}));
  const rec = await consumeTokenData(String(body.token || ''), 'email-change');
  if (!rec?.data) return NextResponse.json({ ok: false, error: 'This link is invalid or has expired. Ask for a new one from your account page.' }, { status: 400 });
  const newEmail = rec.data;
  const out = await withDb(rec.userId, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    if (users.some(u => u.email === newEmail && u.id !== rec.userId)) return { error: 'Another account already uses this address.' };
    const u = users.find(x => x.id === rec.userId);
    if (!u) return { error: 'Account not found.' };
    const updated = { ...u, email: newEmail, emailVerified: true };
    c.set(STORAGE_KEYS.USERS, users.map(x => (x.id === u.id ? updated : x)));
    const profiles = (db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>) || {};
    if (profiles[u.id]) c.set(STORAGE_KEYS.CANDIDATE_PROFILES, { ...profiles, [u.id]: { ...profiles[u.id], email: newEmail } });
    StorageService.addAuditLog(`Email changed from ${u.email} to ${newEmail}`, u.id, 'AUTHENTICATION');
    return { user: updated, old: u.email };
  });
  if ('error' in out) return NextResponse.json({ ok: false, error: out.error }, { status: 400 });
  sendEmailChanged(out.user!, out.old!).catch(() => undefined);
  return NextResponse.json({ ok: true, email: newEmail });
}
