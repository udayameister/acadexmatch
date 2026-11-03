/*
 * Resume builder: the data model, input cleaning, the four ATS-friendly templates and a "start from my
 * analysed resume" import. Everything is single-column, text-based and uses standard headings.
 */
import type { ParsedResume } from './parse';

export type TemplateId = 'ats-classic' | 'academic' | 'modern' | 'fresher';
export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: 'ats-classic', name: 'ATS Classic', description: 'Plain single column. Safest for any applicant tracking system.' },
  { id: 'academic', name: 'Academic CV', description: 'Teaching, research, publications and memberships first. For faculty posts.' },
  { id: 'modern', name: 'Modern Professional', description: 'Clean headings with an accent colour; still one column and text-only.' },
  { id: 'fresher', name: 'Fresher', description: 'Education and projects before experience. For students and new graduates.' },
];

export interface BuilderExperience { title: string; organization: string; location: string; start: string; end: string; bullets: string[] }
export interface BuilderEducation { degree: string; institution: string; year: string; score: string }
export interface BuilderProject { name: string; description: string }

export interface BuilderData {
  fullName: string; headline: string; email: string; phone: string; location: string; links: string[];
  summary: string;
  experience: BuilderExperience[];
  education: BuilderEducation[];
  skills: string[];
  certifications: string[];
  projects: BuilderProject[];
  publications: string[];
  research: string[];
  teaching: string[];
  awards: string[];
  memberships: string[];
  trainings: string[];
  languages: string[];
}

export interface BuilderResume { id: string; label: string; template: TemplateId; updatedAt: string; data: BuilderData }

export const EMPTY_DATA: BuilderData = {
  fullName: '', headline: '', email: '', phone: '', location: '', links: [], summary: '',
  experience: [], education: [], skills: [], certifications: [], projects: [], publications: [], research: [], teaching: [],
  awards: [], memberships: [], trainings: [], languages: [],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const list = (v: unknown, maxItems: number, max: number) => (Array.isArray(v) ? v.map(x => str(x, max)).filter(Boolean).slice(0, maxItems) : []);

export function cleanBuilderData(raw: unknown): BuilderData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  return {
    fullName: str(r.fullName, 100), headline: str(r.headline, 160), email: str(r.email, 120), phone: str(r.phone, 40), location: str(r.location, 120),
    links: list(r.links, 6, 200), summary: str(r.summary, 1500),
    experience: arr(r.experience).slice(0, 20).map(e => ({ title: str(e.title, 120), organization: str(e.organization, 160), location: str(e.location, 100), start: str(e.start, 30), end: str(e.end, 30), bullets: list(e.bullets, 12, 400) })).filter(e => e.title || e.organization),
    education: arr(r.education).slice(0, 10).map(e => ({ degree: str(e.degree, 160), institution: str(e.institution, 200), year: str(e.year, 30), score: str(e.score, 40) })).filter(e => e.degree || e.institution),
    skills: list(r.skills, 60, 60),
    certifications: list(r.certifications, 30, 200),
    projects: arr(r.projects).slice(0, 15).map(p => ({ name: str(p.name, 160), description: str(p.description, 600) })).filter(p => p.name),
    publications: list(r.publications, 150, 600), research: list(r.research, 15, 200), teaching: list(r.teaching, 40, 200),
    awards: list(r.awards, 30, 300), memberships: list(r.memberships, 20, 200), trainings: list(r.trainings, 60, 300), languages: list(r.languages, 10, 60),
  };
}

/** Pre-fills the builder from a resume the user analysed (only what the resume states). */
export function builderFromParsed(p: ParsedResume): BuilderData {
  const sec = (k: string) => p.sections.filter(s => s.key === k).flatMap(s => s.lines).map(l => l.replace(/^[\s•●▪*\-–]+/, '').trim()).filter(l => l.length > 1);
  return cleanBuilderData({
    fullName: p.name || '', headline: p.experience[0]?.title || '', email: p.email || '', phone: p.phone || '', location: p.location || '',
    links: [p.links.linkedin, p.links.github, p.links.scholar, p.links.orcid, p.links.portfolio, ...p.links.other].filter(Boolean),
    summary: p.summary || '',
    experience: p.experience.map(e => ({ title: e.title || '', organization: e.organization || '', location: '', start: e.start || '', end: e.current ? 'Present' : e.end || '', bullets: e.bullets })),
    education: p.education.map(e => ({ degree: [e.degree, e.field].filter(Boolean).join(', '), institution: e.institution || '', year: e.year || '', score: e.score || '' })),
    skills: p.skills.filter(s => s.category !== 'Languages').map(s => s.name),
    certifications: p.certifications, projects: p.projects.map(x => ({ name: x.split(/[:–-]\s/)[0].slice(0, 160), description: x.includes(': ') ? x.split(': ').slice(1).join(': ') : '' })),
    publications: p.publications.items, research: sec('research'),
    // A "Teaching experience" heading often holds the roles themselves; keep only lines not already in experience.
    teaching: sec('teaching').filter(l => !p.experience.some(e => e.raw.includes(l) || e.bullets.includes(l) || (e.title && l.startsWith(e.title)))), awards: p.awards, memberships: p.memberships,
    trainings: sec('training'), languages: p.languages,
  });
}

export interface RenderSection { heading: string; kind: 'paragraph' | 'list' | 'entries' | 'inline'; paragraph?: string; items?: string[]; entries?: { title: string; sub: string; dates: string; bullets: string[] }[] }

/** The ordered sections for a template (shared by the on-screen/PDF view and the DOCX writer). */
export function renderSections(d: BuilderData, t: TemplateId): RenderSection[] {
  const S: Record<string, RenderSection | null> = {
    summary: d.summary ? { heading: t === 'fresher' ? 'Career Objective' : 'Professional Summary', kind: 'paragraph', paragraph: d.summary } : null,
    experience: d.experience.length ? {
      heading: t === 'academic' ? 'Academic and Professional Experience' : 'Work Experience', kind: 'entries',
      entries: d.experience.map(e => ({ title: e.title, sub: [e.organization, e.location].filter(Boolean).join(', '), dates: [e.start, e.end].filter(Boolean).join(' – '), bullets: e.bullets })),
    } : null,
    education: d.education.length ? { heading: 'Education', kind: 'entries', entries: d.education.map(e => ({ title: e.degree, sub: e.institution, dates: e.year, bullets: e.score ? [`Score: ${e.score}`] : [] })) } : null,
    skills: d.skills.length ? { heading: 'Skills', kind: 'inline', items: d.skills } : null,
    research: d.research.length ? { heading: 'Research Interests', kind: 'inline', items: d.research } : null,
    teaching: d.teaching.length ? { heading: 'Subjects Taught', kind: 'list', items: d.teaching } : null,
    publications: d.publications.length ? { heading: 'Publications', kind: 'list', items: d.publications } : null,
    projects: d.projects.length ? { heading: 'Projects', kind: 'entries', entries: d.projects.map(p => ({ title: p.name, sub: '', dates: '', bullets: p.description ? [p.description] : [] })) } : null,
    certifications: d.certifications.length ? { heading: 'Certifications', kind: 'list', items: d.certifications } : null,
    trainings: d.trainings.length ? { heading: t === 'academic' ? 'FDPs, Workshops and Training' : 'Training', kind: 'list', items: d.trainings } : null,
    awards: d.awards.length ? { heading: 'Awards and Achievements', kind: 'list', items: d.awards } : null,
    memberships: d.memberships.length ? { heading: 'Professional Memberships', kind: 'list', items: d.memberships } : null,
    languages: d.languages.length ? { heading: 'Languages', kind: 'inline', items: d.languages } : null,
  };
  const order: Record<TemplateId, string[]> = {
    'ats-classic': ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'publications', 'research', 'teaching', 'trainings', 'awards', 'memberships', 'languages'],
    modern: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'publications', 'research', 'teaching', 'trainings', 'awards', 'memberships', 'languages'],
    academic: ['summary', 'research', 'education', 'experience', 'teaching', 'publications', 'projects', 'skills', 'certifications', 'trainings', 'awards', 'memberships', 'languages'],
    fresher: ['summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'trainings', 'awards', 'publications', 'research', 'teaching', 'memberships', 'languages'],
  };
  return order[t].map(k => S[k]).filter((s): s is RenderSection => !!s);
}

/** Plain text of a built resume, so it can be scored by the same checker. */
export function builderText(d: BuilderData, t: TemplateId): string {
  const out = [d.fullName, d.headline, [d.email, d.phone, d.location].filter(Boolean).join(' | '), d.links.join(' | '), ''];
  for (const s of renderSections(d, t)) {
    out.push(s.heading.toUpperCase());
    if (s.paragraph) out.push(s.paragraph);
    if (s.kind === 'inline') out.push((s.items || []).join(', '));
    else if (s.items) out.push(...s.items.map(i => `• ${i}`));
    for (const e of s.entries || []) { out.push([e.title, e.sub].filter(Boolean).join(' | ') + (e.dates ? ` | ${e.dates}` : '')); out.push(...e.bullets.map(b => `• ${b}`)); }
    out.push('');
  }
  return out.filter((l, i, a) => l || a[i - 1]).join('\n');
}
