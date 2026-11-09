/*
 * Candidate verification: what a candidate must have before asking the administrator to verify them.
 * Pure functions, used both in the browser (checklist) and on the server (the request is re-checked there).
 */
import type { CandidateProfile } from '@/types';

export interface ReadinessItem { key: string; label: string; done: boolean; group: 'profile' | 'documents' | 'account' }

/** `docCategories`: the categories the candidate has uploaded at least one file in. */
export function verificationReadiness(p: CandidateProfile | null | undefined, docCategories: string[], emailConfirmed = true): { items: ReadinessItem[]; ready: boolean; missing: string[] } {
  const has = (c: string) => docCategories.includes(c);
  const phd = !!p?.phdStatus?.isCompleted;
  const net = !!p?.netSletStatus?.isQualified;
  const exp = (p?.experience || []).length > 0;
  const items: ReadinessItem[] = [
    { key: 'email', group: 'account', label: 'Email address confirmed', done: emailConfirmed },
    { key: 'personal', group: 'profile', label: 'Name, mobile number and city', done: !!(p?.name?.trim() && p?.phone?.trim() && p?.location?.city?.trim()) },
    { key: 'degree', group: 'profile', label: 'Highest degree', done: !!p?.highestDegree?.trim() },
    { key: 'bio', group: 'profile', label: 'Short bio (About you)', done: !!p?.bio?.trim() },
    { key: 'education', group: 'profile', label: 'At least one education entry', done: (p?.education || []).length > 0 },
    { key: 'interests', group: 'profile', label: 'Research interests or skills', done: (p?.researchInterests || []).length > 0 || (p?.skills || []).length > 0 },
    { key: 'phd', group: 'profile', label: phd ? 'Ph.D. awarding university' : 'Ph.D. status answered', done: !p ? false : !phd || !!p.phdStatus.institute?.trim() },
    { key: 'photo', group: 'documents', label: 'Profile photo', done: has('photo') },
    { key: 'qualification', group: 'documents', label: 'Qualification certificates (degrees, mark sheets)', done: has('qualification') },
  ];
  if (phd || net) items.push({ key: 'phd_net', group: 'documents', label: `${[phd && 'Ph.D.', net && (p?.netSletStatus.examType || 'NET / SET')].filter(Boolean).join(' and ')} proof`, done: has('phd_net') });
  if (exp) items.push({ key: 'experience', group: 'documents', label: 'Experience certificates for the positions you list', done: has('experience') });
  const missing = items.filter(i => !i.done).map(i => i.label);
  return { items, ready: missing.length === 0, missing };
}
