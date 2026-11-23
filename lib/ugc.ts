/*
 * UGC Regulations 2018 (Appendix II) calculators — pure functions used by the free tools.
 *  - Table 3A (universities) / Table 3B (colleges): academic score for short-listing Assistant Professor candidates.
 *  - Table 2: academic / research score for Associate Professor and Professor (direct recruitment and CAS).
 *  - Eligibility for Assistant Professor, Associate Professor and Professor (with the 2023 NET/SET/SLET rule).
 * The 2025 draft regulations were still under consultation (Rajya Sabha reply, 12 August 2026), so the 2018
 * regulations apply. Institutions may publish their own screening rules; the official notification prevails.
 */

// ------------------------------------------------------------------ Table 3A / 3B

export type Institution = 'university' | 'college';
export type NetLevel = 'none' | 'set' | 'net' | 'jrf';

export interface ShortlistInput {
  institution: Institution;
  ugPercent: number | null;
  pgPercent: number | null;
  /** SC/ST/OBC (non-creamy layer) or PwD: the 55–60% post-graduation band starts at 50%. */
  relaxed: boolean;
  mphilPercent: number | null; // null = no M.Phil
  phd: boolean;
  net: NetLevel;
  papers: number;              // in peer-reviewed or UGC-listed journals
  experienceYears: number;     // teaching / post-doctoral, after the eligibility qualification
  award: 'none' | 'state' | 'national';
}
export interface ScoreLine { key: string; label: string; score: number; max: number; note: string }

export const SHORTLIST_TABLES = {
  university: { name: 'Table 3A — Universities', ug: [[80, 15], [60, 13], [55, 10], [45, 5]], pg: [[80, 25], [60, 23], [55, 20]], phd: 30, mphil: [[60, 7], [55, 5]], researchCap: 30, net: { jrf: 7, net: 5, set: 3 }, netCap: 7, paper: 2, paperCap: 10, expPerYear: 2, expCap: 10, award: { national: 3, state: 2 } },
  college: { name: 'Table 3B — Colleges', ug: [[80, 21], [60, 19], [55, 16], [45, 10]], pg: [[80, 25], [60, 23], [55, 20]], phd: 25, mphil: [[60, 7], [55, 5]], researchCap: 25, net: { jrf: 10, net: 8, set: 5 }, netCap: 10, paper: 2, paperCap: 6, expPerYear: 2, expCap: 10, award: { national: 3, state: 2 } },
} as const;

const band = (pct: number | null, bands: readonly (readonly [number, number])[]) => (pct == null ? 0 : (bands.find(([min]) => pct >= min)?.[1] ?? 0));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function shortlistScore(i: ShortlistInput): { lines: ScoreLine[]; total: number; table: string } {
  const t = SHORTLIST_TABLES[i.institution];
  const pgBands = i.relaxed ? t.pg.map(([m, s]) => [m === 55 ? 50 : m, s] as const) : t.pg;
  const ug = band(i.ugPercent, t.ug);
  const pg = band(i.pgPercent, pgBands);
  const mphil = band(i.mphilPercent, t.mphil);
  const research = Math.min(t.researchCap, mphil + (i.phd ? t.phd : 0));
  const net = i.net === 'none' ? 0 : Math.min(t.netCap, t.net[i.net]);
  const papers = Math.min(t.paperCap, Math.max(0, Math.floor(i.papers)) * t.paper);
  const exp = Math.min(t.expCap, r1(Math.max(0, i.experienceYears) * t.expPerYear)); // part-years count proportionately
  const award = i.award === 'none' ? 0 : t.award[i.award];
  const lines: ScoreLine[] = [
    { key: 'ug', label: 'Graduation', score: ug, max: t.ug[0][1], note: i.ugPercent == null ? 'Enter your percentage' : `${i.ugPercent}%` },
    { key: 'pg', label: 'Post-graduation', score: pg, max: t.pg[0][1], note: i.pgPercent == null ? 'Enter your percentage' : `${i.pgPercent}%${i.relaxed ? ' (relaxed band from 50%)' : ''}` },
    { key: 'research', label: 'M.Phil. / Ph.D.', score: research, max: t.researchCap, note: [i.mphilPercent != null ? `M.Phil. ${mphil}` : '', i.phd ? `Ph.D. ${t.phd}` : ''].filter(Boolean).join(' + ') + (mphil + (i.phd ? t.phd : 0) > t.researchCap ? ` (capped at ${t.researchCap})` : '') || 'None' },
    { key: 'net', label: 'JRF / NET / SET', score: net, max: t.netCap, note: { none: 'None', set: 'SLET/SET', net: 'NET', jrf: 'NET with JRF' }[i.net] },
    { key: 'papers', label: 'Research papers', score: papers, max: t.paperCap, note: `${Math.floor(i.papers)} × ${t.paper}${i.papers * t.paper > t.paperCap ? `, capped at ${t.paperCap}` : ''}` },
    { key: 'exp', label: 'Teaching / post-doctoral experience', score: exp, max: t.expCap, note: `${i.experienceYears} years × ${t.expPerYear}` },
    { key: 'award', label: 'Awards', score: award, max: 3, note: { none: 'None', state: 'State level', national: 'International / national level' }[i.award] },
  ];
  return { lines, total: r1(lines.reduce((n, l) => n + l.score, 0)), table: t.name };
}

// ------------------------------------------------------------------ Table 2 (research score)

export type Discipline = 'science' | 'humanities';
export type ImpactBand = 'none' | 'lt1' | '1to2' | '2to5' | '5to10' | 'gt10';
export const IMPACT_BANDS: { key: ImpactBand; label: string; points: number }[] = [
  { key: 'none', label: 'No impact factor', points: 5 },
  { key: 'lt1', label: 'Impact factor below 1', points: 10 },
  { key: '1to2', label: 'Impact factor 1 – 2', points: 15 },
  { key: '2to5', label: 'Impact factor 2 – 5', points: 20 },
  { key: '5to10', label: 'Impact factor 5 – 10', points: 25 },
  { key: 'gt10', label: 'Impact factor above 10', points: 30 },
];
/** Your share of a joint work: 2 authors 70% each; more than 2: 70% first/principal/corresponding, 30% others. */
export type Authorship = 'sole' | 'two' | 'main' | 'joint';
export const AUTHOR_SHARE: Record<Authorship, number> = { sole: 1, two: 0.7, main: 0.7, joint: 0.3 };

export interface PaperEntry { impact: ImpactBand; authorship: Authorship; count: number }
export interface Table2Input {
  discipline: Discipline;
  papers: PaperEntry[];
  /** Add the impact-factor points to the base 8/10 per paper (the usual reading of "augmented"). */
  addImpactToBase: boolean;
  books: { intl: number; national: number; chapters: number; editorIntl: number; editorNational: number; translationChapters: number; translationBooks: number };
  ict: { pedagogy: number; curricula: number; moocFull4Credit: number; moocCredits: number; moocModules: number; moocContentModules: number; moocCoordinator4Credit: number; moocCoordinatorCredits: number; econtentFull: number; econtentModules: number; econtentContrib: number; econtentEditor: number };
  guidance: { phdAwarded: number; phdJointAwarded: number; phdSubmitted: number; mphilPg: number };
  projects: { completedAbove10L: number; completedBelow10L: number; ongoingAbove10L: number; ongoingBelow10L: number; consultancy: number; jointShare: boolean };
  patents: { intl: number; national: number };
  policy: { intl: number; national: number; state: number };
  awards: { intl: number; national: number };
  talks: { abroad: number; intlIndia: number; national: number; state: number };
}

export const EMPTY_TABLE2: Table2Input = {
  discipline: 'science', papers: [], addImpactToBase: true,
  books: { intl: 0, national: 0, chapters: 0, editorIntl: 0, editorNational: 0, translationChapters: 0, translationBooks: 0 },
  ict: { pedagogy: 0, curricula: 0, moocFull4Credit: 0, moocCredits: 0, moocModules: 0, moocContentModules: 0, moocCoordinator4Credit: 0, moocCoordinatorCredits: 0, econtentFull: 0, econtentModules: 0, econtentContrib: 0, econtentEditor: 0 },
  guidance: { phdAwarded: 0, phdJointAwarded: 0, phdSubmitted: 0, mphilPg: 0 },
  projects: { completedAbove10L: 0, completedBelow10L: 0, ongoingAbove10L: 0, ongoingBelow10L: 0, consultancy: 0, jointShare: false },
  patents: { intl: 0, national: 0 }, policy: { intl: 0, national: 0, state: 0 }, awards: { intl: 0, national: 0 },
  talks: { abroad: 0, intlIndia: 0, national: 0, state: 0 },
};

export interface Table2Result {
  categories: { key: string; label: string; score: number }[];
  /** 5(b) policy documents + 6 talks, before and after the 30% cap. */
  cappedPart: { raw: number; allowed: number };
  total: number; categoriesUsed: number; papers: number;
  checks: { label: string; need: number; ok: boolean; detail: string }[];
}

const n = (v: number) => Math.max(0, Number(v) || 0);

export function table2Score(i: Table2Input): Table2Result {
  const base = i.discipline === 'science' ? 8 : 10;
  const papersScore = i.papers.reduce((s, p) => {
    const ifPts = IMPACT_BANDS.find(b => b.key === p.impact)!.points;
    const per = i.addImpactToBase ? base + ifPts : Math.max(base, ifPts);
    return s + per * AUTHOR_SHARE[p.authorship] * n(p.count);
  }, 0);
  const b = i.books;
  const books = 12 * n(b.intl) + 10 * n(b.national) + 5 * n(b.chapters) + 10 * n(b.editorIntl) + 8 * n(b.editorNational) + 3 * n(b.translationChapters) + 8 * n(b.translationBooks);
  const c = i.ict;
  const ict = 5 * n(c.pedagogy) + 2 * n(c.curricula) + 20 * n(c.moocFull4Credit) + 5 * n(c.moocCredits) + 5 * n(c.moocModules) + 2 * n(c.moocContentModules)
    + 8 * n(c.moocCoordinator4Credit) + 2 * n(c.moocCoordinatorCredits) + 12 * n(c.econtentFull) + 5 * n(c.econtentModules) + 2 * n(c.econtentContrib) + 10 * n(c.econtentEditor);
  const g = i.guidance, pr = i.projects;
  const share = pr.jointShare ? 0.5 : 1;
  const guidance = 10 * n(g.phdAwarded) + 7 * n(g.phdJointAwarded) + 5 * n(g.phdSubmitted) + 2 * n(g.mphilPg)
    + share * (10 * n(pr.completedAbove10L) + 5 * n(pr.completedBelow10L) + 5 * n(pr.ongoingAbove10L) + 2 * n(pr.ongoingBelow10L)) + 3 * n(pr.consultancy);
  const patents = 10 * n(i.patents.intl) + 7 * n(i.patents.national);
  const policy = 10 * n(i.policy.intl) + 7 * n(i.policy.national) + 4 * n(i.policy.state);
  const awards = 7 * n(i.awards.intl) + 5 * n(i.awards.national);
  const talks = 7 * n(i.talks.abroad) + 5 * n(i.talks.intlIndia) + 3 * n(i.talks.national) + 2 * n(i.talks.state);
  // 5(b) + 6 may make up at most 30% of the total: x ≤ 0.3 (rest + x)  ⇔  x ≤ 3/7 · rest.
  const rest = papersScore + books + ict + guidance + patents + awards;
  const raw = policy + talks;
  const allowed = Math.min(raw, (3 / 7) * rest);
  const scale = raw ? allowed / raw : 0;
  const categories = [
    { key: '1', label: '1. Research papers', score: papersScore },
    { key: '2', label: '2. Books, chapters, translations', score: books },
    { key: '3', label: '3. ICT, MOOCs, e-content, curricula', score: ict },
    { key: '4', label: '4. Research guidance, projects, consultancy', score: guidance },
    { key: '5', label: '5. Patents, policy documents, awards', score: patents + policy * scale + awards },
    { key: '6', label: '6. Invited lectures and paper presentations', score: talks * scale },
  ].map(x => ({ ...x, score: Math.round(x.score * 100) / 100 }));
  const total = Math.round(categories.reduce((s, x) => s + x.score, 0) * 100) / 100;
  const categoriesUsed = categories.filter(x => x.score > 0).length;
  const papers = i.papers.reduce((s, p) => s + n(p.count), 0);
  return { categories, cappedPart: { raw, allowed: Math.round(allowed * 100) / 100 }, total, categoriesUsed, papers, checks: [] };
}

export type Stage = 'direct-assoc' | 'direct-prof' | 'cas-assoc' | 'cas-prof';
export const STAGES: { key: Stage; label: string; score: number; papers: number; extra: string }[] = [
  { key: 'cas-assoc', label: 'CAS: Assistant Professor (Level 12) → Associate Professor (Level 13A), universities', score: 70, papers: 7, extra: 'Ph.D.; 3 years in Level 12; 3 of the 7 papers during the assessment period; at least one Ph.D. student guided; one course/MOOC/e-content in the last 3 years; satisfactory or good grades in 2 of the last 3 years.' },
  { key: 'cas-prof', label: 'CAS: Associate Professor (Level 13A) → Professor (Level 14)', score: 110, papers: 10, extra: '3 years in Level 13A; 3 of the 10 papers during the assessment period; successful guidance of Ph.D. candidate(s); satisfactory or good grades in 2 of the last 3 years.' },
  { key: 'direct-assoc', label: 'Direct recruitment: Associate Professor', score: 75, papers: 7, extra: 'Ph.D.; Master’s with 55%; 8 years of teaching/research experience equivalent to Assistant Professor.' },
  { key: 'direct-prof', label: 'Direct recruitment: Professor', score: 120, papers: 10, extra: 'Ph.D.; 10 years of teaching/research experience as Assistant/Associate Professor or Professor; evidence of having guided Ph.D. candidates.' },
];

export function table2Checks(r: Table2Result, stage: Stage) {
  const s = STAGES.find(x => x.key === stage)!;
  return [
    { label: `Research score at least ${s.score}`, ok: r.total >= s.score, detail: `${r.total} of ${s.score}` },
    { label: `At least ${s.papers} papers in peer-reviewed or UGC-listed journals`, ok: r.papers >= s.papers, detail: `${r.papers} entered` },
    { label: 'Score drawn from at least 3 of the 6 categories', ok: r.categoriesUsed >= 3, detail: `${r.categoriesUsed} categories` },
  ];
}

// ------------------------------------------------------------------ eligibility

export interface EligibilityInput {
  pgPercent: number | null;
  relaxed: boolean;
  pgBefore1991: boolean;
  net: NetLevel;
  phd: boolean;
  /** Ph.D. awarded under UGC 2009 or 2016 regulations (exempts from NET/SET/SLET). */
  phdUgcCompliant: boolean;
  experienceYears: number;
  papers: number;
  researchScore: number | null;
  phdGuided: boolean;
}
export interface Verdict { post: 'Assistant Professor' | 'Associate Professor' | 'Professor'; eligible: boolean; reasons: { ok: boolean; text: string }[] }

export function eligibility(i: EligibilityInput): Verdict[] {
  const minPg = i.phd && i.pgBefore1991 ? 50 : i.relaxed ? 50 : 55;
  const pgOk = i.pgPercent != null && i.pgPercent >= minPg;
  const pgLine = { ok: pgOk, text: `Master's degree with at least ${minPg}%${minPg === 50 ? (i.relaxed ? ' (5% relaxation for SC/ST/OBC-NCL/PwD)' : ' (Ph.D. holders who completed the Master\'s before 19 Sep 1991)') : ''}${i.pgPercent == null ? ' — enter your percentage' : ` — you have ${i.pgPercent}%`}` };
  const netOk = i.net !== 'none';
  const exempt = i.phd && i.phdUgcCompliant;
  const asst: Verdict = {
    post: 'Assistant Professor', eligible: pgOk && (netOk || exempt),
    reasons: [pgLine, {
      ok: netOk || exempt,
      text: netOk ? `${{ set: 'SLET/SET', net: 'NET', jrf: 'NET with JRF' }[i.net as 'set']} qualified${i.net === 'set' ? ' (valid for that state\'s universities and colleges only)' : ''}`
        : exempt ? 'Ph.D. under the UGC 2009/2016 regulations exempts you from NET/SET/SLET'
        : 'NET/SET/SLET is the minimum requirement since 1 July 2023 (a Ph.D. under the UGC 2009/2016 regulations exempts you)',
    }],
  };
  const assocScoreOk = i.researchScore != null && i.researchScore >= 75;
  const assoc: Verdict = {
    post: 'Associate Professor', eligible: i.phd && pgOk && i.experienceYears >= 8 && i.papers >= 7 && assocScoreOk,
    reasons: [
      { ok: i.phd, text: 'Ph.D. in the concerned or allied subject' }, pgLine,
      { ok: i.experienceYears >= 8, text: `At least 8 years of teaching/research experience equivalent to Assistant Professor — you have ${i.experienceYears}` },
      { ok: i.papers >= 7, text: `At least 7 papers in peer-reviewed or UGC-listed journals — you have ${i.papers}` },
      { ok: assocScoreOk, text: `Research score of at least 75 (Table 2) — ${i.researchScore == null ? 'use the research score calculator' : `you have ${i.researchScore}`}` },
    ],
  };
  const profScoreOk = i.researchScore != null && i.researchScore >= 120;
  const prof: Verdict = {
    post: 'Professor', eligible: i.phd && i.experienceYears >= 10 && i.papers >= 10 && profScoreOk && i.phdGuided,
    reasons: [
      { ok: i.phd, text: 'Ph.D. in the concerned or allied subject' },
      { ok: i.experienceYears >= 10, text: `At least 10 years as Assistant/Associate Professor or Professor (or equivalent research) — you have ${i.experienceYears}` },
      { ok: i.papers >= 10, text: `At least 10 papers in peer-reviewed or UGC-listed journals — you have ${i.papers}` },
      { ok: profScoreOk, text: `Research score of at least 120 (Table 2) — ${i.researchScore == null ? 'use the research score calculator' : `you have ${i.researchScore}`}` },
      { ok: i.phdGuided, text: 'Evidence of having guided Ph.D. candidate(s)' },
    ],
  };
  return [asst, assoc, prof];
}
