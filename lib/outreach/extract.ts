/*
 * Finds the contact email addresses a college publishes on its own website: mailto links, plain
 * addresses and the usual "name [at] college [dot] ac [dot] in" spellings. Also picks the pages most
 * likely to list them (Contact us, About, Principal, Administration…). Pure functions, no network.
 */

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const BAD_TLD = /\.(png|jpe?g|gif|webp|svg|css|js|ico|pdf|docx?|xlsx?|zip|mp4)$/i;
const NEVER = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|bounce|bounces|devnull|null|test|example|privacy|unsubscribe)([._+-]|@)/i;
const JUNK_DOMAINS = /(^|\.)(example\.(com|org)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com|wordpress\.(com|org)|w3\.org|schema\.org|googleusercontent\.com|cloudflare\.com)$/i;
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|rediffmail|hotmail|outlook|live|icloud|aol|protonmail|zoho)\.(com|co\.in|in)$/i;

/** Roles we prefer to write to (highest first). */
const ROLE_RANK: [RegExp, number, string][] = [
  [/^(principal|director|vc|vicechancellor|vice\.chancellor|dean|registrar|chairman|secretary|correspondent|ceo|head)/i, 50, 'Head of institution'],
  [/^(hr|recruit|careers?|jobs?|placement|tpo|establishment|admin|administration|office|establish)/i, 40, 'Administration / HR'],
  [/^(info|contact|enquir|inquir|mail|admissions?|college|university|institute|reception|helpdesk|support)/i, 30, 'General enquiries'],
  [/^(iqac|naac|nirf|aishe|exam|coe|accounts?)/i, 15, 'Office'],
];

export interface FoundEmail { email: string; role: string; score: number; onCollegeDomain: boolean; freeMail: boolean }

/** The registrable part of a host, e.g. "www.cse.abc.ac.in" → "abc.ac.in". */
export function baseDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const parts = h.split('.');
  const sld2 = /^(ac|edu|gov|nic|res|org|co|net|gen|ind)$/;
  if (parts.length >= 3 && sld2.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(amp|commat|period|nbsp);/gi, (_, e) => ({ amp: '&', commat: '@', period: '.', nbsp: ' ' } as Record<string, string>)[e.toLowerCase()]);
}

/** Turns "principal [at] abc [dot] ac [dot] in" and similar into normal addresses. */
export function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[({<]\s*(at|@)\s*[\])}>]\s*/gi, '@')
    .replace(/\s*[[({<]\s*(dot|\.)\s*[\])}>]\s*/gi, '.')
    .replace(/([a-z0-9._-]+)\s+(?:at|AT)\s+([a-z0-9-]+(?:\s+(?:dot|DOT)\s+[a-z0-9-]+)+)\b/g, (_, u: string, d: string) => `${u}@${d.replace(/\s+(?:dot|DOT)\s+/g, '.')}`);
}

export function cleanEmail(raw: string): string | null {
  let e = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0].replace(/^[.\-_]+|[.\-_,;:]+$/g, '');
  try { e = decodeURIComponent(e); } catch { /* keep */ }
  if (e.length > 120 || !/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  const [local, domain] = e.split('@');
  if (BAD_TLD.test(e) || /\d+x\.(png|jpg)$/.test(e) || NEVER.test(`${local}@`) || JUNK_DOMAINS.test(domain)) return null;
  if (/^[0-9a-f]{16,}$/.test(local)) return null; // tracking ids
  return e;
}

/** Every distinct contact address on a page, ranked (head of institution first). */
export function extractEmails(html: string, pageUrl: string): FoundEmail[] {
  let host = '';
  try { host = new URL(pageUrl).hostname; } catch { /* ignore */ }
  const college = host ? baseDomain(host) : '';
  const found = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) { const e = cleanEmail(decodeEntities(m[1])); if (e) found.add(e); }
  const text = deobfuscate(decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')));
  for (const m of text.matchAll(EMAIL_RE)) { const e = cleanEmail(m[0]); if (e) found.add(e); }
  return [...found].map(email => {
    const [local, domain] = email.split('@');
    const onCollegeDomain = !!college && baseDomain(domain) === college;
    const freeMail = FREE_MAIL.test(domain);
    const r = ROLE_RANK.find(([re]) => re.test(local));
    const score = (r?.[1] ?? 10) + (onCollegeDomain ? 30 : freeMail ? 5 : 0);
    return { email, role: r?.[2] ?? 'Other', score, onCollegeDomain, freeMail };
  })
    // Addresses on unrelated organisations' domains (web designers, portals) are not the college's.
    .filter(f => f.onCollegeDomain || f.freeMail || /\.(ac|edu|gov|nic)\.in$|\.edu$/.test(f.email.split('@')[1]))
    .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
}

const CONTACT_HINT = /contact|reach[- ]?us|get[- ]?in[- ]?touch|address|enquir|about|principal|director|administration|admin|office|placement|careers?|recruit|vacanc|staff|faculty|directory|aboutus|contactus/i;

/** Same-site links that probably list contact details, best first (at most `max`). */
export function contactLinks(html: string, baseUrl: string, max = 3): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const site = baseDomain(base.hostname);
  const out: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    let u: URL;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || baseDomain(u.hostname) !== site || /\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4)$/i.test(u.pathname)) continue;
    const hay = `${u.pathname} ${text}`;
    if (!CONTACT_HINT.test(hay)) continue;
    const score = (/contact|reach|touch|enquir/i.test(hay) ? 10 : 0) + (/principal|director|administration|office/i.test(hay) ? 5 : 0) + (/about/i.test(hay) ? 3 : 0) + (/placement|career|recruit|vacanc/i.test(hay) ? 2 : 0);
    u.hash = '';
    if (u.href !== base.href) out.push({ url: u.href, score });
  }
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter(o => (seen.has(o.url) ? false : (seen.add(o.url), true))).slice(0, max).map(o => o.url);
}

/** Minimal robots.txt check for our user agent (and *). */
export function robotsAllows(robots: string, path: string, agent = 'acadexmatchbot'): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      lastWasAgent = false;
      if (val || key === 'allow') cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.find(g => g.agents.some(a => a !== '*' && agent.includes(a))) || groups.find(g => g.agents.includes('*'));
  if (!mine) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of mine.rules) {
    if (!r.path) continue;
    const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp(`^${pat}`).test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}
