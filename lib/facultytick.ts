/*
 * FacultyTick (facultytick.com) post parser. Pure functions, no network, so it can be unit-tested and run anywhere.
 *
 * FacultyTick is a WordPress job-listing site. Almost every post follows one template of labelled <h4> headings
 * ("NAME OF THE INSTITUTION", "DESIGNATION / JOB POSITION", "QUALIFICATION & EXPERIENCE / REQUIREMENT",
 * "SALARY / REMUNERATION / PAY SCALE", "JOB LOCATION", "HOW TO APPLY", "IMPORTANT DATE", "CONTACT INFORMATION",
 * "ADDRESS FOR COMMUNICATION", "OFFICIAL SOURCE / REFERENCE", plus "PROJECT DETAILS" or "DEPARTMENT / DISCIPLINE /
 * SPECIALIZATION"). Only the facts of the vacancy are taken. FacultyTick's own writing (the "About institution"
 * paragraph, introductions and conclusions) and images are left out, and the institution's own notification and
 * website are preferred over FacultyTick's page for applying.
 */
import type { ApplyMode, Job, JobDetails } from '@/types';

export const FACULTYTICK_ORIGIN = 'https://facultytick.com';
export const FACULTYTICK_SITE_NAME = 'FacultyTick';

/** Shape of a post from https://facultytick.com/wp-json/wp/v2/posts (the fields we request). */
export interface WpPost {
  id: number;
  date: string;
  modified?: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  categories?: number[];
}

export interface ParsedFacultyTickPost {
  job: Job;
  /** Things the administrator should check before approving. */
  issues: string[];
  /** 'template' = FacultyTick's usual labelled layout; 'freeform' = read from headings and text. */
  layout: 'template' | 'freeform';
  posts: string[];
  /** The last date has passed (as of `today`). */
  expired: boolean;
}

// ------------------------------------------------------------------ HTML helpers

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', rupee: '₹' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (n === 160) return ' ';
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Text of an HTML fragment with block elements as line breaks. */
export function htmlToLines(html: string): string[] {
  const t = html
    .replace(/\s+/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(t)
    .replace(/ /g, ' ')
    .split(/\n/)
    .map(l => l.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter(l => l && !/^[•\-–]$/.test(l));
}

const text = (html: string) => htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim();

/** <li> items of a fragment, or its lines when it has no list. */
function items(html: string): string[] {
  const lis = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => text(m[1]).replace(/\s*,\s*/g, ', ')).filter(Boolean);
  return lis.length ? lis : htmlToLines(html);
}

interface Link { href: string; text: string }
function links(html: string): Link[] {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: decodeEntities(m[1]).trim(), text: text(m[2]) }))
    .filter(l => /^https?:\/\//i.test(l.href));
}

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const isExternal = (u: string) => {
  const h = hostOf(u);
  return !!h && !/(^|\.)facultytick\.com$/.test(h) && !/(telegram|t\.me|whatsapp|wa\.me|facebook|instagram|twitter|x\.com|linkedin|youtube|google\.com\/maps)/.test(h);
};
/** "https://www.nitc.ac.in" shown as text → its origin, if it is a web address. */
function asWebsite(s: string): string | null {
  const m = s.trim().match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/\S*)?$/i);
  if (!m) return null;
  const url = /^https?:/i.test(s.trim()) ? s.trim() : `https://${s.trim()}`;
  try { const u = new URL(url); return isExternal(u.href) ? `${u.protocol}//${u.host}` : null; } catch { return null; }
}

const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s || null);

// ------------------------------------------------------------------ sections

type Field = 'institution' | 'about' | 'posts' | 'project' | 'department' | 'qualification' | 'salary' | 'location' | 'apply'
  | 'dates' | 'contact' | 'address' | 'reference' | 'selection' | 'skip';

/** Heading text → field. Order matters: first match wins. */
const LABELS: [RegExp, Field][] = [
  [/NAME OF THE INSTITUT/, 'institution'],
  [/ABOUT (THE )?(INSTITUT|COLLEGE|UNIVERSITY|ORGANI)|CONCLUSION|INTRODUCTION|OVERVIEW|WHY JOIN/, 'about'],
  [/DESIGNATION|JOB POSITION|^POSITIONS?\b|^POSTS?\b|NAME OF (THE )?POST|VACANC/, 'posts'],
  [/PROJECT DETAIL|^PROJECT\b/, 'project'],
  [/DEPARTMENT|DISCIPLINE|SPECIALI[SZ]ATION|SUBJECTS?\b/, 'department'],
  [/QUALIFICATION|ELIGIBILITY|REQUIREMENT|EXPERIENCE/, 'qualification'],
  [/SALARY|REMUNERATION|PAY ?SCALE|EMOLUMENT|FELLOWSHIP AMOUNT|STIPEND/, 'salary'],
  [/JOB LOCATION|^LOCATION|PLACE OF (POSTING|WORK)/, 'location'],
  [/HOW TO APPLY|APPLICATION (PROCESS|PROCEDURE)|MODE OF APPLICATION/, 'apply'],
  [/SELECTION (PROCESS|PROCEDURE)/, 'selection'],
  [/IMPORTANT DATE|LAST DATE|KEY DATE/, 'dates'],
  [/CONTACT/, 'contact'],
  [/ADDRESS/, 'address'],
  [/OFFICIAL SOURCE|REFERENCE|NOTIFICATION/, 'reference'],
];

function labelOf(headingHtml: string): Field {
  const h = text(headingHtml).toUpperCase().replace(/[^A-Z&/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, f] of LABELS) if (re.test(h)) return f;
  return 'skip';
}

/** Splits content into labelled sections. Template posts split on <h4> only (their values may be <h2>). */
function sections(html: string): { layout: 'template' | 'freeform'; parts: Map<Field, string[]>; intro: string } {
  const template = /<h4[^>]*>[\s\S]{0,200}?NAME OF THE INSTITUT/i.test(html);
  const re = template ? /<h4\b[^>]*>([\s\S]*?)<\/h4>/gi : /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi;
  const parts = new Map<Field, string[]>();
  const heads = [...html.matchAll(re)];
  const intro = heads.length ? html.slice(0, heads[0].index) : html;
  heads.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index ?? html.length : html.length;
    const f = labelOf(m[1]);
    if (f === 'skip' || f === 'about') return;
    const list = parts.get(f) || [];
    list.push(html.slice(start, end));
    parts.set(f, list);
  });
  return { layout: template ? 'template' : 'freeform', parts, intro };
}

// ------------------------------------------------------------------ values

const SMALL = new Set(['of', 'and', 'the', 'for', 'in', 'at', 'on', 'to', 'a', 'an', 'by', '&']);

/** "NATIONAL INSTITUTE OF TECHNOLOGY CALICUT" → casing taken from the post title where the word appears there. */
function niceCase(name: string, title: string): string {
  if (name !== name.toUpperCase()) return name;
  const seen = new Map<string, string>();
  for (const w of title.split(/[\s,()]+/)) if (w) seen.set(w.toLowerCase(), w);
  return name.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const core = w.replace(/^[("'‘]+|[)"'’,.:;]+$/g, '');
    const pre = w.slice(0, w.indexOf(core));
    const post = w.slice(w.indexOf(core) + core.length);
    const lower = core.toLowerCase();
    let out: string;
    if (seen.has(lower)) out = seen.get(lower)!;
    else if (i > 0 && SMALL.has(lower)) out = lower;
    else out = lower.replace(/(^|[-'’.])([a-z])/g, (_, a, b) => a + b.toUpperCase());
    return pre + out + post;
  }).join('');
}

/** Institution and post from FacultyTick's title pattern "<Institution> Applications … Post of <Post> Job Vacancy 2026". */
export function splitTitle(title: string): { institution: string | null; post: string | null } {
  const t = decodeEntities(title).replace(/\s+/g, ' ').trim();
  const inst = t.split(/\s+(?:Applications?\b|Invites?\b|is\s+inviting\b|Inviting\b|Recruitment\b|Walk[- ]?in\b|Notification\b|Hiring\b|Advertisement\b|Wanted\b)/i)[0];
  const post = t.match(/\b(?:post|posts|position|positions)\s+of\s+(.+?)(?:\s+(?:Job|Jobs|Vacanc(?:y|ies)|Recruitment|Opportunit(?:y|ies)|Notification)\b|$)/i)?.[1] || null;
  return {
    institution: inst && inst !== t && inst.length >= 4 ? inst.replace(/,\s*located\s+in\s+.*$/i, '').trim() : null,
    post: post ? post.replace(/\s+\d{4}$/, '').trim() : null,
  };
}

const STATES: [RegExp, string][] = [
  [/andhra\s*pradesh|\bA\.?P\.?\b(?=[\s,-]*\d{6}|,\s*India)/i, 'Andhra Pradesh'], [/arunachal/i, 'Arunachal Pradesh'], [/assam/i, 'Assam'],
  [/bihar/i, 'Bihar'], [/chhattisgarh|chattisgarh/i, 'Chhattisgarh'], [/\bgoa\b/i, 'Goa'], [/gujarat/i, 'Gujarat'],
  [/haryana/i, 'Haryana'], [/himachal/i, 'Himachal Pradesh'], [/jharkhand/i, 'Jharkhand'], [/karnataka/i, 'Karnataka'],
  [/kerala/i, 'Kerala'], [/madhya\s*pradesh|\bM\.P\.(?=[\s,-])/i, 'Madhya Pradesh'], [/maharashtra/i, 'Maharashtra'], [/manipur/i, 'Manipur'],
  [/meghalaya/i, 'Meghalaya'], [/mizoram/i, 'Mizoram'], [/nagaland/i, 'Nagaland'], [/odisha|orissa/i, 'Odisha'],
  [/punjab/i, 'Punjab'], [/rajasthan/i, 'Rajasthan'], [/sikkim/i, 'Sikkim'], [/tamil\s*nadu|tamilnadu/i, 'Tamil Nadu'],
  [/telangana/i, 'Telangana'], [/tripura/i, 'Tripura'], [/uttar\s*pradesh|\bU\.\s?P\.?(?=[\s,-]|$)/i, 'Uttar Pradesh'],
  [/uttarakhand|uttaranchal/i, 'Uttarakhand'], [/west\s*bengal/i, 'West Bengal'], [/delhi/i, 'Delhi'],
  [/jammu|kashmir/i, 'Jammu and Kashmir'], [/ladakh/i, 'Ladakh'], [/puducherry|pondicherry/i, 'Puducherry'],
  [/chandigarh/i, 'Chandigarh'], [/andaman/i, 'Andaman and Nicobar Islands'], [/lakshadweep/i, 'Lakshadweep'],
  [/dadra|daman|diu\b/i, 'Dadra and Nagar Haveli and Daman and Diu'],
];

export function findState(s: string): string | null {
  for (const [re, name] of STATES) if (re.test(s)) return name;
  return null;
}

/** "Kataka, Odisha, India" → { city: 'Kataka', state: 'Odisha' }. City only when it is clearly a place name. */
export function splitLocation(s: string | null): { city: string | null; state: string | null } {
  if (!s) return { city: null, state: null };
  const state = findState(s);
  const segs = s.split(/,/).map(x => x.replace(/[-–]?\s*\d{6}\b/g, '').trim()).filter(Boolean);
  let city: string | null = null;
  const si = state ? segs.findIndex(x => findState(x) === state) : -1;
  const candidate = si > 0 ? segs[si - 1] : segs.length === 1 && !state ? segs[0] : null;
  if (candidate && /^[A-Za-z][A-Za-z .'-]{1,30}$/.test(candidate) && !/\b[A-Z]{2,}\b/.test(candidate) && !/campus|p\.?\s?o\b|road|street|nagar\b|post|india|district|dist\b|college|university|institute/i.test(candidate)) city = candidate;
  return { city, state };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const DATE_RE = /\b(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})\b|\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[,-]?[\s-]*(\d{4})\b|\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;

function toIso(m: RegExpMatchArray): string | null {
  let d: number, mo: number, y: number;
  if (m[1]) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if (m[4]) { y = +m[4]; mo = +m[5]; d = +m[6]; }
  else if (m[7]) { d = +m[7]; mo = MONTHS[m[8].slice(0, 3).toLowerCase()] || 0; y = +m[9]; }
  else { mo = MONTHS[m[10].slice(0, 3).toLowerCase()] || 0; d = +m[11]; y = +m[12]; }
  if (!mo || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return dt.getUTCDate() === d ? iso : null;
}

/** All dates in a text, in order. */
export function datesIn(s: string): { iso: string; index: number }[] {
  const out: { iso: string; index: number }[] = [];
  for (const m of s.matchAll(DATE_RE)) { const iso = toIso(m); if (iso) out.push({ iso, index: m.index ?? 0 }); }
  return out;
}

/**
 * The last date to apply from an "Important date" text: the date after "on or before" / "last date" / "to" / "till",
 * otherwise the first date. Interview-only dates are not used as the last date.
 */
export function lastDateFrom(s: string | null): string | null {
  if (!s) return null;
  const dates = datesIn(s);
  if (!dates.length) return null;
  const lower = s.toLowerCase();
  for (const cue of ['on or before', 'last date', 'closing date', 'up to', 'upto', 'till', ' to ', 'before']) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(cue, from);
      if (i < 0) break;
      const next = dates.find(d => d.index >= i && d.index - i <= cue.length + 40);
      if (next) return next.iso;
      from = i + cue.length;
    }
  }
  const first = dates[0];
  const before = lower.slice(Math.max(0, first.index - 40), first.index);
  if (/interview|walk[- ]?in/.test(before) && !/appl/.test(before)) return null;
  return first.iso;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, 'twenty-one': 21, 'twenty one': 21, 'forty-five': 45, sixty: 60 };

/** "within 21 days from the date of publication" → 21 (calendar days); working days are counted as calendar days × 7/5. */
export function relativeDays(s: string | null): number | null {
  if (!s) return null;
  const re = /\b(\d{1,3}|(?:twenty[- ])?[a-z]+)\s*(?:\(\d+\)\s*)?(working\s+)?days?\s+(?:from|of|after)\b/gi;
  for (const m of s.matchAll(re)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase().replace(' ', '-')];
    if (n && n <= 120) return m[2] ? Math.ceil((n * 7) / 5) : n;
  }
  return null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+91[\s-]?)?(?:\(?0\d{2,4}\)?[\s-]?\d{6,8}|[6-9]\d{4}[\s-]?\d{5})\b/g;
const NON_TEACHING = /non[- ]?teaching|clerk|driver|attendant|peon|multi[- ]?tasking|\bMTS\b|accountant|cook|warden|security guard|office assistant|typist|librarian assistant|lab(?:oratory)? attendant|nurse|staff nurse/i;

function applyModesOf(s: string): ApplyMode[] {
  const m = new Set<ApplyMode>();
  if (/walk[- ]?in/i.test(s)) m.add('walk-in');
  if (/e-?mail(ed)?\b|@/i.test(s)) m.add('email');
  if (/online|portal|google form|apply (?:through|via|at) (?:the )?(?:website|link)/i.test(s)) m.add('online');
  if (/\b(?:by post|speed post|registered post|indian post|courier|hard ?copy|send (?:it )?to the address)\b/i.test(s)) m.add('post');
  if (/in person|by hand|offline/i.test(s)) m.add('offline');
  return [...m];
}

/** FacultyTick's own stock sentences, left out of the record. */
const BOILERPLATE = [
  /^The details of the required qualifications/i,
  /^Interested and eligible candidates are invited to submit their applications, including an updated Curriculum Vitae/i,
  /^Applications are invited from interested and eligible candidates for the following Positions/i,
];
const notBoilerplate = (l: string) => !BOILERPLATE.some(re => re.test(l));

// ------------------------------------------------------------------ main

export function parseFacultyTickPost(post: WpPost, opts: { today?: string; categoryNames?: Record<number, string> } = {}): ParsedFacultyTickPost {
  const html = post.content?.rendered || '';
  const title = decodeEntities(post.title?.rendered || '').replace(/\s+/g, ' ').trim();
  const { layout, parts } = sections(html);
  const get = (f: Field) => (parts.get(f) || []).join('\n');
  const issues: string[] = [];
  const fullText = htmlToLines(html).join('\n');
  const fromTitle = splitTitle(title);

  // Institution
  const instRaw = text(get('institution'));
  let institution = instRaw ? niceCase(instRaw, title) : fromTitle.institution;
  if (institution && fromTitle.institution) {
    // Prefer the title's spelling when it is the same name plus an abbreviation, e.g. "… Calicut (NITC)".
    const t = fromTitle.institution;
    if (t.toLowerCase().startsWith(institution.toLowerCase()) && /^\s*\([A-Za-z.&\s]{2,12}\)\s*$/.test(t.slice(institution.length))) institution = t;
  }
  if (!institution) issues.push('Institution name not found');

  // Posts
  let posts = items(get('posts')).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length >= 3 && p.length <= 160);
  if (!posts.length && fromTitle.post) posts = [fromTitle.post];
  posts = [...new Set(posts)];
  if (!posts.length) issues.push('Post name not found');
  const jobTitle = posts.length <= 1 ? (posts[0] || fromTitle.post || title)
    : posts.length <= 3 ? `${posts.slice(0, -1).join(', ')} and ${posts[posts.length - 1]}`
      : `${posts.slice(0, 3).join(', ')} and ${posts.length - 3} more`;
  if (posts.some(p => NON_TEACHING.test(p)) || NON_TEACHING.test(title)) issues.push('Includes non-teaching posts');

  // Departments / project
  const departments = items(get('department')).filter(d => d.length <= 200);
  const project = items(get('project')).map(l => l.replace(/^Name of (the )?/i, ''));

  // Qualification and experience
  const qualLines = htmlToLines(get('qualification')).filter(notBoilerplate);
  const qualification = clip(qualLines.join(' '), 1500);
  const expMatch = (qualification || '').match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,3}experience/i);

  // Salary
  const salary = clip(htmlToLines(get('salary')).join(' '), 300)
    || clip(fullText.match(/(?:Fellowship Amount|Salary|Remuneration|Emoluments?|Stipend|Pay)\s*[:\-–]\s*([^\n]{3,160})/i)?.[1] || null, 200);

  // Location / address
  const locationText = clip(text(get('location')), 200);
  const address = clip(text(get('address')), 300);
  const loc = splitLocation(locationText || address);
  if (!loc.state) {
    const s = findState(`${address || ''} ${institution || ''}`);
    if (s) loc.state = s;
  }
  if (!loc.city && institution) {
    const tail = institution.split(',').slice(1).map(x => x.trim()).find(x => /^[A-Za-z][A-Za-z .'-]{2,30}$/.test(x) && !findState(x));
    if (tail) loc.city = tail;
  }

  // How to apply / selection
  const applyLines = htmlToLines(get('apply')).filter(notBoilerplate);
  const howToApply = clip(applyLines.join('\n'), 2000);
  const selection = items(get('selection')).filter(l => l.length <= 300).slice(0, 10);

  // Dates
  const dateText = clip(htmlToLines(get('dates')).join(' ').replace(/[📫📧🌐📌].*$/u, '').trim(), 400)
    || clip((fullText.match(/[^\n.]*last date[^\n]*/i)?.[0] || '').replace(/(?<=\.)\s.*$/, '').replace(/[📫📧🌐📌].*$/u, '').trim() || null, 300);
  let deadline = lastDateFrom(dateText);
  let deadlineEstimated = false;
  const rel = deadline ? null : relativeDays(dateText);
  if (rel && post.date) {
    const d = new Date(`${post.date.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + rel);
    deadline = d.toISOString().slice(0, 10);
    deadlineEstimated = true;
    issues.push(`Last date estimated as ${rel} days after FacultyTick's post date: confirm it in the notification`);
  } else if (!deadline) issues.push(/rolling|until filled|till filled/i.test(dateText || '') ? 'Rolling advertisement (no fixed last date)' : 'Last date not found');
  const interview = dateText?.match(/(?:date of )?(?:online |offline )?interview[^.]*?(?:\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4})[^.]*/i)?.[0] || null;
  const today = opts.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const expired = !!deadline && deadline < today;

  // Contacts and links
  const contactHtml = `${get('contact')}\n${get('apply')}`;
  const emails = [...new Set([...(text(contactHtml).match(EMAIL_RE) || []), ...links(contactHtml).filter(l => /^mailto:/i.test(l.href)).map(l => l.href.slice(7))])]
    .map(e => e.toLowerCase().replace(/\.$/, '')).filter(e => !/facultytick/.test(e)).slice(0, 6);
  const phones = [...new Set(text(get('contact')).match(PHONE_RE) || [])].slice(0, 4);
  const allLinks = links(html).filter(l => isExternal(l.href));
  const refLinks = links(get('reference')).filter(l => isExternal(l.href));
  const contactLinks = links(get('contact')).filter(l => isExternal(l.href));
  const notification = refLinks.find(l => /notification|advertisement|\.pdf/i.test(`${l.text} ${l.href}`))?.href
    || refLinks[0]?.href || allLinks.find(l => /\.pdf(\?|$)/i.test(l.href))?.href || null;
  const websiteFromText = contactLinks.map(l => asWebsite(l.text)).find(Boolean)
    || (text(get('contact')).match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ac\.in|edu\.in|edu|res\.in|gov\.in|nic\.in|org\.in|org|in|com)\b/i) || []).map(w => asWebsite(w)).find(Boolean)
    || null;
  const website = websiteFromText
    || (notification ? (() => { try { const u = new URL(notification); return `${u.protocol}//${u.host}`; } catch { return null; } })() : null)
    || allLinks.map(l => asWebsite(l.text)).find(Boolean) || null;
  const applicationLink = [...links(get('apply')), ...allLinks].find(l => isExternal(l.href) && /apply|application|form|portal|register|recruit/i.test(`${l.text} ${l.href}`) && !/\.pdf(\?|$)/i.test(l.href))?.href || null;
  if (!notification) issues.push('No link to the official notification');
  if (layout === 'freeform') issues.push("Not in FacultyTick's usual layout: check the details");

  const modes = applyModesOf(`${howToApply || ''} ${dateText || ''}`);
  const nowIso = today;
  const instKey = (hostOf(website || notification || '') || (institution || 'facultytick').toLowerCase()).replace(/[^a-z0-9]+/gi, '');

  const details: JobDetails = {
    hiringOrganization: institution,
    ...(posts.length > 1 ? { postGroups: [{ group: null, items: posts }] } : {}),
    ...(departments.length ? { departmentGroups: [{ group: null, items: departments }] } : {}),
    ...(qualLines.length ? { qualifications: qualLines.slice(0, 20).map(t => ({ post: null, text: clip(t, 600)! })) } : {}),
    salaryText: salary,
    locationText: locationText || address,
    ...(project.length ? { summary: clip(project.join('. ').replace(/\.\./g, '.'), 600) } : {}),
    ...(selection.length ? { selectionProcess: selection } : {}),
    ...(dateText ? { importantDates: [{ label: 'Last date to apply', value: dateText }], lastDateText: dateText } : {}),
    ...(deadlineEstimated ? { deadlineEstimated: true } : {}),
    ...(interview ? { interviewText: clip(interview.trim(), 200) } : {}),
    ...(modes.length ? { applyModes: modes } : {}),
    ...(howToApply ? { howToApply } : {}),
    ...(emails.length ? { applyEmails: emails.map(email => ({ email })) } : {}),
    ...(phones.length ? { contactPhones: phones } : {}),
    applicationLink,
    officialWebsite: website,
    notificationLink: notification,
    organizationAddress: address,
  };

  const job: Job = {
    id: `ft-${post.id}`,
    instituteId: `inst-${instKey}`,
    instituteName: institution || 'Institution not stated',
    instituteShortName: institution?.match(/\(([A-Z][A-Za-z.&]{1,10})\)/)?.[1] || (institution || '').split(',')[0] || 'Institution',
    instituteLogo: '',
    instituteType: null,
    title: clip(jobTitle, 200)!,
    designation: null,
    department: departments.length === 1 ? departments[0] : null,
    specializationTags: [...new Set(departments.flatMap(d => d.replace(/^[^:]{3,40}:\s*/, '').split(/\s*,\s*/)).map(t => t.trim()).filter(t => t.length > 1 && t.length <= 40))].slice(0, 12),
    advertisementNumber: clip(fullText.match(/\b(?:Advt|Advertisement|Notification)\.?\s*No\.?\s*[:.]?\s*([A-Z0-9][A-Za-z0-9/._-]{2,40})/i)?.[1] || null, 60),
    location: loc,
    payScale: { cpcBand: salary, entryPay: null, grossMonthlyEstimated: null, allowances: [] },
    requiredQualifications: {
      minDegree: clip(qualLines.join(' ') || null, 400),
      netSletMandatory: null,
      phdNorms: null,
      minExperienceYears: expMatch ? Number(expMatch[1]) : null,
      experienceText: expMatch ? clip(expMatch[0], 200) : null,
      minUgcCarePubs: null,
      ugcRegulationsYear: null,
      specializationRequirements: [],
    },
    reservationCategory: null,
    applicationDeadline: deadline,
    deadlineText: deadline && !deadlineEstimated ? null : clip(dateText, 200),
    status: 'published',
    isClaimedByInstitute: false,
    screeningQuestions: [],
    selectionProcess: selection,
    description: details.summary || null,
    responsibilities: [],
    benefits: [],
    postedAt: (post.date || nowIso).slice(0, 10),
    applicantCount: 0,
    featured: false,
    externalApplyUrl: applicationLink || notification || website || post.link,
    source: {
      url: post.link,
      pageTitle: title,
      extractedAt: nowIso,
      rawText: null,
      numberOfPosts: null,
      salaryText: salary,
      kind: 'aggregator',
      siteName: FACULTYTICK_SITE_NAME,
    },
    details,
  };
  return { job, issues, layout, posts, expired };
}
