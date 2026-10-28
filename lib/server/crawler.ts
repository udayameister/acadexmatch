/*
 * Universal academic faculty web scraper — Node.js version of scraper.py.
 *
 * Runs inside the web server itself (no Python needed), so it works on hosts such as GoDaddy
 * Node.js Hosting. Behaviour mirrors scraper.py: priority-scored crawl of recruitment pages
 * (depth 2, 12 pages), layout heuristics (tables, job cards, headings, direct links), strict
 * faculty filtering, PDF notice reading, and exact-value extraction — anything not stated in
 * the source stays null.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { Agent } from 'undici';
import type { ScrapeEngineResult, ScrapedRawOpening } from './scrapeEngine';
import { parseNotice, type ParsedNotice } from './noticeParser';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Many college sites have expired or incomplete certificates; like the Python scraper, don't reject them.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

const FACULTY_TITLE_KEYWORDS = [
  String.raw`\bprofessor\b`, String.raw`\bprof\b`, String.raw`\bassistant\s+professor\b`, String.raw`\bassociate\s+professor\b`,
  String.raw`\badjunct\s+professor\b`, String.raw`\bvisiting\s+professor\b`, String.raw`\bchair\s+professor\b`, String.raw`\bemeritus\b`,
  String.raw`\bfaculty\b`, String.raw`\bteaching\s+faculty\b`, String.raw`\bacademic\s+staff\b`, String.raw`\blecturer\b`,
  String.raw`\bsenior\s+lecturer\b`, String.raw`\breader\b`, String.raw`\binstructor\b`, String.raw`\bdean\b`, String.raw`\bpostdoc\b`,
  String.raw`\bpostdoctoral\b`, String.raw`\bresearch\s+associate\b`, String.raw`\bresearch\s+scientist\b`, String.raw`\bresearch\s+fellow\b`,
  String.raw`\bteaching\s+associate\b`, String.raw`\bteaching\s+fellow\b`, String.raw`\btenure[\s-]track\b`, String.raw`\bprincipal\s+investigator\b`,
];
const NON_FACULTY_KEYWORDS = [
  String.raw`\bdriver\b`, String.raw`\bcleaner\b`, String.raw`\bpeon\b`, String.raw`\battendant\b`, String.raw`\bplumber\b`,
  String.raw`\belectrician\b`, String.raw`\bgardener\b`, String.raw`\bcook\b`, String.raw`\bcanteen\b`, String.raw`\bsecurity\s+guard\b`,
  String.raw`\bwarden\b`, String.raw`\bnurse\b`, String.raw`\bpharmacist\b`, String.raw`\bstenographer\b`, String.raw`\bsteno\b`,
  String.raw`\btypist\b`, String.raw`\bdata\s+entry\b`, String.raw`\bclerk\b`, String.raw`\bstore\s*keeper\b`, String.raw`\boffice\s+assistant\b`,
  String.raw`\baccountant\b`, String.raw`\baccounts\s+officer\b`, String.raw`\baudit\s+officer\b`, String.raw`\bcaretaker\b`,
  String.raw`\bsweeper\b`, String.raw`\bcarpenter\b`, String.raw`\bhelper\b`, String.raw`\bbus\s+conductor\b`, String.raw`\bsports\s+coach\b`,
  String.raw`\bfitness\s+instructor\b`, String.raw`\bgym\s+(?:trainer|instructor)\b`, String.raw`\byoga\s+instructor\b`,
  String.raw`\bdriving\s+instructor\b`, String.raw`\bfaculty\s+development\s+program(?:me)?s?\b`,
  String.raw`\bdevelopment\s+program(?:me)?s?\b`, String.raw`\bfdp\b`, String.raw`\bworkshop\b`, String.raw`\bconference\b`, String.raw`\bsymposium\b`,
  String.raw`\bseminar\b`, String.raw`\bfaculty\s+profile\b`, String.raw`\bfaculty\s+directory\b`, String.raw`\bfaculty\s+list\b`,
  String.raw`\bmeet\s+our\s+faculty\b`, String.raw`\bfaculty\s+coordinator\b`, String.raw`\bfaculty\s+advisor\b`,
  String.raw`\bboard\s+of\s+studies\b`, String.raw`\bfaculty\s+exchange\b`, String.raw`\bfaculty\s+awards?\b`,
  String.raw`\bfaculty\s+achievements?\b`, String.raw`\bfaculty\s+publications?\b`, String.raw`\bexam\s+schedule\b`,
  String.raw`\bsyllabus\b`, String.raw`\bhow\s+to\s+apply\b`, String.raw`\beligibility\s+criteria\b`,
  String.raw`\bcampus\s+life\b`, String.raw`\bhostel\b`,
];
const FACULTY_RE = FACULTY_TITLE_KEYWORDS.map(p => new RegExp(p, 'i'));
const NON_FACULTY_RE = NON_FACULTY_KEYWORDS.map(p => new RegExp(p, 'i'));

const HIGH_PRIORITY: [RegExp, number][] = [
  [/positionsoffered|positions-offered/i, 150],
  [/faculty[-_]recruitment|faculty[-_]openings|faculty[-_]positions|teaching[-_]positions/i, 140],
  [/dean[-_]positions?|vc[-_]?position/i, 120],
  [/current[-_]vacanc|academic[-_]openings?|faculty[-_]vacanc/i, 110],
  [/careers?|recruitment|current[-_]openings?|vacanc|jobs?|work[-_]with[-_]us|join[-_]us/i, 70],
  [/employment|advertisements?|notifications?|notices?/i, 40],
];
const DISCARD_URL = [
  /login|signin|signup|register|admission|apply[-_]online|fees?|syllabus|curriculum|exam|result/i,
  /alumni|sports|hostel|mess|gallery|campus[-_]life|events?|news|media|stories|story/i,
  /placement|recruiters|career[-_]guidance|career[-_]competency|career[-_]services|student[-_]career/i,
  /speaker|speakers|team|author|faculty[-_]profile|faculty[-_]directory|bio/i,
  /facebook|twitter|instagram|youtube|linkedin|whatsapp|mailto:|tel:|javascript:|#/i,
  /\.(jpg|jpeg|png|gif|svg|css|js|ico|mp4|zip|rar|docx?|xlsx?)($|\?)/i,
];

const CATEGORY_LABELS = new Set([
  'faculty', 'faculty positions', 'dean positions', 'vc position', 'open positions', 'careers', 'career', 'recruitment',
  'our recruiters', 'about us', 'academics', 'programmes', 'admissions', 'campus life', 'facilities for faculty', 'innovations by the faculty',
]);
const RECRUITMENT_PHRASE_RE = /\b(recruitment|vacanc|openings?|positions?|walk[-_\s]*in|hiring|advertisements?|advt|special\s+drive|employment)\b/i;

/** True only if the item is an academic faculty or research position. */
export function isFacultyRequirement(title: string, text = ''): boolean {
  const titleLower = (title || '').toLowerCase().trim();
  const textLower = (text || '').toLowerCase();
  if (CATEGORY_LABELS.has(titleLower) || ['facilities for faculty', 'innovations by'].some(c => titleLower.includes(c))) return false;
  if (/^(?:Prof\.?|Dr\.?|Shri|Mr\.?|Ms\.?)\s+/i.test((title || '').trim())) {
    if (!/\b(in|of|for|department|school|engineering|science|arts|medicine|computing|law|assistant|associate)\b/i.test(title.trim())) return false;
  }
  const hasFaculty = FACULTY_RE.some(r => r.test(titleLower));
  const hasNon = NON_FACULTY_RE.some(r => r.test(titleLower));
  if (hasNon) return false;
  if (hasFaculty) return true;
  if (!RECRUITMENT_PHRASE_RE.test(titleLower)) return false;
  const sample = `${titleLower} ${textLower.slice(0, 1500)}`;
  const f = FACULTY_RE.filter(r => r.test(sample)).length;
  const n = NON_FACULTY_RE.filter(r => r.test(sample)).length;
  return f >= 1 && f > n;
}

// Labels used in recruitment notices; a value runs until the next label.
const FIELD_LABELS: Record<string, string> = {
  qualification: String.raw`(?:Essential\s+|Minimum\s+|Educational\s+)?Qualifications?|Eligibility(?:\s+Criteria)?`,
  experience: String.raw`(?:Minimum\s+|Desirable\s+)?Experience`,
  salary: String.raw`Salary|Pay\s*(?:Scale|Level|Band|Matrix)?|Emoluments?|Remuneration|Scale\s+of\s+Pay|Compensation`,
  deadline: String.raw`Last\s+Date(?:\s+(?:for|of)\s+(?:receipt\s+of\s+)?(?:applications?|submission))?|Closing\s+Date|Deadline|Apply\s+(?:before|by)|Due\s+Date`,
  posts: String.raw`(?:No\.?|Number)\s+of\s+(?:Posts?|Vacanc(?:y|ies)|Positions?)|Vacanc(?:y|ies)`,
  advt: String.raw`Advt\.?\s*No\.?|Advertisement\s+No\.?|Notification\s+No\.?|Ref(?:erence)?\.?\s*No\.?`,
  department: String.raw`Department|Dept\.?|School|Discipline`,
};
const ANY_LABEL = Object.values(FIELD_LABELS).map(v => `(?:${v})`).join('|');
const STOP_LABEL = ANY_LABEL.replace(/\(\?:(?:Essential|Minimum|Desirable)[^)]*\)\?/g, '');
const LABEL_RES: Record<string, RegExp> = Object.fromEntries(Object.entries(FIELD_LABELS).map(([k, v]) => [
  k, new RegExp(String.raw`(?:^|[\n|;•]|\s)(?:${v})\s*[:：\-–]\s*(.+?)(?=\s*(?:[\n|•]|\b(?:${STOP_LABEL})\s*[:：\-–]|$))`, 'i'),
]));
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Collapses whitespace and trims " .;:,|-–" like the Python _clean. */
export function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, ' ').replace(/^[ .;:,|\-–]+|[ .;:,|\-–]+$/g, '');
  return t || null;
}
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYY-MM-DD when the text has an unambiguous date, else null. */
export function parseDeadlineIso(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  let m = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/);
  if (m) {
    const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  }
  m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return `${pad(+m[1], 4)}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${pad(+m[3], 4)}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${pad(+m[3], 4)}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`;
  return null;
}

export interface FacultyDetails {
  qualification: string | null; experience: string | null; pay_level: string | null; salary: string | null;
  department: string | null; deadline: string | null; number_of_posts: string | null; advt_no: string | null;
}

const DEADLINE_VALUE = String.raw`(?:Last\s+Date|Deadline|Closing\s+Date|Apply\s+(?:before|by))[^0-9A-Za-z]{0,5}([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+[0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})`;
const ADVT_VALUE = String.raw`\b(?:Advt|Advertisement)\.?\s*No\.?\s*[:.]?\s*([A-Z0-9][A-Za-z0-9/._-]{2,40})`;

/** Qualification, experience, pay, deadline, posts, advt no. and department exactly as written; missing = null. */
export function extractFacultyDetails(title: string, text = ''): FacultyDetails {
  const combined = `${title}\n${text}`;
  const d: FacultyDetails = { qualification: null, experience: null, pay_level: null, salary: null, department: null, deadline: null, number_of_posts: null, advt_no: null };
  const target: Record<string, keyof FacultyDetails> = { salary: 'salary', posts: 'number_of_posts', advt: 'advt_no', qualification: 'qualification', experience: 'experience', deadline: 'deadline', department: 'department' };

  for (const [key, rx] of Object.entries(LABEL_RES)) {
    const m = combined.match(rx);
    if (m) {
      const val = clean(m[1]);
      if (val && val.length <= 400) d[target[key]] = val;
    }
  }

  if (!d.qualification) {
    const m = combined.match(/(Ph\.?\s?D\.?(?:\s+(?:in|with|from)\s+[^;\n|]+)?|Doctorate(?:\s+degree)?(?:\s+in\s+[^;\n|]+)?|Master(?:'s)?\s+Degree(?:\s+in\s+[^;\n|]+)?|M\.?\s?Tech\.?(?:\s+in\s+[^;\n|]+)?|M\.?E\.?\s+in\s+[^;\n|]+|(?:UGC|CSIR)[\s-]NET[^;\n|]*|NET\s*\/\s*S?L?ET[^;\n|]*)/i);
    if (m) {
      let q = m[0].split(new RegExp(String.raw`\s+(?:${ANY_LABEL})\s*[:：\-–]`, 'i'))[0];
      q = q.split(/\s+(?:Minimum\s+\d+|\d+\s+years?)\b/i)[0];
      d.qualification = clean(q);
    }
  }
  if (!d.experience) {
    const m = combined.match(/((?:Minimum\s+(?:of\s+)?)?\d+(?:\.\d+)?\+?\s*(?:years?|yrs?)\b[^;\n|]*?experience[^;\n|]*)/i);
    if (m) d.experience = clean(m[0].split(new RegExp(String.raw`\s*(?:${ANY_LABEL})\s*[:：\-–]`, 'i'))[0]);
  }
  if (!d.salary) {
    const m = combined.match(/((?:As\s+per\s+)?(?:the\s+)?(?:revised\s+)?(?:AICTE|UGC|7th\s+CPC|6th\s+CPC|Institute|University)\s+(?:Pay\s*scales?|Pay\s+Matrix|norms|scale\s+of\s+pay)[^;\n|.]*|(?:Rs\.?|INR|₹)\s*[\d.,]+(?:\s*(?:-|to|–)\s*(?:Rs\.?|INR|₹)?\s*[\d.,]+)?(?:\s*(?:LPA|Lakhs?|per\s+annum|p\.?a\.?|pm|per\s+month))?|(?:Pay|Academic)\s+Level[\s-]*\d+[A-Za-z]?(?:\s*\([^)]*\))?|Level[\s-]*\d+[A-Za-z]?\s*\([^)]*\)|Consolidated\s+(?:pay|salary)[^;\n|.]*|Negotiable|Best\s+in\s+the\s+industry)/i);
    if (m) d.salary = clean(m[0]);
  }
  if (d.salary) {
    const lvl = d.salary.match(/(?:Pay\s+|Academic\s+)?Level[\s-]*\d+[A-Za-z]?(?:\s*\([^)]*\))?/i);
    if (lvl) d.pay_level = clean(lvl[0]);
  }
  if (!d.department) {
    const m = combined.match(/(?:Department|Dept\.?|School|Discipline)\s+of\s+([A-Z][A-Za-z\s&,()]+?)(?=[,.\n|;]|$)/);
    if (m) d.department = clean(m[0]);
  }
  if (!d.deadline) {
    const m = combined.match(new RegExp(DEADLINE_VALUE, 'i'));
    if (m) d.deadline = clean(m[1]);
    else {
      const r = combined.match(/rolling\s+(?:advertisement|basis|recruitment)\b|\bopen\s+till\s+filled\b/i);
      if (r) d.deadline = clean((combined.match(/rolling\s+\w+|open\s+till\s+filled/i) || [r[0]])[0]);
    }
  }
  if (!d.advt_no) {
    const m = combined.match(new RegExp(ADVT_VALUE, 'i'));
    if (m) d.advt_no = clean(m[1]);
  }
  return d;
}

const hostKey = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace('www.', ''); } catch { return null; } };

/** Relevance score of a link for faculty recruitment; negative means skip. */
export function scoreLink(href: string, text: string, baseUrl: string): number {
  const combined = `${href} ${text}`.toLowerCase();
  // Check only the path and query, so a domain such as "examcollege.edu" or "newsteam.ac.in" is not discarded.
  let local = href;
  try { const u = new URL(href); if (u.protocol === 'http:' || u.protocol === 'https:') local = `${u.pathname}${u.search}${u.hash}`; } catch { /* keep href */ }
  for (const p of DISCARD_URL) {
    if (p.test(local) && !(href.toLowerCase().endsWith('.pdf') && ['faculty', 'recruit', 'prof', 'advt'].some(k => combined.includes(k)))) return -100;
  }
  const base = hostKey(baseUrl);
  const target = hostKey(href);
  if (base === null || target === null) return -100;
  if (target && target !== base && !target.endsWith(`.${base}`)) return -100;
  let score = 0;
  for (const [p, w] of HIGH_PRIORITY) {
    if (p.test(href)) score += w;
    if (p.test(text)) score += w;
  }
  return score;
}

// ------------------------------------------------------------------ fetching

async function get(url: string, timeoutMs: number) {
  return fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), dispatcher: insecureAgent } as RequestInit);
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await get(url, 15000);
    if (res.status !== 200) return null;
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (ctype.includes('pdf') || buf.subarray(0, 5).toString('latin1') === '%PDF-' || !(ctype.includes('html') || ctype.includes('xml') || ctype.startsWith('text/') || !ctype)) return null;
    const html = buf.toString('utf8');
    const finalUrl = res.url || url;
    const head = cheerio.load(html.slice(0, 2000));
    const meta = head('meta').filter((_, el) => /refresh/i.test(head(el).attr('http-equiv') || '')).first();
    const m = (meta.attr('content') || '').match(/url=([^\s;]+)/i);
    if (m) {
      const target = new URL(m[1].replace(/^['"]|['"]$/g, ''), finalUrl).toString();
      if (target !== finalUrl) {
        const r2 = await get(target, 15000);
        if (r2.status === 200) return { html: await r2.text(), finalUrl: r2.url || target };
      }
    }
    return { html, finalUrl };
  } catch {
    return null;
  }
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 15;
const MAX_PDFS_PER_CRAWL = 8;
const PDF_HINT_RE = /recruit|faculty|professor|advt|advertisement|vacanc|teaching|notification|career|job/i;
const DESIGNATION_SRC = String.raw`\b(?:Assistant|Associate)\s+Professor\b|\bProfessor\b|\bLecturer\b|\bPrincipal\b|\bDirector\b|\bDean\b`;
const isPdfUrl = (u: string) => /\.pdf($|[?#])/i.test(u);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reads the text of a PDF notice; returns [text, note]. */
async function fetchPdfText(url: string): Promise<[string | null, string | null]> {
  try {
    const res = await get(url, 25000);
    if (res.status !== 200) return [null, `PDF not available (HTTP ${res.status})`];
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_PDF_BYTES) return [null, 'PDF is larger than 10 MB'];
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) return [null, 'PDF is larger than 10 MB'];
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return [null, 'Link is not a PDF'];
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PDF_PAGES); i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let s = '';
        for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
          s += item.str ?? '';
          s += item.hasEOL ? '\n' : (item.str ? ' ' : '');
        }
        pages.push(s);
      } catch { pages.push(''); }
    }
    let text = pages.join('\n').replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    text = text.split('\n').map(l => l.trim()).join('\n');
    if (text.length < 60) return [null, 'Scanned PDF (no readable text)'];
    return [text, null];
  } catch (e) {
    return [null, `Could not read PDF (${(e as Error).name || 'error'})`];
  }
}

/** The part of a multi-post notice that belongs to this position, and whether that could be determined. */
function pdfSegmentFor(position: string, text: string): [string, boolean] {
  const designations = new Set([...text.matchAll(new RegExp(DESIGNATION_SRC, 'gi'))].map(m => m[0].toLowerCase().replace(/\s+/g, ' ')));
  if (designations.size <= 1) return [text, true];
  const own = position.match(new RegExp(DESIGNATION_SRC, 'i'));
  if (!own) return [text, false];
  const key = own[0].split(/\s+/).map(escapeRe).join(String.raw`\s+`);
  const m = new RegExp(String.raw`^\s*${key}\b`, 'im').exec(text) || new RegExp(String.raw`(?<![A-Za-z]\s)${key}\b`, 'i').exec(text);
  if (!m) return [text, false];
  const start = m.index;
  const rx = new RegExp(DESIGNATION_SRC, 'gi');
  rx.lastIndex = m.index + m[0].length;
  let next: RegExpExecArray | null = null;
  for (let d = rx.exec(text); d; d = rx.exec(text)) {
    if (d[0].toLowerCase() !== own[0].toLowerCase()) { next = d; break; }
  }
  const end = next ? next.index : Math.min(text.length, start + 2500);
  return [text.slice(start, end), true];
}

function pdfTitle(text: string): string | null {
  for (const raw of text.split('\n').slice(0, 40)) {
    const line = raw.trim();
    if (line.length > 10 && line.length < 160 && isFacultyRequirement(line)) return clean(line);
  }
  return null;
}

function pdfPostHeadings(text: string): string[] {
  const out: string[] = [];
  const startRe = new RegExp(String.raw`^(?:${DESIGNATION_SRC})`, 'i');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length >= 5 && line.length <= 80 && startRe.test(line) && !line.includes(':')) {
      const c = clean(line);
      if (c && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

function noticeWideValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, src] of [['deadline', DEADLINE_VALUE], ['advt_no', ADVT_VALUE]] as const) {
    const vals = new Set([...text.matchAll(new RegExp(src, 'gi'))].map(m => clean(m[1])).filter(Boolean) as string[]);
    if (vals.size === 1) out[key] = [...vals][0];
  }
  return out;
}

interface RawItem {
  position: string; department: string | null; description: string; source_url: string; layout: string;
  pdf_text?: string; pdf_wide?: Record<string, string>; pdf_note?: string | null;
  /** Set when the page is a full recruitment advertisement read section by section. */
  notice?: ParsedNotice;
}

/** A page with this many recognised sections (posts, qualifications, dates, how to apply...) is read as one advertisement. */
export const NOTICE_MIN_SECTIONS = 4;

async function enrichFromPdfs(openings: RawItem[], pdfLinks: [string, string][]): Promise<RawItem[]> {
  let budget = MAX_PDFS_PER_CRAWL;
  const cache = new Map<string, [string | null, string | null]>();
  const textFor = async (url: string): Promise<[string | null, string | null]> => {
    if (!cache.has(url)) {
      if (budget <= 0) return [null, 'PDF limit for one run reached'];
      budget--;
      cache.set(url, await fetchPdfText(url));
    }
    return cache.get(url)!;
  };
  const known = new Set(openings.map(o => o.source_url));
  for (const [url, anchor] of pdfLinks) {
    if (known.has(url)) continue;
    const [text] = await textFor(url);
    if (!text || !isFacultyRequirement(anchor || '', text.slice(0, 3000))) continue;
    const title = pdfTitle(text);
    if (!title) continue;
    known.add(url);
    const posts = pdfPostHeadings(text);
    if (posts.length >= 2) for (const h of posts) openings.push({ position: h, department: null, description: h, source_url: url, layout: 'PDF Notice' });
    else openings.push({ position: title, department: null, description: title, source_url: url, layout: 'PDF Notice' });
  }
  for (const item of openings) {
    if (!isPdfUrl(item.source_url || '')) continue;
    const [text, note] = await textFor(item.source_url);
    if (!text) { item.pdf_note = note; continue; }
    const [segment, certain] = pdfSegmentFor(item.position, text);
    item.pdf_text = certain ? segment : '';
    item.pdf_wide = noticeWideValues(text);
    item.pdf_note = certain ? null : 'Notice lists several posts; only notice-wide details (last date, advertisement no.) were used';
  }
  return openings;
}

// ------------------------------------------------------------------ page extraction

/** BeautifulSoup get_text(" ", strip=True): text nodes trimmed and joined by single spaces. */
function textOf(node: AnyNode | AnyNode[]): string {
  const parts: string[] = [];
  const walk = (n: AnyNode) => {
    if (n.type === 'text') { const t = (n as unknown as { data: string }).data.trim(); if (t) parts.push(t); }
    else if ('children' in n) for (const c of (n as Element).children) walk(c);
  };
  (Array.isArray(node) ? node : [node]).forEach(walk);
  return parts.join(' ');
}
const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const resolve = (base: string, href: string) => { try { return new URL(href, base).toString(); } catch { return base; } };

function extractFacultyFromPage($: cheerio.CheerioAPI, pageUrl: string): RawItem[] {
  const openings: RawItem[] = [];
  const seen = new Set<string>();

  // 1. Tables
  let currentDept: string | null = null;
  $('table').each((_, table) => {
    let headers: string[] = [];
    $(table).find('tr').each((__, row) => {
      const cells = $(row).find('td,th').toArray();
      if (!cells.length) return;
      if (cells.every(c => (c as Element).tagName === 'th')) { headers = cells.map(c => ws(textOf(c))); return; }
      const texts = cells.map(c => ws(textOf(c)));
      const labelled = headers.length && headers.length === texts.length
        ? texts.map((v, i) => (v ? (headers[i] ? `${headers[i]}: ${v}` : v) : '')).filter(Boolean)
        : texts;
      if (texts.length === 1) {
        if (texts[0].length < 140 && !isFacultyRequirement(texts[0])) currentDept = texts[0];
        return;
      }
      let pos: string | null = null;
      let desc = '';
      let dept = currentDept;
      const link = $(row).find('a[href]').first();
      const applyLink = link.length ? resolve(pageUrl, link.attr('href')!) : pageUrl;
      if (texts.length >= 3) {
        if (isFacultyRequirement(texts[1])) { dept = texts[0]; currentDept = dept; pos = texts[1]; desc = labelled.slice(2).join(' | '); }
        else if (isFacultyRequirement(texts[0])) { pos = texts[0]; dept = currentDept; desc = labelled.slice(1).join(' | '); }
        else if (isFacultyRequirement(texts[2])) { dept = texts[1]; currentDept = dept; pos = texts[2]; desc = labelled.slice(3).join(' | '); }
      } else if (texts.length === 2) {
        if (isFacultyRequirement(texts[0])) { pos = texts[0]; desc = texts[1]; }
        else if (isFacultyRequirement(texts[1])) { pos = texts[1]; desc = texts[0]; }
      }
      if (pos && isFacultyRequirement(pos, desc)) {
        const key = `${pos.toLowerCase().trim()}_${String(dept).toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          openings.push({ position: pos, department: dept, description: desc, source_url: applyLink, layout: 'HTML Table' });
        }
      }
    });
  });

  // 2. Job cards & accordions
  const CARD_CLASS = /job|career|vacancy|opening|position|post|accordion|card/i;
  $('div,li,section,article').each((_, card) => {
    const classes = ($(card).attr('class') || '').split(/\s+/).filter(Boolean);
    if (!classes.some(c => CARD_CLASS.test(c))) return;
    const titleEl = $(card).find('h1,h2,h3,h4,h5,h6,strong,a').first();
    if (!titleEl.length) return;
    const rawTitle = ws(textOf(titleEl[0]));
    const full = ws(textOf(card));
    if (isFacultyRequirement(rawTitle, full) && rawTitle.length > 5 && rawTitle.length < 140 && !seen.has(rawTitle)) {
      seen.add(rawTitle);
      const link = $(card).find('a[href]').first();
      openings.push({ position: rawTitle, department: null, description: full, source_url: link.length ? resolve(pageUrl, link.attr('href')!) : pageUrl, layout: 'Job Card' });
    }
  });

  // 3. Headings with the following description
  $('h2,h3,h4,h5').each((_, h) => {
    const title = ws(textOf(h));
    if (!isFacultyRequirement(title) || title.length > 140 || seen.has(title)) return;
    const parts: string[] = [];
    let cur = (h as Element).nextSibling;
    while (cur && parts.length < 3) {
      const t = textOf(cur);
      if (t) parts.push(t);
      cur = cur.nextSibling;
    }
    seen.add(title);
    const link = $(h).find('a[href]').first();
    openings.push({ position: title, department: null, description: parts.join(' '), source_url: link.length ? resolve(pageUrl, link.attr('href')!) : pageUrl, layout: 'Heading Section' });
  });

  // 4. Direct opening links
  $('a[href]').each((_, a) => {
    const raw = ($(a).attr('href') || '').trim();
    const low = raw.toLowerCase();
    if (['/speaker/', '/speakers/', '/team/', '/author/', '/profile/', '/people/', '/category/', '/doctoral/', '/centers/'].some(b => low.includes(b))) return;
    const text = ws(textOf(a));
    if (text.length > 8 && text.length < 180 && isFacultyRequirement(text) && !seen.has(text)) {
      seen.add(text);
      openings.push({ position: text, department: null, description: text, source_url: resolve(pageUrl, raw), layout: 'Direct Job Link' });
    }
  });
  return openings;
}

// ------------------------------------------------------------------ crawl

/** Crawls a college website (depth 2, 12 pages) for faculty recruitment openings. */
export async function crawlCollege(startInput: string, maxPages = 12, maxDepth = 2, deadlineMs = 55000): Promise<ScrapeEngineResult & { pdf_notices_read: number; advertisement_pages_read: number; total_openings: number }> {
  const startUrl = /^https?:\/\//i.test(startInput) ? startInput : `https://${startInput}`;
  const started = Date.now();
  const queue: [number, number, string][] = [[-200, 0, startUrl]];
  const visited = new Set<string>();
  const hubs: string[] = [];
  let raw: RawItem[] = [];
  const pdfLinks: [string, string][] = [];
  let institutionTitle = '';
  let pagesCrawled = 0;

  const popMin = () => {
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      const [a, b] = [queue[i], queue[best]];
      if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) best = i;
    }
    return queue.splice(best, 1)[0];
  };

  while (queue.length && pagesCrawled < maxPages && Date.now() - started < deadlineMs) {
    const [, depth, currentUrl] = popMin();
    const cleanUrl = currentUrl.split('#')[0].replace(/\/+$/, '');
    if (visited.has(cleanUrl)) continue;
    visited.add(cleanUrl);
    pagesCrawled++;
    const page = await fetchHtml(currentUrl);
    if (!page) continue;
    const $ = cheerio.load(page.html);
    if (!institutionTitle) institutionTitle = $('title').first().text().trim();
    const base = page.finalUrl || currentUrl;

    // A full advertisement page (posts, departments, qualifications, dates, how to apply...) becomes
    // one vacancy with every section kept, instead of one thin vacancy per post name.
    const notice = parseNotice(page.html, base);
    if (notice.sectionsFound >= NOTICE_MIN_SECTIONS && (notice.allPosts.length || notice.details.qualifications?.length)) {
      if (!raw.some(r => r.notice && r.source_url === base)) {
        raw.push({ position: notice.title || notice.allPosts[0] || 'Recruitment notification', department: null, description: notice.details.summary || '', source_url: base, layout: 'Advertisement Page', notice });
      }
      if (!hubs.includes(base)) hubs.push(base);
      // The start URL itself is an advertisement (often on a job-listing site): do not wander off into
      // the rest of that site. Elsewhere, an advertisement page's own links are not followed either.
      if (depth === 0) break;
      continue;
    }
    $('script,style,noscript,svg').remove();

    const found = extractFacultyFromPage($, base);
    if (found.length) {
      raw = raw.concat(found);
      if (!hubs.includes(base)) hubs.push(base);
    }

    $('a[href]').each((_, a) => {
      const href = ($(a).attr('href') || '').trim();
      if (!href || href.startsWith('#')) return;
      const abs = resolve(base, href);
      const anchor = textOf(a);
      if (isPdfUrl(abs)) {
        if (PDF_HINT_RE.test(`${abs} ${anchor}`) && !pdfLinks.some(([u]) => u === abs)) pdfLinks.push([abs, anchor]);
        return;
      }
      if (depth >= maxDepth) return;
      if (visited.has(abs.split('#')[0].replace(/\/+$/, ''))) return;
      const score = scoreLink(abs, anchor, startUrl);
      if (score > 0) queue.push([-score, depth + 1, abs]);
    });
  }

  const notices = raw.filter(r => r.notice);
  const noticeUrls = new Set(notices.map(n => n.source_url.replace(/\/+$/, '')));
  raw = await enrichFromPdfs(raw.filter(r => !r.notice && !noticeUrls.has(r.source_url.split('#')[0].replace(/\/+$/, ''))), pdfLinks);

  const openings: ScrapedRawOpening[] = notices.map(n => noticeToOpening(n.notice!, n.source_url));
  const dedup = new Set<string>();
  for (const item of raw) {
    const pos = item.position;
    const desc = item.description || '';
    const details = extractFacultyDetails(pos, desc);
    let fromPdf = false;
    if (item.pdf_text) {
      const p = extractFacultyDetails(pos, item.pdf_text);
      for (const k of Object.keys(p) as (keyof FacultyDetails)[]) if (p[k] && !details[k]) { details[k] = p[k]; fromPdf = true; }
    }
    for (const [k, v] of Object.entries(item.pdf_wide || {})) {
      const key = k as keyof FacultyDetails;
      if (v && !details[key]) { details[key] = v; fromPdf = true; }
    }
    const dept = item.department || details.department;
    const key = `${pos.toLowerCase().replace(/[^a-z0-9]/g, '')}_${String(dept || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    let body = desc.startsWith(pos) ? desc.slice(pos.length).trim() : desc;
    if (!body && item.pdf_text) body = item.pdf_text;
    const rawText = ws(body ? `${pos} | ${body}` : pos);
    openings.push({
      position: pos,
      department: clean(dept),
      qualification: details.qualification,
      experience: details.experience,
      pay_scale: details.pay_level || details.salary,
      pay_level: details.pay_level,
      salary: details.salary,
      deadline: details.deadline,
      deadline_iso: parseDeadlineIso(details.deadline),
      number_of_posts: details.number_of_posts,
      advt_no: details.advt_no,
      description: rawText ? rawText.slice(0, 1500) : null,
      source_url: item.source_url || startUrl,
      extraction_layout: item.layout || 'Direct',
      details_from_pdf: fromPdf,
      pdf_note: item.pdf_note ?? null,
    });
  }
  return {
    start_url: startUrl,
    institution_title: institutionTitle || null,
    pages_crawled: pagesCrawled,
    career_hubs_discovered: hubs,
    pdf_notices_read: raw.filter(o => o.pdf_text).length,
    advertisement_pages_read: notices.length,
    total_openings: openings.length,
    openings,
  };
}

/** Maps a parsed advertisement page to one scraped opening (all sections kept in `details`). */
export function noticeToOpening(n: ParsedNotice, url: string): ScrapedRawOpening {
  const d = n.details;
  const join = (xs?: { post: string | null; text: string }[]) => xs?.length ? xs.map(x => (x.post ? `${x.post}: ${x.text}` : x.text)).join('; ') : null;
  const posts = n.allPosts;
  return {
    position: n.title || posts[0] || 'Recruitment notification',
    department: d.departmentGroups?.length === 1 && d.departmentGroups[0].items.length === 1 ? d.departmentGroups[0].items[0] : null,
    qualification: join(d.qualifications),
    experience: join(d.experience),
    pay_scale: d.salaryText ?? null,
    salary: d.salaryText ?? null,
    pay_level: null,
    deadline: d.lastDateText ?? null,
    deadline_iso: n.deadlineIso,
    number_of_posts: d.numberOfPosts ?? null,
    advt_no: null,
    description: ws([d.summary, posts.length ? `Posts: ${posts.join(', ')}` : ''].filter(Boolean).join(' | ')).slice(0, 1500) || null,
    source_url: url,
    extraction_layout: 'Advertisement Page',
    details_from_pdf: false,
    pdf_note: null,
    details: d,
    institution_name: d.hiringOrganization ?? null,
    city: n.city,
    state: n.state,
    date_posted: n.datePosted,
    title: n.title,
  };
}
