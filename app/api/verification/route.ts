import { NextRequest, NextResponse } from 'next/server';
import { withDb, accountOf, DOCUMENTS_KEY, StoredDocument } from '@/lib/server/db';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { verificationReadiness } from '@/lib/verification';
import { notify } from '@/lib/server/notifications';
import { appUrl } from '@/lib/server/mailer';
import { CONTACT_EMAIL } from '@/lib/contact';
import type { CandidateProfile, UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Db = Record<string, unknown>;
const profiles = (db: Db) => (db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>) || {};
const users = (db: Db) => (db[STORAGE_KEYS.USERS] as UserAccount[]) || [];
const docCats = (db: Db, userId: string) => [...new Set(((db[DOCUMENTS_KEY] as StoredDocument[]) || []).filter(d => d.userId === userId).map(d => d.category))];
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const readinessOf = (db: Db, u: UserAccount) => verificationReadiness(profiles(db)[u.id], docCats(db, u.id), u.emailVerified !== false);

/**
 * Candidate verification.
 *  GET            candidate: own status and checklist.  Admin with ?queue=1: every candidate with a request or a tick.
 *  POST request   candidate asks to be verified (only when the checklist is complete).
 *  POST cancel    candidate withdraws a pending request.
 *  POST approve / reject / revoke   administrator decides (reject needs a reason).
 */
export async function GET(req: NextRequest) {
  const me = await currentUserId(req);
  const queue = req.nextUrl.searchParams.get('queue') === '1';
  const out = await withDb(me, db => {
    const acc = accountOf(db, me);
    if (!acc) return { status: 401, body: { error: 'Please sign in.' } };
    if (queue) {
      if (acc.role !== 'super_admin') return { status: 403, body: { error: 'Only the platform administrator can do this.' } };
      const rows = users(db).filter(u => u.role === 'candidate').map(u => {
        const p = profiles(db)[u.id];
        if (!p || (!p.verificationRequest && !p.documentsVerified)) return null;
        const r = readinessOf(db, u);
        return { userId: u.id, name: u.name, email: u.email, verified: p.documentsVerified || null, request: p.verificationRequest || null, ready: r.ready, missing: r.missing, completeness: p.profileCompleteness, highestDegree: p.highestDegree, designation: p.currentDesignation, institute: p.currentInstitute };
      }).filter(Boolean);
      return { status: 200, body: { rows } };
    }
    if (acc.role !== 'candidate') return { status: 403, body: { error: 'Verification is for candidate accounts.' } };
    const p = profiles(db)[acc.id];
    const r = readinessOf(db, acc);
    return { status: 200, body: { verified: p?.documentsVerified || null, request: p?.verificationRequest || null, ...r } };
  });
  return NextResponse.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const me = await currentUserId(req);
  const b = await req.json().catch(() => ({})) as { action?: string; userId?: string; note?: string };
  const mails: Parameters<typeof notify>[0][] = [];
  const out = await withDb(me, db => {
    const acc = accountOf(db, me);
    if (!acc) return { status: 401, body: { error: 'Please sign in.' } };
    const map = profiles(db);
    const save = (p: CandidateProfile) => { map[p.userId] = p; db[STORAGE_KEYS.CANDIDATE_PROFILES] = map; };

    if (b.action === 'request' || b.action === 'cancel') {
      if (acc.role !== 'candidate') return { status: 403, body: { error: 'Verification is for candidate accounts.' } };
      const p = map[acc.id];
      if (!p) return { status: 400, body: { error: 'Complete your profile first.' } };
      if (p.documentsVerified) return { status: 400, body: { error: 'Your profile is already verified.' } };
      if (b.action === 'cancel') {
        if (p.verificationRequest?.status !== 'pending') return { status: 400, body: { error: 'There is no pending request.' } };
        save({ ...p, verificationRequest: null });
        StorageService.addAuditLog('Withdrew verification request', acc.id, 'PII_ACCESS');
        return { status: 200, body: { ok: true } };
      }
      if (p.verificationRequest?.status === 'pending') return { status: 400, body: { error: 'Your request is already with our team.' } };
      const r = readinessOf(db, acc);
      if (!r.ready) return { status: 400, body: { error: `Please complete these first: ${r.missing.join('; ')}.`, missing: r.missing } };
      save({ ...p, verificationRequest: { status: 'pending', requestedAt: new Date().toISOString() } });
      StorageService.addAuditLog('Requested profile verification', acc.id, 'PII_ACCESS');
      for (const admin of users(db).filter(u => u.role === 'super_admin')) {
        mails.push({ key: `verify-req:${acc.id}:${todayIst()}:${admin.id}`, category: 'account', kind: 'verification-request', user: admin.email.endsWith('@acadexmatch.in') ? undefined : admin, to: admin.email.endsWith('@acadexmatch.in') ? CONTACT_EMAIL : undefined, subject: `Verification request: ${acc.name}`, heading: 'A candidate asked to be verified', paragraphs: [`${acc.name} (${acc.email}) has completed their profile and uploaded their documents, and asked for the verified tick.`, 'Check the documents against the profile, then approve or reject with a reason.'], button: { label: 'Review the request', url: `${appUrl()}/admin?tab=quality` } });
      }
      return { status: 200, body: { ok: true } };
    }

    if (b.action === 'approve' || b.action === 'reject' || b.action === 'revoke') {
      if (acc.role !== 'super_admin') return { status: 403, body: { error: 'Only the platform administrator can do this.' } };
      const cand = users(db).find(u => u.id === b.userId && u.role === 'candidate');
      const p = cand && map[cand.id];
      if (!cand || !p) return { status: 404, body: { error: 'Candidate not found.' } };
      const note = String(b.note || '').trim().slice(0, 500);
      const now = new Date().toISOString();
      const dash = `${appUrl()}/candidate/dashboard`;
      if (b.action === 'approve') {
        save({ ...p, documentsVerified: { at: todayIst(), by: acc.name, note: note || undefined }, verificationRequest: null });
        StorageService.addAuditLog(`Verified candidate ${cand.email}`, cand.id, 'PII_ACCESS');
        mails.push({ key: `verify-ok:${cand.id}:${now}`, category: 'account', kind: 'verification-approved', user: cand, subject: 'Your AcadeXMatch profile is verified', heading: 'You are verified', paragraphs: ['Our team has checked your profile and documents. Your profile now shows the green verified tick to institutions when you apply and in talent search.', 'If you change your qualifications later, upload the new proofs so your profile stays accurate.'], button: { label: 'Open your dashboard', url: dash } });
      } else if (b.action === 'reject') {
        if (note.length < 5) return { status: 400, body: { error: 'Give the candidate a reason, so they know what to fix.' } };
        save({ ...p, documentsVerified: null, verificationRequest: { status: 'rejected', requestedAt: p.verificationRequest?.requestedAt || now, reviewedAt: now, note } });
        StorageService.addAuditLog(`Rejected verification of ${cand.email}: ${note}`, cand.id, 'PII_ACCESS');
        mails.push({ key: `verify-no:${cand.id}:${now}`, category: 'account', kind: 'verification-rejected', user: cand, subject: 'Your verification request needs changes', heading: 'We could not verify your profile yet', paragraphs: [`Our team's note: ${note}`, 'Update your profile or documents, then ask for verification again from your dashboard.'], button: { label: 'Update your profile', url: `${appUrl()}/candidate/profile#documents` } });
      } else {
        if (!p.documentsVerified) return { status: 400, body: { error: 'This candidate is not verified.' } };
        save({ ...p, documentsVerified: null, verificationRequest: note ? { status: 'rejected', requestedAt: now, reviewedAt: now, note } : null });
        StorageService.addAuditLog(`Removed verification of ${cand.email}${note ? `: ${note}` : ''}`, cand.id, 'PII_ACCESS');
      }
      return { status: 200, body: { ok: true } };
    }
    return { status: 400, body: { error: 'Unknown action.' } };
  });
  if (out.status === 200) for (const m of mails) await notify(m).catch(() => undefined);
  return NextResponse.json(out.body, { status: out.status });
}
