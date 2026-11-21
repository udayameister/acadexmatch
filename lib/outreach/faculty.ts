/*
 * Finds individual teachers' published addresses on college faculty pages (pure functions, no network).
 * Used by the administrator's "Teacher invitations" tool. Role addresses (principal@, office@, hodcse@ …)
 * are left to the institution outreach; only an address shown next to a teacher's name or designation counts.
 */
import { baseDomain, cleanEmail, deobfuscate } from './extract';

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
  const withMail = html
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
  return /faculty|staff|people|teaching|our-?team|profile|department|dept|members|directory/i.test(url) || /\b(faculty|teaching staff|faculty members|our faculty|staff profile|people)\b/i.test(head);
}

/**
 * Teachers' addresses on one page, each with the name, designation and department found next to it.
 * Only addresses on the college's own domain unless `includeFreeMail` (then a Gmail etc. address must sit next to a
 * teaching designation).
 */
export function extractTeachers(html: string, pageUrl: string, opts: { includeFreeMail?: boolean } = {}): FoundTeacher[] {
  let host = '';
  try { host = new URL(pageUrl).hostname; } catch { /* ignore */ }
  const college = host ? baseDomain(host) : '';
  const lines = pageLines(html);
  const facultyPage = isFacultyPage(pageUrl, lines);
  const pageDept = lines.slice(0, 60).map(l => l.match(DEPARTMENT)?.[1]).find(Boolean) || null;
  const out = new Map<string, FoundTeacher>();
  const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(EMAIL)) {
      const email = cleanEmail(m[0]);
      if (!email || out.has(email)) continue;
      const [local, domain] = email.split('@');
      const onCollegeDomain = !!college && baseDomain(domain) === college;
      const freeMail = FREE_MAIL.test(domain);
      if (!onCollegeDomain && !(freeMail && opts.includeFreeMail)) continue;
      if (ROLE_LOCAL.test(local)) continue;
      // The address's own "card": this line and up to 4 before / 2 after, stopping at another address.
      const before: string[] = [];
      for (let k = i - 1; k >= Math.max(0, i - 4); k--) { if (EMAIL.test(lines[k])) { EMAIL.lastIndex = 0; break; } EMAIL.lastIndex = 0; before.unshift(lines[k]); }
      const after: string[] = [];
      for (let k = i + 1; k <= Math.min(lines.length - 1, i + 2); k++) { if (EMAIL.test(lines[k])) { EMAIL.lastIndex = 0; break; } EMAIL.lastIndex = 0; after.push(lines[k]); }
      const sameLine = line.replace(m[0], ' ');
      const card = [...before, sameLine, ...after].join('\n');
      if (NON_TEACHING.test(card)) continue;
      const designation = designationIn(sameLine) || designationIn([...before].reverse().join('\n')) || designationIn(after.join('\n'));
      const nameMatch = sameLine.match(NAME) || [...before].reverse().map(l => l.match(NAME)).find(Boolean) || after.map(l => l.match(NAME)).find(Boolean);
      const name = nameMatch ? tidy(nameMatch[1]).slice(0, 80) : null;
      if (!designation && !(facultyPage && name)) continue;
      if (freeMail && !designation) continue;
      const department = card.match(DEPARTMENT)?.[1] ? tidy(card.match(DEPARTMENT)![1]) : pageDept ? tidy(pageDept) : null;
      out.set(email, { email, name, designation, department: department ? department.slice(0, 80) : null, onCollegeDomain, freeMail });
    }
  });
  return [...out.values()];
}

const FACULTY_HINT = /faculty|staff|people|teaching|our-?team|profiles?|members|directory|departments?|dept|academics?|school-of|schools/i;
const SKIP_LINK = /student|alumni|admission|result|exam|gallery|event|news|notice|tender|download|syllabus|timetable|calendar|login|wp-login|feedback|placement-record|hostel|canteen|transport|sport/i;

/** Same-site links that probably lead to teachers' lists, best first (at most `max`). */
export function facultyLinks(html: string, baseUrl: string, max = 8): string[] {
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
    const score = (/faculty|teaching staff|our faculty/i.test(hay) ? 10 : 0) + (/staff|people|profiles?|members|directory/i.test(hay) ? 6 : 0) + (/department|dept|school/i.test(hay) ? 3 : 0);
    u.hash = '';
    if (u.href !== base.href) out.push({ url: u.href, score });
  }
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter(o => (seen.has(o.url) ? false : (seen.add(o.url), true))).slice(0, max).map(o => o.url);
}
