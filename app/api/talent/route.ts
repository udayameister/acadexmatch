import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, isPremiumUser, isInstituteSubscribed } from '@/lib/storage';
import { withDb, accountOf } from '@/lib/server/db';
import { currentUserId } from '@/lib/server/auth';
import { computeExperienceYears } from '@/lib/scoring';
import type { Application, CandidateProfile, Institute, TalentInvite, UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Talent search for institution staff with an active subscription. Only Premium candidates who opted in
 * ("discoverable") are returned, and only non-contact details: no email, phone or documents.
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  const p = req.nextUrl.searchParams;
  const q = (p.get('q') || '').toLowerCase().trim().slice(0, 120);
  const minApi = Number(p.get('minApi') || 0) || 0;
  const minExp = Number(p.get('minExp') || 0) || 0;
  const needPhd = p.get('phd') === '1';
  const needNet = p.get('net') === '1';
  const state = (p.get('state') || '').toLowerCase().trim();

  const out = await withDb(userId, db => {
    const me = accountOf(db, userId);
    const isStaff = me && (me.role === 'institute_admin' || me.role === 'recruiter') && me.instituteId;
    if (!me || !(isStaff || me.role === 'super_admin')) return { error: 'Institution staff only.', status: 403 };
    if (isStaff) {
      const inst = ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).find(i => i.id === me.instituteId);
      if (!isInstituteSubscribed(inst)) return { error: 'Talent search needs an active Institution Premium subscription.', status: 403 };
    }
    const users = new Map(((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).map(u => [u.id, u]));
    const profiles = (db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>) || {};
    const invites = ((db[STORAGE_KEYS.TALENT_INVITES] as TalentInvite[]) || []).filter(i => !isStaff || i.instituteId === me.instituteId);
    const applied = ((db[STORAGE_KEYS.APPLICATIONS] as Application[]) || []).filter(a => !isStaff || a.instituteId === me.instituteId);
    const words = q.split(/\s+/).filter(Boolean);

    const results = Object.values(profiles).filter(pr => {
      const u = users.get(pr.userId);
      if (!u || u.role !== 'candidate' || !pr.discoverable || !isPremiumUser(u)) return false;
      if (pr.apiScore < minApi) return false;
      if (needPhd && !pr.phdStatus?.isCompleted) return false;
      if (needNet && !pr.netSletStatus?.isQualified) return false;
      if (state && (pr.location?.state || '').toLowerCase() !== state) return false;
      if (minExp && computeExperienceYears(pr.experience || [], true) < minExp) return false;
      if (!words.length) return true;
      const hay = [pr.name, pr.currentDesignation, pr.currentInstitute, pr.highestDegree, ...(pr.researchInterests || []), ...(pr.skills || []), ...(pr.education || []).map(e => `${e.degree} ${e.field}`), pr.phdStatus?.thesisTitle].join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    }).map(pr => ({
      candidateId: pr.userId,
      name: pr.name,
      designation: pr.currentDesignation || null,
      institute: pr.currentInstitute || null,
      highestDegree: pr.highestDegree || null,
      city: pr.location?.city || null,
      state: pr.location?.state || null,
      researchInterests: (pr.researchInterests || []).slice(0, 8),
      phd: !!pr.phdStatus?.isCompleted,
      net: !!pr.netSletStatus?.isQualified,
      apiScore: pr.apiScore,
      indexedPublications: (pr.publications || []).filter(x => x.ugcCareListed || x.scopusIndexed || x.sciScieIndexed).length,
      publications: (pr.publications || []).length,
      academicExperienceYears: computeExperienceYears(pr.experience || [], true),
      verified: !!pr.documentsVerified,
      invitedFor: invites.filter(i => i.candidateId === pr.userId).map(i => i.jobId),
      appliedFor: applied.filter(a => a.candidateId === pr.userId).map(a => a.jobId),
    })).sort((a, b) => b.apiScore - a.apiScore).slice(0, 60);
    return { results };
  });
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
