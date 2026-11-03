/*
 * AcadeXMatch ATS compatibility scoring (the platform's own method, not a universal ATS standard).
 * Six weighted dimensions (configurable by the administrator), an overall 0–100 score, the job-description
 * match when one is given, and rule-based recommendations. It never invents qualifications: suggestions say
 * what to add "if you have it".
 */
import type { ParsedResume } from './parse';
import { ACTION_VERBS } from './parse';
import type { JobRequirements } from './jd';
import { findSkills, LEARNING_HINTS, type SkillCategory } from './skills';
import { hasTerm, pct, termSet } from './text';

export interface ScoreWeights { keywords: number; skills: number; experience: number; formatting: number; education: number; summary: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { keywords: 25, skills: 20, experience: 20, formatting: 15, education: 10, summary: 10 };

export type Dimension = keyof ScoreWeights;
export const DIMENSION_LABEL: Record<Dimension, string> = {
  keywords: 'Keyword optimisation', skills: 'Skills relevance', experience: 'Work experience relevance',
  formatting: 'Structure and formatting', education: 'Education and certifications', summary: 'Professional summary',
};

export interface LayoutSignals { tables: number; textBoxes: number; images: number; multiColumn: boolean; contactInHeader: boolean; scanned: boolean }

export interface Finding { severity: 'high' | 'medium' | 'low'; area: Dimension | 'completeness'; text: string }
export interface WeakBullet { text: string; issue: string; suggestion: string }

export interface AnalysisResult {
  overall: number;
  band: { label: string; tone: 'excellent' | 'strong' | 'improve' | 'significant' | 'major' };
  dimensions: Record<Dimension, number>;
  completeness: { score: number; present: string[]; missing: string[] };
  weights: ScoreWeights;
  hasJob: boolean;
  job?: {
    matchPercent: number;
    title: string | null;
    organization: string | null;
    matchedRequired: string[];
    missingRequired: string[];
    matchedPreferred: string[];
    missingPreferred: string[];
    matchedKeywords: string[];
    missingKeywords: string[];
    experience: { required: number | null; have: number; ok: boolean | null };
    education: { required: string | null; have: string | null; ok: boolean | null; net: { required: boolean; have: boolean } };
    certifications: { mentioned: string[]; have: string[] };
    responsibilities: { text: string; covered: boolean }[];
  };
  findings: Finding[];
  weakBullets: WeakBullet[];
  skillGaps: { name: string; category: SkillCategory; required: boolean; hint: string | null }[];
  formatting: { check: string; ok: boolean; note: string }[];
  stats: { words: number; bullets: number; actionVerbShare: number; quantifiedShare: number; experienceYears: number; skills: number };
}

export function bandFor(score: number): AnalysisResult['band'] {
  if (score >= 90) return { label: 'Excellent compatibility', tone: 'excellent' };
  if (score >= 75) return { label: 'Strong compatibility', tone: 'strong' };
  if (score >= 60) return { label: 'Needs improvement', tone: 'improve' };
  if (score >= 40) return { label: 'Significant improvements required', tone: 'significant' };
  return { label: 'Major optimisation recommended', tone: 'major' };
}

const SAMPLE_VERBS = ['Developed', 'Led', 'Taught', 'Published', 'Designed', 'Improved', 'Implemented', 'Mentored'].filter(v => ACTION_VERBS.includes(v.toLowerCase()) || true);
const LEVEL_RANK = { school: 0, diploma: 1, bachelors: 2, masters: 3, doctorate: 4, other: 0 } as const;
const LEVEL_LABEL = { doctorate: 'Ph.D.', masters: "Master's degree", bachelors: "Bachelor's degree", diploma: 'Diploma' } as const;

const WEAK_STARTS: [RegExp, string, string[]][] = [
  [/^(responsible for|responsibilities included|in charge of)\s+/i, 'Describes a duty, not what you did', ['Managed', 'Led', 'Ran', 'Owned']],
  [/^(worked on|working on|work on)\s+/i, 'Vague: say what you did', ['Built', 'Developed', 'Implemented', 'Delivered']],
  [/^(helped|assisted|supported)\s+(with\s+)?/i, 'Understates your part', ['Contributed to', 'Co-developed', 'Supported … by']],
  [/^(involved in|participated in|part of)\s+/i, 'Passive: name your contribution', ['Contributed to', 'Delivered', 'Coordinated']],
  [/^(did|done|handled|handling)\s+/i, 'Weak verb', ['Managed', 'Conducted', 'Taught', 'Delivered']],
  [/^(duties|tasks) (included|were)\s*:?\s*/i, 'Lists duties instead of results', ['Managed', 'Delivered', 'Improved']],
];

/** Runs the analysis. `job` is the parsed job description, if the user gave one. */
export function analyzeResume(r: ParsedResume, signals: LayoutSignals, job: JobRequirements | null, weights: ScoreWeights = DEFAULT_WEIGHTS, rawText = ''): AnalysisResult {
  const text = rawText || r.sections.flatMap(s => [s.heading, ...s.lines]).join('\n');
  const tset = termSet(text);
  const resumeSkills = new Set(r.skills.map(s => s.name));
  const hard = r.skills.filter(s => s.category !== 'Soft skills' && s.category !== 'Languages');
  const expYears = Math.round((r.totalExperienceMonths / 12) * 10) / 10;
  const bullets = r.experience.flatMap(e => e.bullets);
  const consider = bullets.length || r.stats.bullets;
  const actionShare = consider ? r.stats.actionVerbBullets / consider : 0;
  const quantShare = consider ? r.stats.quantifiedBullets / consider : 0;
  const findings: Finding[] = [];
  const add = (severity: Finding['severity'], area: Finding['area'], t: string) => findings.push({ severity, area, text: t });
  const academicResume = r.sections.some(s => ['publications', 'research', 'teaching'].includes(s.key)) || /professor|lecturer|research scholar/i.test(r.experience.map(e => e.title).join(' '));

  // ---------- completeness
  const expected: [string, boolean][] = [
    ['Contact details (email and phone)', !!(r.email && r.phone)],
    ['Professional summary', !!r.summary],
    ['Work experience with dates', r.experience.length > 0],
    ['Education', r.education.length > 0],
    ['Skills section', r.sections.some(s => s.key === 'skills')],
    ...(academicResume ? [['Publications', r.publications.items.length > 0] as [string, boolean], ['Research interests', r.sections.some(s => s.key === 'research')] as [string, boolean]] : []),
    ['Certifications or training', r.certifications.length > 0 || r.sections.some(s => s.key === 'training')],
  ];
  const completeness = { score: pct((expected.filter(e => e[1]).length / expected.length) * 100), present: expected.filter(e => e[1]).map(e => e[0]), missing: expected.filter(e => !e[1]).map(e => e[0]) };
  for (const m of completeness.missing) add(m.startsWith('Contact') || m.startsWith('Work') || m === 'Education' ? 'high' : 'medium', 'completeness', `Add a clear “${m}” section${m.startsWith('Contact') ? ' at the top, in the main body (not the header)' : ''}.`);

  // ---------- formatting
  const formatting: AnalysisResult['formatting'] = [
    { check: 'Text can be read (not a scanned image)', ok: !signals.scanned, note: 'Scanned resumes are invisible to most ATS.' },
    { check: 'No tables', ok: signals.tables === 0, note: 'Tables can scramble the reading order.' },
    { check: 'No text boxes', ok: signals.textBoxes === 0, note: 'Text inside text boxes is often skipped.' },
    { check: 'No images or icons for content', ok: signals.images === 0, note: 'Images and icons are ignored; logos are fine to leave out.' },
    { check: 'Single-column layout', ok: !signals.multiColumn, note: 'Two columns can be read across instead of down.' },
    { check: 'Contact details in the main body', ok: !signals.contactInHeader, note: 'Some ATS skip page headers and footers.' },
    { check: 'Standard section headings', ok: r.sections.filter(s => s.key !== 'other').length >= 3, note: 'Use headings like “Experience”, “Education”, “Skills”.' },
    { check: 'Consistent date format', ok: r.stats.dateFormats <= 1, note: 'Write dates the same way, e.g. “Jun 2018 – Present”.' },
    { check: 'Suitable length', ok: academicResume ? r.stats.words >= 250 : r.stats.words >= 250 && r.stats.words <= 1100, note: academicResume ? 'Academic CVs can be long, but need enough detail.' : 'Aim for one to two pages (about 300–900 words).' },
    { check: 'Bullet points for achievements', ok: r.stats.bullets >= 4, note: 'Short bullet points are easier to scan and parse.' },
    { check: 'No first-person pronouns', ok: r.stats.firstPersonPronouns <= 2, note: 'Write “Developed…”, not “I developed…”.' },
  ];
  const fmtPoints: Record<string, number> = { 'Text can be read (not a scanned image)': 40, 'No tables': 10, 'No text boxes': 10, 'No images or icons for content': 5, 'Single-column layout': 10, 'Contact details in the main body': 10, 'Standard section headings': 15, 'Consistent date format': 5, 'Suitable length': 10, 'Bullet points for achievements': 10, 'No first-person pronouns': 5 };
  const fmtLoss = formatting.filter(f => !f.ok).reduce((s, f) => s + (fmtPoints[f.check] || 5), 0);
  for (const f of formatting.filter(x => !x.ok)) add((fmtPoints[f.check] || 0) >= 10 ? 'high' : 'low', 'formatting', `${f.check.replace(/^No /, 'Remove ').replace(/^Text can be read.*/, 'Upload a text-based PDF or DOCX, not a scan')}: ${f.note}`);
  const formattingScore = pct(100 - fmtLoss);

  // ---------- summary
  let summaryScore = 0;
  if (r.summary) {
    const n = r.summary.split(/\s+/).length;
    summaryScore = 40 + (n >= 30 && n <= 120 ? 25 : n >= 15 ? 12 : 0) + (/\d/.test(r.summary) ? 10 : 0)
      + (findSkills(r.summary).length >= 2 ? 15 : 0) + (/\b(I|my|me)\b/.test(r.summary) ? 0 : 10);
    if (/\b(hard[- ]?working|looking for (a )?(good )?opportunit|reputed (company|organi[sz]ation)|seeking a (challenging )?position)\b/i.test(r.summary)) {
      summaryScore -= 20;
      add('medium', 'summary', 'Replace generic phrases (“hard-working”, “looking for a good opportunity”) with your role, years of experience and two or three strongest skills.');
    }
    if (n < 30) add('low', 'summary', 'Expand the summary to 3–4 lines: your role, years of experience, key skills and a notable result.');
    if (n > 120) add('low', 'summary', 'Shorten the summary to about 3–4 lines; move details into experience.');
  } else add('medium', 'summary', 'Add a 3–4 line professional summary at the top: your role, years of experience, key skills and one notable result.');

  // ---------- experience quality (used with or without a job)
  const weakBullets: WeakBullet[] = [];
  for (const b of bullets.length ? bullets : []) {
    const w = WEAK_STARTS.find(([re]) => re.test(b));
    if (w && weakBullets.length < 10) {
      const rest = b.replace(w[0], '').replace(/^\s*the\s+/i, 'the ');
      // Keep acronyms and proper nouns ("REST APIs", "Operating Systems"); lower-case only an ordinary first word.
      const first = rest.split(/\s+/)[0] || '';
      const tail = /^[A-Z][a-z]+$/.test(first) && !/^[A-Z][a-z]+$/.test(rest.split(/\s+/)[1] || '') ? `${first.toLowerCase()}${rest.slice(first.length)}` : rest;
      const teaching = /\b(labs?|laborator(y|ies)|class(es)?|courses?|lecture|session|tutorial|subject|students?)\b/i.test(b);
      const verb = teaching && w[2].includes('Managed') ? 'Conducted' : w[2][0];
      weakBullets.push({ text: b, issue: w[1], suggestion: `${verb} ${tail}`.replace(/\s+/g, ' ').trim() });
    }
  }
  if (consider && actionShare < 0.6) add('medium', 'experience', `Only ${Math.round(actionShare * 100)}% of your bullet points start with an action verb. Start each with one, e.g. ${SAMPLE_VERBS.join(', ')}.`);
  if (consider && quantShare < 0.3) add('medium', 'experience', 'Add numbers where you know them (students taught, papers published, time saved, % improvement, team size). Do not estimate figures you cannot support.');
  const expQuality = pct((r.experience.length ? 40 : 0) + Math.min(1, actionShare / 0.7) * 35 + Math.min(1, quantShare / 0.4) * 25);

  // ---------- education quality
  const best = r.education.reduce<typeof r.education[number] | null>((a, e) => (!a || LEVEL_RANK[e.level] > LEVEL_RANK[a.level] ? e : a), null);
  const certNames = [...r.certifications, ...r.skills.map(s => s.name)].join(' ');
  const hasNet = /\b(ugc[- ]?net|csir[- ]?net|\bnet\b|slet|\bset\b)\b/i.test(`${certNames} ${text}`);
  let eduScore = r.education.length ? 60 + (r.education.every(e => e.year) ? 15 : 0) + (r.certifications.length ? 15 : 0) + (r.education.some(e => e.institution) ? 10 : 0) : 10;

  // ---------- with or without a job description
  let keywordScore: number, skillsScore: number, experienceScore: number;
  let jobBlock: AnalysisResult['job'] | undefined;
  const skillGaps: AnalysisResult['skillGaps'] = [];

  if (job) {
    const kwFound = job.keywords.filter(k => resumeSkills.has(k.label) || hasTerm(tset, k.term) || text.toLowerCase().includes(k.term));
    const kwMissing = job.keywords.filter(k => !kwFound.includes(k));
    const kwTotal = job.keywords.reduce((s, k) => s + k.weight, 0) || 1;
    keywordScore = pct((kwFound.reduce((s, k) => s + k.weight, 0) / kwTotal) * 100);

    const reqHave = job.requiredSkills.filter(s => resumeSkills.has(s.name));
    const reqMiss = job.requiredSkills.filter(s => !resumeSkills.has(s.name));
    const prefHave = job.preferredSkills.filter(s => resumeSkills.has(s.name));
    const prefMiss = job.preferredSkills.filter(s => !resumeSkills.has(s.name));
    const reqShare = job.requiredSkills.length ? reqHave.length / job.requiredSkills.length : 1;
    const prefShare = job.preferredSkills.length ? prefHave.length / job.preferredSkills.length : 1;
    skillsScore = job.requiredSkills.length || job.preferredSkills.length ? pct((reqShare * 0.75 + prefShare * 0.25) * 100) : pct(Math.min(1, hard.length / 12) * 100);
    for (const s of reqMiss) skillGaps.push({ name: s.name, category: s.category, required: true, hint: LEARNING_HINTS[s.category] || null });
    for (const s of prefMiss) skillGaps.push({ name: s.name, category: s.category, required: false, hint: LEARNING_HINTS[s.category] || null });

    const expText = r.experience.map(e => `${e.title || ''} ${e.organization || ''} ${e.bullets.join(' ')}`).join('\n');
    const expSkills = new Set(findSkills(expText).map(f => f.skill.name));
    const jobSkillNames = [...job.requiredSkills, ...job.preferredSkills].map(s => s.name);
    const inExp = jobSkillNames.length ? jobSkillNames.filter(n => expSkills.has(n)).length / jobSkillNames.length : 0.5;
    const yearsOk = job.minExperienceYears == null ? null : expYears >= job.minExperienceYears;
    const yearsPart = job.minExperienceYears == null ? 0.8 : Math.min(1, expYears / Math.max(0.5, job.minExperienceYears));
    const titleWords = (job.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const titleHit = titleWords.length ? titleWords.filter(w => r.experience.some(e => (e.title || '').toLowerCase().includes(w))).length / titleWords.length : 0.5;
    experienceScore = pct((yearsPart * 0.4 + inExp * 0.3 + titleHit * 0.15) * 100 + expQuality * 0.15);
    if (yearsOk === false) add('high', 'experience', `The job asks for at least ${job.minExperienceYears} years of experience; your resume shows about ${expYears}. If you have more (including teaching, research or internships), list it with dates.`);
    if (inExp < 0.4 && jobSkillNames.length) add('medium', 'experience', 'Show the job’s key skills inside your experience bullet points (where you actually used them), not only in the skills list.');

    const needLevel = job.degreeLevel;
    const eduOk = needLevel ? !!best && LEVEL_RANK[best.level] >= LEVEL_RANK[needLevel] : null;
    eduScore = pct((needLevel ? (eduOk ? 70 : 20) : 60) + (job.netRequired ? (hasNet ? 20 : 0) : 15) + (job.certifications.length ? (job.certifications.some(c => certNames.toUpperCase().includes(c.split(' ')[0])) ? 15 : 0) : 15));
    if (eduOk === false) add('high', 'education', `The job asks for a ${LEVEL_LABEL[needLevel!]}; your resume’s highest qualification is ${best ? best.degree : 'not stated'}. If you hold it (or it is in progress), state it clearly with the year.`);
    if (job.netRequired && !hasNet) add('high', 'education', 'The job asks for NET/SET/SLET (or a Ph.D. under UGC regulations). If you have qualified, mention it with the year.');

    if (reqMiss.length) add('high', 'keywords', `Missing required skills: ${reqMiss.slice(0, 10).map(s => s.name).join(', ')}. Add the ones you genuinely have, in your skills and in the experience where you used them.`);
    if (kwMissing.length) add('medium', 'keywords', `Keywords from the job description not in your resume: ${kwMissing.slice(0, 12).map(k => k.label).join(', ')}. Use the job’s own wording where it truthfully describes your work; do not stuff keywords.`);

    const respCovered = job.responsibilities.map(t => {
      const s = findSkills(t).map(f => f.skill.name);
      const ts = termSet(t);
      const shared = [...ts].filter(x => !x.includes(' ') && tset.has(x)).length;
      return { text: t, covered: s.some(n => resumeSkills.has(n)) || shared >= Math.max(2, Math.ceil(ts.size * 0.25)) };
    });

    const matchPercent = pct(keywordScore * 0.35 + skillsScore * 0.35 + (yearsOk === false ? 30 : 100) * 0.15 + (eduOk === false ? 30 : 100) * 0.15);
    jobBlock = {
      matchPercent, title: job.title, organization: job.organization,
      matchedRequired: reqHave.map(s => s.name), missingRequired: reqMiss.map(s => s.name),
      matchedPreferred: prefHave.map(s => s.name), missingPreferred: prefMiss.map(s => s.name),
      matchedKeywords: kwFound.map(k => k.label), missingKeywords: kwMissing.map(k => k.label),
      experience: { required: job.minExperienceYears, have: expYears, ok: yearsOk },
      education: { required: needLevel ? LEVEL_LABEL[needLevel] : null, have: best?.degree || null, ok: eduOk, net: { required: job.netRequired, have: hasNet } },
      certifications: { mentioned: job.certifications, have: job.certifications.filter(c => certNames.toUpperCase().includes(c.split(' ')[0])) },
      responsibilities: respCovered,
    };
  } else {
    // Without a job description: how well-stocked and clear the resume is for ATS keyword search in general.
    const cats = new Set(hard.map(s => s.category));
    keywordScore = pct(Math.min(1, hard.length / 20) * 70 + (r.sections.some(s => s.key === 'skills') ? 20 : 0) + Math.min(1, cats.size / 3) * 10);
    skillsScore = pct(Math.min(1, hard.length / 16) * 60 + Math.min(1, cats.size / 5) * 25 + (r.skills.some(s => s.category === 'Soft skills') ? 15 : 0));
    experienceScore = expQuality;
    add('low', 'keywords', 'Add a target job description to see the exact keywords and skills that job looks for.');
    if (hard.length < 8) add('medium', 'skills', 'List more of the specific tools, methods and subjects you know (for example programming languages, software, lab techniques, subjects taught).');
  }

  const dims: Record<Dimension, number> = {
    keywords: keywordScore, skills: skillsScore, experience: experienceScore, formatting: formattingScore,
    education: pct(eduScore), summary: pct(summaryScore),
  };
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const overall = pct((Object.keys(dims) as Dimension[]).reduce((s, k) => s + dims[k] * weights[k], 0) / wsum);
  const order = { high: 0, medium: 1, low: 2 } as const;

  return {
    overall, band: bandFor(overall), dimensions: dims, completeness, weights, hasJob: !!job, job: jobBlock,
    findings: findings.sort((a, b) => order[a.severity] - order[b.severity]),
    weakBullets, skillGaps, formatting,
    stats: { words: r.stats.words, bullets: consider, actionVerbShare: Math.round(actionShare * 100), quantifiedShare: Math.round(quantShare * 100), experienceYears: expYears, skills: hard.length },
  };
}
