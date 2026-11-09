/*
 * AI resume builder. One paid session (an `ai_resume` payment) gives a candidate:
 *   1. a chat interview by the "interviewer" model, seeded with their AcadeXMatch profile;
 *   2. an AI-written resume (the "writer" model) saved as a normal builder draft;
 *   3. up to MAX_IMPROVES rewrites by a separate "improver" model, each scored before/after with the
 *      site's own ATS checker. The better-scoring version is kept.
 * Every prompt forbids inventing facts or figures; the improver may only rephrase what the candidate gave.
 */
import { randomBytes } from 'crypto';
import { readJson, writeJson } from './persist';
import { withDb, accountOf, unverified } from './db';
import { STORAGE_KEYS } from '@/lib/storage';
import { paymentState } from '@/lib/paymentLabel';
import { aiResumePriceFor, onPaidPremium } from '@/lib/aiResumePricing';
import { cleanBuilderData, builderText, TEMPLATES, type BuilderData, type TemplateId } from '@/lib/resume/builder';
import { parseResume } from '@/lib/resume/parse';
import { analyzeResume } from '@/lib/resume/score';
import { parseJobDescription } from '@/lib/resume/jd';
import { getResumeSettings, getDraft, saveDraft } from './resumes';
import { AI_MODELS, aiResumeAvailable, aiConfigured, callClaude, AiError, type AiMessage, type AiTool } from './ai';
import { AI_RESUME_SESSION_DAYS, type CandidateProfile, type Payment, type PlanSettings, type UserAccount } from '@/types';

export const LIMITS = { userMessages: 40, messageChars: 2000, jobChars: 12_000, builds: 3, improves: 3 };

export interface AiChatMessage { role: 'user' | 'assistant'; content: string; at: string }
export interface AiRun { at: string; kind: 'build' | 'improve'; model: string; before: number | null; after: number; kept: boolean; changes: string[]; questions: string[] }
export interface AiSession {
  id: string; paymentId: string; createdAt: string; expiresAt: string;
  messages: AiChatMessage[]; ready: boolean; jobText: string;
  draftId: string | null; builds: number; improves: number; runs: AiRun[];
  tokens: { input: number; output: number };
}
interface Store { sessions: AiSession[] }

const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '');
const storeName = (userId: string) => `airesume-${safe(userId)}`;
const locks = new Map<string, Promise<unknown>>();
async function withStore<T>(userId: string, fn: (s: Store) => T | Promise<T>, write = true): Promise<T> {
  const key = safe(userId);
  const prev = locks.get(key) || Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>(r => { release = r; });
  const chain = prev.then(() => mine);
  locks.set(key, chain);
  await prev.catch(() => undefined);
  try {
    const s: Store = { sessions: [], ...((await readJson<Store>(storeName(userId))) || {}) };
    const out = await fn(s);
    if (write) await writeJson(storeName(userId), s);
    return out;
  } finally { release(); if (locks.get(key) === chain) locks.delete(key); }
}

interface Stats { sessions: number; builds: number; improves: number; messages: number; tokensIn: number; tokensOut: number; failures: number }
let statsQ: Promise<unknown> = Promise.resolve();
function bump(fn: (s: Stats) => void): void {
  statsQ = statsQ.then(async () => {
    const s: Stats = { sessions: 0, builds: 0, improves: 0, messages: 0, tokensIn: 0, tokensOut: 0, failures: 0, ...((await readJson<Stats>('airesume-stats')) || {}) };
    fn(s); await writeJson('airesume-stats', s);
  }).catch(() => undefined);
}
export async function aiResumeStats(): Promise<Stats> {
  return { sessions: 0, builds: 0, improves: 0, messages: 0, tokensIn: 0, tokensOut: 0, failures: 0, ...((await readJson<Stats>('airesume-stats')) || {}) };
}

type Err = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Err => ({ ok: false, error, status });

/** The candidate, their profile, settings and AI-resume payments (one database read). */
async function context(userId: string) {
  return withDb(userId, db => {
    const me = accountOf(db, userId);
    const settings = (db[STORAGE_KEYS.PLAN_SETTINGS] || {}) as Partial<PlanSettings>;
    const profile = ((db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>) || {})[userId] || null;
    const payments = (((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).filter(p => p.userId === userId && p.product === 'ai_resume'));
    return { me, settings, profile, payments, unconfirmed: !!me && unverified(me, db) };
  });
}

const paidAndValid = (p: Payment) => p.status === 'paid' && paymentState(p) === 'paid';
const sessionExpiry = (p: Payment) => new Date(Date.parse(p.paidAt || p.createdAt) + AI_RESUME_SESSION_DAYS * 86400_000).toISOString();

export interface Overview {
  available: boolean; configured: boolean; price: number; fullPrice: number; premium: boolean;
  credits: number; sessions: { id: string; createdAt: string; expiresAt: string; active: boolean; builds: number; improves: number; draftId: string | null; lastScore: number | null }[];
}

export async function overview(userId: string): Promise<Overview | Err> {
  const c = await context(userId);
  if (!c.me) return fail('Please sign in.', 401);
  const st = await withStore(userId, s => s.sessions, false);
  const used = new Set(st.map(x => x.paymentId));
  const now = new Date().toISOString();
  return {
    available: aiResumeAvailable(c.settings) && c.me.role === 'candidate', configured: aiConfigured(),
    price: aiResumePriceFor(c.settings, onPaidPremium(c.me)), fullPrice: aiResumePriceFor(c.settings, false), premium: onPaidPremium(c.me),
    credits: c.payments.filter(p => paidAndValid(p) && !used.has(p.id) && sessionExpiry(p) > now).length,
    sessions: st.map(x => {
      const p = c.payments.find(y => y.id === x.paymentId);
      return { id: x.id, createdAt: x.createdAt, expiresAt: x.expiresAt, active: !!p && paidAndValid(p) && x.expiresAt > now, builds: x.builds, improves: x.improves, draftId: x.draftId, lastScore: x.runs.length ? x.runs[x.runs.length - 1].after : null };
    }),
  };
}

/** Session the candidate may still use (paid, not refunded, not expired). */
async function usable(userId: string, id: string): Promise<{ c: Awaited<ReturnType<typeof context>>; session: AiSession } | Err> {
  const c = await context(userId);
  if (!c.me) return fail('Please sign in.', 401);
  if (c.me.role !== 'candidate') return fail('The AI resume builder is for candidate accounts.', 403);
  if (c.unconfirmed) return fail('Please confirm your email address first: open the link we emailed you, or send a new one from My account.', 403);
  if (!aiResumeAvailable(c.settings)) return fail('The AI resume builder is not available right now. Your paid session is kept and will work when it is back.', 503);
  const session = await withStore(userId, s => s.sessions.find(x => x.id === id) || null, false);
  if (!session) return fail('Session not found.', 404);
  const p = c.payments.find(x => x.id === session.paymentId);
  if (!p || !paidAndValid(p)) return fail('This session’s payment was refunded or is not complete.', 403);
  if (session.expiresAt < new Date().toISOString()) return fail(`This session ended on ${session.expiresAt.slice(0, 10)}. Start a new one to continue.`, 403);
  return { c, session };
}

// ------------------------------------------------------------------ profile → plain facts for the models

function profileFacts(p: CandidateProfile | null, me: UserAccount): string {
  if (!p) return `Name: ${me.name}\nEmail: ${me.email}`;
  const L: string[] = [];
  const add = (k: string, v: unknown) => { if (v !== undefined && v !== null && String(v).trim()) L.push(`${k}: ${String(v).trim()}`); };
  add('Name', p.name || me.name); add('Email', p.email || me.email); add('Phone', p.phone);
  add('Location', [p.location?.city, p.location?.state].filter(Boolean).join(', '));
  add('Current designation', p.currentDesignation); add('Current institution', p.currentInstitute); add('Highest degree', p.highestDegree);
  if (p.phdStatus?.isCompleted) add('Ph.D.', [p.phdStatus.institute, p.phdStatus.graduationYear, p.phdStatus.thesisTitle && `thesis "${p.phdStatus.thesisTitle}"`].filter(Boolean).join(', ') || 'awarded');
  if (p.netSletStatus?.isQualified) add('NET/SET', [p.netSletStatus.examType, p.netSletStatus.qualifiedYear, p.netSletStatus.subject].filter(Boolean).join(', '));
  add('About', p.bio); add('Teaching philosophy', p.teachingPhilosophy);
  for (const e of (p.education || []).slice(0, 10)) add('Education', Object.values(e as unknown as Record<string, unknown>).filter(v => typeof v === 'string' || typeof v === 'number').join(', '));
  for (const e of (p.experience || []).slice(0, 20)) add('Experience', Object.values(e as unknown as Record<string, unknown>).filter(v => typeof v === 'string' || typeof v === 'number').join(', '));
  for (const x of (p.publications || []).slice(0, 60)) add('Publication', Object.values(x as unknown as Record<string, unknown>).filter(v => typeof v === 'string' || typeof v === 'number').join(', '));
  add('Research interests', (p.researchInterests || []).join(', ')); add('Skills', (p.skills || []).join(', '));
  add('Links', Object.values(p.scholarLinks || {}).filter(Boolean).join(', '));
  return L.join('\n').slice(0, 20_000);
}

const transcript = (s: AiSession) => s.messages.map(m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${m.content}`).join('\n\n');

// ------------------------------------------------------------------ 1. start + chat (interviewer model)

const INTERVIEWER = `You are the AcadeXMatch resume interviewer. You help candidates in India (mainly faculty, researchers and other professionals) build an ATS-friendly resume by asking questions in a friendly, professional chat.
Rules:
- Ask at most two short questions per message. Use simple English. Never use markdown headings or tables.
- Collect only real facts from the candidate. Never invent, assume or suggest facts, dates, numbers, employers, publications or skills.
- Cover, in order, skipping what the profile already answers clearly: target role (and the job description if they have one); each position with title, organisation, start and end month/year and 2-4 concrete achievements (ask for real numbers such as students taught, results, papers, grants, but accept "not sure"); education with years and scores; teaching subjects; research interests; publications; certifications, FDPs and training; awards; memberships; skills; languages; links (ORCID, Google Scholar, LinkedIn).
- Confirm profile facts briefly instead of asking again.
- If the candidate asks something off-topic, answer in one line and return to the interview.
- When you have enough for a strong resume (or the candidate wants to finish), say so in one sentence, tell them to press "Build my resume", and end the message with the exact tag [READY].`;

export async function startSession(userId: string): Promise<{ ok: true; session: AiSession } | Err> {
  const c = await context(userId);
  if (!c.me) return fail('Please sign in.', 401);
  if (c.me.role !== 'candidate') return fail('The AI resume builder is for candidate accounts.', 403);
  if (c.unconfirmed) return fail('Please confirm your email address first.', 403);
  if (!aiResumeAvailable(c.settings)) return fail('The AI resume builder is not available right now.', 503);
  const now = new Date().toISOString();
  const first = c.profile?.name || c.me.name;
  return withStore(userId, s => {
    const used = new Set(s.sessions.map(x => x.paymentId));
    const pay = c.payments.filter(p => paidAndValid(p) && !used.has(p.id) && sessionExpiry(p) > now).sort((a, b) => (a.paidAt || '').localeCompare(b.paidAt || ''))[0];
    if (!pay) return fail('Pay for an AI resume session first.', 402);
    const known = [c.profile?.currentDesignation, c.profile?.highestDegree].filter(Boolean).join(', ');
    const session: AiSession = {
      id: `ai${Date.now().toString(36)}${randomBytes(4).toString('hex')}`, paymentId: pay.id, createdAt: now, expiresAt: sessionExpiry(pay),
      messages: [{ role: 'assistant', at: now, content: `Hello ${first}! I will ask you a few questions and then write an ATS-friendly resume for you. I already have your AcadeXMatch profile${known ? ` (${known})` : ''}, so I will only ask for what is missing.\n\nFirst: which position are you applying for? If you have the job description, paste it in the box above the chat so I can match its keywords.` }],
      ready: false, jobText: '', draftId: null, builds: 0, improves: 0, runs: [], tokens: { input: 0, output: 0 },
    };
    s.sessions.unshift(session);
    bump(x => { x.sessions++; });
    return { ok: true as const, session };
  });
}

export async function getSession(userId: string, id: string): Promise<{ ok: true; session: AiSession } | Err> {
  const u = await usable(userId, id);
  if ('ok' in u) {
    // Ended or refunded sessions can still be read.
    const s = await withStore(userId, st => st.sessions.find(x => x.id === id) || null, false);
    return s ? { ok: true, session: s } : u;
  }
  return { ok: true, session: u.session };
}

export async function setJob(userId: string, id: string, jobText: string): Promise<{ ok: true; session: AiSession } | Err> {
  const u = await usable(userId, id);
  if ('ok' in u) return u;
  const text = String(jobText || '').trim().slice(0, LIMITS.jobChars);
  return withStore(userId, s => { const x = s.sessions.find(y => y.id === id)!; x.jobText = text; return { ok: true as const, session: x }; });
}

export async function chat(userId: string, id: string, text: string): Promise<{ ok: true; session: AiSession } | Err> {
  const u = await usable(userId, id);
  if ('ok' in u) return u;
  const msg = String(text || '').trim();
  if (!msg) return fail('Type your answer first.');
  if (msg.length > LIMITS.messageChars) return fail(`Please keep each answer under ${LIMITS.messageChars} characters (paste a job description in its own box).`);
  if (u.session.messages.filter(m => m.role === 'user').length >= LIMITS.userMessages) return fail('This session has reached its message limit. Press "Build my resume" to continue.', 429);
  const s0 = u.session;
  const history: AiMessage[] = [
    { role: 'user', content: `Candidate's AcadeXMatch profile (facts you may rely on):\n${profileFacts(u.c.profile, u.c.me!)}${s0.jobText ? `\n\nTarget job description:\n${s0.jobText}` : ''}\n\nStart the interview.` },
    ...s0.messages.slice(-40).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: msg },
  ];
  let reply;
  try {
    reply = await callClaude({ model: AI_MODELS.chat(), system: INTERVIEWER, messages: history, maxTokens: 600, timeoutMs: 45_000 });
  } catch (e) { bump(x => { x.failures++; }); return fail((e as Error).message, (e as AiError).status || 502); }
  const ready = /\[READY\]/i.test(reply.text);
  const answer = reply.text.replace(/\s*\[READY\]\s*/gi, '').trim() || 'Thank you. Anything else you would like to add?';
  const now = new Date().toISOString();
  bump(x => { x.messages++; x.tokensIn += reply.usage.input; x.tokensOut += reply.usage.output; });
  return withStore(userId, s => {
    const x = s.sessions.find(y => y.id === id)!;
    x.messages.push({ role: 'user', content: msg, at: now }, { role: 'assistant', content: answer, at: new Date().toISOString() });
    x.ready = x.ready || ready;
    x.tokens.input += reply.usage.input; x.tokens.output += reply.usage.output;
    return { ok: true as const, session: x };
  });
}

// ------------------------------------------------------------------ 2. build (writer model) and 3. improve (improver model)

const strArr = { type: 'array', items: { type: 'string' } };
const RESUME_SCHEMA = {
  type: 'object',
  properties: {
    fullName: { type: 'string' }, headline: { type: 'string', description: 'Target role, e.g. "Assistant Professor, Computer Science and Engineering"' },
    email: { type: 'string' }, phone: { type: 'string' }, location: { type: 'string' }, links: strArr,
    summary: { type: 'string', description: '3-4 lines: role, years of experience, key skills, one notable real result' },
    experience: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, organization: { type: 'string' }, location: { type: 'string' }, start: { type: 'string', description: 'e.g. "Jun 2018"' }, end: { type: 'string', description: 'e.g. "Mar 2022" or "Present"' }, bullets: strArr }, required: ['title', 'organization', 'start', 'end', 'bullets'] } },
    education: { type: 'array', items: { type: 'object', properties: { degree: { type: 'string' }, institution: { type: 'string' }, year: { type: 'string' }, score: { type: 'string' } }, required: ['degree', 'institution'] } },
    skills: strArr, certifications: strArr,
    projects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
    publications: strArr, research: strArr, teaching: strArr, awards: strArr, memberships: strArr, trainings: strArr, languages: strArr,
  },
  required: ['fullName', 'summary', 'experience', 'education', 'skills'],
};
const TEMPLATE_IDS = TEMPLATES.map(t => t.id);
const WRITE_TOOL: AiTool = {
  name: 'write_resume', description: 'Return the complete resume as structured data.',
  input_schema: { type: 'object', properties: { template: { type: 'string', enum: TEMPLATE_IDS, description: 'academic for faculty/research posts; fresher for students; ats-classic otherwise' }, resume: RESUME_SCHEMA }, required: ['template', 'resume'] },
};
const IMPROVE_TOOL: AiTool = {
  name: 'improve_resume', description: 'Return the improved resume, what you changed, and questions whose answers would improve it further.',
  input_schema: { type: 'object', properties: { resume: RESUME_SCHEMA, changes: { ...strArr, description: 'Short list of what you changed and why' }, questions: { ...strArr, description: 'Facts to ask the candidate for (e.g. missing numbers or dates)' } }, required: ['resume', 'changes', 'questions'] },
};

const TRUTH = `Truthfulness is mandatory: use only facts present in the PROFILE, the INTERVIEW or the CURRENT RESUME. Never invent employers, titles, dates, degrees, scores, publications, grants, skills or numbers. If a fact is missing, leave it out (do not write placeholders). Job-description keywords may be used only for skills and experience the candidate actually has.`;
const FORMAT = `ATS rules: single column, standard section names, plain text (no tables, emojis, icons or markdown). Dates as "Mon YYYY" (e.g. "Jun 2018") and "Present" for current roles, newest first. Each achievement bullet starts with a strong past-tense action verb (Developed, Taught, Led, Published, Designed, Mentored, Implemented, Coordinated, Improved), is one line, and keeps real numbers. No first-person pronouns. Summary: 3-4 lines. Publications in a consistent citation style with year and DOI/journal when given. Indian English spelling.`;

const WRITER = `You are an expert resume writer for Indian academic and professional jobs. Turn the candidate's facts into a polished, ATS-friendly resume. ${TRUTH}\n${FORMAT}`;
const IMPROVER = `You are a senior ATS resume editor, separate from the writer. Improve the CURRENT RESUME so applicant tracking systems and recruiters rate it higher, using the ATS REPORT. Rewrite weak bullets, sharpen the summary, order sections and skills for the target job, and add relevant keywords the candidate genuinely has. ${TRUTH}\n${FORMAT}\nList your changes and up to 5 questions for facts that would raise the score further.`;

function scoreOf(d: BuilderData, t: TemplateId, jobText: string, weights: Awaited<ReturnType<typeof getResumeSettings>>['weights']) {
  const text = builderText(d, t);
  const r = analyzeResume(parseResume(text, new Date()), { tables: 0, textBoxes: 0, images: 0, multiColumn: false, contactInHeader: false, scanned: false }, jobText && jobText.split(/\s+/).length >= 8 ? parseJobDescription(jobText) : null, weights, text);
  return r;
}

const asData = (raw: unknown, fallback: Partial<BuilderData>) => {
  const d = cleanBuilderData(raw);
  return { ...d, fullName: d.fullName || fallback.fullName || '', email: d.email || fallback.email || '', phone: d.phone || fallback.phone || '' };
};

export async function build(userId: string, id: string): Promise<{ ok: true; session: AiSession; draftId: string; score: number } | Err> {
  const u = await usable(userId, id);
  if ('ok' in u) return u;
  const s0 = u.session;
  if (s0.builds >= LIMITS.builds) return fail(`This session has used its ${LIMITS.builds} builds. Use "Improve with AI" or edit the draft.`, 429);
  if (s0.messages.filter(m => m.role === 'user').length < 2 && !u.c.profile?.education?.length) return fail('Answer a few interview questions first, so there is enough to write a resume.');
  const facts = profileFacts(u.c.profile, u.c.me!);
  let out;
  try {
    out = await callClaude({
      model: AI_MODELS.writer(), system: WRITER, maxTokens: 8000, tool: WRITE_TOOL, timeoutMs: 120_000,
      messages: [{ role: 'user', content: `PROFILE:\n${facts}\n\nINTERVIEW:\n${transcript(s0)}\n\n${s0.jobText ? `TARGET JOB DESCRIPTION:\n${s0.jobText}\n\n` : ''}Write the resume now.` }],
    });
  } catch (e) { bump(x => { x.failures++; }); return fail((e as Error).message, (e as AiError).status || 502); }
  const input = (out.tool?.input || {}) as { template?: string; resume?: unknown };
  if (!input.resume) { bump(x => { x.failures++; }); return fail('The AI could not write the resume this time. Please try again.', 502); }
  const template = (TEMPLATE_IDS as string[]).includes(input.template || '') ? input.template as TemplateId : 'ats-classic';
  const data = asData(input.resume, { fullName: u.c.profile?.name || u.c.me!.name, email: u.c.me!.email, phone: u.c.profile?.phone });
  const saved = await saveDraft(userId, { id: s0.draftId || undefined, label: `AI resume · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, template, data });
  if (!saved.ok) return saved;
  const { weights } = await getResumeSettings();
  const score = scoreOf(data, template, s0.jobText, weights).overall;
  bump(x => { x.builds++; x.tokensIn += out.usage.input; x.tokensOut += out.usage.output; });
  const session = await withStore(userId, s => {
    const x = s.sessions.find(y => y.id === id)!;
    x.draftId = saved.draft.id; x.builds++;
    x.runs.push({ at: new Date().toISOString(), kind: 'build', model: out.model, before: null, after: score, kept: true, changes: [], questions: [] });
    x.tokens.input += out.usage.input; x.tokens.output += out.usage.output;
    return x;
  });
  return { ok: true, session, draftId: saved.draft.id, score };
}

export async function improve(userId: string, id: string): Promise<{ ok: true; session: AiSession; run: AiRun } | Err> {
  const u = await usable(userId, id);
  if ('ok' in u) return u;
  const s0 = u.session;
  if (!s0.draftId) return fail('Build the resume first.');
  if (s0.improves >= LIMITS.improves) return fail(`This session has used its ${LIMITS.improves} AI improvements.`, 429);
  const draft = await getDraft(userId, s0.draftId);
  if (!draft) return fail('The AI resume draft was deleted. Press "Build my resume" to write it again.', 404);
  const { weights } = await getResumeSettings();
  const before = scoreOf(draft.data, draft.template, s0.jobText, weights);
  const report = [
    `Overall ATS score: ${before.overall}/100`,
    ...Object.entries(before.dimensions).map(([k, v]) => `${k}: ${v}/100`),
    'Findings:', ...before.findings.slice(0, 12).map(f => `- (${f.severity}) ${f.text}`),
    before.weakBullets.length ? 'Weak bullets:' : '', ...before.weakBullets.slice(0, 10).map(w => `- "${w.text}": ${w.issue}`),
    before.job ? `Missing job keywords: ${before.job.missingKeywords.slice(0, 25).join(', ')}` : '',
    before.job ? `Missing required skills: ${before.job.missingRequired.slice(0, 20).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  let out;
  try {
    out = await callClaude({
      model: AI_MODELS.improver(), system: IMPROVER, maxTokens: 8000, tool: IMPROVE_TOOL, timeoutMs: 150_000,
      messages: [{ role: 'user', content: `PROFILE:\n${profileFacts(u.c.profile, u.c.me!)}\n\nINTERVIEW:\n${transcript(s0)}\n\n${s0.jobText ? `TARGET JOB DESCRIPTION:\n${s0.jobText}\n\n` : ''}CURRENT RESUME (template ${draft.template}):\n${JSON.stringify(draft.data)}\n\nATS REPORT:\n${report}\n\nImprove the resume now.` }],
    });
  } catch (e) { bump(x => { x.failures++; }); return fail((e as Error).message, (e as AiError).status || 502); }
  const input = (out.tool?.input || {}) as { resume?: unknown; changes?: unknown; questions?: unknown };
  if (!input.resume) { bump(x => { x.failures++; }); return fail('The AI could not improve the resume this time. Please try again.', 502); }
  const data = asData(input.resume, draft.data);
  const after = scoreOf(data, draft.template, s0.jobText, weights).overall;
  const kept = after >= before.overall;
  if (kept) {
    const saved = await saveDraft(userId, { id: draft.id, label: draft.label, template: draft.template, data });
    if (!saved.ok) return saved;
  }
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, n) : []);
  const run: AiRun = { at: new Date().toISOString(), kind: 'improve', model: out.model, before: before.overall, after, kept, changes: list(input.changes, 12), questions: list(input.questions, 5) };
  bump(x => { x.improves++; x.tokensIn += out.usage.input; x.tokensOut += out.usage.output; });
  const session = await withStore(userId, s => {
    const x = s.sessions.find(y => y.id === id)!;
    x.improves++; x.runs.push(run);
    x.tokens.input += out.usage.input; x.tokens.output += out.usage.output;
    return x;
  });
  return { ok: true, session, run };
}

/** What the browser may see of a session (no token counts). */
export function publicSession(s: AiSession) {
  return { id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, messages: s.messages, ready: s.ready, jobText: s.jobText, draftId: s.draftId, builds: s.builds, improves: s.improves, runs: s.runs, limits: LIMITS, userMessages: s.messages.filter(m => m.role === 'user').length };
}
