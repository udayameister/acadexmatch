import { CandidateProfile, EducationItem, ExperienceItem, PublicationItem } from '@/types';
import { calculateUgcApiScore, verifyJournalUgcCareStatus } from './scoring';

export interface ParsedResumeResult {
  candidateProfile: Partial<CandidateProfile>;
  confidenceScore: number;
  extractedSections: {
    educationFound: number;
    experienceFound: number;
    publicationsFound: number;
    netSletDetected: boolean;
    phdDetected: boolean;
  };
  ugcComplianceInsights: string[];
  missingFields: string[];
}

type SectionKey = 'education' | 'experience' | 'publications' | 'interests' | 'skills' | 'awards' | 'certifications' | 'summary' | 'other';

const SECTION_PATTERNS: [SectionKey, RegExp][] = [
  ['education', /^(education(al)?(\s+qualifications?)?|academic\s+qualifications?|qualifications?|degrees?)$/i],
  ['experience', /^((professional|academic|teaching|research|work|employment)(\s+(&|and)\s+\w+)?\s+(experience|history)|experience|appointments?|positions?\s+held|employment)$/i],
  ['publications', /^((selected\s+|peer[-\s]reviewed\s+|research\s+)?publications?.*|journal\s+(papers|articles).*|research\s+papers.*)$/i],
  ['interests', /^(research\s+interests?|areas?\s+of\s+(interest|specialization|expertise)|specializations?)$/i],
  ['skills', /^((technical\s+)?skills|tools.*|technical\s+expertise|competencies)$/i],
  ['awards', /^(awards?.*|honou?rs?.*|achievements?|fellowships?.*|scholarships?)$/i],
  ['certifications', /^(national\s+eligibility.*|certifications?.*|eligibility.*|qualifying\s+exams?.*)$/i],
  ['summary', /^(summary|executive\s+summary|profile|professional\s+summary|about(\s+me)?|objective)$/i],
  ['other', /^(sponsored\s+(research\s+)?projects?|projects?|patents?|references?|personal\s+details|declaration|conferences?.*|invited\s+talks?|teaching|courses\s+taught|ph\.?d\.?\s+supervision|memberships?)$/i],
];

const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DEGREE_RE = /\b(ph\.?\s?d\.?|doctor\s+of\s+philosophy|m\.?\s?tech|m\.?\s?e\.?(?=\s|$|\()|m\.?\s?sc\.?|m\.?\s?s\.?(?=\s)|m\.?\s?phil|m\.?\s?a\.?(?=\s)|mca|mba|master(?:'s)?(?:\s+of\s+\w+)?|b\.?\s?tech|b\.?\s?e\.?(?=\s|$|\()|b\.?\s?sc\.?|b\.?\s?a\.?(?=\s)|bca|b\.?\s?com|bachelor(?:'s)?(?:\s+of\s+\w+)?)/i;
const DESIGNATION_RE = /\b(professor|lecturer|fellow|postdoc|post-doctoral|postdoctoral|scientist|researcher|research\s+associate|teaching\s+assistant|engineer|instructor|head\s+of|dean|director|consultant|analyst|developer|reader)\b/i;
const INSTITUTE_RE = /\b(university|institute|college|iit|nit|iisc|iiit|school|academy|laboratory|labs?|centre|center|ltd|limited|inc|corporation|technologies|research)\b/i;

function cleanLine(line: string): string {
  return line.replace(/^[\s•\-–—*·▪●○◦\d.)\]]+(?=\S)/, '').replace(/\s+/g, ' ').trim();
}

function detectSection(line: string): SectionKey | null {
  const candidate = line.replace(/[:\-–—_=]+$/, '').trim();
  if (!candidate || candidate.length > 70) return null;
  const words = candidate.split(/\s+/).length;
  if (words > 8) return null;
  for (const [key, re] of SECTION_PATTERNS) {
    if (re.test(candidate)) return key;
  }
  return null;
}

function splitSections(lines: string[]): Record<SectionKey, string[]> & { header: string[] } {
  const sections = {
    header: [] as string[],
    education: [] as string[],
    experience: [] as string[],
    publications: [] as string[],
    interests: [] as string[],
    skills: [] as string[],
    awards: [] as string[],
    certifications: [] as string[],
    summary: [] as string[],
    other: [] as string[],
  };
  let current: SectionKey | 'header' = 'header';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const section = detectSection(line);
    if (section) {
      current = section;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

function lastYear(text: string): number | undefined {
  const years = text.match(YEAR_RE);
  return years ? parseInt(years[years.length - 1], 10) : undefined;
}

function extractGrade(text: string): string {
  const pct = text.match(/(\d{2}(?:\.\d+)?)\s*%/);
  if (pct) return `${pct[1]}%`;
  const cgpa = text.match(/(?:cgpa|cpi|gpa)[:\s]*(\d{1,2}(?:\.\d+)?)(?:\s*\/\s*10)?|(\d{1,2}\.\d+)\s*\/\s*10/i);
  if (cgpa) return `${cgpa[1] || cgpa[2]} CGPA`;
  return '';
}

function parseDate(token: string, isEnd: boolean): string | 'Present' | null {
  const t = token.trim().toLowerCase();
  if (/present|current|till\s+date|now|ongoing/.test(t)) return 'Present';
  const m = t.match(/([a-z]{3,9})\.?\s*,?\s*(\d{4})/);
  if (m && MONTHS[m[1].slice(0, 3)] !== undefined) {
    const month = MONTHS[m[1].slice(0, 3)] + 1;
    return `${m[2]}-${String(month).padStart(2, '0')}-01`;
  }
  const mm = t.match(/(\d{1,2})[/-](\d{4})/);
  if (mm) return `${mm[2]}-${mm[1].padStart(2, '0')}-01`;
  const y = t.match(/(\d{4})/);
  if (y) return isEnd ? `${y[1]}-12-31` : `${y[1]}-01-01`;
  return null;
}

function parseDateRange(text: string): { start: string; end: string | 'Present' } | null {
  const range = text.match(/((?:[a-z]{3,9}\.?\s*,?\s*)?(?:\d{1,2}[/-])?\d{4})\s*(?:-|–|—|to|till)\s*((?:[a-z]{3,9}\.?\s*,?\s*)?(?:\d{1,2}[/-])?\d{4}|present|current|till\s+date|now|ongoing)/i);
  if (!range) return null;
  const start = parseDate(range[1], false);
  const end = parseDate(range[2], true);
  if (!start || start === 'Present' || !end) return null;
  return { start, end };
}

function splitList(lines: string[]): string[] {
  return lines
    .flatMap(l => cleanLine(l).split(/[,;•|]|\s{2,}/))
    .map(s => s.replace(/\.$/, '').trim())
    .filter(s => s.length > 1 && s.length < 60);
}

function parseEducation(lines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  lines.forEach((raw, idx) => {
    const line = cleanLine(raw);
    const deg = line.match(DEGREE_RE);
    if (!deg || line.length > 220) return;
    const context = [line, cleanLine(lines[idx + 1] || ''), cleanLine(lines[idx + 2] || '')].join(' ');
    const field = (line.match(/\b(?:in|of)\s+([A-Z][A-Za-z&,\s]+?)(?=\s*[(\-–—,|]|\s+\d{4}|$)/) || [])[1]?.trim() || '';
    let institute = '';
    const sameLine = line.split(/\s[-–—|]\s|,\s/).find(p => INSTITUTE_RE.test(p) && !DEGREE_RE.test(p));
    if (sameLine) institute = sameLine.replace(/\(.*?\)/g, '').trim();
    else if (lines[idx + 1] && INSTITUTE_RE.test(lines[idx + 1]) && !DEGREE_RE.test(lines[idx + 1])) {
      institute = cleanLine(lines[idx + 1]).split(/\s[-–—|]\s/)[0].trim();
    }
    items.push({
      id: `edu-${items.length + 1}-${Date.now()}`,
      degree: deg[1].replace(/\s+/g, ' ').replace(/^doctor of philosophy$/i, 'Ph.D.'),
      field,
      institute,
      year: lastYear(line) || lastYear(context) || 0,
      gradePercentage: extractGrade(context),
    });
  });
  return items;
}

function parseExperience(lines: string[]): ExperienceItem[] {
  const items: ExperienceItem[] = [];
  lines.forEach((raw, idx) => {
    const line = cleanLine(raw);
    if (!DESIGNATION_RE.test(line) || line.length > 200) return;
    const range = parseDateRange(line) || parseDateRange(cleanLine(lines[idx + 1] || ''));
    if (!range) return;
    const designation = line.replace(/\(.*?\)/g, '').split(/\s[-–—|,]\s|,\s/)[0].replace(/\b(19|20)\d{2}\b.*$/, '').trim();
    let institute = '';
    let department = '';
    const next = cleanLine(lines[idx + 1] || '');
    const instSource = INSTITUTE_RE.test(next) && !parseDateRange(next) ? next : line.replace(designation, '');
    const parts = instSource.replace(/\(.*?\)/g, '').split(/\s[-–—|]\s|,\s/).map(p => p.trim()).filter(Boolean);
    institute = parts.find(p => INSTITUTE_RE.test(p)) || '';
    department = parts.find(p => /\b(dept|department|school|centre|center|division)\b/i.test(p) && p !== institute) || '';
    const lower = `${designation} ${institute}`.toLowerCase();
    const type: ExperienceItem['type'] = /postdoc|post-doctoral|postdoctoral|research|scientist|fellow/.test(lower)
      ? 'Research / Postdoc'
      : /ltd|limited|inc|corporation|technologies|engineer|developer|consultant|analyst/.test(lower)
      ? 'Industry / R&D'
      : 'Teaching';
    items.push({
      id: `exp-${items.length + 1}-${Date.now()}`,
      designation,
      instituteOrCompany: institute,
      department,
      startDate: range.start,
      endDate: range.end,
      isCurrent: range.end === 'Present',
      type,
    });
  });
  return items;
}

function parsePublications(lines: string[]): PublicationItem[] {
  const pubs: PublicationItem[] = [];
  // Re-join entries that wrap across lines: a new entry starts with a number / bullet.
  const entries: string[] = [];
  for (const raw of lines) {
    const startsEntry = /^\s*(\[?\d+[\].)]|[•\-–*▪●])\s+/.test(raw) || /^\s*["“]/.test(raw);
    if (startsEntry || entries.length === 0) entries.push(raw.trim());
    else entries[entries.length - 1] += ` ${raw.trim()}`;
  }

  for (const rawEntry of entries) {
    const entry = cleanLine(rawEntry);
    if (entry.length < 30) continue;
    if (/^\d+\s+(additional|more|other)\b/i.test(entry)) continue;

    const quoted = entry.match(/["“]([^"”]{10,})["”]/);
    const title = quoted ? quoted[1].trim().replace(/[,.]$/, '') : entry.split(/\.\s/)[0].trim();
    const afterTitle = quoted ? entry.slice(entry.indexOf(quoted[0]) + quoted[0].length) : entry.slice(title.length);
    const year = lastYear(afterTitle) || lastYear(entry) || 0;
    const venue = afterTitle
      .replace(/^[\s,.:;]+/, '')
      .split(/,?\s*(?:19|20)\d{2}\b/)[0]
      .replace(/\bdoi[:\s].*$/i, '')
      .replace(/[\s,.;]+$/, '')
      .trim();
    const doi = (entry.match(/\b(10\.\d{4,9}\/[^\s,;)]+)/i) || [])[1]?.replace(/\.$/, '');
    const impact = entry.match(/\bIF[:\s]*(\d+(?:\.\d+)?)/i);
    const lower = entry.toLowerCase();
    const estimate = verifyJournalUgcCareStatus(venue || entry);
    const sci = /\bsci(e)?\b/.test(lower) || estimate.isSci;
    const scopus = /\bscopus\b/.test(lower) || estimate.isScopus || sci;
    const ugcCare = /ugc[-\s]?care/.test(lower) || estimate.isUgcCare || scopus;

    pubs.push({
      id: `pub-${pubs.length + 1}-${Date.now()}`,
      title,
      journalOrConference: venue || 'Venue not detected',
      year,
      doi,
      ugcCareListed: ugcCare,
      scopusIndexed: scopus,
      sciScieIndexed: sci,
      impactFactor: impact ? parseFloat(impact[1]) : undefined,
      authors: '',
      type: /patent/.test(lower) ? 'Patent' : /proceedings|conference|symposium|workshop|neurips|icml|cvpr|aaai|iclr/.test(lower) ? 'Conference' : /chapter/.test(lower) ? 'Book Chapter' : 'Journal',
    });
  }
  return pubs;
}

function parseNet(text: string): CandidateProfile['netSletStatus'] {
  const lower = text.toLowerCase();
  const netLine = text.split('\n').find(l => /\b(ugc[-\s]?net|csir[-\s]?net|\bnet\b|jrf|slet|\bset\b)/i.test(l) && !/network|internet|\.net/i.test(l)) || '';
  const l = netLine.toLowerCase();
  let examType: CandidateProfile['netSletStatus']['examType'];
  if (/csir/.test(l)) examType = /jrf/.test(l) ? 'CSIR-NET (JRF)' : 'CSIR-NET (LS)';
  else if (/ugc[-\s]?net|\bnet\b|jrf/.test(l)) examType = /jrf|junior research fellowship/.test(l) ? 'UGC-NET (JRF)' : 'UGC-NET (LS)';
  else if (/slet|\bset\b/.test(l)) examType = 'SLET/SET';

  if (!examType) {
    return /\bgate\b/.test(lower) ? { isQualified: false, examType: 'GATE' } : { isQualified: false };
  }
  const subject = (netLine.match(/\bin\s+([A-Z][A-Za-z&\s]+?)(?=\s*[(,.]|$)/) || [])[1]?.trim();
  const roll = (netLine.match(/roll\s*(?:no\.?|number)?[:\s]*([A-Z0-9-]{5,})/i) || [])[1];
  return { isQualified: true, examType, qualifiedYear: lastYear(netLine), subject, rollNumber: roll };
}

/**
 * Rule-based academic CV extractor. Runs entirely in the browser — no CV text leaves the device.
 * Accuracy depends on the CV having conventional section headings (Education, Experience, Publications...).
 */
export async function parseAcademicResume(text: string): Promise<ParsedResumeResult> {
  const normalized = text.replace(/\r/g, '').replace(/\t/g, ' ');
  const lines = normalized.split('\n');
  const sections = splitSections(lines);
  const lower = normalized.toLowerCase();

  // Identity
  const name = (lines
    .map(l => cleanLine(l))
    .find(l => l.length > 3 && l.length < 60 && /[a-z]/i.test(l) && !/curriculum|vitae|resume|\bcv\b|dossier|@|\d{4}/i.test(l)) || '')
    .replace(/,?\s*(ph\.?\s?d\.?|m\.?\s?tech\.?|m\.?\s?sc\.?)\s*$/i, '')
    .trim();
  const email = (normalized.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || '';
  const orcid = (normalized.match(/\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/) || [])[1] || '';
  // Strip ORCID iDs and DOIs first so their digit groups aren't mistaken for a phone number.
  const phoneSource = normalized.replace(/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g, '').replace(/\b10\.\d{4,9}\/\S+/g, '');
  const labelledPhone = phoneSource.match(/(?:phone|mobile|mob|tel|contact)\.?\s*(?:no\.?)?\s*[:\-]?\s*(\+?[\d\s()-]{10,18}\d)/i);
  const loosePhone = phoneSource.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{2,5}[\s-]?\d{3,5}[\s-]?\d{3,5}/);
  const phone = (labelledPhone?.[1] || loosePhone?.[0] || '').trim();
  const scopusId = (normalized.match(/scopus[^:\n]*[:\s]+(\d{8,12})/i) || [])[1] || '';
  const scholarUrl = (normalized.match(/https?:\/\/scholar\.google\.[^\s|,]+/i) || [])[0] || '';
  const locationLabel = (normalized.match(/(?:location|address|city)\s*[:\-]\s*([^|\n]+)/i) || [])[1]?.trim() || '';
  const [city = '', state = ''] = locationLabel.split(',').map(s => s.trim());

  // Sections
  const education = parseEducation(sections.education.length ? sections.education : lines);
  const experience = parseExperience(sections.experience.length ? sections.experience : lines);
  const publications = parsePublications(sections.publications);
  const researchInterests = splitList(sections.interests).slice(0, 12);
  const skills = splitList(sections.skills).slice(0, 20);
  const netSletStatus = parseNet(sections.certifications.length ? `${sections.certifications.join('\n')}\n${normalized}` : normalized);

  // Ph.D.
  const phdItem = education.find(e => /ph\.?\s?d/i.test(e.degree));
  const phdMentioned = /\bph\.?\s?d\.?\b|doctor of philosophy/i.test(normalized);
  const pursuing = /pursuing|ongoing|thesis submitted|registered for ph\.?d/i.test(normalized);
  const phdCompleted = !!phdItem && !pursuing;
  const thesisTitle = (normalized.match(/thesis(?:\s+title)?\s*[:\-]\s*([^\n]+)/i) || [])[1]?.trim();
  const supervisor = (normalized.match(/(?:supervisor|advisor|guide)\s*[:\-]\s*([^\n|]+)/i) || [])[1]?.trim();
  const ugcCompliant = phdCompleted && (/ugc\s*(regulations?)?\s*,?\s*(2009|2016)|(2009|2016)\s*(regulation|compliant)|ugc[\s-]compliant/i.test(normalized) || (phdItem?.year || 0) >= 2010);

  // Current role
  const current = experience.find(e => e.isCurrent) || experience[0];
  const master = education.find(e => /m\.?\s?tech|m\.?\s?e|m\.?\s?sc|m\.?\s?s|master|mca|mba|m\.?\s?phil|m\.?\s?a/i.test(e.degree));
  const highestDegree = phdCompleted
    ? `Ph.D.${phdItem?.field ? ` in ${phdItem.field}` : ''}`
    : master
    ? `${master.degree}${master.field ? ` in ${master.field}` : ''}`
    : education[0]?.degree || '';

  // Awards
  const awardText = sections.awards.join(' ').toLowerCase() + ' ' + (lower.match(/[^\n]*(award|medal|fellowship)[^\n]*/g) || []).join(' ');
  const awardLevel: CandidateProfile['awardLevel'] = /international|national|ieee|acm|best (paper|dissertation|thesis)|gold medal|inspire|dst|serb/.test(awardText)
    ? 'national'
    : sections.awards.length > 0 || /award|medal/.test(awardText)
    ? 'state'
    : 'none';

  const summary = sections.summary.join(' ').trim();

  const profile: Partial<CandidateProfile> = {
    ...(name && { name }),
    ...(email && { email }),
    ...(phone && { phone }),
    ...(locationLabel && { location: { city, state } }),
    ...(highestDegree && { highestDegree }),
    ...(current?.designation && { currentDesignation: current.designation }),
    ...(current?.instituteOrCompany && { currentInstitute: current.instituteOrCompany }),
    ...(summary && { bio: summary.slice(0, 1200) }),
    netSletStatus,
    phdStatus: {
      isCompleted: phdCompleted,
      institute: phdItem?.institute || undefined,
      thesisTitle,
      graduationYear: phdItem?.year || undefined,
      isUgc2009_2016Compliant: ugcCompliant,
      supervisorName: supervisor,
    },
    education,
    experience,
    publications,
    researchInterests,
    skills,
    scholarLinks: {
      ...(orcid && { orcid }),
      ...(scopusId && { scopusId }),
      ...(scholarUrl && { googleScholar: scholarUrl }),
    },
    awardLevel,
  };
  profile.apiScore = calculateUgcApiScore(profile);

  const missingFields: string[] = [];
  if (!name) missingFields.push('Name');
  if (!email) missingFields.push('Email');
  if (!phone) missingFields.push('Phone');
  if (education.length === 0) missingFields.push('Education (add an "Education" heading)');
  if (experience.length === 0) missingFields.push('Experience with date ranges');
  if (publications.length === 0) missingFields.push('Publications (add a "Publications" heading)');
  if (researchInterests.length === 0) missingFields.push('Research interests');

  const insights: string[] = [];
  if (phdCompleted) {
    insights.push(`Ph.D. detected${phdItem?.institute ? ` from ${phdItem.institute}` : ''}${phdItem?.year ? ` (${phdItem.year})` : ''}${ugcCompliant ? '; appears to meet UGC 2009/2016 norms — confirm with your degree certificate.' : '.'}`);
  } else if (phdMentioned) {
    insights.push('A Ph.D. is mentioned but does not appear to be completed — most Assistant Professor posts at universities require a completed Ph.D.');
  } else {
    insights.push('No Ph.D. detected. You will need NET/SLET qualification for Assistant Professor (Level 10) posts.');
  }
  insights.push(netSletStatus.isQualified ? `${netSletStatus.examType} qualification detected${netSletStatus.qualifiedYear ? ` (${netSletStatus.qualifiedYear})` : ''}.` : 'No UGC/CSIR-NET or SLET/SET qualification detected.');
  const indexed = publications.filter(p => p.scopusIndexed || p.sciScieIndexed).length;
  insights.push(`${publications.length} publication(s) extracted; ${indexed} look Scopus/SCI-indexed by venue. Verify each against the official UGC-CARE list.`);
  insights.push(`Estimated UGC Table 3A academic score: ${profile.apiScore}/100 — review education grades and experience dates after saving.`);

  const foundChecks = [!!name, !!email, !!phone, education.length > 0, experience.length > 0, publications.length > 0, researchInterests.length > 0, netSletStatus.isQualified || phdMentioned];
  const confidenceScore = Math.round((foundChecks.filter(Boolean).length / foundChecks.length) * 100);

  return {
    candidateProfile: profile,
    confidenceScore,
    extractedSections: {
      educationFound: education.length,
      experienceFound: experience.length,
      publicationsFound: publications.length,
      netSletDetected: netSletStatus.isQualified,
      phdDetected: phdCompleted,
    },
    ugcComplianceInsights: insights,
    missingFields,
  };
}

/** Extracts plain text from an uploaded CV (PDF or plain text) in the browser. */
export async function extractTextFromFile(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return file.text();

  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Rebuild lines from text items using their vertical position.
    let lastY: number | null = null;
    let line = '';
    const out: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line);
        line = '';
      }
      line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      lastY = y;
      if (item.hasEOL) {
        out.push(line);
        line = '';
        lastY = null;
      }
    }
    if (line) out.push(line);
    pages.push(out.join('\n'));
  }
  return pages.join('\n');
}

export function generateTeachingStatement(interests: string[], degree: string, universityTarget: string): string {
  return `TEACHING PHILOSOPHY & PEDAGOGICAL STATEMENT

As an academic with a ${degree}, my pedagogical philosophy is grounded in creating an active, inquiry-driven, and inclusive classroom environment.

1. Foundations First, Followed by Systems Building:
I bridge rigorous theory with hands-on laboratory work, so that students both understand the concepts and can build and evaluate working systems.

2. Fostering Undergraduate & Postgraduate Research:
At ${universityTarget}, I aim to mentor students in open-ended projects that lead to open-source contributions or peer-reviewed publications.

3. Interdisciplinary Relevance & Active Learning:
Drawing on my research in ${interests.slice(0, 3).join(', ') || 'my field'}, I connect coursework to real-world challenges and encourage students to develop locally relevant solutions.

I am committed to NEP 2020 multidisciplinary frameworks and continuous, formative evaluation.`;
}

/** Template-based draft of a statutory faculty advertisement. Recruiters should edit before publishing. */
export function generateUgcJobDescription(
  title: string,
  department: string,
  instituteName: string,
  cpcBand: string,
  specializations: string,
): string {
  return `FACULTY RECRUITMENT NOTIFICATION
${instituteName}
${department}

Position: ${title}
Pay Scale: 7th Central Pay Commission ${cpcBand}

1. Minimum Qualifications (UGC Regulations 2018 / AICTE norms):
   - Ph.D. in ${department.replace('Department of ', '')} or a closely allied discipline, with First Class in the preceding degree.
   - Research output in UGC-CARE listed and Scopus / SCI indexed journals.
   - Specialization focus areas: ${specializations}.

2. Responsibilities:
   - Teach undergraduate and postgraduate courses aligned with NEP 2020.
   - Supervise doctoral researchers and pursue sponsored research (DST, SERB, MeitY, industry).
   - Contribute to departmental development and institutional governance.

3. Selection & Allowances:
   - Selection through a duly constituted Selection Committee with external subject experts.
   - DA, HRA / campus accommodation and professional development allowance as per institute rules.`;
}
