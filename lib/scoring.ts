import { CandidateProfile, EducationItem, ExperienceItem, Job, MatchBreakdown } from '@/types';

export interface UgcTable3ABreakdown {
  graduationScore: number;
  postGraduationScore: number;
  phdScore: number;
  netJrfScore: number;
  publicationsScore: number;
  experienceScore: number;
  awardsScore: number;
  totalScore: number;
}

const BACHELOR_RE = /\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|b\.?\s?a\b|b\.?\s?com|bachelor|b\.?\s?s\b|bca|b\.?\s?arch|b\.?\s?pharm|mbbs)/i;
const MASTER_RE = /\b(m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|m\.?\s?a\b|m\.?\s?com|master|m\.?\s?s\b|mca|mba|m\.?\s?phil|m\.?\s?arch|m\.?\s?pharm)/i;

/**
 * Converts a grade string ("86.2%", "9.4 CGPA", "8.9/10") to an approximate percentage.
 * CGPA is converted with the commonly used x9.5 factor. Returns null when no grade is present.
 */
export function gradeToPercentage(grade: string | undefined): number | null {
  if (!grade) return null;
  const pct = grade.match(/(\d{2,3}(?:\.\d+)?)\s*%/);
  if (pct) return Math.min(100, parseFloat(pct[1]));
  const cgpa = grade.match(/(\d{1,2}(?:\.\d+)?)\s*(?:\/\s*10|cgpa|cpi|gpa)/i);
  if (cgpa) {
    const v = parseFloat(cgpa[1]);
    if (v <= 10) return Math.round(v * 9.5 * 10) / 10;
  }
  const bare = parseFloat(grade);
  if (!isNaN(bare)) {
    if (bare <= 10) return Math.round(bare * 9.5 * 10) / 10;
    if (bare <= 100) return bare;
  }
  return null;
}

function findDegree(education: EducationItem[] | undefined, re: RegExp): EducationItem | undefined {
  return (education || []).find(e => re.test(e.degree));
}

/** Total years of academic / research / industry experience, computed from start and end dates. */
export function computeExperienceYears(experience: ExperienceItem[] | undefined, onlyAcademic = false): number {
  const now = Date.now();
  let totalMs = 0;
  for (const item of experience || []) {
    if (onlyAcademic && item.type === 'Industry / R&D') continue;
    const start = Date.parse(item.startDate);
    if (isNaN(start)) continue;
    const end = item.isCurrent || item.endDate === 'Present' ? now : Date.parse(item.endDate);
    if (isNaN(end) || end <= start) continue;
    totalMs += end - start;
  }
  return Math.round((totalMs / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

/**
 * Calculates the Academic Score per UGC Regulations 2018, Table 3A
 * (criteria for short-listing candidates for Assistant Professor in universities).
 */
export function getUgcTable3ABreakdown(profile: Partial<CandidateProfile>): UgcTable3ABreakdown {
  // 1. Graduation: >=80% -> 15, 60-80% -> 13, 55-60% -> 10, 45-55% -> 5
  const ugPct = gradeToPercentage(findDegree(profile.education, BACHELOR_RE)?.gradePercentage);
  const gradScore = ugPct === null ? 0 : ugPct >= 80 ? 15 : ugPct >= 60 ? 13 : ugPct >= 55 ? 10 : ugPct >= 45 ? 5 : 0;

  // 2. Post Graduation: >=80% -> 25, 60-80% -> 23, 55-60% -> 20
  const pgPct = gradeToPercentage(findDegree(profile.education, MASTER_RE)?.gradePercentage);
  const pgScore = pgPct === null ? 0 : pgPct >= 80 ? 25 : pgPct >= 60 ? 23 : pgPct >= 55 ? 20 : 0;

  // 3. Ph.D. Degree: 30
  const phdScore = profile.phdStatus?.isCompleted ? 30 : 0;

  // 4. NET with JRF -> 7, NET -> 5, SLET/SET -> 3
  let netScore = 0;
  const net = profile.netSletStatus;
  if (net?.isQualified) {
    if (net.examType?.includes('JRF')) netScore = 7;
    else if (net.examType?.includes('NET')) netScore = 5;
    else if (net.examType === 'SLET/SET') netScore = 3;
  }

  // 5. Research papers in peer-reviewed / UGC-listed journals: 2 each, max 10
  const peerReviewed = (profile.publications || []).filter(
    p => p.type !== 'Patent' && (p.ugcCareListed || p.scopusIndexed || p.sciScieIndexed)
  ).length;
  const publicationsScore = Math.min(peerReviewed * 2, 10);

  // 6. Teaching / post-doctoral experience: 2 per year, max 10
  const academicYears = computeExperienceYears(profile.experience, true);
  const experienceScore = Math.min(Math.floor(academicYears) * 2, 10);

  // 7. Awards: international / national -> 3, state / university -> 2
  const awardsScore = profile.awardLevel === 'national' ? 3 : profile.awardLevel === 'state' ? 2 : 0;

  const total = gradScore + pgScore + phdScore + netScore + publicationsScore + experienceScore + awardsScore;

  return {
    graduationScore: gradScore,
    postGraduationScore: pgScore,
    phdScore,
    netJrfScore: netScore,
    publicationsScore,
    experienceScore,
    awardsScore,
    totalScore: Math.min(total, 100),
  };
}

export function calculateUgcApiScore(profile: Partial<CandidateProfile>): number {
  return getUgcTable3ABreakdown(profile).totalScore;
}

/** Percentage of the dossier that has been filled in. */
export function computeProfileCompleteness(profile: Partial<CandidateProfile>): number {
  const checks = [
    !!profile.name?.trim(),
    !!profile.phone?.trim(),
    !!profile.location?.city?.trim(),
    !!profile.currentDesignation?.trim(),
    !!profile.currentInstitute?.trim(),
    !!profile.highestDegree?.trim(),
    !!profile.bio?.trim(),
    (profile.education || []).length > 0,
    (profile.experience || []).length > 0,
    (profile.publications || []).length > 0,
    (profile.researchInterests || []).length > 0,
    (profile.skills || []).length > 0,
    !!(profile.scholarLinks?.orcid || profile.scholarLinks?.googleScholar || profile.scholarLinks?.scopusId),
    profile.phdStatus?.isCompleted !== undefined && (!profile.phdStatus.isCompleted || !!profile.phdStatus.institute),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Recomputes derived fields (API score, completeness) after any profile edit. */
export function withDerivedProfileFields(profile: CandidateProfile): CandidateProfile {
  return {
    ...profile,
    apiScore: calculateUgcApiScore(profile),
    profileCompleteness: computeProfileCompleteness(profile),
  };
}

/**
 * Transparent & Explainable Hybrid Matching Engine
 */
export function calculateMatchScore(candidate: CandidateProfile, job: Job): MatchBreakdown {
  const positiveSignals: string[] = [];
  const potentialGaps: string[] = [];

  // 1. Mandatory Qualification Check
  let meetsMandatoryNetPhd = true;
  let qualScore = 60;

  if (/ph\.?\s?d/i.test(job.requiredQualifications.minDegree || '')) {
    if (candidate.phdStatus?.isCompleted) {
      qualScore += 30;
      positiveSignals.push('Holds completed Ph.D. complying with UGC/AICTE minimum norms');
    } else {
      meetsMandatoryNetPhd = false;
      qualScore -= 40;
      potentialGaps.push('Job mandates Ph.D.; candidate has not completed Ph.D.');
    }
  }

  if (job.requiredQualifications.netSletMandatory) {
    if (candidate.netSletStatus?.isQualified) {
      qualScore += 10;
      positiveSignals.push('Qualified in UGC-NET / CSIR-NET JRF');
    } else if (candidate.phdStatus?.isUgc2009_2016Compliant) {
      qualScore += 10;
      positiveSignals.push('Ph.D. exempts from NET under UGC 2009/2016 regulations');
    } else {
      meetsMandatoryNetPhd = false;
      qualScore -= 30;
      potentialGaps.push('NET/SLET qualification is mandatory for this pay level');
    }
  }

  qualScore = Math.max(0, Math.min(100, qualScore));

  // 2. Research & Department Synergy
  let researchScore = 40;
  const candKeywords = [
    ...(candidate.researchInterests || []).map(r => r.toLowerCase()),
    ...(candidate.skills || []).map(s => s.toLowerCase()),
    (candidate.currentDesignation || '').toLowerCase(),
  ].map(k => k.trim()).filter(k => k.length > 2);

  const jobKeywords = [
    (job.department || job.title).toLowerCase(),
    ...job.specializationTags.map(t => t.toLowerCase()),
  ];

  let matches = 0;
  jobKeywords.forEach(jk => {
    if (candKeywords.some(ck => ck.includes(jk) || jk.includes(ck))) {
      matches++;
    }
  });

  if (matches >= 3) {
    researchScore = 95;
    positiveSignals.push('High research alignment with departmental thrust areas');
  } else if (matches >= 1) {
    researchScore = 80;
    positiveSignals.push('Demonstrates relevant domain overlap with active department projects');
  } else {
    researchScore = 55;
    potentialGaps.push('Specialization focus is adjacent rather than directly core to department');
  }

  // 3. UGC-CARE / Scopus Publication Density
  let ugcPubsScore = 50;
  const candPubs = candidate.publications || [];
  const validPubs = candPubs.filter(p => p.ugcCareListed || p.scopusIndexed || p.sciScieIndexed);

  const minPubs = job.requiredQualifications.minUgcCarePubs;
  if (minPubs === null) {
    ugcPubsScore = validPubs.length > 0 ? 80 : 60;
    positiveSignals.push(`The vacancy does not state a publication benchmark; you have ${validPubs.length} indexed paper${validPubs.length === 1 ? '' : 's'}`);
  } else if (validPubs.length >= minPubs) {
    ugcPubsScore = 90;
    positiveSignals.push(`Publication count (${validPubs.length}) meets statutory UGC benchmark (${minPubs})`);
  } else {
    ugcPubsScore = Math.round((validPubs.length / Math.max(1, minPubs)) * 70);
    potentialGaps.push(`UGC-CARE paper count (${validPubs.length}) is below advertised benchmark (${minPubs})`);
  }

  // 4. Experience Delta
  let expScore = 75;
  const expYears = computeExperienceYears(candidate.experience);
  const minExp = job.requiredQualifications.minExperienceYears;
  if (minExp === null) {
    expScore = 75;
    positiveSignals.push(`The vacancy does not state a minimum experience; you have ${expYears.toFixed(1)} years`);
  } else if (expYears >= minExp) {
    expScore = 92;
    positiveSignals.push(`Academic experience meets ${minExp}+ years requirement`);
  } else {
    expScore = 65;
    potentialGaps.push(`Experience (${expYears.toFixed(1)} yrs) slightly below desired ${minExp} yrs`);
  }

  // Overall Deterministic Weighted Score (35% Quals, 30% Research, 20% Pubs, 15% Exp)
  let overall = (qualScore * 0.35) + (researchScore * 0.30) + (ugcPubsScore * 0.20) + (expScore * 0.15);

  if (!meetsMandatoryNetPhd) {
    overall = Math.min(overall, 48); // Cap fit score if statutory mandatory criteria fail
  }

  return {
    overallScore: Math.round(overall),
    qualificationMatch: Math.round(qualScore),
    researchSynergy: Math.round(researchScore),
    ugcCarePubsFit: Math.round(ugcPubsScore),
    experienceMatch: Math.round(expScore),
    meetsMandatoryNetPhd,
    positiveSignals,
    potentialGaps,
  };
}

export interface JournalIndexingEstimate {
  /** True when the venue matches a publisher / series whose journals are routinely Scopus or SCI indexed. */
  likelyIndexed: boolean;
  isUgcCare: boolean;
  isScopus: boolean;
  isSci: boolean;
  label: string;
}

const SCI_SERIES = ['ieee transactions', 'acm transactions', 'nature', 'science', 'physical review', 'journal of machine learning research', 'neural computation'];
const SCOPUS_PUBLISHERS = [
  'ieee', 'acm', 'springer', 'elsevier', 'taylor & francis', 'taylor and francis', 'wiley', 'plos', 'mdpi',
  'sage', 'oxford university press', 'cambridge university press', 'current science', 'sadhana', 'pramana',
  'indian academy of sciences', 'iop', 'aip', 'acs', 'rsc', 'frontiers', 'neurips', 'icml', 'iclr', 'cvpr', 'aaai',
];

/**
 * Heuristic indexing estimate from the venue name. This is NOT an authoritative UGC-CARE lookup —
 * the UGC-CARE list must be confirmed on the official portal (ugccare.unipune.ac.in) before selection.
 */
export function verifyJournalUgcCareStatus(journalName: string): JournalIndexingEstimate {
  const normalized = journalName.toLowerCase();
  const isSci = SCI_SERIES.some(k => normalized.includes(k));
  const isScopus = isSci || SCOPUS_PUBLISHERS.some(k => normalized.includes(k));

  if (isScopus) {
    return {
      likelyIndexed: true,
      // UGC-CARE Group II covers journals indexed in Scopus / Web of Science
      isUgcCare: true,
      isScopus: true,
      isSci,
      label: isSci ? 'Likely SCI / Scopus (UGC-CARE Group II)' : 'Likely Scopus (UGC-CARE Group II)',
    };
  }

  return {
    likelyIndexed: false,
    isUgcCare: false,
    isScopus: false,
    isSci: false,
    label: 'Unverified — confirm on the UGC-CARE portal',
  };
}
