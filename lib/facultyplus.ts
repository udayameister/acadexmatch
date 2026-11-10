/*
 * FacultyPlus (facultyplus.com) post parser. Pure functions, no network, so it can be unit-tested and run anywhere.
 *
 * FacultyPlus is a WordPress job-listing site. Its posts are paragraphs that start with a bold label
 * ("Hiring Organization Name:", "Institution Name:", "Job Title/Designation:", "Post Name/Designation:",
 * "Vacancy available in departments:", "Salary Details:", "Pay Scale/Pay Level:", "Job Location:", ...), each
 * followed by its value and sometimes a list or table, plus two tables: "Important Dates" and "Important Links".
 *
 * Only the facts of the vacancy and the institution's own details are taken (name, posts, departments,
 * qualifications, pay, place, dates, official website, application link, e-mail, address). FacultyPlus's own
 * writing (introductions, profiles, responsibilities, procedures, FAQs, disclaimers), its images, its links and
 * files hosted on facultyplus.com are never copied into the vacancy. The FacultyPlus post address is kept only in
 * the administrator's approval queue, for checking.
 */
import type { ApplyMode, Job, JobDetails, JobListGroup } from '@/types';
import { decodeEntities, datesIn, findState, htmlToLines, lastDateFrom, splitLocation, type WpPost } from './facultytick';

export const FACULTYPLUS_ORIGIN = 'https://www.facultyplus.com';
export type { WpPost };

export interface ParsedFacultyPlusPost {
  /** False when the post is not a vacancy (an event, an article…): nothing to queue. */
  isVacancy: boolean;
  job: Job;
  /** Things the administrator should check before approving. */
  issues: string[];
  posts: string[];
  /** The last date has passed (as of `today`). */
  expired: boolean;
}

// ------------------------------------------------------------------ helpers

const text = (html: string) => htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim();
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s || null);
const uniq = <T,>(a: T[]) => [...new Set(a)];

const isFacultyPlus = (u: string) => /(^|\.)facultyplus\.com$/i.test(hostOf(u));
function hostOf(u: string): string {
  try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
const SOCIAL = /(^|\.)(t\.me|telegram\.(me|org)|whatsapp\.com|wa\.me|chat\.whatsapp\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|youtu\.be)$/i;
/** A link that may be shown to candidates: the institution's own, never FacultyPlus or social media. */
const isOwnLink = (u: string) => /^https?:\/\//i.test(u) && !!hostOf(u) && !isFacultyPlus(u) && !SOCIAL.test(hostOf(u));

/** "www.srtmun.ac.in" (or a link FacultyPlus wrote as https://www.facultyplus.com/www.srtmun.ac.in) → https://www.srtmun.ac.in */
function websiteFrom(s: string | null | undefined): string | null {
  if (!s) return null;
  let v = decodeEntities(s).trim().replace(/[)\].,;]+$/, '');
  const inside = v.match(/^https?:\/\/(?:www\.)?facultyplus\.com\/+((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}\S*)$/i);
  if (inside) v = inside[1];
  if (!/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(v)) return null;
  try {
    const u = new URL(/^https?:/i.test(v) ? v : `https://${v}`);
    return isOwnLink(u.href) ? `${u.protocol}//${u.host}` : null;
  } catch { return null; }
}

/** Cloudflare e-mail protection ("/cdn-cgi/l/email-protection#…" or data-cfemail) → the address. */
export function cfDecode(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(out) ? out : null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+91[\s-]?)?(?:\(?0\d{2,4}\)?[\s-]?\d{6,8}|[6-9]\d{4}[\s-]?\d{5})\b/g;

function emailsIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) { const e = cfDecode(m[1]); if (e) out.push(e); }
  for (const m of html.matchAll(/email-protection#([0-9a-f]+)/gi)) { const e = cfDecode(m[1]); if (e) out.push(e); }
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) out.push(decodeURIComponent(m[1]));
  out.push(...(text(html).match(EMAIL_RE) || []));
  return uniq(out.map(e => e.toLowerCase().replace(/\.$/, ''))).filter(e => !/facultyplus/.test(e));
}

interface Link { href: string; text: string }
function linksIn(html: string): Link[] {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: decodeEntities(m[1]).trim(), text: text(m[2]) }));
}

// ------------------------------------------------------------------ blocks

interface Block { kind: 'p' | 'list' | 'table' | 'heading' | 'rule'; html: string }

/** Top-level blocks in order. <div> and <span> wrappers are dropped so their paragraphs count as top-level. */
function blocksOf(html: string): Block[] {
  const flat = html.replace(/<\/?(div|span|section|article|figure)\b[^>]*>/gi, '\n');
  const out: Block[] = [];
  const re = /<(p|ul|ol|table|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<hr\b[^>]*>/gi;
  for (const m of flat.matchAll(re)) {
    if (!m[1]) { out.push({ kind: 'rule', html: '' }); continue; }
    const t = m[1].toLowerCase();
    out.push({ kind: t === 'p' ? 'p' : t === 'table' ? 'table' : t.startsWith('h') ? 'heading' : 'list', html: m[2] });
  }
  return out;
}

interface Table { head: string[]; rows: { cells: string[]; html: string[] }[] }
function tableOf(html: string): Table {
  const head = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1]));
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(r => [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]))
    .filter(cells => cells.length)
    .map(cells => ({ cells: cells.map(text), html: cells }));
  return { head, rows };
}

/** Items of a list; for nested lists, the innermost items (e.g. the departments under each post). */
const listItems = (html: string) => [...html.matchAll(/<li\b[^>]*>((?:(?!<li\b|<\/li>)[\s\S])*)<\/li>/gi)].map(m => text(m[1]).replace(/\s*,\s*/g, ', ')).filter(Boolean);

type Field = 'institution' | 'posts' | 'departments' | 'qualification' | 'experience' | 'salary' | 'location' | 'applyMode'
  | 'employment' | 'total' | 'advt' | 'age' | 'address' | 'dates' | 'links' | 'email' | 'contact' | 'howToApply'
  | 'lastDate' | 'interview' | 'website' | 'notification' | 'applicationLink' | 'end' | 'skip';

/** Label → field. First match wins; anything else (profiles, responsibilities, procedures, FAQs…) is skipped. */
const LABELS: [RegExp, Field][] = [
  [/^(frequently asked|faqs?\b|copyright|disclaimer|benefits of|why (join|work))/, 'end'],
  [/^(hiring organi[sz]ation|institution name|name of (the )?(institution|organi[sz]ation|college|university)|organi[sz]ation name|college name|university name|employer)/, 'institution'],
  [/^(job title|post name|name of (the )?posts?|designation|posts?( available| advertised)?$|position)/, 'posts'],
  [/^(vacancy available in|departments?|department ?\/ ?school|subjects?\b|disciplines?|specialization)/, 'departments'],
  [/^(required (educational )?qualification|qualifications?( and experience)?|eligibility|educational qualification)/, 'qualification'],
  [/^(required experience|experience)/, 'experience'],
  [/^(salary|pay scale|pay level|pay\b|remuneration|emoluments?|stipend|fellowship|consolidated)/, 'salary'],
  [/^(job location|location|place of (posting|work))/, 'location'],
  [/^(apply mode|mode of (application|apply))/, 'applyMode'],
  [/^(employment type|nature of (job|appointment|engagement)|job type)/, 'employment'],
  [/^(total vacanc|no\.? of (posts|vacancies)|number of (posts|vacancies))/, 'total'],
  [/^(advertisement ?\/ ?notification no|advertisement no|advt\.? no|notification no)/, 'advt'],
  [/^age limit/, 'age'],
  [/^((organi[sz]ation|institution|college|university|postal) address|address( for (communication|correspondence))?$)/, 'address'],
  [/^important dates?/, 'dates'],
  [/^important links?/, 'links'],
  [/^e-?mail( address| id)?( to apply)?/, 'email'],
  [/^contact( number| no| details| person)?/, 'contact'],
  [/^how to apply/, 'howToApply'],
  [/^(last date|closing date)/, 'lastDate'],
  [/^(date,? time and venue of interview|walk[- ]?in|interview date|date of interview)/, 'interview'],
  [/^(official website|institution official website|website)/, 'website'],
  [/^(official notification|detailed advertisement|notification link)/, 'notification'],
  [/^(application link|apply online|online application)/, 'applicationLink'],
];

function fieldOf(label: string): Field {
  const l = label.toLowerCase().replace(/[:：?]+$/, '').replace(/\s+/g, ' ').trim();
  for (const [re, f] of LABELS) if (re.test(l)) return f;
  return 'skip';
}

interface Labelled { field: Field; label: string; value: string; valueHtml: string; follow: Block[] }

/** Paragraphs that start with a bold label, each with its value and the lists/tables that follow it. */
function labelled(blocks: Block[]): Labelled[] {
  const out: Labelled[] = [];
  let cur: Labelled | null = null;
  for (const b of blocks) {
    if (b.kind === 'p' || b.kind === 'heading') {
      const m = b.html.match(/^\s*(?:<(?:strong|b)\b[^>]*>\s*)+([\s\S]*?)(?:\s*<\/(?:strong|b)>)+([\s\S]*)$/i);
      const label = m ? text(m[1]) : b.kind === 'heading' ? text(b.html) : '';
      if (label && label.length <= 90 && (m ? /[:：?]\s*$/.test(label) || /^\s*[:：]/.test(text(m[2])) || b.kind === 'heading' || /<br/i.test(m[2]) : true)) {
        const valueHtml = m ? m[2].replace(/^\s*[:：]/, '') : '';
        cur = { field: fieldOf(label), label: label.replace(/[:：]\s*$/, '').trim(), value: text(valueHtml), valueHtml, follow: [] };
        out.push(cur);
        if (cur.field === 'end') break;
        continue;
      }
      if (cur) cur.follow.push(b);
      continue;
    }
    if (b.kind === 'rule') { cur = null; continue; }
    if (cur) cur.follow.push(b);
  }
  return out;
}

// ------------------------------------------------------------------ values

const DESIGNATION = /\b(professors?|lecturers?|teachers?|faculty|instructors?|directors?|principals?|deans?|fellows?|assistants?|associates?|officers?|librarians?|registrars?|tutors?|demonstrators?|coordinators?|counsel+ors?|trainers?|head|hod|scientists?|engineers?|managers?|pgt|tgt|prt|chair(person)?|auditors?|accountants?|clerks?|counsellors?)\b/i;
const NOT_STATED = /^(not (applicable|specified|stated|mentioned|available|given|disclosed)\b.*|n\.?\s?a\.?|nil|none|-+|—)$/i;
/** A labelled value, or null when the post says it is not stated. */
const known = (v: string | null | undefined) => (v && !NOT_STATED.test(v.trim()) ? v.trim() : null);

/** Designations named inside a sentence, e.g. "The Institute is engaging Adjunct Faculty in the following departments". */
const DESIG_PHRASE = /\b((?:(?:Assistant|Associate|Adjunct|Visiting|Guest|Contractual|Senior|Junior|Full[- ]time|Part[- ]time)\s+)*(?:Professors?|Faculty|Lecturers?|Teachers?)(?:\s+of\s+Practice)?|Teaching\s+(?:Assistants?|Associates?)|Lab(?:oratory)?\s+(?:Instructors?|Demonstrators?|Assistants?)|Principals?|Librarians?|Post[- ]?Doctoral\s+Fellows?|Research\s+(?:Associates?|Assistants?|Fellows?|Scientists?)|Junior\s+Research\s+Fellows?|PGT|TGT|PRT)\b/gi;
const singular = (s: string) => s.replace(/\b(Professor|Lecturer|Teacher|Assistant|Associate|Instructor|Demonstrator|Principal|Librarian|Fellow|Scientist)s\b/g, '$1');
function designationsIn(s: string): string[] {
  return uniq([...s.matchAll(DESIG_PHRASE)].map(m => singular(m[1].replace(/\s+/g, ' ').trim())).filter(x => !/^(faculty|teachers?)$/i.test(x) || s.length < 40));
}
const SENTENCE = /\b(is|are|has|have|hiring|engaging|inviting|recruiting|following|basis|candidates|applications)\b/i;
/** A post name as written, without trailing "(1 post)" or ", to teach …". */
function cleanPost(p: string): string[] {
  const v = p.replace(/\s+/g, ' ').replace(/,?\s+to (teach|handle|take)\b.*$/i, '').replace(/\s*\(\s*\d+\s*posts?\s*\)\s*$/i, '').replace(/[.;:]+$/, '').trim();
  if (v.length >= 3 && v.length <= 80 && !SENTENCE.test(v)) return [v];
  return designationsIn(v);
}
const LEAD_IN = /^(the (college|university|institution|institute|school|organi[sz]ation)( is| has)? (hiring|inviting|recruiting|looking)|openings are available|candidates should|the following|applications are invited|vacancies? (are|is) available|selected candidates)/i;
const NON_TEACHING = /non[- ]?teaching|clerk|driver|attendant|peon|multi[- ]?tasking|\bMTS\b|accountant|cook|warden|security guard|office assistant|typist|admission counsel+or|placement officer|web specialist|digital media/i;

/** Value of a labelled paragraph plus its following list: list items when there is a list, else the value split up. */
function valuesOf(l: Labelled | undefined, split = true): string[] {
  if (!l) return [];
  const listed = l.follow.filter(b => b.kind === 'list').flatMap(b => listItems(b.html));
  if (listed.length) return listed;
  const v = l.value.replace(LEAD_IN, '').replace(/^[\s:–-]+/, '').trim();
  if (!v || NOT_STATED.test(v)) return [];
  return split ? v.split(/\s*(?:;|,(?![^()]*\))|\s\/\s|\band\b(?![^()]*\)))\s*/).map(s => s.trim()).filter(s => s.length >= 2) : [v];
}

/** Reads the posts table of the second template: designation column, subject column and the "Total" row. */
function postsTable(t: Table): { posts: string[]; departments: string[]; total: string | null } {
  const cols = Math.max(t.head.length, ...t.rows.map(r => r.cells.length));
  const body = t.rows.filter(r => !/^total$/i.test(r.cells[0]?.trim() || ''));
  const totalRow = t.rows.find(r => /^total$/i.test(r.cells[0]?.trim() || ''));
  const total = totalRow ? totalRow.cells.slice(1).reverse().find(c => /^\d+$/.test(c.trim())) || null : null;
  let desigCol = -1;
  for (let c = 0; c < cols && desigCol < 0; c++) {
    const vals = body.map(r => r.cells[c] || '').filter(Boolean);
    if (vals.length && vals.filter(v => DESIGNATION.test(v) && v.length <= 80).length / vals.length >= 0.5) desigCol = c;
  }
  const colVals = (c: number) => (c >= 0 ? uniq(body.map(r => r.cells[c]).filter(v => v && !/^\d+$/.test(v) && !NOT_STATED.test(v))) : []);
  const deptCol = t.head.findIndex((h, i) => i !== desigCol && /department|school|discipline|centre|center/i.test(h));
  const subjCol = t.head.findIndex((h, i) => i !== desigCol && i !== deptCol && /subject|speciali[sz]ation/i.test(h));
  const posts = desigCol >= 0 ? colVals(desigCol) : [];
  const dept = colVals(deptCol), subj = colVals(subjCol);
  // With a post column, the department/subject column lists departments. Without one, the first column is the
  // department unless it repeats one centre for every row, then the subjects are more useful.
  const departments = desigCol >= 0 ? (subj.length ? subj : dept) : (dept.length >= subj.length ? dept : subj);
  return { posts, departments, total };
}

/** Institution from FacultyPlus titles: "… at <Institution>, <City>", "<Institution> Wanted …", "<Institution>, <Place> 2026 – <Posts>". */
export function institutionFromTitle(title: string): string | null {
  const t = decodeEntities(title).replace(/\s+/g, ' ').replace(/\s*\((walk[- ]?in|contract|temporary)\)\s*$/i, '').trim();
  const at = t.match(/\b(?:at|in)\s+((?:[A-Z][\w.&'’-]*|of|and|for|the|&)(?:\s+(?:[A-Z][\w.&'’()-]*|of|and|for|the|&|\([^)]*\)))*(?:,\s*[A-Z][\w .'-]+)*)$/);
  if (at && /college|universit|institut|school|academy|vidyalaya|polytechnic|iit|nit|iiit|iim|aiims|centre|center|group|foundation|campus|hospital/i.test(at[1])) return at[1].trim();
  const wanted = t.match(/^(.+?)\s+(?:Wanted|Invites|Inviting|Hiring|Recruitment|Walk[- ]?in)\b/i);
  if (wanted && /college|universit|institut|school|academy/i.test(wanted[1])) return wanted[1].replace(/\s+20\d\d\s*$/, '').trim();
  const dash = t.match(/^(.+?)\s+20\d\d\s*[–-]\s+/);
  if (dash) return dash[1].trim();
  const rec = t.match(/\b(?:Recruitment|Vacancy|Vacancies|Notification|Openings?)\s+(?:20\d\d\s+)?(.+)$/i);
  if (rec && /college|universit|institut|school|academy|vidyalaya|polytechnic/i.test(rec[1])) return rec[1].replace(/^at\s+/i, '').trim();
  return null;
}

function applyModesOf(s: string): ApplyMode[] {
  const m = new Set<ApplyMode>();
  if (/walk[- ]?in/i.test(s)) m.add('walk-in');
  if (/e-?mail|@/i.test(s)) m.add('email');
  if (/online|portal|google form|website/i.test(s)) m.add('online');
  if (/\b(post(al)?|speed post|registered post|courier|hard ?copy)\b/i.test(s)) m.add('post');
  if (/in person|by hand|offline|direct/i.test(s)) m.add('offline');
  return [...m];
}

const joinPosts = (posts: string[], fallback: string) => posts.length <= 1 ? (posts[0] || fallback)
  : posts.length <= 3 ? `${posts.slice(0, -1).join(', ')} and ${posts[posts.length - 1]}`
    : `${posts.slice(0, 3).join(', ')} and ${posts.length - 3} more`;

const firstDate = (s: string | null) => (s ? datesIn(s)[0]?.iso || null : null);

// ------------------------------------------------------------------ main

export function parseFacultyPlusPost(post: WpPost, opts: { today?: string } = {}): ParsedFacultyPlusPost {
  const html = post.content?.rendered || '';
  const title = decodeEntities(post.title?.rendered || '').replace(/\s+/g, ' ').trim();
  const L = labelled(blocksOf(html));
  const one = (f: Field) => L.find(x => x.field === f);
  const all = (f: Field) => L.filter(x => x.field === f);
  const issues: string[] = [];
  const today = opts.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // Tables
  const tableAfter = (f: Field) => { const b = one(f)?.follow.find(x => x.kind === 'table'); return b ? tableOf(b.html) : null; };
  const kv = (t: Table | null) => new Map((t?.rows || []).map(r => [r.cells[0]?.replace(/[:：]\s*$/, '').trim().toLowerCase() || '', { text: r.cells[1] || '', html: r.html[1] || '' }]));
  const dates = kv(tableAfter('dates'));
  const linkRows = kv(tableAfter('links'));
  const row = (m: Map<string, { text: string; html: string }>, re: RegExp) => [...m.entries()].find(([k]) => re.test(k))?.[1];
  const stated = (v?: { text: string }) => (v && v.text && !NOT_STATED.test(v.text.trim()) ? v.text.trim() : null);

  // Institution
  let institution = one('institution')?.value.replace(/[.\s]+$/, '') || null;
  if (institution && institution.length > 160) institution = null;
  institution = institution || institutionFromTitle(title);

  // Posts and departments
  const postsLabel = one('posts');
  const pTable = postsLabel?.follow.find(b => b.kind === 'table');
  const fromTable = pTable ? postsTable(tableOf(pTable.html)) : null;
  let posts = fromTable?.posts.length ? fromTable.posts : valuesOf(postsLabel).flatMap(cleanPost);
  if (!posts.length && postsLabel) posts = designationsIn(postsLabel.value);
  posts = uniq(posts.map(p => p.replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim()).filter(p => p.length >= 3));
  const departments = uniq([
    ...(fromTable?.departments || []),
    ...all('departments').flatMap(l => {
      const t = l.follow.find(b => b.kind === 'table');
      return t ? postsTable(tableOf(t.html)).departments : valuesOf(l);
    }),
  ].map(d => d.replace(/[.;]+$/, '').trim()).filter(d => d.length >= 2 && d.length <= 200)).slice(0, 40);

  const isVacancy = !!institution && (posts.length > 0 || departments.length > 0 || DESIGNATION.test(title));
  if (!posts.length) {
    const fromTitle = title.match(/\b((?:Assistant|Associate|Adjunct|Visiting|Guest|Contractual)?\s*Professor(?:\s*\/\s*\w[\w ]*)?|Lecturers?|Teaching (?:Assistant|Associate)|Lab Instructor|Principal|Librarian|PGT [A-Za-z]+|TGT [A-Za-z]+)\b/i)?.[1];
    if (fromTitle) posts = [fromTitle.trim()];
  }
  if (!institution) issues.push('Institution name not found');
  if (!posts.length) issues.push('Post name not found');
  if (posts.some(p => NON_TEACHING.test(p)) || NON_TEACHING.test(title)) issues.push('Includes non-teaching posts');

  // Requirements (stated facts only, as short items)
  const qualificationItems = all('qualification').flatMap(l => {
    const forPost = l.label.match(/\bfor\s+(.+)$/i)?.[1];
    const vals = valuesOf(l, false).filter(v => v.length <= 400 && !NOT_STATED.test(v));
    return vals.map(v => ({ post: forPost && DESIGNATION.test(forPost) ? forPost.trim() : null, text: v }));
  }).slice(0, 15);
  const experienceItems = all('experience').flatMap(l => valuesOf(l, false)).filter(v => v.length <= 300 && !/^(both )?(experienced|freshers?) (and|&|or)/i.test(v) || /\d/.test(v)).slice(0, 8);
  const expYears = experienceItems.join(' ').match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);

  // Pay, place, type
  const salary = clip(known(one('salary')?.value) || valuesOf(one('salary'), false)[0] || null, 300);
  const locationText = clip(known(one('location')?.value), 200);
  const addressLabel = one('address');
  const address = clip(known(addressLabel ? (addressLabel.value || addressLabel.follow.filter(b => b.kind === 'p').map(b => text(b.html)).join(', ')) : null), 300);
  const loc = splitLocation(locationText || address);
  if (!loc.state) loc.state = findState(`${locationText || ''} ${address || ''} ${institution || ''} ${title}`);
  if (!loc.city && locationText) {
    const first = locationText.split(',')[0].trim();
    if (/^[A-Za-z][A-Za-z .'-]{2,30}$/.test(first) && !findState(first)) loc.city = first;
  }
  if (!loc.city && institution) {
    const tail = institution.split(',').slice(1).map(x => x.trim()).find(x => /^[A-Za-z][A-Za-z .'-]{2,30}$/.test(x) && !findState(x));
    if (tail) loc.city = tail;
  }
  const employment = clip(known(one('employment')?.value), 80);
  const total = fromTable?.total || known(one('total')?.value)?.match(/\d+/)?.[0] || null;
  const advt = clip(known(one('advt')?.value), 120);
  const age = clip(known(one('age')?.value), 300);

  // Dates
  const lastDateRaw = stated(row(dates, /^last date( to apply| for (online )?(submission|application|receipt))?$|^closing date/))
    || stated(row(dates, /last date/)) || one('lastDate')?.value || null;
  const hardCopyRaw = stated(row(dates, /hard ?copy/));
  const hardCopy = hardCopyRaw && hardCopyRaw !== lastDateRaw ? hardCopyRaw : null;
  const interviewRaw = stated(row(dates, /walk[- ]?in|interview/)) || one('interview')?.value || null;
  const notificationDate = firstDate(stated(row(dates, /notification date|date of notification|advertisement date/)));
  let deadline = lastDateFrom(lastDateRaw) || firstDate(lastDateRaw);
  let deadlineText: string | null = null;
  const interviewDate = firstDate(interviewRaw);
  if (!deadline && interviewDate) {
    deadline = interviewDate;
    issues.push('Walk-in: the closing date is the interview date');
  }
  if (!deadline) {
    if (lastDateRaw && /early|soon|immediate|until|till|rolling|open/i.test(lastDateRaw)) { deadlineText = clip(lastDateRaw, 120); issues.push('No fixed last date: set one or approve as rolling'); }
    else issues.push('Last date not found');
  }
  const expired = !!deadline && deadline < today;

  // Links and contacts: the institution's own only
  const linkOf = (re: RegExp, f: Field): string | null => {
    const r = row(linkRows, re);
    const fromRow = r ? linksIn(r.html).map(l => l.href).find(isOwnLink) || null : null;
    const lab = one(f);
    const fromLabel = lab ? [...linksIn(lab.valueHtml), ...lab.follow.flatMap(b => linksIn(b.html))].map(l => l.href).find(isOwnLink) || null : null;
    return fromRow || fromLabel;
  };
  const websiteRow = row(linkRows, /website/);
  const website = (websiteRow ? linksIn(websiteRow.html).map(l => websiteFrom(l.href) || websiteFrom(l.text)).find(Boolean) || websiteFrom(websiteRow.text) : null)
    || (() => { const l = one('website'); return l ? [...linksIn(l.valueHtml).map(x => websiteFrom(x.href) || websiteFrom(x.text)), websiteFrom(l.value)].find(Boolean) || null : null; })();
  const notification = linkOf(/official notification|notification|advertisement/, 'notification');
  const notificationRow = row(linkRows, /notification|advertisement/);
  if (!notification && notificationRow && linksIn(notificationRow.html).some(l => isFacultyPlus(l.href))) issues.push('The notification file is on FacultyPlus only: it is not linked (check it before approving)');
  else if (!notification) issues.push('No link to the official notification');
  const applicationLink = linkOf(/application link|apply online|online application|registration/, 'applicationLink');
  const emailHtml = [row(linkRows, /e-?mail/)?.html || '', one('email')?.valueHtml || '', ...(one('email')?.follow.map(b => b.html) || []), one('howToApply')?.valueHtml || '', ...(one('howToApply')?.follow.map(b => b.html) || [])].join(' ');
  const emails = emailsIn(emailHtml).slice(0, 5);
  const contact = one('contact');
  const phones = uniq((`${contact?.value || ''} ${row(linkRows, /contact|phone/)?.text || ''}`.match(PHONE_RE) || []).map(p => p.trim())).slice(0, 4);
  const applyModeText = `${one('applyMode')?.value || ''} ${emails.length ? 'email' : ''} ${applicationLink ? 'online' : ''} ${interviewRaw && /walk/i.test(`${interviewRaw} ${title}`) ? 'walk-in' : ''}`;
  const modes = applyModesOf(applyModeText);
  if (!website && !applicationLink && !notification && !emails.length) issues.push('No institution website, e-mail or link found');

  // Assemble
  const jobTitle = clip(joinPosts(posts, title), 200)!;
  const instKey = (hostOf(website || applicationLink || notification || '') || (institution || 'facultyplus').toLowerCase()).replace(/[^a-z0-9]+/gi, '');
  const importantDates = [
    ...(notificationDate ? [{ label: 'Notification date', value: stated(row(dates, /notification date/))! }] : []),
    ...(lastDateRaw ? [{ label: 'Last date to apply', value: clip(lastDateRaw, 160)! }] : []),
    ...(hardCopy ? [{ label: 'Last date for hard copy', value: clip(hardCopy, 160)! }] : []),
    ...(interviewRaw ? [{ label: 'Walk-in / interview', value: clip(interviewRaw, 200)! }] : []),
  ];
  const postGroups: JobListGroup[] = posts.length > 1 ? [{ group: null, items: posts }] : [];

  const details: JobDetails = {
    hiringOrganization: institution,
    ...(postGroups.length ? { postGroups } : {}),
    ...(total ? { numberOfPosts: total } : {}),
    ...(departments.length ? { departmentGroups: [{ group: null, items: departments }] } : {}),
    ...(qualificationItems.length ? { qualifications: qualificationItems } : {}),
    ...(experienceItems.length ? { experience: experienceItems.map(t => ({ post: null, text: t })) } : {}),
    ...(age ? { ageLimit: age } : {}),
    ...(employment ? { employmentType: employment } : {}),
    salaryText: salary,
    locationText: locationText || address,
    ...(importantDates.length ? { importantDates } : {}),
    ...(notificationDate ? { notificationDate } : {}),
    ...(lastDateRaw ? { lastDateText: clip(lastDateRaw, 160) } : {}),
    ...(interviewRaw ? { interviewText: clip(interviewRaw, 200) } : {}),
    ...(modes.length ? { applyModes: modes } : {}),
    ...(emails.length ? { applyEmails: emails.map(email => ({ email })) } : {}),
    ...(phones.length ? { contactPhones: phones } : {}),
    applicationLink,
    officialWebsite: website,
    notificationLink: notification,
    organizationAddress: address,
  };

  const job: Job = {
    id: `fp-${post.id}`,
    instituteId: `inst-${instKey}`,
    instituteName: institution || 'Institution not stated',
    instituteShortName: institution?.match(/\(([A-Z][A-Za-z.&]{1,10})\)/)?.[1] || (institution || '').split(',')[0] || 'Institution',
    instituteLogo: '',
    instituteType: null,
    title: jobTitle,
    designation: null,
    department: departments.length === 1 ? departments[0] : null,
    specializationTags: uniq(departments.map(d => d.replace(/\s*\([^)]*\)\s*/g, ' ').trim()).filter(t => t.length > 1 && t.length <= 40)).slice(0, 12),
    advertisementNumber: advt,
    location: loc,
    payScale: { cpcBand: salary, entryPay: null, grossMonthlyEstimated: null, allowances: [] },
    requiredQualifications: {
      minDegree: clip(qualificationItems.map(q => q.text).join(' ') || null, 400),
      netSletMandatory: null,
      phdNorms: null,
      minExperienceYears: expYears ? Number(expYears[1]) : null,
      experienceText: experienceItems.length ? clip(experienceItems.join(' '), 200) : null,
      minUgcCarePubs: null,
      ugcRegulationsYear: null,
      specializationRequirements: [],
    },
    reservationCategory: null,
    applicationDeadline: deadline,
    deadlineText,
    status: 'published',
    isClaimedByInstitute: false,
    screeningQuestions: [],
    selectionProcess: [],
    description: null,
    responsibilities: [],
    benefits: [],
    postedAt: (post.date || today).slice(0, 10),
    applicantCount: 0,
    featured: false,
    ...(applicationLink || notification || website ? { externalApplyUrl: (applicationLink || notification || website)! } : {}),
    // The vacancy points to the institution, never to FacultyPlus.
    source: {
      url: website || applicationLink || notification || '',
      pageTitle: null,
      extractedAt: today,
      rawText: null,
      numberOfPosts: total,
      salaryText: salary,
      kind: 'aggregator',
      siteName: null,
    },
    details,
  };
  return { isVacancy, job, issues, posts, expired };
}
