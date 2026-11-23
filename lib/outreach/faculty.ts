/*
 * Finds individual teachers' published addresses on college faculty pages (pure functions, no network).
 * Used by the administrator's "Teacher invitations" tool. Role addresses (principal@, office@, hodcse@ …)
 * are left to the institution outreach; only an address shown next to a teacher's name or designation counts.
 */
import { baseDomain, cleanEmail, deobfuscate, revealCloudflareEmails } from './extract';

export interface FoundTeacher {
  email: string;
  name: string | null;
  designation: string | null;
  department: string | null;
  onCollegeDomain: boolean;
  freeMail: boolean;
}

const FREE_MAIL = /^(gmail|yahoo|ymail|rediffmail|hotmail|outlook|live|icloud|aol|protonmail|zoho|yandex|mail)\.(com|co\.in|in)$/i;

/** Teaching posts (nearest one to the address wins). */
const DESIGNATION = /\b(professor\s*(?:&|and)\s*head|associate\s+professor|assoc\.?\s*prof\.?|assistant\s+professor|asst\.?\s*prof\.?|senior\s+lecturer|lecturer|professor\s+of\s+practice|adjunct\s+professor|visiting\s+professor|emeritus\s+professor|professor|prof\.|head\s+of\s+(?:the\s+)?department|h\.?o\.?d\.?|dean|director|teaching\s+assistant|lab(?:oratory)?\s+instructor|instructor|faculty)\b/i;
/** Posts that are not teaching staff — skipped. */
const NON_TEACHING = /\b(office\s+assistant|office\s+superintendent|accountant|clerk|cashier|driver|attender|peon|security|store\s*keeper|typist|receptionist|watchman|sweeper|electrician|plumber|warden|student|alumn)/i;
/** Local parts that are offices or departments, not people. */
const ROLE_WORDS = 'principal|director|vc|vicechancellor|dean|registrar|chairman|secretary|correspondent|ceo|head|hr|recruitment|recruit|careers|career|jobs|job|placement|placements|tpo|establishment|admin|administration|office|info|contact|enquiry|enquiries|inquiry|mail|admission|admissions|college|university|institute|reception|helpdesk|support|iqac|naac|nirf|aishe|exam|exams|coe|accounts|account|library|librarian|hod|dept|department|webmaster|web|noreply|feedback|grievance|antiragging|alumni|student|students|nss|ncc|sports|hostel|transport|purchase|stores|store|research|rnd|tnp|training|cell|club|committee|press|media|pro|ict|it|cc|computer|lab|labs|cse|ece|eee|eie|mech|civil|aiml|aids|ai|ds|cs|mba|mca|bba|bca|english|maths|math|physics|chemistry|biology|commerce|economics|history|tamil|hindi|telugu|kannada|malayalam|marathi|sanskrit|science|sciences|arts|management|pharmacy|nursing|law|education|engg|engineering|main|general|official|director|desk|team|staff|faculty|academic|academics|portal|online';
const ROLE_LOCAL = new RegExp(`^(?:(?:${ROLE_WORDS})[._-]?)+\\d*$`, 'i');
const NAME = /\b((?:Dr|DR|Prof|PROF|Mr|MR|Mrs|MRS|Ms|MS|Miss|Smt|SMT|Shri|Sri|Er|Thiru|Tmt)\.?\s+(?:[A-Z]\.\s*){0,3}[A-Z][a-zA-Z.'-]+(?:\s+(?:[A-Z]\.\s*|[A-Z][a-zA-Z.'-]+)){0,4})/;
const DEPARTMENT = /\b(?:[Dd]epartment|DEPARTMENT|[Dd]ept\.?|DEPT\.?|[Ss]chool|SCHOOL|[Dd]ivision|[Ff]aculty)\s+[Oo][Ff]\s+([A-Z][A-Za-z&,\s-]{2,60}?)(?=\s*(?:\n|$|[|•·:–—-]\s|\(|,\s*[A-Z]{2,}))/;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(amp|commat|period|nbsp);/gi, (_, e) => ({ amp: '&', commat: '@', period: '.', nbsp: ' ' } as Record<string, string>)[e.toLowerCase()]);
}

/** Page text with one line per block (table row, list item, card), mailto addresses written out. */
export function pageLines(html: string): string[] {
  const withMail = revealCloudflareEmails(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<a\b[^>]*href\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>/gi, (_, e: string) => ` ${e} `)
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|dl|dt|dd|figure|figcaption|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  return deobfuscate(decodeEntities(withMail))
    .split('\n')
    .map(l => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);
}

/** Indian-style names without a title: "G. Udhayaraj", "A. Deepa Priyadarsini", "Udhayaraj G", "R. K. Sharma". */
const INITIAL_NAME = /^(?:(?:[A-Z]\.\s*){1,3}[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3}|[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3}\s+(?:[A-Z]\.?\s*){1,3})$/;
const NOT_A_NAME = /\b(department|college|university|faculty|email|e-mail|phone|mobile|contact|professor|lecturer|head|office|more|detail|profile|qualification|experience|read|view|click|home|about)\b/i;
/** A short line near the address that is someone's name: initials style, or containing a word of the address itself. */
function plainName(lines: string[], local: string): string | null {
  const parts = local.toLowerCase().split(/[._\d-]+/).filter(w => w.length >= 4);
  for (const raw of lines) {
    const l = raw.replace(/\s*\|\s*/g, ' ').replace(/[,:;]+$/, '').trim();
    if (!l || l.length > 60 || /\d|@/.test(l) || NOT_A_NAME.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length < 1 || words.length > 6) continue;
    if (INITIAL_NAME.test(l)) return l;
    const lw = l.toLowerCase().replace(/[^a-z\s]/g, ' ');
    if (parts.some(w => lw.split(/\s+/).some(x => x.length >= 4 && (w.includes(x) || x.includes(w))))) return l;
  }
  return null;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s|,:;–—-]+|[\s|,:;–—-]+$/g, '').trim();

function designationIn(text: string): string | null {
  const m = text.match(DESIGNATION);
  if (!m) return null;
  const d = m[1].toLowerCase().replace(/\s+/g, ' ');
  if (/professor\s*(&|and)\s*head/.test(d)) return 'Professor & Head';
  if (/^h\.?o\.?d\.?$|head of/.test(d)) return 'Head of Department';
  if (/assoc/.test(d)) return 'Associate Professor';
  if (/asst|assistant professor/.test(d)) return 'Assistant Professor';
  if (/senior lecturer/.test(d)) return 'Senior Lecturer';
  if (/lecturer/.test(d)) return 'Lecturer';
  if (/instructor/.test(d)) return 'Lab Instructor';
  if (/teaching assistant/.test(d)) return 'Teaching Assistant';
  if (/dean/.test(d)) return 'Dean';
  if (/director/.test(d)) return 'Director';
  if (/faculty/.test(d)) return 'Faculty';
  return 'Professor';
}

/** Does this page look like a list of teachers? (URL or heading) */
export function isFacultyPage(url: string, lines: string[]): boolean {
  const head = lines.slice(0, 40).join(' ');
  return /faculty|staff|people|personnel|teaching|our-?team|profile|department|dept|members|directory/i.test(url) || /\b(faculty|teaching staff|faculty members|our faculty|staff profile|people)\b/i.test(head);
}

/**
 * Teachers' addresses on one page, each with the name, designation and department found next to it.
 * Only addresses on the college's own domain unless `includeFreeMail` (then a Gmail etc. address must sit next to a
 * teaching designation).
 */
export type RejectReason = 'other domain' | 'Gmail-type (switched off)' | 'office or department address' | 'non-teaching staff' | 'no name or designation next to it';
export interface Rejected { email: string; reason: RejectReason }

export function extractTeachers(html: string, pageUrl: string, opts: { includeFreeMail?: boolean; rejects?: Rejected[] } = {}): FoundTeacher[] {
  let host = '';
  try { host = new URL(pageUrl).hostname; } catch { /* ignore */ }
  const college = host ? baseDomain(host) : '';
  const lines = pageLines(html);
  const facultyPage = isFacultyPage(pageUrl, lines);
  const pageDept = lines.slice(0, 60).map(l => l.match(DEPARTMENT)?.[1]).find(Boolean) || null;
  const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
  const hasEmail = (l: string) => { EMAIL.lastIndex = 0; const r = EMAIL.test(l); EMAIL.lastIndex = 0; return r; };

  // First pass: every address with the teacher details around it.
  type Cand = FoundTeacher & { local: string; domain: string; nonTeaching: boolean; nameMatchesAddress: boolean };
  const cands = new Map<string, Cand>();
  lines.forEach((line, i) => {
    for (const m of line.matchAll(EMAIL)) {
      const email = cleanEmail(m[0]);
      if (!email || cands.has(email)) continue;
      const [local, domain] = email.split('@');
      // The address's own "card": this line and up to 4 before / 2 after, stopping at another address.
      const before: string[] = [];
      for (let k = i - 1; k >= Math.max(0, i - 4) && !hasEmail(lines[k]); k--) before.unshift(lines[k]);
      const after: string[] = [];
      for (let k = i + 1; k <= Math.min(lines.length - 1, i + 2) && !hasEmail(lines[k]); k++) after.push(lines[k]);
      const sameLine = line.replace(m[0], ' ');
      const card = [...before, sameLine, ...after].join('\n');
      const designation = designationIn(sameLine) || designationIn([...before].reverse().join('\n')) || designationIn(after.join('\n'));
      const nameMatch = sameLine.match(NAME) || [...before].reverse().map(l => l.match(NAME)).find(Boolean) || after.map(l => l.match(NAME)).find(Boolean);
      // Titled names first ("Dr. R. Kumar"), then plain names on the line itself or just above / below.
      const name = nameMatch ? tidy(nameMatch[1]).slice(0, 80)
        : plainName([sameLine, ...[...before].reverse(), ...after], local)?.slice(0, 80) ?? null;
      const nameWords = (name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
      const nameMatchesAddress = nameWords.some(w => local.toLowerCase().includes(w));
      const dm = card.match(DEPARTMENT)?.[1];
      const department = dm ? tidy(dm) : pageDept ? tidy(pageDept) : null;
      cands.set(email, { email, name, designation, department: department ? department.slice(0, 80) : null, onCollegeDomain: !!college && baseDomain(domain) === college, freeMail: FREE_MAIL.test(domain), local, domain, nonTeaching: NON_TEACHING.test(card), nameMatchesAddress });
    }
  });
  // Staff addresses are often on a different domain from the website (site on .edu.in, mail on .ac.in):
  // a non-Gmail domain used by at least 3 teachers on the page counts as the college's own.
  const perDomain = new Map<string, number>();
  for (const c of cands.values()) if (!c.freeMail && !c.onCollegeDomain && c.designation && !ROLE_LOCAL.test(c.local)) perDomain.set(baseDomain(c.domain), (perDomain.get(baseDomain(c.domain)) || 0) + 1);
  const staffDomains = new Set([...perDomain].filter(([, n]) => n >= 3).map(([d]) => d));

  const out: FoundTeacher[] = [];
  const reject = (email: string, reason: RejectReason) => { opts.rejects?.push({ email, reason }); };
  for (const c of cands.values()) {
    const ownDomain = c.onCollegeDomain || staffDomains.has(baseDomain(c.domain));
    if (!ownDomain && !c.freeMail) { reject(c.email, 'other domain'); continue; }
    if (c.freeMail && !opts.includeFreeMail) { reject(c.email, 'Gmail-type (switched off)'); continue; }
    if (ROLE_LOCAL.test(c.local)) { reject(c.email, 'office or department address'); continue; }
    if (c.nonTeaching) { reject(c.email, 'non-teaching staff'); continue; }
    if (!c.designation && !(facultyPage && c.name)) { reject(c.email, 'no name or designation next to it'); continue; }
    // Gmail-type: a teaching designation next to it, or (on a teachers' list) a name that matches the address.
    if (c.freeMail && !c.designation && !(facultyPage && c.nameMatchesAddress)) { reject(c.email, 'no name or designation next to it'); continue; }
    out.push({ email: c.email, name: c.name, designation: c.designation, department: c.department, onCollegeDomain: ownDomain, freeMail: c.freeMail });
  }
  return out;
}

const FACULTY_HINT = /faculty|staff|people|personnel|teaching|our-?team|profiles?|members|directory|departments?|dept|academics?|school-of|schools/i;
const SKIP_LINK = /student|alumni|admission|result|exam|gallery|event|news|notice|tender|download|syllabus|timetable|calendar|login|wp-login|feedback|placement-record|hostel|canteen|transport|sport/i;

/** Same-site links that probably lead to teachers' lists, best first (at most `max`). */
export function facultyLinks(html: string, baseUrl: string, max = 8): string[] {
  return facultyLinksScored(html, baseUrl, max).map(o => o.url);
}
export function facultyLinksScored(html: string, baseUrl: string, max = 8): { url: string; score: number }[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const site = baseDomain(base.hostname);
  const out: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let u: URL;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || baseDomain(u.hostname) !== site || /\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|pptx?|mp4|mp3)$/i.test(u.pathname)) continue;
    const hay = `${u.pathname} ${text}`;
    if (!FACULTY_HINT.test(hay) || SKIP_LINK.test(hay)) continue;
    const score = (/faculty|teaching staff|our faculty|personnel/i.test(hay) ? 10 : 0) + (/staff|people|profiles?|members|directory/i.test(hay) ? 6 : 0) + (/department|dept|school/i.test(hay) ? 3 : 0)
      - (/iqac|naac|nirf|annual|report|rules|regulation|programme|program|curriculum|committee|minutes|policy|seed-money|depository|grant|research-centre/i.test(hay) ? 8 : 0);
    u.hash = '';
    if (u.href !== base.href) out.push({ url: u.href, score });
  }
  const seen = new Set<string>();
  const best = new Map<string, number>();
  for (const o of out) best.set(o.url, Math.max(best.get(o.url) ?? -99, o.score));
  return [...best].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score).filter(o => (seen.has(o.url) ? false : (seen.add(o.url), true))).slice(0, max);
}

/** Usual addresses of teachers' lists, tried when a home page offers no faculty links (menus built by JavaScript). */
export const GUESSED_FACULTY_PATHS = ['/faculty', '/faculty-members', '/our-faculty', '/faculty/', '/staff', '/teaching-staff', '/departments', '/people'];
