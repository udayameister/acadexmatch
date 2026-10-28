/*
 * Reads a single recruitment advertisement page — an institution's notice or a job-listing site such as
 * FacultyPlus — into structured fields. Pages like these are written as labelled sections:
 *
 *   <p><strong>Date Posted:</strong> October 28, 2026</p>
 *   <p><strong>Academic Posts</strong></p><ul><li>Director</li>…</ul>
 *   <p><strong>Important Dates:</strong></p><table>…</table>
 *
 * The parser walks the content in order, recognises the section labels, and collects the text, lists
 * and tables under each one. It also reads schema.org JobPosting JSON-LD and decodes e-mail addresses
 * hidden by Cloudflare. Only values that are actually on the page are returned.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { ApplyMode, JobDetails, JobListGroup, PostRequirement } from '@/types';

type Section =
  | 'datePosted' | 'organization' | 'posts' | 'departments' | 'numberOfPosts' | 'qualifications' | 'preferred'
  | 'experience' | 'profile' | 'responsibilities' | 'salary' | 'location' | 'dates' | 'lastDate' | 'interview'
  | 'notificationDate' | 'applyMode' | 'howToApply' | 'procedure' | 'documents' | 'links' | 'address'
  | 'benefits' | 'fee' | 'age' | 'selection' | 'reservation' | 'stop';

/** Section labels, checked in order (more specific first). */
const SECTIONS: [RegExp, Section][] = [
  [/^(frequently asked|faqs?\b|disclaimer|reference source|related (posts|jobs)|share this|also read|tags?\b|join (our|us on))/i, 'stop'],
  [/^(date posted|posted on|published on|date of (posting|publication))/i, 'datePosted'],
  [/^(hiring organi[sz]ation|organi[sz]ation name|name of (the )?(organi[sz]ation|institut\w*|universit\w*|college|employer)|recruiting (organi[sz]ation|institut\w*)|employer)/i, 'organization'],
  [/^(organi[sz]ation|institut\w*|universit\w*|college|campus|postal|correspondence|contact)? ?address\b/i, 'address'],
  [/^(vacanc\w* (available )?in (the )?departments?|departments?|disciplines?|subjects?|speciali[sz]ations?|branches|areas? of speciali[sz]ation|vacancy available in)/i, 'departments'],
  [/^(no\.? of (posts|vacancies|positions)|number of (posts|vacancies|positions)|total (posts|vacancies|positions)|vacancy count)/i, 'numberOfPosts'],
  [/^(job title|designation|name of (the )?posts?|posts? (name|available|advertised)|positions?( available| advertised)?$|vacanc(y|ies)( details)?$|openings?$)/i, 'posts'],
  [/^(preferred|desirable|desired) (qualifications?|requirements?|criteria)|^desirables?\b/i, 'preferred'],
  [/^((required|essential|minimum|educational|academic) )?(qualifications?|eligibility( criteria)?)\b/i, 'qualifications'],
  [/^((required|minimum|relevant|teaching|work|desired) )?experience\b/i, 'experience'],
  [/^(candidate profile|skills( required)?|key skills|competenc)/i, 'profile'],
  [/^(responsibilit|duties|job (description|responsibilit)|role( and responsibilities)?\b|key responsibilit)/i, 'responsibilities'],
  [/^(salary|pay( scale| level| band| matrix)?\b|remuneration|emoluments|compensation|stipend)/i, 'salary'],
  [/^(job location|location|place of (posting|work)|work location)/i, 'location'],
  [/^(important dates?|key dates|schedule)/i, 'dates'],
  [/^(last date|closing date|deadline|application deadline|due date)/i, 'lastDate'],
  [/^(walk[- ]?in|interview( date)?|date of interview)/i, 'interview'],
  [/^(newspaper notification date|notification date|advertisement date|date of advertisement)/i, 'notificationDate'],
  [/^(apply mode|mode of (application|applying)|application mode)/i, 'applyMode'],
  [/^how to apply/i, 'howToApply'],
  [/^(application (procedure|process)|procedure( to apply)?|steps to apply)/i, 'procedure'],
  [/^(documents? (required|to be (submitted|enclosed))|enclosures|attachments required)/i, 'documents'],
  [/^(important links?|useful links?|links)\b/i, 'links'],
  [/^(benefits|perks|why join|facilities)/i, 'benefits'],
  [/^(application fee|fee details|fees?)\b/i, 'fee'],
  [/^age( limit)?\b/i, 'age'],
  [/^(selection (process|procedure|criteria)|mode of selection)/i, 'selection'],
  [/^(reservation|category[- ]wise)/i, 'reservation'],
];

function sectionOf(label: string): Section | null {
  const l = label.replace(/^[\s\d.)-]+/, '').trim();
  for (const [re, s] of SECTIONS) if (re.test(l)) return s;
  return null;
}

const ws = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const stripColon = (s: string) => ws(s).replace(/[:\-–—]+$/, '').trim();
const NOT_STATED = /^(not (specified|mentioned|available|applicable|printed|disclosed)|n\.?a\.?|nil|none|-+)$/i;

/** Cloudflare "email protection": hex string, first byte is the XOR key. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(out) ? out : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD from "October 28, 2026", "28 Oct 2026", "28-10-2026", "2026-10-28"; null if unclear. */
export function parseDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (m && +m[2] <= 12 && +m[1] <= 31) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`;
  return null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Director: Ph.D." → { post: 'Director', text: 'Ph.D.' }; lines without a short "post:" prefix keep post null. */
function requirement(line: string): PostRequirement {
  const m = line.match(/^([^:]{2,120}?)\s*[:–—-]\s+(.+)$/);
  if (m && !/^https?$/i.test(m[1]) && m[1].split(/\s+/).length <= 16) return { post: ws(m[1]), text: ws(m[2]) };
  return { post: null, text: ws(line) };
}

function modesFrom(text: string): ApplyMode[] {
  const t = text.toLowerCase();
  const out: ApplyMode[] = [];
  if (/\bonline\b|portal|website|google form|apply link/.test(t)) out.push('online');
  if (/e-?mail|mail (your|the|their|cv|resume)/.test(t)) out.push('email');
  if (/walk[- ]?in/.test(t)) out.push('walk-in');
  if (/\bby post\b|speed post|registered post|courier|postal/.test(t)) out.push('post');
  if (/\boffline\b|in person|hand(ed)? over/.test(t)) out.push('offline');
  return [...new Set(out)];
}

interface Block { tag: string; label: string | null; inline: string; text: string; lines: string[]; items: string[]; rows: string[][]; links: { text: string; href: string }[] }

function textOf($: cheerio.CheerioAPI, el: AnyNode): string {
  return ws($(el).text());
}

/** The labelled blocks of the page content, in reading order. */
function blocks($: cheerio.CheerioAPI, root: cheerio.Cheerio<Element>, baseUrl: string): Block[] {
  const out: Block[] = [];
  root.find('h1,h2,h3,h4,h5,h6,p,ul,ol,table,dl').each((_, el) => {
    const $el = $(el);
    // Lists and tables are read as a whole; skip anything inside them (and nested lists).
    if ($el.parents('ul,ol,table,dl').length) return;
    const tag = (el as Element).tagName.toLowerCase();
    const links = $el.find('a[href]').toArray().map(a => {
      const href = $(a).attr('href') || '';
      let abs = href;
      try { abs = new URL(href, baseUrl).toString(); } catch { /* keep */ }
      return { text: textOf($, a), href: abs };
    }).filter(l => /^(https?:|mailto:)/i.test(l.href));
    if (tag === 'ul' || tag === 'ol') {
      const items: string[] = [];
      $el.children('li').each((__, li) => {
        const $li = $(li);
        const sub = $li.children('ul,ol').children('li').toArray().map(x => textOf($, x)).filter(Boolean);
        const own = ws($li.clone().children('ul,ol').remove().end().text());
        if (sub.length) items.push(...sub.map(s => (own ? `${own}: ${s}` : s)));
        else if (own) items.push(own);
      });
      if (items.length) out.push({ tag, label: null, inline: '', text: items.join(' '), lines: [], items, rows: [], links });
      return;
    }
    if (tag === 'table' || tag === 'dl') {
      const rows: string[][] = tag === 'table'
        ? $el.find('tr').toArray().map(tr => $(tr).children('th,td').toArray().map(c => textOf($, c)))
        : $el.children('dt').toArray().map(dt => [textOf($, dt), ws($(dt).next('dd').text())]);
      out.push({ tag, label: null, inline: '', text: rows.map(r => r.join(' | ')).join(' / '), lines: [], items: [], rows: rows.filter(r => r.some(Boolean)), links });
      return;
    }
    const html = $el.html() || '';
    const lines = html.split(/<br\s*\/?>/i).map(h => ws(cheerio.load(`<i>${h}</i>`)('i').text())).filter(Boolean);
    const text = ws($el.text());
    if (!text) return;
    // A label is leading bold text ("<strong>Label:</strong> value") or a heading.
    let label: string | null = null;
    let inline = text;
    const first = $el.contents().filter((__, n) => !(n.type === 'text' && !ws((n as unknown as { data: string }).data))).first();
    const boldEl = first.is('strong,b') ? first : first.is('em,i,span') && first.find('strong,b').length && ws(first.text()) === ws(first.find('strong,b').first().text()) ? first : null;
    if (/^h[1-6]$/.test(tag)) { label = text; inline = ''; }
    else if (boldEl) {
      const b = ws(boldEl.text());
      if (b && b.length <= 160) { label = b; inline = ws(text.slice(text.indexOf(b) + b.length)); }
    } else {
      const m = text.match(/^([A-Z][A-Za-z /&()'’.-]{2,60}):\s+(.+)$/);
      if (m && sectionOf(m[1])) { label = m[1]; inline = m[2]; }
    }
    out.push({ tag, label, inline, text, lines, items: [], rows: [], links });
  });
  return out;
}

export interface ParsedNotice {
  title: string | null;
  details: JobDetails;
  datePosted: string | null;
  deadlineIso: string | null;
  city: string | null;
  state: string | null;
  /** How many recognised sections were found (a page with several is a full advertisement). */
  sectionsFound: number;
  /** Posts flattened (for search and for deciding whether it is an academic notice). */
  allPosts: string[];
}

const SKIP_TEXT = /^(advertisement|sponsored|tour colleges|share|tweet|pin it|whatsapp|telegram|click here to (join|subscribe))$/i;

export function parseNotice(html: string, pageUrl: string): ParsedNotice {
  const $ = cheerio.load(html);

  // Cloudflare-protected e-mail addresses → plain text before reading.
  $('[data-cfemail]').each((_, el) => { const e = decodeCfEmail($(el).attr('data-cfemail') || ''); if (e) $(el).replaceWith(e); });
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
    const hex = ($(el).attr('href') || '').split('#')[1] || '';
    const e = decodeCfEmail(hex);
    if (e) $(el).attr('href', `mailto:${e}`);
    if (e && /\[email\s*protected\]/i.test($(el).text())) $(el).text(e);
  });

  // schema.org JobPosting, if the page has it.
  let ld = null as Record<string, unknown> | null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      const all = (Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j]) as Record<string, unknown>[];
      const jp = all.find(x => x && (x['@type'] === 'JobPosting' || (Array.isArray(x['@type']) && (x['@type'] as string[]).includes('JobPosting'))));
      if (jp && !ld) ld = jp;
    } catch { /* ignore broken JSON-LD */ }
  });

  $('script,style,noscript,iframe,ins,svg,form,button,nav,footer,aside,.sharedaddy,.td-post-sharing,.related-posts,.code-block').remove();
  const candidates = ['.td-post-content', '.entry-content', '.post-content', '.article-content', 'article .content', 'article', '[role=main]', 'main', '#content', 'body'];
  let root = $('body') as cheerio.Cheerio<Element>;
  for (const sel of candidates) { const r = $(sel).first() as cheerio.Cheerio<Element>; if (r.length && ws(r.text()).length > 200) { root = r; break; } }

  const title = ws($('h1').first().text()) || ws($('title').text()).split(/\s[|–—-]\s/)[0] || null;
  const d: JobDetails = {};
  const allPosts: string[] = [];
  const found = new Set<Section>();
  const postGroups: JobListGroup[] = [];
  const deptGroups: JobListGroup[] = [];
  const req: Record<'qualifications' | 'preferred' | 'experience', PostRequirement[]> = { qualifications: [], preferred: [], experience: [] };
  const listOf: Partial<Record<Section, string[]>> = {};
  let section: Section | null = null;
  let group: string | null = null;
  // A group heading with nothing under it ("Professors / Associate Professors") becomes the parent of the next ones.
  let parentGroup: string | null = null;
  let datePosted: string | null = null;
  let summary: string | null = null;
  let lastDateText: string | null = null;

  const pushGroupItems = (target: JobListGroup[], items: string[]) => {
    const g = target.find(x => x.group === group);
    if (g) g.items.push(...items); else target.push({ group, items: [...items] });
  };
  const setText = (sec: Section, value: string) => {
    const v = ws(value);
    if (!v) return;
    switch (sec) {
      case 'datePosted': datePosted = parseDate(v); break;
      case 'organization': d.hiringOrganization = d.hiringOrganization || v; break;
      case 'numberOfPosts': d.numberOfPosts = d.numberOfPosts || v; break;
      case 'salary': d.salaryText = d.salaryText || v; break;
      case 'location': d.locationText = d.locationText || v; break;
      case 'lastDate': lastDateText = lastDateText || v; break;
      case 'interview': d.interviewText = d.interviewText || v; break;
      case 'notificationDate': if (!NOT_STATED.test(v)) d.notificationDate = d.notificationDate || v; break;
      case 'applyMode': d.applyModes = [...new Set([...(d.applyModes || []), ...modesFrom(v)])]; break;
      case 'howToApply': d.howToApply = d.howToApply ? `${d.howToApply} ${v}` : v; break;
      case 'fee': d.applicationFee = d.applicationFee || v; break;
      case 'age': d.ageLimit = d.ageLimit || v; break;
      case 'reservation': d.reservation = d.reservation || v; break;
      case 'address': d.organizationAddress = d.organizationAddress || v; break;
      case 'qualifications': case 'preferred': case 'experience': req[sec].push(requirement(v)); break;
      case 'posts': allPosts.push(v); pushGroupItems(postGroups, [v]); break;
      case 'departments': pushGroupItems(deptGroups, [v]); break;
      default: (listOf[sec] ||= []).push(v);
    }
  };

  for (const b of blocks($, root, pageUrl)) {
    if (SKIP_TEXT.test(b.text)) continue;
    if (b.label) {
      const sec = sectionOf(stripColon(b.label));
      if (sec === 'stop') { section = 'stop'; continue; }
      if (sec) {
        found.add(sec);
        section = sec;
        group = null;
        parentGroup = null;
        // Address lines are split by <br>; keep them together.
        if (sec === 'address') { const lines = b.lines.slice(1).length ? b.lines.slice(1) : [b.inline]; setText('address', lines.join(', ').replace(/[,.]\s*,/g, ',').replace(/[,.]$/, '')); continue; }
        if (b.inline && !NOT_STATED.test(b.inline)) setText(sec, b.inline);
        else if (b.inline && (sec === 'lastDate' || sec === 'interview' || sec === 'salary')) setText(sec, b.inline);
        continue;
      }
      // A bold line that is not a known section: a group heading inside the current section.
      if (section === 'posts' || section === 'departments') {
        const lbl = stripColon(b.label);
        if (section === 'posts' && /vacanc\w* .*department/i.test(lbl)) { section = 'departments'; group = null; found.add('departments'); continue; }
        const target = section === 'posts' ? postGroups : deptGroups;
        const current = target.find(x => x.group === group);
        if (group && (!current || !current.items.length)) parentGroup = group;
        if (lbl.includes(':')) parentGroup = null; // "Medical College and Hospital: Senior Resident" starts a new branch
        group = parentGroup && parentGroup !== lbl ? `${parentGroup} › ${lbl}` : lbl;
        if (b.inline) setText(section, b.inline);
        continue;
      }
      if (section === 'stop') continue;
    }
    if (section === 'stop') continue;
    if (!section) {
      if (!summary && b.tag === 'p' && b.text.length > 80) summary = b.text;
      continue;
    }
    if (b.items.length) { for (const it of b.items) setText(section, it); continue; }
    if (b.rows.length) {
      const rows = b.rows.filter(r => !(r.length === 2 && /^(activity|event|particulars?|link type|links?)$/i.test(r[0]) && /^(date|dates|details?|links?)$/i.test(r[1])));
      for (const r of rows) {
        const [k, v] = [stripColon(r[0] || ''), ws(r.slice(1).join(' '))];
        if (!k) continue;
        const sec = sectionOf(k);
        if (section === 'dates' || sec === 'lastDate' || sec === 'interview' || sec === 'notificationDate') {
          (d.importantDates ||= []).push({ label: k, value: v });
          if (sec && sec !== 'dates') setText(sec, v);
          found.add('dates');
        } else if (section === 'links' || /website|link|notification|e-?mail|apply/i.test(k)) {
          const rowLinks = b.links.filter(l => v.includes(l.text) || l.text === '' || r.join(' ').includes(l.text));
          const http = rowLinks.find(l => /^https?:/i.test(l.href) && !l.href.includes('/cdn-cgi/'));
          if (/official website|website/i.test(k)) d.officialWebsite = d.officialWebsite || http?.href || (v.match(/https?:\/\/\S+/) || [])[0] || null;
          else if (/application link|apply online|apply link/i.test(k)) d.applicationLink = d.applicationLink || (http?.href ?? null);
          else if (/notification|advertisement|notice/i.test(k)) d.notificationLink = d.notificationLink || (http?.href ?? null);
          if (/e-?mail/i.test(k) || /@/.test(v)) collectEmails(v, d);
          found.add('links');
        } else if (sec) setText(sec, v);
        else if (section) setText(section, `${k}: ${v}`);
      }
      continue;
    }
    if (b.text) setText(section, b.label ? b.inline || b.text : b.text);
  }

  // E-mail addresses and phone numbers mentioned in the application parts.
  const applyText = [d.howToApply || '', ...(listOf.procedure || []), ...(d.importantDates || []).map(x => x.value)].join(' ; ');
  collectEmails(applyText, d);
  const phones = new Set<string>();
  for (const m of ws(root.text()).matchAll(/(?<![\d])(?:\+91[\s-]?)?[6-9]\d{9}(?![\d])/g)) phones.add(m[0].replace(/\s|-/g, ''));
  if (phones.size && phones.size <= 6) d.contactPhones = [...phones];
  if (d.applyEmails?.length && !(d.applyModes || []).includes('email')) d.applyModes = [...(d.applyModes || []), 'email'];
  if (!d.applyModes?.length) { const m = modesFrom(`${d.howToApply || ''} ${(listOf.procedure || []).join(' ')}`); if (m.length) d.applyModes = m; }
  if (d.applicationLink && !(d.applyModes || []).includes('online')) d.applyModes = [...(d.applyModes || []), 'online'];

  if (postGroups.length) d.postGroups = postGroups.filter(g => g.items.length);
  if (deptGroups.length) d.departmentGroups = deptGroups.filter(g => g.items.length);
  if (req.qualifications.length) d.qualifications = req.qualifications;
  if (req.preferred.length) d.preferredQualifications = req.preferred;
  if (req.experience.length) d.experience = req.experience;
  if (listOf.profile) d.candidateProfile = listOf.profile;
  if (listOf.responsibilities) d.responsibilities = listOf.responsibilities;
  if (listOf.procedure) d.applicationProcedure = listOf.procedure;
  if (listOf.documents) d.documentsRequired = listOf.documents;
  if (listOf.benefits) d.benefits = listOf.benefits;
  if (listOf.selection) d.selectionProcess = listOf.selection;
  if (listOf.address && !d.organizationAddress) d.organizationAddress = listOf.address.join(', ');
  if (summary) d.summary = summary;

  // JSON-LD fills only what the page text did not state.
  let city: string | null = null, state: string | null = null;
  if (ld) {
    const j = ld as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    datePosted = datePosted || parseDate(String(j.datePosted || ''));
    d.employmentType = typeof j.employmentType === 'string' ? j.employmentType : Array.isArray(j.employmentType) ? j.employmentType.join(', ') : null;
    if (!d.hiringOrganization && j.hiringOrganization?.name) d.hiringOrganization = ws(String(j.hiringOrganization.name));
    const addr = (Array.isArray(j.jobLocation) ? j.jobLocation[0] : j.jobLocation)?.address;
    if (addr) { city = addr.addressLocality ? ws(String(addr.addressLocality)) : null; state = addr.addressRegion ? ws(String(addr.addressRegion)) : null; }
    if (!lastDateText && j.validThrough) lastDateText = String(j.validThrough).slice(0, 10);
  }
  if (d.locationText && (!city || !state)) {
    const parts = d.locationText.split(',').map(ws).filter(Boolean);
    if (parts.length >= 2) { city = city || parts[0]; state = state || parts[parts.length - 1]; }
    else if (parts.length === 1) city = city || parts[0];
  }

  // Deadline: an exact date if stated; "within N days" is worked out from the posting date and flagged.
  let deadlineIso: string | null = null;
  if (lastDateText) {
    d.lastDateText = lastDateText;
    deadlineIso = parseDate(lastDateText);
    const within = lastDateText.match(/within\s+(\d{1,3})\s+days?/i);
    if (!deadlineIso && within) {
      const from = parseDate(d.notificationDate || '') || datePosted;
      if (from) { deadlineIso = addDays(from, Number(within[1])); d.deadlineEstimated = true; }
    }
  }

  return { title, details: d, datePosted, deadlineIso, city, state, sectionsFound: found.size, allPosts };
}

function collectEmails(text: string, d: JobDetails): void {
  const re = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(\s*\(([^)]{2,80})\))?(\s+for\s+([^,.;]{3,60}))?/g;
  for (const m of text.matchAll(re)) {
    const email = m[1].toLowerCase();
    const note = ws(m[3] || m[5] || '') || null;
    const list = (d.applyEmails ||= []);
    const ex = list.find(x => x.email === email);
    if (!ex) list.push({ email, note });
    else if (!ex.note && note) ex.note = note;
  }
}
