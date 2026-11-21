/*
 * Teacher invitations (administrator only).
 * 1. Finder: visits the faculty / department pages of AISHE colleges' public websites and collects the addresses
 *    published next to a teacher's name or designation (robots.txt respected, honest user agent, slow rate,
 *    at most a few pages per site). Role addresses are left to the institution outreach.
 * 2. Invitations: ONE email per address, ever, through a SEPARATE sender (CANDIDATE_SMTP_* / CANDIDATE_MAIL_FROM —
 *    never the Brevo outreach account or the sign-in mail). Unsubscribe link in every email, the shared
 *    do-not-email list, a daily limit, and people who already have an AcadeXMatch account are skipped.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { RowDataPacket } from 'mysql2';
import { readJson, writeJson } from './persist';
import { withDb } from './db';
import { appUrl } from './mailer';
import { allAisheRecords } from './aishe';
import { outreachDb, suppressedSet, registered, fetchText, siteUrl, unsubscribeLink } from './outreach';
import { STORAGE_KEYS } from '@/lib/storage';
import { robotsAllows } from '@/lib/outreach/extract';
import { extractTeachers, facultyLinks, type FoundTeacher } from '@/lib/outreach/faculty';
import type { AisheRecord, UserAccount } from '@/types';

const KEY = 'teacher-outreach-state';
const g = globalThis as unknown as { __teacherTables?: Promise<void>; __teacherFinder?: Promise<void> | null; __teacherSender?: boolean; __teacherTransport?: Transporter | null };

export interface TeacherSettings { dailyLimit: number; includeFreeMail: boolean; pagesPerSite: number }
export interface TeacherFinder {
  running: boolean; stopRequested?: boolean; filter: { state?: string; category?: string };
  queue: string[]; total: number; done: number; found: number; skipped: number; pages: number;
  startedAt?: string; finishedAt?: string; lastError?: string;
}
export interface TeacherTemplate { subject: string; body: string }
interface State {
  settings: TeacherSettings; finder: TeacherFinder; template: TeacherTemplate;
  sending: boolean; sendingSince?: string; lastError?: string; day: { date: string; sent: number };
}

const SETTINGS: TeacherSettings = { dailyLimit: 50, includeFreeMail: false, pagesPerSite: 12 };
const blankFinder = (): TeacherFinder => ({ running: false, filter: {}, queue: [], total: 0, done: 0, found: 0, skipped: 0, pages: 0 });

export function defaultTemplate(): TeacherTemplate {
  return {
    subject: 'Faculty vacancies across India in one place — {{name}}',
    body: [
      'Dear {{name}},',
      'I am Udayakumar Palanivelu, an Assistant Professor and the founder of AcadeXMatch (acadexmatch.com), a recruitment platform built only for teachers in Indian higher education.',
      'AcadeXMatch collects faculty vacancies from universities and colleges across India, shows the 7th CPC pay, reservation and UGC / AICTE eligibility for each post, and tells you which ones you qualify for. You can set alerts for your subject and state, track your applications and apply to institutions that recruit on the platform.',
      `Creating a profile is free: ${appUrl()}/register`,
      'This is the only email we will send you. If faculty vacancies are not of interest, please ignore it.',
      'With regards,\nUdayakumar Palanivelu\nFounder, AcadeXMatch',
    ].join('\n\n'),
  };
}

async function readState(): Promise<State> {
  const s = (await readJson<Partial<State>>(KEY)) || {};
  return {
    settings: { ...SETTINGS, ...(s.settings || {}) },
    finder: { ...blankFinder(), ...(s.finder || {}) },
    template: s.template?.subject ? s.template : defaultTemplate(),
    sending: !!s.sending, sendingSince: s.sendingSince, lastError: s.lastError,
    day: s.day?.date ? s.day : { date: '', sent: 0 },
  };
}
let chain: Promise<unknown> = Promise.resolve();
function updateState<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => { const s = await readState(); const out = await fn(s); await writeJson(KEY, s); return out; });
  chain = run.catch(() => undefined);
  return run;
}

async function tables(): Promise<void> {
  g.__teacherTables ||= (async () => {
    const p = await outreachDb();
    await p.query(`CREATE TABLE IF NOT EXISTS acx_teacher_contacts (
      email VARCHAR(190) NOT NULL PRIMARY KEY,
      name VARCHAR(120) NULL, designation VARCHAR(60) NULL, department VARCHAR(120) NULL,
      aishe_code VARCHAR(40) NOT NULL, college VARCHAR(400) NOT NULL, state VARCHAR(80) NULL,
      source_url VARCHAR(600) NULL, found_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'new', sent_at TIMESTAMP NULL, message_id VARCHAR(200) NULL, error VARCHAR(300) NULL,
      KEY by_status (status), KEY by_state (state), KEY by_college (aishe_code)
    ) DEFAULT CHARSET=utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS acx_teacher_crawled (
      aishe_code VARCHAR(40) NOT NULL PRIMARY KEY, pages INT NOT NULL DEFAULT 0, found INT NOT NULL DEFAULT 0,
      note VARCHAR(200) NULL, crawled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) DEFAULT CHARSET=utf8mb4`);
  })().catch(e => { g.__teacherTables = undefined; throw e; });
  return g.__teacherTables;
}
const db = async () => { await tables(); return outreachDb(); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ finder

/**
 * Visits one college: home page → faculty / department pages → (one level deeper) department faculty lists.
 * At most `pages` pages, robots.txt respected, ~1 second between requests to the same site.
 */
export async function findTeachersFor(rec: AisheRecord, opts: { fetcher?: typeof fetchText; delayMs?: number; pages?: number; includeFreeMail?: boolean } = {}): Promise<{ teachers: (FoundTeacher & { source: string })[]; pages: number; note: string }> {
  const get = opts.fetcher || fetchText;
  const start = siteUrl(rec.website);
  if (!start) return { teachers: [], pages: 0, note: 'No website' };
  const origin = new URL(start).origin;
  const robots = await get(`${origin}/robots.txt`, 8000);
  const allowed = (u: string) => !robots.ok || robotsAllows(robots.text, new URL(u).pathname || '/');
  if (!allowed(start)) return { teachers: [], pages: 0, note: 'robots.txt does not allow it' };
  const limit = Math.max(2, Math.min(30, opts.pages ?? SETTINGS.pagesPerSite));
  const found = new Map<string, FoundTeacher & { source: string }>();
  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
  let pages = 0;
  while (queue.length && pages < limit) {
    const { url, depth } = queue.shift()!;
    if (seen.has(url) || !allowed(url)) continue;
    seen.add(url);
    if (pages) await sleep(opts.delayMs ?? 1000);
    const page = await get(url);
    pages++;
    if (!page.ok || !page.text) { if (!depth) return { teachers: [], pages, note: page.status ? `Website answered ${page.status}` : 'Website not reachable' }; continue; }
    for (const t of extractTeachers(page.text, page.url, { includeFreeMail: opts.includeFreeMail })) if (!found.has(t.email)) found.set(t.email, { ...t, source: page.url });
    if (depth < 2) for (const l of facultyLinks(page.text, page.url, depth ? 6 : 10)) if (!seen.has(l)) queue.push({ url: l, depth: depth + 1 });
  }
  const teachers = [...found.values()].slice(0, 300);
  return { teachers, pages, note: teachers.length ? `${teachers.length} teachers found on ${pages} pages` : `No teachers' addresses on ${pages} pages` };
}

async function saveTeachers(rec: AisheRecord, list: (FoundTeacher & { source: string })[], pages: number, note: string): Promise<number> {
  const p = await db();
  const supp = await suppressedSet();
  let added = 0;
  for (const t of list) {
    if (supp.has(t.email) || supp.has(`@${t.email.split('@')[1]}`)) continue;
    const [r] = await p.query(
      `INSERT INTO acx_teacher_contacts (email, name, designation, department, aishe_code, college, state, source_url) VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name = COALESCE(VALUES(name), name), designation = COALESCE(VALUES(designation), designation), department = COALESCE(VALUES(department), department), source_url = VALUES(source_url)`,
      [t.email, t.name, t.designation, t.department, rec.code, rec.name.slice(0, 400), rec.state || null, t.source.slice(0, 600)]) as unknown as [{ affectedRows: number }];
    if (r.affectedRows === 1) added++;
  }
  await p.query('INSERT INTO acx_teacher_crawled (aishe_code, pages, found, note) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pages = VALUES(pages), found = VALUES(found), note = VALUES(note), crawled_at = CURRENT_TIMESTAMP', [rec.code, pages, list.length, note.slice(0, 200)]);
  return added;
}

/** Colleges to visit: has a website, not registered on AcadeXMatch, not visited for teachers in 180 days. */
async function collegesFor(filter: TeacherFinder['filter']): Promise<AisheRecord[]> {
  const p = await db();
  const [rows] = await p.query<RowDataPacket[]>('SELECT aishe_code FROM acx_teacher_crawled WHERE crawled_at > (NOW() - INTERVAL 180 DAY)');
  const recent = new Set(rows.map(r => String(r.aishe_code)));
  const reg = await registered();
  return (await allAisheRecords()).filter(r =>
    siteUrl(r.website) && !recent.has(r.code) && !reg.codes.has(r.code) && !/closed|inactive|merged/i.test(r.status || '') &&
    (!filter.state || r.state === filter.state) && (!filter.category || r.category === filter.category));
}

export async function teacherFinderPreview(filter: TeacherFinder['filter']): Promise<number> {
  return (await collegesFor(filter)).length;
}

export async function startTeacherFinder(filter: TeacherFinder['filter'], limit: number): Promise<TeacherFinder> {
  const list = (await collegesFor(filter)).slice(0, Math.max(1, Math.min(1000, Math.round(limit) || 100)));
  if (!list.length) throw new Error('No colleges to visit for this choice: every college with a website here is on AcadeXMatch already or was visited in the last 180 days.');
  const st = await updateState(s => {
    if (s.finder.running) throw new Error('The teacher finder is already running.');
    s.finder = { ...blankFinder(), running: true, filter, queue: list.map(r => r.code), total: list.length, startedAt: new Date().toISOString() };
    return s.finder;
  });
  void runTeacherFinder();
  return st;
}

export async function stopTeacherFinder(): Promise<void> {
  await updateState(s => { if (s.finder.running) s.finder.stopRequested = true; });
}

/** Works through the queue, 3 colleges at a time; resumes after a restart (called by the scheduler). */
export function runTeacherFinder(): Promise<void> {
  if (g.__teacherFinder) return g.__teacherFinder;
  g.__teacherFinder = (async () => {
    try {
      const s0 = await readState();
      if (!s0.finder.running) return;
      const byCode = new Map((await allAisheRecords()).map(r => [r.code, r]));
      for (;;) {
        const { batch, settings } = await updateState(s => {
          if (!s.finder.running) return { batch: [] as string[], settings: s.settings };
          if (s.finder.stopRequested) { s.finder.running = false; s.finder.stopRequested = false; s.finder.finishedAt = new Date().toISOString(); return { batch: [], settings: s.settings }; }
          const take = s.finder.queue.splice(0, 3);
          if (!take.length) { s.finder.running = false; s.finder.finishedAt = new Date().toISOString(); }
          return { batch: take, settings: s.settings };
        });
        if (!batch.length) break;
        const results = await Promise.all(batch.map(async code => {
          const rec = byCode.get(code);
          if (!rec) return { found: 0, pages: 0, skipped: 1 };
          try {
            const r = await findTeachersFor(rec, { pages: settings.pagesPerSite, includeFreeMail: settings.includeFreeMail });
            const added = await saveTeachers(rec, r.teachers, r.pages, r.note);
            return { found: added, pages: r.pages, skipped: r.teachers.length ? 0 : 1 };
          } catch (e) {
            return { found: 0, pages: 0, skipped: 1, error: (e as Error).message };
          }
        }));
        await updateState(s => {
          s.finder.done += batch.length;
          s.finder.found += results.reduce((n, r) => n + r.found, 0);
          s.finder.pages += results.reduce((n, r) => n + r.pages, 0);
          s.finder.skipped += results.reduce((n, r) => n + r.skipped, 0);
          const err = results.find(r => 'error' in r && r.error) as { error?: string } | undefined;
          if (err?.error) s.finder.lastError = err.error.slice(0, 200);
        });
      }
    } finally { g.__teacherFinder = null; }
  })();
  return g.__teacherFinder;
}

// ------------------------------------------------------------------ sender (separate from every other mail)

export function teacherSenderConfigured(): boolean {
  return !!(process.env.CANDIDATE_SMTP_HOST && process.env.CANDIDATE_SMTP_USER && process.env.CANDIDATE_SMTP_PASS && process.env.CANDIDATE_MAIL_FROM);
}
function transport(): Transporter {
  if (!g.__teacherTransport) {
    const port = Number(process.env.CANDIDATE_SMTP_PORT || 587);
    g.__teacherTransport = nodemailer.createTransport({
      host: process.env.CANDIDATE_SMTP_HOST, port,
      secure: process.env.CANDIDATE_SMTP_SECURE ? process.env.CANDIDATE_SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.CANDIDATE_SMTP_USER, pass: process.env.CANDIDATE_SMTP_PASS },
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000,
    });
  }
  return g.__teacherTransport;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkify = (s: string) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" style="color:#800000">$1</a>');

export interface TeacherRow { email: string; name: string | null; designation: string | null; department: string | null; aishe_code: string; college: string; state: string | null; source_url: string | null; status: string; found_at: string; sent_at: string | null; error: string | null }

/** Greeting name: "Dr. R. Kumar" → "Dr. R. Kumar"; no name → "Sir / Madam". */
function greetingName(t: Pick<TeacherRow, 'name'>): string {
  return t.name?.trim() || 'Sir / Madam';
}

export function renderInvite(tpl: TeacherTemplate, t: Pick<TeacherRow, 'email' | 'name' | 'college' | 'source_url' | 'department'>) {
  const fill = (s: string) => s
    .replace(/\{\{\s*name\s*\}\}/gi, greetingName(t))
    .replace(/\{\{\s*college\s*\}\}/gi, t.college)
    .replace(/\{\{\s*department\s*\}\}/gi, t.department || 'your department')
    .replace(/\s+—\s+Sir \/ Madam$/, '');
  const subject = fill(tpl.subject).replace(/\s+—\s*$/, '');
  const body = fill(tpl.body);
  const unsub = unsubscribeLink(t.email);
  const why = `${t.email} is published on ${t.college}'s website${t.source_url ? ` (${t.source_url})` : ''}`;
  const footer = `You received this one-time email because ${why}. We will not email this address again. To be sure, unsubscribe: ${unsub}`;
  const text = `${body}\n\n—\n${footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 18px">
${body.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
<p style="margin:28px 0 0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:12px">You received this one-time email because ${esc(why)}. We will not email this address again. <a href="${esc(unsub)}" style="color:#777">Unsubscribe</a></p>
</div></body></html>`;
  return { subject, text, html, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

async function send(to: string, msg: ReturnType<typeof renderInvite>): Promise<string | undefined> {
  const info = await transport().sendMail({ from: process.env.CANDIDATE_MAIL_FROM, to, replyTo: process.env.CANDIDATE_REPLY_TO || undefined, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers });
  return info.messageId;
}

/** SMTP problems: login refused (stop sending), temporary (try later), or this address refused (mark failed). */
function classify(e: unknown): 'auth' | 'temporary' | 'address' {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.code === 'EAUTH' || err.responseCode === 535 || err.responseCode === 534 || err.responseCode === 530) return 'auth';
  if (err.responseCode && err.responseCode >= 500 && err.responseCode < 600) return 'address';
  return 'temporary';
}

async function registeredEmails(): Promise<Set<string>> {
  return withDb(null, d => new Set(((d[STORAGE_KEYS.USERS] as UserAccount[]) || []).map(u => (u.email || '').toLowerCase()).filter(Boolean)));
}

export async function sendTeacherTest(to: string, tpl?: Partial<TeacherTemplate>): Promise<void> {
  if (!teacherSenderConfigured()) throw new Error('The teacher-invitation sender is not set up yet (CANDIDATE_SMTP_* settings).');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) throw new Error('Enter a valid email address for the test.');
  const s = await readState();
  const t = { subject: tpl?.subject || s.template.subject, body: tpl?.body || s.template.body };
  const msg = renderInvite(t, { email: to, name: 'Dr. A. Sample', college: 'Sample College of Engineering', department: 'Computer Science', source_url: 'https://www.example.ac.in/cse/faculty' });
  await send(to, { ...msg, subject: `[TEST] ${msg.subject}` });
}

/**
 * Sends the next invitations within today's limit (called by the scheduler every few minutes while sending is on).
 * Each address is emailed once: it is marked before the message goes out, so a crash never sends twice.
 */
export async function teacherSendDue(): Promise<{ sent: number }> {
  if (g.__teacherSender || !teacherSenderConfigured()) return { sent: 0 };
  g.__teacherSender = true;
  let sent = 0;
  try {
    const s0 = await readState();
    if (!s0.sending) return { sent: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const used = s0.day.date === today ? s0.day.sent : 0;
    const room = Math.min(25, s0.settings.dailyLimit - used);
    if (room <= 0) return { sent: 0 };
    const p = await db();
    const [rows] = await p.query<RowDataPacket[]>("SELECT * FROM acx_teacher_contacts WHERE status = 'new' ORDER BY found_at, email LIMIT ?", [room * 3]);
    if (!rows.length) return { sent: 0 };
    const supp = await suppressedSet();
    const users = await registeredEmails();
    const reg = await registered();
    let stop: string | null = null;
    for (const row of rows as unknown as TeacherRow[]) {
      if (sent >= room) break;
      const email = row.email;
      const domain = email.split('@')[1];
      if (supp.has(email) || supp.has(`@${domain}`)) { await p.query("UPDATE acx_teacher_contacts SET status = 'unsubscribed' WHERE email = ?", [email]); continue; }
      if (users.has(email)) { await p.query("UPDATE acx_teacher_contacts SET status = 'joined' WHERE email = ?", [email]); continue; }
      if (reg.codes.has(row.aishe_code)) { await p.query("UPDATE acx_teacher_contacts SET status = 'removed', error = 'College joined AcadeXMatch' WHERE email = ?", [email]); continue; }
      // Claim it first: never twice, even if the server restarts mid-send.
      const [claim] = await p.query("UPDATE acx_teacher_contacts SET status = 'sending' WHERE email = ? AND status = 'new'", [email]) as unknown as [{ affectedRows: number }];
      if (claim.affectedRows !== 1) continue;
      try {
        const id = await send(email, renderInvite(s0.template, row));
        await p.query("UPDATE acx_teacher_contacts SET status = 'sent', sent_at = NOW(), message_id = ?, error = NULL WHERE email = ?", [(id || '').slice(0, 200), email]);
        sent++;
      } catch (e) {
        const kind = classify(e);
        const msg = String((e as Error).message || e).slice(0, 300);
        if (kind === 'address') { await p.query("UPDATE acx_teacher_contacts SET status = 'failed', error = ? WHERE email = ?", [msg, email]); continue; }
        await p.query("UPDATE acx_teacher_contacts SET status = 'new', error = ? WHERE email = ?", [msg, email]);
        stop = kind === 'auth' ? `The mail server refused the login: ${msg}` : `Will retry: ${msg}`;
        if (kind === 'auth') g.__teacherTransport = null;
        await updateState(s => { s.lastError = stop!; if (kind === 'auth') s.sending = false; });
        break;
      }
      await sleep(1500);
    }
    await updateState(s => {
      const d = new Date().toISOString().slice(0, 10);
      s.day = { date: d, sent: (s.day.date === d ? s.day.sent : 0) + sent };
      if (sent && !stop) s.lastError = undefined;
    });
    return { sent };
  } finally { g.__teacherSender = false; }
}

/** After a crash mid-send, an address left as "sending" is treated as sent (it may have gone out). */
async function settleStuck(): Promise<void> {
  const p = await db();
  await p.query("UPDATE acx_teacher_contacts SET status = 'sent', error = 'Server restarted while sending; treated as sent so it is never emailed twice' WHERE status = 'sending'");
}

// ------------------------------------------------------------------ admin

export async function teacherSummary() {
  const s = await readState();
  const p = await db();
  if (!g.__teacherSender) await settleStuck().catch(() => undefined);
  const [counts] = await p.query<RowDataPacket[]>('SELECT status, COUNT(*) n FROM acx_teacher_contacts GROUP BY status');
  const [colleges] = await p.query<RowDataPacket[]>('SELECT COUNT(*) n, COALESCE(SUM(found > 0), 0) withTeachers, COALESCE(SUM(pages), 0) pages FROM acx_teacher_crawled');
  const [states] = await p.query<RowDataPacket[]>('SELECT state, COUNT(*) n FROM acx_teacher_contacts GROUP BY state ORDER BY n DESC LIMIT 40');
  const users = await registeredEmails();
  const [sentRows] = await p.query<RowDataPacket[]>("SELECT email FROM acx_teacher_contacts WHERE status IN ('sent','joined')");
  const joined = sentRows.filter(r => users.has(String(r.email))).length;
  const today = new Date().toISOString().slice(0, 10);
  const aishe = await allAisheRecords().catch(() => [] as AisheRecord[]);
  return {
    senderConfigured: teacherSenderConfigured(),
    sender: process.env.CANDIDATE_MAIL_FROM || null,
    settings: s.settings, finder: { ...s.finder, queue: undefined, queued: s.finder.queue.length },
    template: s.template, sending: s.sending, sendingSince: s.sendingSince, lastError: s.lastError || null,
    sentToday: s.day.date === today ? s.day.sent : 0,
    counts: Object.fromEntries(counts.map(r => [String(r.status), Number(r.n)])) as Record<string, number>,
    visited: Number(colleges[0]?.n || 0), visitedWithTeachers: Number(colleges[0]?.withTeachers || 0), pagesRead: Number(colleges[0]?.pages || 0),
    joined,
    byState: states.map(r => ({ state: r.state ? String(r.state) : 'Unknown', n: Number(r.n) })),
    states: [...new Set(aishe.map(r => r.state).filter(Boolean))].sort() as string[],
    categories: [...new Set(aishe.map(r => r.category).filter(Boolean))].sort() as string[],
  };
}

export async function listTeachers(q: { search?: string; status?: string; state?: string; limit?: number; offset?: number }): Promise<{ rows: TeacherRow[]; total: number }> {
  const p = await db();
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.search) { where.push('(email LIKE ? OR name LIKE ? OR college LIKE ? OR department LIKE ?)'); const v = `%${q.search}%`; args.push(v, v, v, v); }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.state) { where.push('state = ?'); args.push(q.state); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[c]] = await p.query<RowDataPacket[]>(`SELECT COUNT(*) n FROM acx_teacher_contacts ${w}`, args);
  const [rows] = await p.query<RowDataPacket[]>(`SELECT * FROM acx_teacher_contacts ${w} ORDER BY found_at DESC, email LIMIT ? OFFSET ?`, [...args, Math.min(200, q.limit || 50), Math.max(0, q.offset || 0)]);
  return { rows: rows as unknown as TeacherRow[], total: Number(c.n) };
}

export async function removeTeacher(email: string): Promise<void> {
  const p = await db();
  await p.query("UPDATE acx_teacher_contacts SET status = 'removed' WHERE email = ? AND status IN ('new','failed')", [email.trim().toLowerCase()]);
}

export async function saveTeacherSettings(raw: Partial<TeacherSettings>): Promise<TeacherSettings> {
  return updateState(s => {
    if (raw.dailyLimit != null) s.settings.dailyLimit = Math.max(1, Math.min(500, Math.round(Number(raw.dailyLimit)) || SETTINGS.dailyLimit));
    if (raw.pagesPerSite != null) s.settings.pagesPerSite = Math.max(2, Math.min(30, Math.round(Number(raw.pagesPerSite)) || SETTINGS.pagesPerSite));
    if (raw.includeFreeMail != null) s.settings.includeFreeMail = !!raw.includeFreeMail;
    return s.settings;
  });
}

export async function saveTeacherTemplate(raw: Partial<TeacherTemplate>): Promise<TeacherTemplate> {
  const subject = String(raw.subject || '').trim().slice(0, 200);
  const body = String(raw.body || '').trim().slice(0, 8000);
  if (subject.length < 5) throw new Error('Write a subject.');
  if (body.length < 40) throw new Error('Write the message (at least a few sentences).');
  return updateState(s => { s.template = { subject, body }; return s.template; });
}

export async function setTeacherSending(on: boolean): Promise<void> {
  if (on && !teacherSenderConfigured()) throw new Error('Set up the teacher-invitation sender first (CANDIDATE_SMTP_HOST, CANDIDATE_SMTP_USER, CANDIDATE_SMTP_PASS, CANDIDATE_MAIL_FROM in GoDaddy).');
  await updateState(s => { s.sending = on; s.sendingSince = on ? new Date().toISOString() : undefined; if (on) s.lastError = undefined; });
  if (on) void teacherSendDue();
}
