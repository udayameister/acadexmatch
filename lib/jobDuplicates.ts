/*
 * Duplicate vacancy detection, shared by the server (approval queues) and the admin console (job board).
 * Pure functions. Two vacancies are treated as the same advertisement when they come from the same institution,
 * advertise the same kind of post, and their dates do not contradict each other.
 */

export interface DupCandidate {
  id: string;
  title: string;
  instituteName: string;
  applicationDeadline?: string | null;
  postedAt?: string | null;
  officialWebsite?: string | null;
}

const STOP = new Set(['the', 'of', 'and', 'for', 'in', 'at', 'a', 'an', '&', 'college', 'institute', 'university', 'autonomous', 'deemed', 'to', 'be', 'india', 'pvt', 'ltd', 'private', 'limited']);

/** "Viswam Engineering College (Autonomous), Madanapalle" → "viswam engineering madanapalle" without generic words. */
export function institutionKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .join(' ');
}

const hostOf = (u?: string | null) => {
  if (!u) return '';
  try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

function sameInstitution(a: DupCandidate, b: DupCandidate): boolean {
  const ha = hostOf(a.officialWebsite), hb = hostOf(b.officialWebsite);
  if (ha && hb) return ha === hb;
  const ka = institutionKey(a.instituteName), kb = institutionKey(b.instituteName);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // One name is the other plus a place or campus ("Karpagam Institutions" vs "Karpagam Institutions Coimbatore").
  const [s, l] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return s.length >= 8 && (l.startsWith(`${s} `) || l.endsWith(` ${s}`));
}

/** Kinds of post, most specific first, so "Assistant Professor" is not also counted as "Professor". */
const POSTS: [RegExp, string][] = [
  [/\bassociate\s+prof/i, 'associate professor'],
  [/\bassistant\s+prof|\basst\.?\s*prof/i, 'assistant professor'],
  [/\b(adjunct|visiting|guest)\s+(prof|faculty|lecturer)/i, 'guest faculty'],
  [/\bprofessor\s+of\s+practice/i, 'professor of practice'],
  [/\bprofessor\b/i, 'professor'],
  [/\bprincipal\b/i, 'principal'],
  [/\bvice[- ]chancellor\b/i, 'vice chancellor'],
  [/\bdirector\b/i, 'director'],
  [/\bdean\b/i, 'dean'],
  [/\b(hod|head of (the )?department)\b/i, 'hod'],
  [/\blecturer\b/i, 'lecturer'],
  [/\bteaching\s+(assistant|associate)\b/i, 'teaching assistant'],
  [/\b(lab(oratory)?|workshop)\s+(instructor|assistant|technician)\b/i, 'lab staff'],
  [/\b(post[- ]?doc|research associate|research assistant|jrf|srf|project (associate|assistant|fellow)|research fellow)\b/i, 'research'],
  [/\blibrarian\b/i, 'librarian'],
  [/\b(pgt|tgt|prt|teacher)\b/i, 'school teacher'],
  [/\b(faculty|teaching staff)\b/i, 'faculty'],
];

export function postKinds(title: string): Set<string> {
  const out = new Set<string>();
  let rest = title;
  for (const [re, kind] of POSTS) {
    const g = new RegExp(re.source, 'gi');
    if (g.test(rest)) { out.add(kind); rest = rest.replace(g, ' '); }
  }
  return out;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^20\d\d$/.test(w)));

function samePosts(a: string, b: string): boolean {
  const ka = postKinds(a), kb = postKinds(b);
  // "Faculty Recruitment" is generic: it overlaps any teaching post.
  if (ka.has('faculty') || kb.has('faculty')) {
    const teaching = (k: Set<string>) => [...k].some(x => /professor|lecturer|faculty|principal|dean|hod|teaching/.test(x));
    if ((ka.has('faculty') && teaching(kb)) || (kb.has('faculty') && teaching(ka))) return true;
  }
  if (ka.size && kb.size) return [...ka].some(x => kb.has(x));
  const wa = words(a), wb = words(b);
  if (!wa.size || !wb.size) return false;
  const inter = [...wa].filter(w => wb.has(w)).length;
  return inter / Math.min(wa.size, wb.size) >= 0.6;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86400000;

function compatibleDates(a: DupCandidate, b: DupCandidate): boolean {
  if (a.applicationDeadline && b.applicationDeadline) return dayDiff(a.applicationDeadline, b.applicationDeadline) <= 3;
  if (a.postedAt && b.postedAt) return dayDiff(a.postedAt, b.postedAt) <= 45;
  return true;
}

export function isDuplicate(a: DupCandidate, b: DupCandidate): boolean {
  if (a.id === b.id) return false;
  return sameInstitution(a, b) && samePosts(a.title, b.title) && compatibleDates(a, b);
}

/** First candidate that looks like the same advertisement as `job`, or null. */
export function findDuplicate<T extends DupCandidate>(job: DupCandidate, candidates: T[]): T | null {
  for (const c of candidates) if (isDuplicate(job, c)) return c;
  return null;
}

/**
 * Groups of duplicate vacancies in a list (each group has at least two). The first of each group is the one to
 * keep: the one with the most applications, then the one posted first.
 */
export function duplicateGroups<T extends DupCandidate & { applicantCount?: number }>(jobs: T[]): T[][] {
  const used = new Set<string>();
  const groups: T[][] = [];
  const byInst = new Map<string, T[]>();
  for (const j of jobs) {
    const k = institutionKey(j.instituteName).split(' ').slice(0, 2).join(' ');
    if (!k) continue;
    byInst.set(k, [...(byInst.get(k) || []), j]);
  }
  for (const list of byInst.values()) {
    for (const j of list) {
      if (used.has(j.id)) continue;
      const g = [j, ...list.filter(o => !used.has(o.id) && isDuplicate(j, o))];
      if (g.length < 2) continue;
      g.forEach(x => used.add(x.id));
      g.sort((x, y) => (y.applicantCount || 0) - (x.applicantCount || 0) || String(x.postedAt || '').localeCompare(String(y.postedAt || '')));
      groups.push(g);
    }
  }
  return groups;
}
