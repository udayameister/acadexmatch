/*
 * AcadeXMatch resume parser (in-house, rule-based). Turns resume text into structured fields: contact details,
 * sections, experience with dates, education, skills, certifications, projects, publications, awards,
 * memberships, languages and links. Nothing is guessed: a field the resume does not state stays empty.
 */
import { findSkills, type SkillCategory } from './skills';
import { findState } from '../facultytick';

export type SectionKey =
  | 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'projects' | 'publications' | 'awards'
  | 'memberships' | 'languages' | 'research' | 'teaching' | 'patents' | 'grants' | 'training' | 'responsibilities'
  | 'interests' | 'personal' | 'references' | 'other';

export interface ResumeSection { key: SectionKey; heading: string; lines: string[] }
export interface ExperienceEntry { title: string | null; organization: string | null; start: string | null; end: string | null; current: boolean; months: number | null; bullets: string[]; raw: string }
export interface EducationEntry { degree: string; level: 'doctorate' | 'masters' | 'bachelors' | 'diploma' | 'school' | 'other'; field: string | null; institution: string | null; year: string | null; score: string | null; raw: string }

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: { linkedin: string | null; github: string | null; scholar: string | null; orcid: string | null; portfolio: string | null; other: string[] };
  summary: string | null;
  sections: ResumeSection[];
  experience: ExperienceEntry[];
  totalExperienceMonths: number;
  education: EducationEntry[];
  skills: { name: string; category: SkillCategory; count: number }[];
  certifications: string[];
  projects: string[];
  publications: { items: string[]; journals: number; conferences: number; books: number; indexed: string[]; dois: number };
  awards: string[];
  memberships: string[];
  languages: string[];
  patents: string[];
  grants: string[];
  stats: { words: number; lines: number; bullets: number; actionVerbBullets: number; quantifiedBullets: number; firstPersonPronouns: number; dateFormats: number };
}

// ------------------------------------------------------------------ section headings

const HEADINGS: [SectionKey, RegExp][] = [
  ['summary', /^(professional |career |executive )?(summary|profile|objective|overview)$|^about( me)?$|^career objective$|^professional profile$|^personal statement$/],
  ['teaching', /^teaching (experience|profile|interests|philosophy)$|^courses (taught|handled)$|^subjects (taught|handled)$/],
  ['experience', /^(work |professional |industry |industrial |academic |relevant |employment )?(experience|history)$|^employment( history| record)?$|^work history$|^positions? held$|^career history$|^experience details$|^(academic|professional|teaching|work|industry|research)( and | & )(professional|academic|industry|industrial|research|teaching|work) experience$/],
  ['education', /^(education|educational|academic)( qualifications?| background| details| profile)?$|^qualifications?$/],
  ['skills', /^((technical|key|core|professional|it|computer|software) )?(skills|competenc(y|ies)|proficienc(y|ies)|expertise)( summary| set)?$|^areas of (expertise|specialization|specialisation)$|^skill set$|^tools( and technologies)?$|^technologies$/],
  ['certifications', /^(certifications?|certificates?|licen[cs]es|professional certifications?|online courses|moocs?)( and courses| & courses)?$/],
  ['grants', /^((research )?(grants?|funding)( received)?|(funded|sponsored) (research )?projects?)$/],
  ['projects', /^((academic|key|major|personal|research|consultancy) )?projects?( (handled|undertaken|done|completed))?$/],
  ['publications', /^((research|journal|conference|selected|list of) )?(publications?|papers|articles)$|^books?( (and|&) book chapters)?$|^book chapters$|^research papers$/],
  ['patents', /^patents?( (filed|granted|published))?$/],
  ['awards', /^(awards?|honou?rs|achievements?|accomplishments|recognitions?)( (and|&) (awards?|honou?rs|achievements?|recognitions?))?$/],
  ['memberships', /^((professional )?memberships?|affiliations|professional (bodies|affiliations))$/],
  ['languages', /^languages?( known)?$|^linguistic (skills|proficiency)$/],
  ['research', /^research( (interests?|areas?|experience|profile|focus))?$|^areas of research$/],
  ['training', /^(trainings?|workshops?|fdps?|seminars|conferences|faculty development programmes?)( (attended|organi[sz]ed|participated))?( (and|&) [a-z ]+)?$/],
  ['responsibilities', /^(administrative |additional |other )?(responsibilities|roles)( held)?$|^positions of responsibility$/],
  ['interests', /^(hobbies|interests|extra[- ]?curricular( activities)?|co[- ]?curricular( activities)?)$/],
  ['personal', /^personal (details|information|profile|data)$/],
  ['references', /^references?$|^referees?$|^declaration$/],
];

function headingOf(line: string): { key: SectionKey; heading: string } | null {
  const raw = line.replace(/^[\s•\-–*#\d.)]+/, '').replace(/[:\-–]+$/, '').trim();
  if (!raw || raw.length > 48 || raw.split(/\s+/).length > 6) return null;
  const norm = raw.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ and /g, ' and ');
  for (const [key, re] of HEADINGS) if (re.test(norm) || re.test(norm.replace(/ and /g, ' & '))) return { key, heading: raw };
  return null;
}

// ------------------------------------------------------------------ dates

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = `(?:${MON}\\.?,?\\s*\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const END = `(?:${DATE}|present|current|now|till date|to date|ongoing|continuing)`;
export const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|till|until)\\s*(${END})`, 'i');

function toYm(s: string, now: Date): { y: number; m: number } | null {
  const t = s.toLowerCase().trim();
  if (/present|current|now|till date|to date|ongoing|continuing/.test(t)) return { y: now.getFullYear(), m: now.getMonth() + 1 };
  let m = t.match(new RegExp(`^(${MON})\\.?,?\\s*(\\d{4})$`));
  if (m) return { y: +m[2], m: MONTHS[m[1].slice(0, 4).replace(/t$/, '')] || MONTHS[m[1].slice(0, 3)] || 1 };
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return { y: +m[2], m: Math.min(12, Math.max(1, +m[1])) };
  m = t.match(/^(\d{4})$/);
  if (m) return { y: +m[1], m: 1 };
  return null;
}

function monthsBetween(a: string, b: string, now: Date): number | null {
  const s = toYm(a, now), e = toYm(b, now);
  if (!s || !e || s.y < 1950 || e.y > now.getFullYear() + 1) return null;
  const n = (e.y - s.y) * 12 + (e.m - s.m) + (/^\d{4}$/.test(b.trim()) ? 12 : 1);
  return n > 0 && n < 12 * 50 ? n : null;
}

// ------------------------------------------------------------------ helpers

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;)]*)?/gi;
const BULLET = /^\s*(?:[•●▪◦‣∙·*\-–]|\d{1,2}[.)]|[a-z][.)])\s+/i;

export const ACTION_VERBS = [
  'achieved', 'administered', 'analysed', 'analyzed', 'architected', 'automated', 'built', 'championed', 'coached', 'collaborated', 'conceived',
  'conducted', 'coordinated', 'created', 'cut', 'delivered', 'designed', 'developed', 'directed', 'drove', 'enabled', 'engineered', 'established',
  'evaluated', 'expanded', 'facilitated', 'founded', 'generated', 'guided', 'headed', 'implemented', 'improved', 'increased', 'initiated', 'innovated',
  'introduced', 'investigated', 'launched', 'led', 'managed', 'mentored', 'migrated', 'modernised', 'modernized', 'optimised', 'optimized',
  'organised', 'organized', 'oversaw', 'pioneered', 'planned', 'presented', 'produced', 'published', 'raised', 'redesigned', 'reduced', 'resolved',
  'revamped', 'scaled', 'secured', 'simplified', 'spearheaded', 'streamlined', 'strengthened', 'supervised', 'taught', 'trained', 'transformed',
  'won', 'wrote', 'authored', 'co-authored', 'filed', 'received', 'awarded', 'guided', 'mentored', 'established', 'framed', 'prepared',
];
const ACTION_SET = new Set(ACTION_VERBS);

const isBulletLike = (l: string) => BULLET.test(l);
const stripBullet = (l: string) => l.replace(BULLET, '').trim();
const firstWord = (l: string) => stripBullet(l).split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, '') || '';
const quantified = (l: string) => /\d+(?:\.\d+)?\s*(?:%|percent|x\b|\+|lakh|crore|cr\b|k\b|students|papers|projects|users|clients|members|hours|days|months|years)|₹\s?\d|rs\.?\s?\d|\$\s?\d/i.test(l);

const DEGREE_RE: [EducationEntry['level'], RegExp][] = [
  ['doctorate', /\b(ph\.?\s?d|doctorate|doctor of philosophy|d\.?\s?phil|d\.?\s?sc|post[- ]?doc(toral)?)\b/i],
  ['masters', /\b(m\.?\s?tech|m\.?\s?e\b|m\.e\.|m\.?\s?sc|m\.?\s?s\b|m\.?\s?a\b|m\.a\.|mba|mca|m\.?\s?com|m\.?\s?phil|m\.?\s?ed|m\.?\s?pharm|ll\.?\s?m|md\b|m\.?\s?arch|m\.?\s?des|master(?:'s)?( of| in| degree)?|post[- ]?graduat(e|ion)|pg\b|pgdm)\b/i],
  ['bachelors', /\b(b\.?\s?tech|b\.?\s?e\b|b\.e\.|b\.?\s?sc|b\.?\s?a\b|b\.a\.|bba|bca|b\.?\s?com|b\.?\s?ed|b\.?\s?pharm|ll\.?\s?b|mbbs|bds|b\.?\s?arch|b\.?\s?des|bachelor(?:'s)?( of| in| degree)?|under[- ]?graduat(e|ion)|ug\b)\b/i],
  ['diploma', /\b(diploma|polytechnic|iti)\b/i],
  ['school', /\b(hsc|ssc|sslc|cbse|icse|12th|10th|xii|x\b|higher secondary|secondary school|intermediate|class (10|12)|puc)\b/i],
];

function dedupe(list: string[], max = 40): string[] {
  const seen = new Set<string>();
  return list.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).slice(0, max);
}

/** Section lines joined into entries: a bullet or a line after a blank starts a new entry. */
function entries(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    if (isBulletLike(l) || !out.length || /^\[\d+\]|^\d{1,3}\.\s/.test(l) || out[out.length - 1].length > 160) out.push(stripBullet(l));
    else if (/^[a-z(,&]/.test(l) || /[,\-–:&]$|\b(and|of|in|for|the|with)$/i.test(out[out.length - 1])) out[out.length - 1] += ` ${l}`;
    else out.push(l);
  }
  return out;
}

// ------------------------------------------------------------------ main

export function parseResume(text: string, now = new Date()): ParsedResume {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim());
  const nonEmpty = lines.filter(Boolean);

  // Sections
  const sections: ResumeSection[] = [];
  let current: ResumeSection = { key: 'other', heading: '', lines: [] };
  for (const l of lines) {
    const h = l ? headingOf(l) : null;
    if (h) { if (current.lines.some(Boolean) || current.heading) sections.push(current); current = { key: h.key, heading: h.heading, lines: [] }; }
    else current.lines.push(l);
  }
  if (current.lines.some(Boolean) || current.heading) sections.push(current);
  const top = sections[0]?.key === 'other' ? sections[0].lines.filter(Boolean) : [];
  const sectionLines = (k: SectionKey) => sections.filter(s => s.key === k).flatMap(s => s.lines);
  const has = (k: SectionKey) => sections.some(s => s.key === k);

  // Contact
  const email = text.match(EMAIL)?.[0] || null;
  const phoneLine = nonEmpty.slice(0, 25).find(l => PHONE.test(l.replace(EMAIL, '')) && (l.match(/\d/g) || []).length >= 10 && !RANGE_RE.test(l));
  const phone = phoneLine ? (phoneLine.replace(EMAIL, '').match(PHONE)?.[0].trim() || null) : null;
  const urls = [...text.matchAll(URL_RE)].map(m => m[0]).filter(u => !EMAIL.test(u) && /\.[a-z]{2,}/i.test(u) && !/^\d/.test(u) && !/\.(?:pdf|docx?)$/i.test(u));
  const find = (re: RegExp) => urls.find(u => re.test(u)) || null;
  const linkedin = find(/linkedin\.com/i), github = find(/github\.com/i), scholar = find(/scholar\.google/i), orcid = find(/orcid\.org/i);
  const other = dedupe(urls.filter(u => ![linkedin, github, scholar, orcid].includes(u) && /^(https?:\/\/|www\.)/i.test(u)), 6);
  const portfolio = other[0] || null;

  // Name: first short line of mostly letters near the top that is not contact or a heading.
  const name = nonEmpty.slice(0, 6).map(l => l.replace(/^(curriculum vitae|resume|résumé|cv)\s*[:\-–]?\s*/i, '').trim())
    .find(l => l && l.length <= 50 && /^[A-Za-z][A-Za-z.' -]+$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 6 && !headingOf(l) && !/curriculum|resume|vitae/i.test(l)) || null;
  // Location: a segment of a top line that names an Indian state (or "India"), e.g. "Pune, Maharashtra".
  const location = top.slice(0, 8).flatMap(l => l.split(/\s*[|•·]\s*/)).map(x => x.replace(/^(address|location)\s*[:\-]\s*/i, '').trim())
    .find(x => x.length < 70 && !EMAIL.test(x) && !/\d{6,}/.test(x.replace(/\s/g, '')) && (findState(x) !== null || /\bindia\b/i.test(x)) && !/professor|engineer|department|developer|manager|lecturer/i.test(x)) || null;

  // Summary
  const summaryLines = sectionLines('summary').filter(Boolean);
  const summary = summaryLines.length ? summaryLines.join(' ').slice(0, 1500) : null;

  // Experience
  const expLines = [...sectionLines('experience'), ...sectionLines('teaching')];
  const experience: ExperienceEntry[] = [];
  for (let i = 0; i < expLines.length; i++) {
    const l = expLines[i];
    const m = l && l.match(RANGE_RE);
    if (!m || isBulletLike(l) && l.length > 120) continue;
    const rest = l.replace(m[0], '').replace(/[()|,–—-]+\s*$/, '').replace(/^\s*[()|,–—-]+/, '').trim();
    let title: string | null = null, org: string | null = null;
    const pick = (s: string) => {
      const at = s.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
      if (at) return [at[1], at[2]];
      const parts = s.split(/\s*(?:\||,|–|—| - )\s*/).filter(Boolean);
      return [parts[0] || null, parts.slice(1).join(', ') || null];
    };
    if (rest.length >= 3) [title, org] = pick(rest);
    if ((!title || !org) && i > 0 && expLines[i - 1] && !RANGE_RE.test(expLines[i - 1]) && !isBulletLike(expLines[i - 1])) {
      const [t2, o2] = pick(expLines[i - 1]);
      if (!title) { title = t2; org = org || o2; } else if (!org) org = expLines[i - 1];
    }
    const bullets: string[] = [];
    for (let j = i + 1; j < expLines.length && bullets.length < 15; j++) {
      const n = expLines[j];
      if (!n) continue;
      if (RANGE_RE.test(n) && !isBulletLike(n)) break;
      if (j + 1 < expLines.length && RANGE_RE.test(expLines[j + 1] || '') && !isBulletLike(n) && n.length < 90) break;
      bullets.push(stripBullet(n));
    }
    const endRaw = m[2];
    experience.push({
      title: title?.replace(/[:\-–]+$/, '').trim() || null, organization: org?.trim() || null,
      start: m[1], end: endRaw, current: /present|current|now|till|to date|ongoing|continuing/i.test(endRaw),
      months: monthsBetween(m[1], endRaw, now), bullets, raw: l,
    });
  }
  // Total experience: union of month ranges, so overlapping jobs are not counted twice.
  const covered = new Set<number>();
  for (const e of experience) {
    const s = e.start ? toYm(e.start, now) : null, en = e.end ? toYm(e.end, now) : null;
    if (!s || !en || !e.months) continue;
    for (let k = 0; k < e.months; k++) covered.add(s.y * 12 + s.m - 1 + k);
  }
  let totalExperienceMonths = covered.size;
  const stated = text.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)(?:\s+and\s+\d+\s+months?)?\s+(?:of\s+)?(?:\w+\s+){0,3}experience/i);
  if (!totalExperienceMonths && stated) totalExperienceMonths = Math.round(Number(stated[1]) * 12);

  // Education
  const eduSource = has('education') ? sectionLines('education') : nonEmpty;
  const education: EducationEntry[] = [];
  const eduEntries = entries(eduSource);
  for (const e of eduEntries) {
    const hit = DEGREE_RE.find(([, re]) => re.test(e));
    if (!hit) continue;
    const degree = e.match(hit[1])![0];
    const year = (e.match(/\b(19[5-9]\d|20[0-4]\d)\b(?!.*\b(19[5-9]\d|20[0-4]\d)\b)/) || [])[0] || null;
    const score = e.match(/\b(\d{1,2}(?:\.\d{1,2})?\s*(?:\/\s*10)?\s*(?:cgpa|cpi|gpa|sgpa)|(?:cgpa|cpi|gpa)\s*[:\-]?\s*\d{1,2}(?:\.\d{1,2})?|\d{2}(?:\.\d{1,2})?\s*%)/i)?.[0] || null;
    const field = e.match(/\b(?:in|of)\s+([A-Z][A-Za-z &]+?)(?=\s*(?:,|\||–|-|\(|\bfrom\b|\bat\b|\d|$))/)?.[1]?.trim() || null;
    const institution = e.match(/([A-Z][A-Za-z.&' ]*(?:University|Institute|College|School|IIT|NIT|IIIT|Academy|Vidyalaya|Polytechnic)[A-Za-z.&' ,]*)/)?.[1]?.replace(/[,\s]+$/, '').trim() || null;
    education.push({ degree, level: hit[0], field, institution, year, score, raw: e.slice(0, 300) });
    if (education.length >= 12) break;
  }

  // Skills (whole resume)
  const skills = findSkills(text).map(f => ({ name: f.skill.name, category: f.skill.category, count: f.count }))
    .sort((a, b) => b.count - a.count);

  // List-type sections
  /** Comma-separated items on one line ("IEEE (Member), ISTE, CSI") become separate items; commas inside brackets are kept. */
  const splitCommas = (e: string) => {
    const parts = e.split(/,(?![^()]*\))|;/).map(x => x.trim()).filter(Boolean);
    return parts.length >= 2 && parts.every(x => x.length <= 50 && !/\b(19|20)\d{2}\b/.test(x)) ? parts : [e];
  };
  const list = (k: SectionKey, max = 30, split = false) => dedupe(entries(sectionLines(k)).flatMap(e => (split ? splitCommas(e) : [e])), max);
  const pubItems = list('publications', 80);
  const pubText = sectionLines('publications').join(' ');
  const journals = pubItems.filter(p => /journal|transactions|letters|\bvol\.?|volume|issn|elsevier|springer|wiley|ieee access|plos|frontiers|mdpi|taylor|sage|nature|\bsci\b|scopus/i.test(p) && !/conference|proceedings|symposium/i.test(p)).length;
  const conferences = pubItems.filter(p => /conference|proceedings|symposium|workshop|congress|\bicon|\bic[a-z]{2,}\b/i.test(p)).length;
  const books = pubItems.filter(p => /\bbook\b|chapter|isbn/i.test(p)).length;
  const indexed = ['Scopus', 'SCI', 'SCIE', 'Web of Science', 'UGC-CARE', 'ESCI', 'PubMed'].filter(x => new RegExp(`\\b${x.replace(/[- ]/g, '[- ]?')}\\b`, x === 'SCI' ? '' : 'i').test(pubText));
  const languagesFromSkills = skills.filter(s => s.category === 'Languages').map(s => s.name);
  const languages = has('languages') ? dedupe(sectionLines('languages').join(',').split(/[,;|•]/).map(s => s.replace(/\(.*?\)/g, '').trim()).filter(s => /^[A-Za-z ]{3,20}$/.test(s)), 12) : languagesFromSkills;

  // Writing statistics (for the formatting and content checks)
  const bulletLines = nonEmpty.filter(isBulletLike);
  const expBullets = experience.flatMap(e => e.bullets);
  const consideredBullets = expBullets.length ? expBullets : bulletLines.map(stripBullet);
  const dateFormats = new Set(nonEmpty.filter(l => RANGE_RE.test(l)).map(l => {
    const m = l.match(RANGE_RE)![1];
    return /^\d{4}$/.test(m) ? 'year' : /^\d/.test(m) ? 'numeric' : 'month-name';
  })).size;

  return {
    name, email, phone, location,
    links: { linkedin, github, scholar, orcid, portfolio, other },
    summary, sections, experience, totalExperienceMonths, education, skills,
    certifications: list('certifications'), projects: list('projects'),
    publications: { items: pubItems, journals, conferences, books, indexed, dois: (pubText.match(/\b10\.\d{4,9}\/\S+/g) || []).length },
    awards: list('awards'), memberships: list('memberships', 30, true), languages,
    patents: list('patents'), grants: list('grants'),
    stats: {
      words: text.split(/\s+/).filter(Boolean).length,
      lines: nonEmpty.length,
      bullets: bulletLines.length,
      actionVerbBullets: consideredBullets.filter(b => ACTION_SET.has(firstWord(b))).length,
      quantifiedBullets: consideredBullets.filter(quantified).length,
      firstPersonPronouns: (text.match(/\b(I|me|my|myself)\b/g) || []).length,
      dateFormats,
    },
  };
}
