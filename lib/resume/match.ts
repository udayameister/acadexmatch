/*
 * Recommends open AcadeXMatch vacancies for a parsed resume: subject/skill overlap, qualification level,
 * NET/SET and experience. Every reason shown is derived from the resume and the posting, nothing else.
 */
import type { Job } from '@/types';
import type { ParsedResume } from './parse';
import { findSkills } from './skills';
import { termSet, words, stem } from './text';

export interface JobRecommendation { jobId: string; title: string; institute: string; location: string | null; deadline: string | null; score: number; reasons: string[]; gaps: string[] }

const LEVEL = { school: 0, other: 0, diploma: 1, bachelors: 2, masters: 3, doctorate: 4 } as const;
function levelOf(t: string | null): number | null {
  if (!t) return null;
  if (/ph\.?\s?d|doctor/i.test(t)) return 4;
  if (/m\.?\s?tech|m\.?\s?e\b|master|post[- ]?grad|m\.?\s?sc|mca|mba|m\.?\s?phil|\bpg\b|m\.?\s?a\b|m\.?\s?com/i.test(t)) return 3;
  if (/b\.?\s?tech|b\.?\s?e\b|bachelor|graduat|b\.?\s?sc|bca|b\.?\s?com/i.test(t)) return 2;
  if (/diploma/i.test(t)) return 1;
  return null;
}

export function recommendJobs(r: ParsedResume, text: string, jobs: Job[], today: string, limit = 8): JobRecommendation[] {
  const skillNames = new Set(r.skills.map(s => s.name));
  const fields = r.education.map(e => e.field || '').join(' ');
  const resumeTerms = termSet(`${fields} ${r.skills.map(s => s.name).join(' ')} ${r.summary || ''} ${r.experience.map(e => e.title || '').join(' ')}`);
  const best = Math.max(0, ...r.education.map(e => LEVEL[e.level]));
  const years = r.totalExperienceMonths / 12;
  const hasNet = /\b(ugc[- ]?net|csir[- ]?net|slet|\bset\b|\bnet\b)/i.test(text);
  const hasPhd = r.education.some(e => e.level === 'doctorate');

  const out: JobRecommendation[] = [];
  for (const j of jobs) {
    if (j.status !== 'published') continue;
    if (j.applicationDeadline && j.applicationDeadline < today) continue;
    const reasons: string[] = [], gaps: string[] = [];
    const jobText = `${j.title} ${j.department || ''} ${j.specializationTags.join(' ')} ${j.requiredQualifications.specializationRequirements.join(' ')}`;
    const jobSkills = findSkills(jobText).map(f => f.skill.name);
    const sharedSkills = jobSkills.filter(s => skillNames.has(s));
    const jobWords = [...new Set(words(`${j.department || ''} ${j.specializationTags.join(' ')}`).filter(w => w.length > 3).map(stem))];
    const sharedWords = jobWords.filter(w => resumeTerms.has(w));
    const subject = jobWords.length ? sharedWords.length / jobWords.length : 0;
    const skillPart = jobSkills.length ? sharedSkills.length / jobSkills.length : 0;
    let score = Math.max(subject, skillPart) * 55 + Math.min(subject, skillPart) * 10;
    if (sharedSkills.length) reasons.push(`Skills match: ${sharedSkills.slice(0, 4).join(', ')}`);
    else if (sharedWords.length) reasons.push(`Subject match: ${j.department || j.specializationTags[0]}`);
    if (score < 15) continue; // not the candidate's subject area

    const need = levelOf(j.requiredQualifications.minDegree);
    if (need == null || best >= need) { score += 15; if (need != null) reasons.push('Meets the minimum qualification'); }
    else gaps.push(`Needs ${j.requiredQualifications.minDegree}`);
    if (j.requiredQualifications.netSletMandatory) {
      if (hasNet || hasPhd) { score += 10; reasons.push(hasNet ? 'NET/SET stated' : 'Ph.D. stated'); } else gaps.push('NET/SET/SLET required');
    } else score += 10;
    const minExp = j.requiredQualifications.minExperienceYears;
    if (minExp == null || years >= minExp) { score += 10; if (minExp) reasons.push(`${minExp}+ years’ experience required — you have about ${Math.floor(years)}`); }
    else gaps.push(`${minExp} years’ experience required`);

    out.push({
      jobId: j.id, title: j.title, institute: j.instituteName, location: [j.location.city, j.location.state].filter(Boolean).join(', ') || null,
      deadline: j.applicationDeadline || j.deadlineText || null, score: Math.min(100, Math.round(score)), reasons, gaps,
    });
  }
  return out.sort((a, b) => b.score - a.score || (a.deadline || '9').localeCompare(b.deadline || '9')).slice(0, limit);
}
