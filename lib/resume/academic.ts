/*
 * Academic CV analyzer: teaching and research experience, Ph.D. and NET/SET status, publications, patents,
 * grants, memberships and FDPs, plus an indicative check against the UGC Regulations 2018 (as amended) for
 * Assistant, Associate and Professor posts. It reports only what the CV states and never fills gaps.
 */
import type { ParsedResume } from './parse';

export interface EligibilityCheck {
  post: 'Assistant Professor' | 'Associate Professor' | 'Professor';
  status: 'meets' | 'check' | 'not_yet';
  met: string[];
  missing: string[];
}

export interface AcademicProfile {
  isAcademic: boolean;
  phd: 'awarded' | 'pursuing' | 'submitted' | null;
  netSet: string[];
  pgScore: string | null;
  teachingYears: number;
  researchYears: number;
  industryYears: number;
  publications: { total: number; journals: number; conferences: number; books: number; indexed: string[]; withDoi: number };
  patents: number;
  grants: number;
  memberships: number;
  trainings: number;
  phdGuidance: string | null;
  profileLinks: { scholar: boolean; orcid: boolean; linkedin: boolean };
  eligibility: EligibilityCheck[];
  suggestions: string[];
  note: string;
}

const TEACH_RE = /\b(professor|lecturer|faculty|teaching|tutor|instructor|teacher|head of (the )?department|hod|dean|principal)\b/i;
const RESEARCH_RE = /\b(research (scholar|associate|fellow|assistant|engineer|scientist)|jrf|srf|post[- ]?doc|project (fellow|associate|assistant)|scientist|ph\.?\s?d (scholar|candidate))\b/i;

const years = (m: number) => Math.round((m / 12) * 10) / 10;

export function analyzeAcademic(r: ParsedResume, text: string): AcademicProfile {
  let teach = 0, research = 0, industry = 0;
  for (const e of r.experience) {
    const m = e.months || 0;
    const label = `${e.title || ''} ${e.organization || ''}`;
    if (TEACH_RE.test(label)) teach += m;
    else if (RESEARCH_RE.test(label)) research += m;
    else industry += m;
  }

  const doc = r.education.find(e => e.level === 'doctorate');
  const phd: AcademicProfile['phd'] = doc
    ? /\b(pursuing|ongoing|in progress|registered|currently)\b/i.test(doc.raw) ? 'pursuing'
      : /\b(submitted|thesis submitted)\b/i.test(doc.raw) ? 'submitted' : 'awarded'
    : null;
  const netSet = [...new Set((text.match(/\b(ugc[- ]?net(?:[- ]?jrf)?|csir[- ]?net(?:[- ]?jrf)?|gate|slet|tn[- ]?set|k[- ]?set|ap[- ]?set|ts[- ]?set|mh[- ]?set|wb[- ]?set|\bset\b(?= (qualified|exam|\d{4}))|\bnet\b(?= (qualified|exam|\d{4}|jrf)))/gi) || []).map(s => s.toUpperCase().replace(/\s+/g, '-')))];
  const pg = r.education.find(e => e.level === 'masters');
  const pgScore = pg?.score || null;
  const pgPercent = pgScore ? Number(pgScore.match(/(\d{2}(?:\.\d+)?)\s*%/)?.[1] || NaN) : NaN;
  const cgpa = pgScore ? Number((pgScore.match(/(?:cgpa|gpa|cpi)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)/i) || pgScore.match(/(\d(?:\.\d+)?)\s*(?:\/\s*10|cgpa|gpa)/i))?.[1] || NaN) : NaN;
  // CGPA-to-percentage rules differ by university, so a CGPA only counts as "meets" when clearly above the line.
  const pg55 = !isNaN(pgPercent) ? pgPercent >= 55 : !isNaN(cgpa) && cgpa <= 10 ? (cgpa >= 6.5 ? true : cgpa < 5.5 ? false : null) : null;

  const trainings = r.sections.filter(s => s.key === 'training').reduce((n, s) => n + s.lines.filter(l => l.length > 12).length, 0)
    + (text.match(/\b(fdp|faculty development programme|refresher course|orientation programme)\b/gi) || []).length;
  const guidance = text.match(/[^\n.]*\b(guided|supervis(ed|ing)|guiding)\b[^\n.]*\b(ph\.?\s?d|research scholars?|doctoral)\b[^\n.]*/i)?.[0].trim() || null;

  const pubs = r.publications;
  const pubTotal = pubs.items.length;
  const teachingYears = years(teach), researchYears = years(research);
  const academicYears = years(teach + research);
  const hasNet = netSet.some(s => /NET|SET|SLET/.test(s) && !/^GATE$/.test(s));

  const eligibility: EligibilityCheck[] = [];
  {
    const met: string[] = [], missing: string[] = [];
    if (pg) met.push(`Master's degree (${pg.degree})`); else missing.push("Master's degree in the relevant subject");
    if (pg55 === true) met.push(`Master's score ${pgScore} (55% or equivalent required)`);
    else if (pg55 === false) missing.push("55% marks in the Master's (5% relaxation applies to reserved categories)");
    else missing.push("Master's percentage not stated: add it (55% is the usual minimum)");
    if (hasNet) met.push(`NET/SET/SLET qualified (${netSet.filter(s => s !== 'GATE').join(', ')})`);
    else missing.push(phd === 'awarded' ? 'NET/SET/SLET not stated (UGC’s 2023 notice makes it the minimum for direct recruitment; Ph.D. rules vary by advertisement)' : 'NET/SET/SLET qualification');
    eligibility.push({ post: 'Assistant Professor', status: pg && hasNet && pg55 === true ? 'meets' : pg && (hasNet || phd === 'awarded') ? 'check' : 'not_yet', met, missing });
  }
  {
    const met: string[] = [], missing: string[] = [];
    if (phd === 'awarded') met.push('Ph.D. awarded'); else missing.push('Ph.D. (awarded)');
    if (academicYears >= 8) met.push(`${academicYears} years of teaching/research experience`); else missing.push(`8 years of teaching/research experience (CV shows ${academicYears})`);
    if (pubTotal >= 7) met.push(`${pubTotal} publications listed`); else missing.push(`At least 7 peer-reviewed/UGC-CARE publications (CV lists ${pubTotal})`);
    missing.push('Research score of 75 (Appendix II, Table 2): calculate from your publications');
    eligibility.push({ post: 'Associate Professor', status: phd === 'awarded' && academicYears >= 8 && pubTotal >= 7 ? 'check' : 'not_yet', met, missing });
  }
  {
    const met: string[] = [], missing: string[] = [];
    if (phd === 'awarded') met.push('Ph.D. awarded'); else missing.push('Ph.D. (awarded)');
    if (academicYears >= 10) met.push(`${academicYears} years of teaching/research experience`); else missing.push(`10 years of teaching/research experience (CV shows ${academicYears})`);
    if (pubTotal >= 10) met.push(`${pubTotal} publications listed`); else missing.push(`At least 10 peer-reviewed/UGC-CARE publications (CV lists ${pubTotal})`);
    if (guidance) met.push('Ph.D. guidance mentioned'); else missing.push('Successful guidance of at least 2 Ph.D. candidates (not stated)');
    missing.push('Research score of 120 (Appendix II, Table 2)');
    eligibility.push({ post: 'Professor', status: phd === 'awarded' && academicYears >= 10 && pubTotal >= 10 && guidance ? 'check' : 'not_yet', met, missing });
  }

  const suggestions: string[] = [];
  if (!r.sections.some(s => s.key === 'research')) suggestions.push('Add a “Research interests” section with 3–5 specific areas.');
  if (!r.sections.some(s => s.key === 'teaching') && teach > 0) suggestions.push('Add “Subjects taught” (course names, UG/PG level) — selection committees look for it.');
  if (pubTotal && pubs.dois < pubTotal / 2) suggestions.push('Add DOIs to your publications so they can be verified quickly.');
  if (pubTotal && !pubs.indexed.length) suggestions.push('Mark each publication’s indexing (Scopus, Web of Science, UGC-CARE) where it applies.');
  if (!r.links.scholar && !r.links.orcid && pubTotal) suggestions.push('Add your ORCID iD and Google Scholar profile link.');
  if (!netSet.length) suggestions.push('If you have qualified NET/SET/SLET/GATE, state it with the year.');
  if (phd === 'pursuing') suggestions.push('State your Ph.D. registration year and expected submission date.');
  if (!r.memberships.length) suggestions.push('List professional memberships (e.g. IEEE, ISTE, CSI) if you hold any.');
  if (!trainings) suggestions.push('List FDPs, refresher and orientation programmes you attended (title, organiser, dates).');

  const isAcademic = teach + research > 0 || pubTotal > 0 || !!phd || r.sections.some(s => ['research', 'teaching', 'publications'].includes(s.key));

  return {
    isAcademic, phd, netSet, pgScore, teachingYears, researchYears, industryYears: years(industry),
    publications: { total: pubTotal, journals: pubs.journals, conferences: pubs.conferences, books: pubs.books, indexed: pubs.indexed, withDoi: pubs.dois },
    patents: r.patents.length, grants: r.grants.length, memberships: r.memberships.length, trainings,
    phdGuidance: guidance, profileLinks: { scholar: !!r.links.scholar, orcid: !!r.links.orcid, linkedin: !!r.links.linkedin },
    eligibility, suggestions,
    note: 'Indicative check against the UGC Regulations 2018 (as amended). Always confirm with the advertisement and the institution’s rules; API/research scores are not calculated here.',
  };
}
