/*
 * College outreach (administrator only).
 * 1. Contact finder: visits the public websites of AISHE colleges that are not on AcadeXMatch yet and
 *    collects the contact addresses they publish (robots.txt respected, a few pages per site, slow rate,
 *    honest user agent).
 * 2. Campaigns: sends the administrator's message through a SEPARATE Brevo account
 *    (OUTREACH_EMAIL_API_KEY / OUTREACH_MAIL_FROM), so complaints can never block sign-in codes or
 *    candidate alerts. Daily limit, test email first, one-click unsubscribe in every email, a permanent
 *    do-not-email list, and registered institutions are never emailed.
 */
import { createHmac, randomBytes } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import { readJson, writeJson, sqlPool, backend } from './persist';
import { serverSecret, safeEqual } from './security';
import { allAisheRecords, normaliseAisheCode } from './aishe';
import { withDb } from './db';
import { appUrl } from './mailer';
import { STORAGE_KEYS, DEFAULT_PLAN_SETTINGS } from '@/lib/storage';
import { contactLinks, extractEmails, robotsAllows, baseDomain, type FoundEmail } from '@/lib/outreach/extract';
import { CONTACT_EMAIL } from '@/lib/contact';
import type { AisheRecord, Institute, PlanSettings } from '@/types';

const UA = 'Mozilla/5.0 (compatible; AcadeXMatchBot/1.0; +https://acadexmatch.com/about; info@acadexmatch.com)';
const g = globalThis as unknown as { __outreachTables?: Promise<void>; __finder?: Promise<void> | null; __sender?: boolean };

// ------------------------------------------------------------------ storage

async function tables(): Promise<void> {
  if (backend() !== 'mysql') throw new Error('Email outreach needs the MySQL database.');
  g.__outreachTables ||= (async () => {
    const p = await sqlPool();
    await p.query(`CREATE TABLE IF NOT EXISTS acx_outreach_contacts (
      email VARCHAR(190) NOT NULL PRIMARY KEY,
      aishe_code VARCHAR(20) NOT NULL,
      college VARCHAR(400) NOT NULL,
      state VARCHAR(120) NULL,
      district VARCHAR(120) NULL,
      category VARCHAR(60) NULL,
      role VARCHAR(60) NULL,
      score INT NOT NULL DEFAULT 0,
      source_url VARCHAR(600) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      sends INT NOT NULL DEFAULT 0,
      last_sent_at DATETIME NULL,
      last_campaign VARCHAR(40) NULL,
      found_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_code (aishe_code), KEY idx_state (state), KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS acx_outreach_crawled (
      aishe_code VARCHAR(20) NOT NULL PRIMARY KEY,
      crawled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      found INT NOT NULL DEFAULT 0,
      note VARCHAR(200) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS acx_outreach_suppress (
      value VARCHAR(190) NOT NULL PRIMARY KEY,
      reason VARCHAR(60) NOT NULL,
      added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  })().catch(e => { g.__outreachTables = undefined; throw e; });
  return g.__outreachTables;
}
const db = async () => { await tables(); return sqlPool(); };

// ------------------------------------------------------------------ settings and state

export interface OutreachSettings { dailyLimit: number; perCollege: 1 | 2; gapDays: number }
const DEFAULTS: OutreachSettings = { dailyLimit: 100, perCollege: 1, gapDays: 30 };

export interface FinderState { running: boolean; filter: { state?: string; category?: string }; queue: string[]; done: number; total: number; found: number; skipped: number; startedAt?: string; finishedAt?: string; stopRequested?: boolean; lastError?: string }
export interface Campaign {
  id: string; name: string; subject: string; body: string;
  audience: { state?: string; category?: string };
  perCollege: 1 | 2;
  status: 'draft' | 'sending' | 'paused' | 'done';
  createdAt: string; startedAt?: string; finishedAt?: string;
  queue: string[]; sent: number; failed: number; skipped: number; lastError?: string;
}
interface State { settings: OutreachSettings; finder: FinderState; campaigns: Campaign[]; day: { date: string; sent: number } }

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const blankFinder = (): FinderState => ({ running: false, filter: {}, queue: [], done: 0, total: 0, found: 0, skipped: 0 });

let stateChain: Promise<unknown> = Promise.resolve();
async function readState(): Promise<State> {
  const s = await readJson<Partial<State>>('outreach-state');
  return { settings: { ...DEFAULTS, ...(s?.settings || {}) }, finder: { ...blankFinder(), ...(s?.finder || {}) }, campaigns: s?.campaigns || [], day: s?.day || { date: todayIst(), sent: 0 } };
}
function updateState<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const run = stateChain.then(async () => { const s = await readState(); const out = await fn(s); await writeJson('outreach-state', s); return out; });
  stateChain = run.catch(() => undefined);
  return run;
}

export function outreachSenderConfigured(): boolean {
  return !!process.env.OUTREACH_EMAIL_API_KEY && !!process.env.OUTREACH_MAIL_FROM;
}

// ------------------------------------------------------------------ registered institutions (never contacted)

async function registered(): Promise<{ codes: Set<string>; domains: Set<string> }> {
  return withDb(null, d => {
    const insts = (d[STORAGE_KEYS.INSTITUTES] as Institute[]) || [];
    const codes = new Set(insts.map(i => normaliseAisheCode(i.aisheCode || '')).filter(Boolean));
    const domains = new Set<string>();
    for (const i of insts) {
      for (const v of [i.website, (i as { contactEmail?: string }).contactEmail]) {
        if (!v) continue;
        try { domains.add(baseDomain(v.includes('@') ? v.split('@')[1] : new URL(v.startsWith('http') ? v : `https://${v}`).hostname)); } catch { /* ignore */ }
      }
    }
    return { codes, domains };
  });
}

// ------------------------------------------------------------------ contact finder

async function fetchText(url: string, ms = 12000): Promise<{ ok: boolean; status: number; text: string; url: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: ctrl.signal });
    const type = r.headers.get('content-type') || '';
    if (!/text|html|xml/i.test(type) && !url.endsWith('robots.txt')) return { ok: false, status: r.status, text: '', url: r.url };
    const buf = await r.arrayBuffer();
    return { ok: r.ok, status: r.status, text: Buffer.from(buf.slice(0, 1_500_000)).toString('utf8'), url: r.url || url };
  } catch {
    return { ok: false, status: 0, text: '', url };
  } finally { clearTimeout(t); }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function siteUrl(website: string): string | null {
  const w = (website || '').trim();
  if (!w || /^(na|n\/a|nil|none|-)$/i.test(w)) return null;
  try { const u = new URL(/^https?:\/\//i.test(w) ? w : `http://${w}`); return /\./.test(u.hostname) ? u.origin + (u.pathname === '/' ? '/' : u.pathname) : null; } catch { return null; }
}

/** Visits one college's site (home page + up to 3 contact-like pages). */
export async function findContactsFor(rec: AisheRecord, opts: { fetcher?: typeof fetchText; delayMs?: number } = {}): Promise<{ emails: (FoundEmail & { source: string })[]; note: string }> {
  const get = opts.fetcher || fetchText;
  const start = siteUrl(rec.website);
  if (!start) return { emails: [], note: 'No website' };
  const origin = new URL(start).origin;
  const robots = await get(`${origin}/robots.txt`, 8000);
  const allowed = (u: string) => !robots.ok || robotsAllows(robots.text, new URL(u).pathname || '/');
  if (!allowed(start)) return { emails: [], note: 'robots.txt does not allow it' };
  const home = await get(start);
  if (!home.ok || !home.text) return { emails: [], note: home.status ? `Website answered ${home.status}` : 'Website not reachable' };
  const found = new Map<string, FoundEmail & { source: string }>();
  const add = (list: FoundEmail[], source: string) => { for (const f of list) if (!found.has(f.email)) found.set(f.email, { ...f, source }); };
  add(extractEmails(home.text, home.url), home.url);
  for (const link of contactLinks(home.text, home.url, 3)) {
    if (!allowed(link)) continue;
    await sleep(opts.delayMs ?? 800);
    const page = await get(link);
    if (page.ok) add(extractEmails(page.text, page.url), page.url);
  }
  const emails = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  return { emails, note: emails.length ? `${emails.length} found` : 'No email published' };
}

async function saveFound(rec: AisheRecord, emails: (FoundEmail & { source: string })[], note: string): Promise<number> {
  const p = await db();
  const supp = await suppressedSet();
  let added = 0;
  for (const e of emails) {
    if (supp.has(e.email) || supp.has(`@${e.email.split('@')[1]}`)) continue;
    const [r] = await p.query<RowDataPacket[] & { affectedRows?: number }>(
      `INSERT INTO acx_outreach_contacts (email, aishe_code, college, state, district, category, role, score, source_url) VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE source_url = VALUES(source_url), score = GREATEST(score, VALUES(score))`,
      [e.email, rec.code, rec.name.slice(0, 400), rec.state || null, rec.district || null, rec.category || null, e.role, e.score, e.source.slice(0, 600)]) as unknown as [{ affectedRows: number }];
    if (r.affectedRows === 1) added++;
  }
  await p.query('INSERT INTO acx_outreach_crawled (aishe_code, found, note) VALUES (?,?,?) ON DUPLICATE KEY UPDATE found = VALUES(found), note = VALUES(note), crawled_at = CURRENT_TIMESTAMP', [rec.code, emails.length, note.slice(0, 200)]);
  return added;
}

/** Colleges that would be visited for this filter (not registered, has a website, not visited in 90 days). */
async function candidates(filter: FinderState['filter']): Promise<AisheRecord[]> {
  const p = await db();
  const [rows] = await p.query<RowDataPacket[]>('SELECT aishe_code FROM acx_outreach_crawled WHERE crawled_at > (NOW() - INTERVAL 90 DAY)');
  const recent = new Set(rows.map(r => String(r.aishe_code)));
  const reg = await registered();
  return (await allAisheRecords()).filter(r =>
    siteUrl(r.website) && !recent.has(r.code) && !reg.codes.has(r.code) && !/closed|inactive|merged/i.test(r.status || '') &&
    (!filter.state || r.state === filter.state) && (!filter.category || r.category === filter.category));
}

export async function finderPreview(filter: FinderState['filter']): Promise<number> {
  return (await candidates(filter)).length;
}

export async function startFinder(filter: FinderState['filter'], limit: number): Promise<FinderState> {
  const list = (await candidates(filter)).slice(0, Math.max(1, Math.min(2000, Math.round(limit) || 200)));
  const st = await updateState(s => {
    if (s.finder.running) throw new Error('The contact finder is already running.');
    s.finder = { ...blankFinder(), running: true, filter, queue: list.map(r => r.code), total: list.length, startedAt: new Date().toISOString() };
    return s.finder;
  });
  void runFinder();
  return st;
}

export async function stopFinder(): Promise<void> {
  await updateState(s => { if (s.finder.running) s.finder.stopRequested = true; });
}

/** Works through the queue with a few sites in parallel; resumes after a restart (called by the scheduler). */
export function runFinder(): Promise<void> {
  if (g.__finder) return g.__finder;
  g.__finder = (async () => {
    try {
      if (!(await readState()).finder.running) return; // nothing queued: do not load the directory
      const byCode = new Map((await allAisheRecords()).map(r => [r.code, r]));
      for (;;) {
        const batch = await updateState(s => {
          if (!s.finder.running) return [];
          if (s.finder.stopRequested) { s.finder.running = false; s.finder.stopRequested = false; s.finder.finishedAt = new Date().toISOString(); return []; }
          const take = s.finder.queue.splice(0, 4);
          if (!take.length) { s.finder.running = false; s.finder.finishedAt = new Date().toISOString(); }
          return take;
        });
        if (!batch.length) break;
        const results = await Promise.all(batch.map(async code => {
          const rec = byCode.get(code);
          if (!rec) return { found: 0, skipped: 1 };
          try {
            const r = await findContactsFor(rec);
            const added = await saveFound(rec, r.emails, r.note);
            return { found: added, skipped: r.emails.length ? 0 : 1 };
          } catch (e) {
            return { found: 0, skipped: 1, error: (e as Error).message };
          }
        }));
        await updateState(s => {
          s.finder.done += batch.length;
          s.finder.found += results.reduce((n, r) => n + r.found, 0);
          s.finder.skipped += results.reduce((n, r) => n + r.skipped, 0);
          const err = results.find(r => 'error' in r && r.error) as { error?: string } | undefined;
          if (err?.error) s.finder.lastError = err.error.slice(0, 200);
        });
      }
    } finally { g.__finder = null; }
  })();
  return g.__finder;
}

// ------------------------------------------------------------------ contacts and do-not-email list

async function suppressedSet(): Promise<Set<string>> {
  const p = await db();
  const [rows] = await p.query<RowDataPacket[]>('SELECT value FROM acx_outreach_suppress');
  return new Set(rows.map(r => String(r.value)));
}

export async function suppress(value: string, reason: string): Promise<void> {
  const v = value.trim().toLowerCase();
  if (!/^[^@\s]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) throw new Error('Enter an email address or @domain.');
  const p = await db();
  await p.query('INSERT INTO acx_outreach_suppress (value, reason) VALUES (?,?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)', [v, reason.slice(0, 60)]);
  if (v.startsWith('@')) await p.query("UPDATE acx_outreach_contacts SET status = 'unsubscribed' WHERE email LIKE ?", [`%${v}`]);
  else await p.query("UPDATE acx_outreach_contacts SET status = 'unsubscribed' WHERE email = ?", [v]);
}

export interface ContactRow { email: string; aishe_code: string; college: string; state: string | null; category: string | null; role: string | null; score: number; source_url: string | null; status: string; sends: number; last_sent_at: string | null }

export async function listContacts(q: { search?: string; state?: string; status?: string; limit?: number; offset?: number }): Promise<{ rows: ContactRow[]; total: number }> {
  const p = await db();
  const where: string[] = [], args: unknown[] = [];
  if (q.search) { where.push('(email LIKE ? OR college LIKE ? OR aishe_code = ?)'); args.push(`%${q.search}%`, `%${q.search}%`, q.search.toUpperCase()); }
  if (q.state) { where.push('state = ?'); args.push(q.state); }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ n }]] = await p.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM acx_outreach_contacts ${w}`, args) as unknown as [[{ n: number }]];
  const [rows] = await p.query<RowDataPacket[]>(`SELECT email, aishe_code, college, state, category, role, score, source_url, status, sends, last_sent_at FROM acx_outreach_contacts ${w} ORDER BY found_at DESC, score DESC LIMIT ? OFFSET ?`, [...args, Math.min(500, q.limit || 50), q.offset || 0]);
  return { rows: rows as ContactRow[], total: Number(n) };
}

export async function outreachSummary() {
  const p = await db();
  const [byStatus] = await p.query<RowDataPacket[]>('SELECT status, COUNT(*) AS n FROM acx_outreach_contacts GROUP BY status');
  const [[col]] = await p.query<RowDataPacket[]>('SELECT COUNT(DISTINCT aishe_code) AS colleges FROM acx_outreach_contacts') as unknown as [[{ colleges: number }]];
  const [[cr]] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS visited, SUM(found > 0) AS withEmail FROM acx_outreach_crawled') as unknown as [[{ visited: number; withEmail: number }]];
  const [[sp]] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM acx_outreach_suppress') as unknown as [[{ n: number }]];
  const s = await readState();
  return {
    senderConfigured: outreachSenderConfigured(), sender: process.env.OUTREACH_MAIL_FROM || null,
    contacts: Object.fromEntries(byStatus.map(r => [r.status, Number(r.n)])) as Record<string, number>,
    colleges: Number(col.colleges || 0), visited: Number(cr.visited || 0), visitedWithEmail: Number(cr.withEmail || 0), suppressed: Number(sp.n || 0),
    settings: s.settings, finder: { ...s.finder, queue: undefined, queued: s.finder.queue.length },
    campaigns: s.campaigns.map(c => ({ ...c, queue: undefined, queued: c.queue.length })),
    sentToday: s.day.date === todayIst() ? s.day.sent : 0,
  };
}

export async function saveSettings(raw: Partial<OutreachSettings>): Promise<OutreachSettings> {
  return updateState(s => {
    const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
    s.settings = { dailyLimit: n(raw.dailyLimit, 1, 2000, s.settings.dailyLimit), perCollege: raw.perCollege === 2 ? 2 : raw.perCollege === 1 ? 1 : s.settings.perCollege, gapDays: n(raw.gapDays, 1, 365, s.settings.gapDays) };
    return s.settings;
  });
}

// ------------------------------------------------------------------ campaigns

const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export async function launchOfferTemplate(): Promise<{ subject: string; body: string }> {
  const s = await withDb(null, d => ({ ...DEFAULT_PLAN_SETTINGS, ...((d[STORAGE_KEYS.PLAN_SETTINGS] as Partial<PlanSettings>) || {}) }));
  return {
    subject: 'Free faculty recruitment for {{college}} until ' + fmt(s.institutionFreeUntil),
    body: [
      'Dear Principal / Head of the Institution,',
      'I am writing from AcadeXMatch (acadexmatch.com), an academic recruitment platform built for Indian higher education. It brings faculty vacancies, UGC and AICTE eligibility norms and the whole selection process into one place.',
      `Launch offer for {{college}}: every institution tool is free until ${fmt(s.institutionFreeUntil)} once we verify your institution:`,
      '• Publish faculty vacancies with 7th CPC pay, reservation and UGC / AICTE norms\n• Receive applications and move candidates through screening, interviews and selection\n• Schedule interviews, record selection-committee scores and search our candidate pool',
      `You can also advertise your FDPs, workshops, seminars and conferences free until ${fmt(s.eventsFreeUntil)}.`,
      'To start, register at https://acadexmatch.com/register with your AISHE code ({{aishe}}). Our team verifies institutions within one or two working days.',
      `If you have any questions, simply reply to this email or write to ${CONTACT_EMAIL}.`,
      'Warm regards,\nUdayakumar Palanivelu\nFounder & CEO, AcadeXMatch',
    ].join('\n\n'),
  };
}

const id = () => `oc-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
function cleanCampaign(raw: Partial<Campaign>): Pick<Campaign, 'name' | 'subject' | 'body' | 'audience' | 'perCollege'> {
  const subject = String(raw.subject || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const body = String(raw.body || '').replace(/\r/g, '').trim().slice(0, 8000);
  if (subject.length < 5) throw new Error('Write a subject line.');
  if (body.length < 50) throw new Error('Write the message (at least a few sentences).');
  return {
    name: String(raw.name || subject).trim().slice(0, 80), subject, body,
    audience: { state: raw.audience?.state ? String(raw.audience.state).slice(0, 120) : undefined, category: raw.audience?.category ? String(raw.audience.category).slice(0, 60) : undefined },
    perCollege: raw.perCollege === 2 ? 2 : 1,
  };
}

export async function saveCampaign(raw: Partial<Campaign> & { id?: string }): Promise<Campaign> {
  const c = cleanCampaign(raw);
  return updateState(s => {
    if (raw.id) {
      const cur = s.campaigns.find(x => x.id === raw.id);
      if (!cur) throw new Error('Campaign not found.');
      if (cur.status !== 'draft') throw new Error('A campaign that has started cannot be edited.');
      Object.assign(cur, c);
      return cur;
    }
    const camp: Campaign = { id: id(), ...c, status: 'draft', createdAt: new Date().toISOString(), queue: [], sent: 0, failed: 0, skipped: 0 };
    s.campaigns.unshift(camp);
    s.campaigns = s.campaigns.slice(0, 50);
    return camp;
  });
}

export async function deleteCampaign(cid: string): Promise<void> {
  await updateState(s => {
    const c = s.campaigns.find(x => x.id === cid);
    if (c?.status === 'sending') throw new Error('Pause the campaign first.');
    s.campaigns = s.campaigns.filter(x => x.id !== cid);
  });
}

/** Who a campaign would reach now: best address(es) per college, never registered, suppressed or recently emailed. */
export async function audienceFor(c: Pick<Campaign, 'audience' | 'perCollege'>, gapDays: number): Promise<string[]> {
  const p = await db();
  // The waiting period applies to the whole college: once any of its addresses is emailed, none is emailed again until it ends.
  const gap = Math.max(1, Math.round(gapDays));
  const where = ["status IN ('new','sent')", `aishe_code NOT IN (SELECT aishe_code FROM (SELECT DISTINCT aishe_code FROM acx_outreach_contacts WHERE last_sent_at >= (NOW() - INTERVAL ${gap} DAY)) recent)`];
  const args: unknown[] = [];
  if (c.audience.state) { where.push('state = ?'); args.push(c.audience.state); }
  if (c.audience.category) { where.push('category = ?'); args.push(c.audience.category); }
  const [rows] = await p.query<RowDataPacket[]>(`SELECT email, aishe_code FROM acx_outreach_contacts WHERE ${where.join(' AND ')} ORDER BY aishe_code, score DESC, email`, args);
  const reg = await registered();
  const supp = await suppressedSet();
  const perCode = new Map<string, number>();
  const out: string[] = [];
  for (const r of rows) {
    const email = String(r.email), code = String(r.aishe_code), domain = email.split('@')[1];
    if (reg.codes.has(code) || reg.domains.has(baseDomain(domain)) || supp.has(email) || supp.has(`@${domain}`)) continue;
    const n = perCode.get(code) || 0;
    if (n >= c.perCollege) continue;
    perCode.set(code, n + 1);
    out.push(email);
  }
  return out;
}

export async function campaignPreviewCount(raw: Partial<Campaign>): Promise<number> {
  const s = await readState();
  return (await audienceFor({ audience: raw.audience || {}, perCollege: raw.perCollege === 2 ? 2 : 1 }, s.settings.gapDays)).length;
}

export async function startCampaign(cid: string): Promise<Campaign> {
  if (!outreachSenderConfigured()) throw new Error('Add the outreach Brevo account (OUTREACH_EMAIL_API_KEY and OUTREACH_MAIL_FROM) first.');
  const s0 = await readState();
  const c0 = s0.campaigns.find(x => x.id === cid);
  if (!c0) throw new Error('Campaign not found.');
  const queue = c0.status === 'paused' ? c0.queue : await audienceFor(c0, s0.settings.gapDays);
  const c = await updateState(s => {
    const cur = s.campaigns.find(x => x.id === cid);
    if (!cur) throw new Error('Campaign not found.');
    if (cur.status === 'done' || cur.status === 'sending') throw new Error('This campaign has already been sent or is sending.');
    if (s.campaigns.some(x => x.status === 'sending' && x.id !== cid)) throw new Error('Another campaign is sending. Pause it first.');
    if (cur.status === 'draft') { cur.queue = queue; cur.startedAt = new Date().toISOString(); }
    cur.status = 'sending';
    return cur;
  });
  void sendDue();
  return c;
}

export async function pauseCampaign(cid: string): Promise<void> {
  await updateState(s => { const c = s.campaigns.find(x => x.id === cid); if (c?.status === 'sending') c.status = 'paused'; });
}

// ------------------------------------------------------------------ sending

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', serverSecret()).update(`outreach-unsub:${email.toLowerCase()}`).digest('base64url').slice(0, 24);
}
export function unsubscribeTokenValid(email: string, t: string): boolean {
  return !!t && safeEqual(unsubscribeToken(email), t);
}
export function unsubscribeLink(email: string): string {
  return `${appUrl()}/api/outreach/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" style="color:#800000">$1</a>');

export function renderOutreach(c: Pick<Campaign, 'subject' | 'body'>, contact: { email: string; college: string; aishe: string }) {
  const fill = (t: string) => t.replace(/\{\{\s*college\s*\}\}/gi, contact.college).replace(/\{\{\s*aishe\s*\}\}/gi, contact.aishe);
  const subject = fill(c.subject);
  const body = fill(c.body);
  const unsub = unsubscribeLink(contact.email);
  const footer = `You received this email because ${contact.email} is published as a contact address on ${contact.college}'s website. To receive no further emails from AcadeXMatch, unsubscribe: ${unsub}`;
  const text = `${body}\n\n—\n${footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 18px">
${body.split(/\n{2,}/).map(par => `<p style="margin:0 0 14px">${linkify(par).replace(/\n/g, '<br>')}</p>`).join('\n')}
<p style="margin:28px 0 0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:12px">You received this email because ${esc(contact.email)} is published as a contact address on ${esc(contact.college)}'s website. <a href="${esc(unsub)}" style="color:#777">Unsubscribe</a> and we will not email this address again.</p>
</div></body></html>`;
  return { subject, text, html, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

/** Sends through the separate outreach Brevo account. */
export async function sendOutreachEmail(to: string, msg: { subject: string; text: string; html: string; headers: Record<string, string> }): Promise<string | undefined> {
  const key = process.env.OUTREACH_EMAIL_API_KEY;
  if (!key) throw new Error('Outreach sender not configured.');
  const replyTo = process.env.OUTREACH_REPLY_TO || CONTACT_EMAIL;
  const r = await fetch(`${(process.env.OUTREACH_EMAIL_API_URL || 'https://api.brevo.com').replace(/\/$/, '')}/v3/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFrom(process.env.OUTREACH_MAIL_FROM!), replyTo: { email: replyTo }, to: [{ email: to }], subject: msg.subject, textContent: msg.text, htmlContent: msg.html, headers: msg.headers, tags: ['outreach'] }),
  });
  const d = await r.json().catch(() => ({})) as { message?: string; messageId?: string };
  if (!r.ok) throw Object.assign(new Error(`Brevo ${r.status}: ${d.message || r.statusText}`), { status: r.status });
  return d.messageId;
}

export async function sendTest(raw: Partial<Campaign>, to: string): Promise<void> {
  if (!outreachSenderConfigured()) throw new Error('Add the outreach Brevo account first.');
  const c = cleanCampaign(raw);
  const m = renderOutreach(c, { email: to, college: 'Example College of Arts and Science', aishe: 'C-12345' });
  await sendOutreachEmail(to, { ...m, subject: `[TEST] ${m.subject}` });
}

/** Sends the next part of the running campaign, within the daily limit (called by the scheduler and on start). */
export async function sendDue(): Promise<{ sent: number }> {
  if (g.__sender || !outreachSenderConfigured()) return { sent: 0 };
  g.__sender = true;
  let sent = 0;
  try {
    for (let round = 0; round < 10; round++) {
      const job = await updateState(s => {
        if (s.day.date !== todayIst()) s.day = { date: todayIst(), sent: 0 };
        const c = s.campaigns.find(x => x.status === 'sending');
        if (!c) return null;
        if (!c.queue.length) { c.status = 'done'; c.finishedAt = new Date().toISOString(); return null; }
        const room = s.settings.dailyLimit - s.day.sent;
        if (room <= 0) return null;
        const take = c.queue.splice(0, Math.min(10, room));
        s.day.sent += take.length;
        return { campaign: { id: c.id, subject: c.subject, body: c.body }, emails: take };
      });
      if (!job) break;
      const p = await db();
      const supp = await suppressedSet();
      const results: { email: string; ok: boolean; skip?: boolean; err?: string }[] = [];
      for (const email of job.emails) {
        const domain = email.split('@')[1];
        const [[row]] = await p.query<RowDataPacket[]>('SELECT email, college, aishe_code, status FROM acx_outreach_contacts WHERE email = ?', [email]) as unknown as [[{ college: string; aishe_code: string; status: string } | undefined]];
        if (!row || row.status === 'unsubscribed' || row.status === 'removed' || supp.has(email) || supp.has(`@${domain}`)) { results.push({ email, ok: false, skip: true }); continue; }
        try {
          await sendOutreachEmail(email, renderOutreach(job.campaign, { email, college: row.college, aishe: row.aishe_code }));
          await p.query("UPDATE acx_outreach_contacts SET status = 'sent', sends = sends + 1, last_sent_at = NOW(), last_campaign = ? WHERE email = ?", [job.campaign.id, email]);
          results.push({ email, ok: true });
          sent++;
        } catch (e) {
          const status = (e as { status?: number }).status;
          if (status === 400) await p.query("UPDATE acx_outreach_contacts SET status = 'failed' WHERE email = ?", [email]);
          results.push({ email, ok: false, err: (e as Error).message });
          if (status === 401 || status === 403) break; // key problem: stop, do not burn the list
        }
        await sleep(400);
      }
      await updateState(s => {
        const c = s.campaigns.find(x => x.id === job.campaign.id);
        if (!c) return;
        c.sent += results.filter(r => r.ok).length;
        c.skipped += results.filter(r => r.skip).length;
        const failed = results.filter(r => !r.ok && !r.skip);
        c.failed += failed.length;
        // Return the ones not attempted (after an auth error) to the queue and pause.
        const attempted = new Set(results.map(r => r.email));
        const notTried = job.emails.filter(e => !attempted.has(e));
        s.day.sent -= notTried.length + results.filter(r => r.skip).length;
        if (notTried.length) { c.queue.unshift(...notTried); c.status = 'paused'; }
        if (failed.length) c.lastError = failed[failed.length - 1].err?.slice(0, 200);
      });
    }
  } finally { g.__sender = false; }
  return { sent };
}
