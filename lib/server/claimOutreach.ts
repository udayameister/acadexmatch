/*
 * "Claim your listing" outreach (administrator only).
 *
 * Many colleges already have vacancies live on AcadeXMatch, imported from their notices. We write to the recruitment
 * contact published in that notice (or the college's own role address found by the institution outreach):
 * "Your Assistant Professor vacancy is already live on AcadeXMatch and candidates are viewing it. Register free
 * to receive applications directly." — we arrive bringing applicants, not a cold pitch.
 *
 * - Sent through the institution outreach sender (Brevo), with the shared unsubscribe / do-not-email list.
 * - Only real numbers: the views sentence appears only when the vacancy has been viewed at least `minViews` times.
 * - At most one email per institution every `gapDays`, three in total; never to colleges already registered,
 *   and never within 14 days of an institution-outreach email to the same address.
 * - Automatic mode picks up newly posted vacancies once they have been live for `waitDays`.
 * - The claim link opens /claim/<token>: the vacancies, then "Register free"; the registration is recorded and the
 *   administrator attaches the vacancies to the new institution account after checking it.
 * - A call list (phone numbers from the notices) with "called" notes for the administrator.
 */
import { createHmac } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import { readJson, writeJson } from './persist';
import { serverSecret, safeEqual } from './security';
import { withDb } from './db';
import { appUrl } from './mailer';
import { jobViewCounts } from './jobViews';
import { outreachDb, suppressedSet, registered, sendOutreachEmail, outreachSenderConfigured, unsubscribeLink } from './outreach';
import { STORAGE_KEYS } from '@/lib/storage';
import { baseDomain } from '@/lib/outreach/extract';
import type { Institute, Job } from '@/types';

const KEY = 'claim-outreach';
const g = globalThis as unknown as { __claimSender?: boolean };

export interface ClaimSettings { auto: boolean; dailyLimit: number; gapDays: number; maxEmails: number; waitDays: number; minViews: number; minDaysLeft: number }
export interface ClaimTemplate { subject: string; body: string }
interface SentMail { to: string; at: string; jobIds: string[]; views: number; messageId?: string }
export interface InstRecord {
  emails: SentMail[];
  clicks: number; lastClick?: string;
  called?: string; callNote?: string;
  registrations?: { userId: string; instituteId: string; name: string; email: string; at: string }[];
  attached?: { at: string; instituteId: string; jobIds: string[] };
  skip?: boolean; lastError?: string;
}
interface State { settings: ClaimSettings; template: ClaimTemplate; inst: Record<string, InstRecord>; day: { date: string; sent: number }; lastError?: string }

const SETTINGS: ClaimSettings = { auto: false, dailyLimit: 40, gapDays: 30, maxEmails: 3, waitDays: 3, minViews: 5, minDaysLeft: 4 };

export function defaultClaimTemplate(): ClaimTemplate {
  return {
    subject: 'Your {{vacancy}} vacancy is already live on AcadeXMatch',
    body: [
      'Dear Sir / Madam,',
      'Your {{vacancy}} vacancy at {{college}} is already live on AcadeXMatch, India\'s recruitment platform for higher education. {{views_sentence}}',
      'View it here: {{vacancy_link}}',
      'Register free to receive applications directly, with each candidate\'s qualifications, NET/SET/Ph.D. status, publications and experience checked against UGC/AICTE norms, and shortlist them in one place instead of sorting emails:',
      '{{claim_link}}',
      'All institution tools are free for verified institutions until 3 November 2027.',
      'With regards,\nUdayakumar Palanivelu\nFounder, AcadeXMatch\ninfo@acadexmatch.com',
    ].join('\n\n'),
  };
}

async function readState(): Promise<State> {
  const s = (await readJson<Partial<State>>(KEY)) || {};
  return {
    settings: { ...SETTINGS, ...(s.settings || {}) },
    template: s.template?.subject ? s.template : defaultClaimTemplate(),
    inst: s.inst || {},
    day: s.day?.date ? s.day : { date: '', sent: 0 },
    lastError: s.lastError,
  };
}
let chain: Promise<unknown> = Promise.resolve();
function updateState<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => { const s = await readState(); const out = await fn(s); await writeJson(KEY, s); return out; });
  chain = run.catch(() => undefined);
  return run;
}
const ist = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// ------------------------------------------------------------------ claim tokens

export function claimToken(instKey: string): string {
  const id = Buffer.from(instKey).toString('base64url');
  const sig = createHmac('sha256', serverSecret()).update(`claim:${instKey}`).digest('base64url').slice(0, 16);
  return `${id}.${sig}`;
}
export function readClaimToken(token: string): string | null {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig) return null;
  let key = '';
  try { key = Buffer.from(id, 'base64url').toString('utf8'); } catch { return null; }
  return key && safeEqual(claimToken(key).split('.')[1], sig) ? key : null;
}
export const claimLink = (instKey: string) => `${appUrl()}/claim/${claimToken(instKey)}`;

// ------------------------------------------------------------------ who to write to

const FREE_MAIL = /^(gmail|yahoo|ymail|rediffmail|hotmail|outlook|live|icloud|zoho)\.(com|co\.in|in)$/i;
const domainOf = (url?: string | null) => { try { return url ? baseDomain(new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname) : ''; } catch { return ''; } };

export interface ClaimGroup {
  key: string; college: string; state: string | null; city: string | null;
  jobs: { id: string; title: string; postedAt: string; deadline: string | null; views: number; last7: number }[];
  views: number; last7: number;
  emails: { email: string; from: 'notice' | 'website' }[];
  phones: string[];
  domain: string;
  record: InstRecord;
  /** Why it would not be emailed now ('' = ready). */
  hold: string;
}

/** Live, unclaimed vacancies grouped by institution, with recipients and whether each is ready to email. */
export async function claimGroups(): Promise<{ groups: ClaimGroup[]; since: string }> {
  const s = await readState();
  const { jobs, institutes } = await withDb(null, d => ({ jobs: (d[STORAGE_KEYS.JOBS] as Job[]) || [], institutes: (d[STORAGE_KEYS.INSTITUTES] as Institute[]) || [] }));
  const views = await jobViewCounts().catch(() => ({ since: '', jobs: {} as Record<string, { total: number; last7: number }> }));
  const reg = await registered();
  const regNames = new Set(institutes.map(i => i.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));
  const supp = await suppressedSet();
  const today = ist();
  const byKey = new Map<string, Job[]>();
  for (const j of jobs) {
    if (j.status !== 'published' || j.isClaimedByInstitute !== false) continue;
    if (j.applicationDeadline && j.applicationDeadline < today) continue;
    const k = j.instituteId || `name-${j.instituteName}`;
    byKey.set(k, [...(byKey.get(k) || []), j]);
  }
  // Website role addresses already found by the institution outreach, by domain.
  const p = await outreachDb();
  const [rows] = await p.query<RowDataPacket[]>("SELECT email, last_sent_at FROM acx_outreach_contacts WHERE status NOT IN ('unsubscribed','removed','bounced') ORDER BY score DESC");
  const siteMail = new Map<string, string[]>();
  const lastInstitutionMail = new Map<string, number>();
  for (const r of rows) {
    const e = String(r.email);
    const d = baseDomain(e.split('@')[1]);
    siteMail.set(d, [...(siteMail.get(d) || []), e]);
    if (r.last_sent_at) lastInstitutionMail.set(e, new Date(r.last_sent_at).getTime());
  }
  const groups: ClaimGroup[] = [];
  for (const [key, list] of byKey) {
    const first = list[0];
    const dWebsite = domainOf(first.details?.officialWebsite) || (first.source?.kind !== 'aggregator' ? domainOf(first.source?.url) : '');
    const noticeMails = [...new Set(list.flatMap(j => (j.details?.applyEmails || []).map(a => a.email.toLowerCase())))];
    const domain = dWebsite || noticeMails.map(e => e.split('@')[1]).filter(d => !FREE_MAIL.test(d)).map(baseDomain)[0] || '';
    const emails: ClaimGroup['emails'] = [
      ...noticeMails.sort((a, b) => Number(FREE_MAIL.test(a.split('@')[1])) - Number(FREE_MAIL.test(b.split('@')[1]))).map(e => ({ email: e, from: 'notice' as const })),
      ...(domain ? (siteMail.get(domain) || []).filter(e => !noticeMails.includes(e)).slice(0, 2).map(e => ({ email: e, from: 'website' as const })) : []),
    ].filter(e => !supp.has(e.email) && !supp.has(`@${e.email.split('@')[1]}`));
    const jobsOut = list.map(j => ({ id: j.id, title: j.title, postedAt: j.postedAt, deadline: j.applicationDeadline || null, views: views.jobs[j.id]?.total || 0, last7: views.jobs[j.id]?.last7 || 0 }))
      .sort((a, b) => b.views - a.views);
    const rec = s.inst[key] || { emails: [], clicks: 0 };
    const total = jobsOut.reduce((n, j) => n + j.views, 0);
    const last = rec.emails[rec.emails.length - 1];
    const ready = jobsOut.filter(j => daysBetween(j.postedAt.slice(0, 10), today) >= s.settings.waitDays && (!j.deadline || daysBetween(today, j.deadline) >= s.settings.minDaysLeft));
    const newSinceLast = last ? jobsOut.some(j => !last.jobIds.includes(j.id)) : true;
    const to = emails[0]?.email;
    let hold = '';
    if (rec.skip) hold = 'Excluded by you';
    else if (rec.attached) hold = 'Claimed';
    else if (rec.registrations?.length) hold = 'Registered — attach the vacancies';
    else if ((domain && reg.domains.has(domain)) || regNames.has(first.instituteName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())) hold = 'Already registered on AcadeXMatch';
    else if (!to) hold = first.details?.contactPhones?.length ? 'No email — call instead' : 'No contact found';
    else if (rec.emails.length >= s.settings.maxEmails) hold = `Emailed ${rec.emails.length} times already`;
    else if (last && daysBetween(last.at, new Date().toISOString()) < s.settings.gapDays) hold = `Emailed ${ist(new Date(last.at))}; next after ${s.settings.gapDays} days`;
    else if (last && !newSinceLast) hold = 'No new vacancy since the last email';
    else if (!ready.length) hold = `Waiting: live for ${s.settings.waitDays} days with ${s.settings.minDaysLeft}+ days left`;
    else if (lastInstitutionMail.has(to) && Date.now() - lastInstitutionMail.get(to)! < 14 * 86_400_000) hold = 'Got an institution-outreach email in the last 14 days';
    groups.push({
      key, college: first.instituteName, state: first.location?.state || null, city: first.location?.city || null,
      jobs: jobsOut, views: total, last7: jobsOut.reduce((n, j) => n + j.last7, 0), emails,
      phones: [...new Set(list.flatMap(j => j.details?.contactPhones || []))].slice(0, 4),
      domain, record: rec, hold,
    });
  }
  groups.sort((a, b) => Number(!!a.hold) - Number(!!b.hold) || b.views - a.views || a.college.localeCompare(b.college));
  return { groups, since: views.since };
}

// ------------------------------------------------------------------ the email

const pretty = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function renderClaim(tpl: ClaimTemplate, grp: Pick<ClaimGroup, 'key' | 'college' | 'jobs'>, to: string, minViews: number) {
  const top = grp.jobs[0];
  const more = grp.jobs.length - 1;
  const vacancy = `${top.title}${more > 0 ? ` (and ${more} more)` : ''}`;
  const views = grp.jobs.reduce((n, j) => n + j.views, 0);
  const viewsSentence = views >= minViews
    ? `Candidates have viewed ${grp.jobs.length > 1 ? 'your vacancies' : 'it'} ${views.toLocaleString('en-IN')} times since ${pretty(grp.jobs.map(j => j.postedAt).sort()[0])}.`
    : 'Candidates across India can already see it.';
  const fill = (t: string) => t
    .replace(/\{\{\s*vacancy\s*\}\}/gi, vacancy)
    .replace(/\{\{\s*college\s*\}\}/gi, grp.college)
    .replace(/\{\{\s*views_sentence\s*\}\}/gi, viewsSentence)
    .replace(/\{\{\s*views\s*\}\}/gi, views.toLocaleString('en-IN'))
    .replace(/\{\{\s*vacancy_link\s*\}\}/gi, `${appUrl()}/jobs/${encodeURIComponent(top.id)}`)
    .replace(/\{\{\s*claim_link\s*\}\}/gi, claimLink(grp.key))
    .replace(/\{\{\s*deadline\s*\}\}/gi, top.deadline ? pretty(top.deadline) : 'the closing date');
  const subject = fill(tpl.subject).slice(0, 200);
  const body = fill(tpl.body);
  const unsub = unsubscribeLink(to);
  const why = `${to} is given as the recruitment contact for ${grp.college}`;
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const linkify = (x: string) => esc(x).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1" style="color:#800000">$1</a>');
  const text = `${body}\n\n—\nYou received this email because ${why}. To receive no further emails from AcadeXMatch, unsubscribe: ${unsub}`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;padding:24px 18px">
${body.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
<p style="margin:28px 0 0;font-size:12px;color:#777;border-top:1px solid #eee;padding-top:12px">You received this email because ${esc(why)}. <a href="${esc(unsub)}" style="color:#777">Unsubscribe</a> and we will not email this address again.</p>
</div></body></html>`;
  return { subject, text, html, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

// ------------------------------------------------------------------ sending

/** Emails one institution now (administrator's button, or the automatic run). */
export async function sendClaim(key: string, opts: { force?: boolean; to?: string } = {}): Promise<SentMail> {
  if (!outreachSenderConfigured()) throw new Error('The outreach sender (Brevo) is not set up.');
  const s = await readState();
  const { groups } = await claimGroups();
  const grp = groups.find(x => x.key === key);
  if (!grp) throw new Error('This institution has no live unclaimed vacancy.');
  if (grp.hold && !(opts.force && /^(Waiting|No new vacancy|Got an institution)/.test(grp.hold))) throw new Error(`Not sent: ${grp.hold}.`);
  const to = (opts.to || grp.emails[0]?.email || '').toLowerCase();
  if (!to || !grp.emails.some(e => e.email === to)) throw new Error('No usable email address for this institution.');
  const msg = renderClaim(s.template, grp, to, s.settings.minViews);
  const messageId = await sendOutreachEmail(to, msg);
  const mail: SentMail = { to, at: new Date().toISOString(), jobIds: grp.jobs.map(j => j.id), views: grp.views, messageId };
  await updateState(st => {
    const rec = st.inst[key] || { emails: [], clicks: 0 };
    rec.emails = [...rec.emails, mail];
    rec.lastError = undefined;
    st.inst[key] = rec;
    const d = ist();
    st.day = { date: d, sent: (st.day.date === d ? st.day.sent : 0) + 1 };
  });
  return mail;
}

/** Automatic run (scheduler, every 10 minutes): within today's limit, 9:00–18:00 IST, institutions that are ready. */
export async function claimSendDue(opts: { now?: Date } = {}): Promise<{ sent: number }> {
  if (g.__claimSender || !outreachSenderConfigured()) return { sent: 0 };
  g.__claimSender = true;
  let sent = 0;
  try {
    const s = await readState();
    if (!s.settings.auto) return { sent: 0 };
    const now = opts.now || new Date();
    const hour = new Date(now.getTime() + 5.5 * 3600_000).getUTCHours();
    if (hour < 9 || hour >= 18) return { sent: 0 };
    const used = s.day.date === ist(now) ? s.day.sent : 0;
    const room = Math.min(15, s.settings.dailyLimit - used);
    if (room <= 0) return { sent: 0 };
    const { groups } = await claimGroups();
    for (const grp of groups.filter(x => !x.hold).slice(0, room)) {
      try { await sendClaim(grp.key); sent++; } catch (e) {
        const m = (e as Error & { status?: number }).message || String(e);
        const status = (e as { status?: number }).status;
        await updateState(st => { st.lastError = m.slice(0, 300); if (status === 400) { st.inst[grp.key] = { ...(st.inst[grp.key] || { emails: [], clicks: 0 }), lastError: m.slice(0, 200) }; } });
        if (!status || status === 401 || status === 403 || status === 429 || status >= 500) break; // sender problem: try later
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    if (sent) await updateState(st => { st.lastError = undefined; });
    return { sent };
  } finally { g.__claimSender = false; }
}

// ------------------------------------------------------------------ claim page, registrations, attaching

/** Public: what the claim page shows (vacancies only; no contact data). */
export async function claimInfo(token: string) {
  const key = readClaimToken(token);
  if (!key) return null;
  const jobs = await withDb(null, d => ((d[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.instituteId === key && j.status === 'published'));
  if (!jobs.length) return null;
  return {
    college: jobs[0].instituteName,
    city: jobs[0].location?.city || null, state: jobs[0].location?.state || null,
    claimed: jobs.every(j => j.isClaimedByInstitute !== false),
    jobs: jobs.map(j => ({ id: j.id, title: j.title, deadline: j.applicationDeadline || null, department: j.department || null })),
  };
}

export async function recordClaimClick(token: string): Promise<void> {
  const key = readClaimToken(token);
  if (!key) return;
  await updateState(s => { const r = s.inst[key] || { emails: [], clicks: 0 }; r.clicks = (r.clicks || 0) + 1; r.lastClick = new Date().toISOString(); s.inst[key] = r; });
}

/** Called after an institution account is created from a claim link. */
export async function recordClaimRegistration(token: string, user: { id: string; name: string; email: string; instituteId?: string }): Promise<void> {
  const key = readClaimToken(token);
  if (!key || !user.instituteId) return;
  await updateState(s => {
    const r = s.inst[key] || { emails: [], clicks: 0 };
    r.registrations = [...(r.registrations || []).filter(x => x.userId !== user.id), { userId: user.id, instituteId: user.instituteId!, name: user.name, email: user.email, at: new Date().toISOString() }];
    s.inst[key] = r;
  });
}

/**
 * Administrator: moves the institution's imported vacancies to its new account, so applications come through
 * AcadeXMatch. Only after checking that the account really belongs to that institution.
 */
export async function attachClaim(key: string, instituteId: string): Promise<{ attached: number }> {
  const res = await withDb(null, d => {
    const inst = ((d[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).find(i => i.id === instituteId);
    if (!inst) throw new Error('That institution account no longer exists.');
    const jobs = (d[STORAGE_KEYS.JOBS] as Job[]) || [];
    const ids: string[] = [];
    for (const j of jobs) {
      if (j.instituteId !== key || j.isClaimedByInstitute !== false) continue;
      j.instituteId = inst.id; j.instituteName = inst.name; j.instituteShortName = inst.shortName || inst.name; j.instituteLogo = inst.logo || j.instituteLogo;
      j.isClaimedByInstitute = true;
      ids.push(j.id);
    }
    return ids;
  }, { write: true });
  await updateState(s => { const r = s.inst[key] || { emails: [], clicks: 0 }; r.attached = { at: new Date().toISOString(), instituteId, jobIds: res }; s.inst[key] = r; });
  return { attached: res.length };
}

export async function markCalled(key: string, note: string): Promise<void> {
  await updateState(s => { const r = s.inst[key] || { emails: [], clicks: 0 }; r.called = new Date().toISOString(); r.callNote = note.slice(0, 300); s.inst[key] = r; });
}
export async function setSkip(key: string, skip: boolean): Promise<void> {
  await updateState(s => { const r = s.inst[key] || { emails: [], clicks: 0 }; r.skip = skip; s.inst[key] = r; });
}

export async function claimSummary() {
  const s = await readState();
  const { groups, since } = await claimGroups();
  const today = ist();
  return {
    senderConfigured: outreachSenderConfigured(),
    settings: s.settings, template: s.template, lastError: s.lastError || null,
    sentToday: s.day.date === today ? s.day.sent : 0, viewsSince: since,
    totals: {
      institutions: groups.length, vacancies: groups.reduce((n, x) => n + x.jobs.length, 0),
      ready: groups.filter(x => !x.hold).length, withEmail: groups.filter(x => x.emails.length).length,
      phoneOnly: groups.filter(x => !x.emails.length && x.phones.length).length,
      emailed: Object.values(s.inst).filter(r => r.emails.length).length,
      clicked: Object.values(s.inst).filter(r => r.clicks > 0).length,
      registered: Object.values(s.inst).filter(r => r.registrations?.length).length,
      claimed: Object.values(s.inst).filter(r => r.attached).length,
    },
    groups: groups.map(x => ({ ...x, claimUrl: claimLink(x.key) })),
  };
}

export async function saveClaimSettings(raw: Partial<ClaimSettings>): Promise<ClaimSettings> {
  return updateState(s => {
    const n = (v: unknown, lo: number, hi: number, d: number) => (v == null ? d : Math.max(lo, Math.min(hi, Math.round(Number(v)) || d)));
    s.settings = {
      auto: raw.auto != null ? !!raw.auto : s.settings.auto,
      dailyLimit: n(raw.dailyLimit, 1, 300, s.settings.dailyLimit),
      gapDays: n(raw.gapDays, 7, 365, s.settings.gapDays),
      maxEmails: n(raw.maxEmails, 1, 5, s.settings.maxEmails),
      waitDays: n(raw.waitDays, 0, 30, s.settings.waitDays),
      minViews: n(raw.minViews, 1, 1000, s.settings.minViews),
      minDaysLeft: n(raw.minDaysLeft, 0, 60, s.settings.minDaysLeft),
    };
    return s.settings;
  });
}
export async function saveClaimTemplate(raw: Partial<ClaimTemplate>): Promise<ClaimTemplate> {
  const subject = String(raw.subject || '').trim().slice(0, 200);
  const body = String(raw.body || '').trim().slice(0, 8000);
  if (subject.length < 5) throw new Error('Write a subject.');
  if (!/\{\{\s*claim_link\s*\}\}/.test(body)) throw new Error('Keep {{claim_link}} in the message — it is how the college registers and claims its vacancy.');
  return updateState(s => { s.template = { subject, body }; return s.template; });
}
/** Preview / test: the email for one institution, sent to the administrator's address. */
export async function claimTest(key: string, to: string, tpl?: Partial<ClaimTemplate>): Promise<{ subject: string; text: string }> {
  const s = await readState();
  const { groups } = await claimGroups();
  const grp = groups.find(x => x.key === key) || groups[0];
  if (!grp) throw new Error('No live unclaimed vacancy to preview.');
  const msg = renderClaim({ subject: tpl?.subject || s.template.subject, body: tpl?.body || s.template.body }, grp, to || 'test@example.com', s.settings.minViews);
  if (to) {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) throw new Error('Enter a valid address for the test.');
    await sendOutreachEmail(to, { ...msg, subject: `[TEST] ${msg.subject}` });
  }
  return { subject: msg.subject, text: msg.text };
}
