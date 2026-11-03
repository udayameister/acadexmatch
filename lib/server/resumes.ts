/*
 * Resume Intelligence storage and service. Each user's resumes, analyses and builder drafts live in their own
 * private store ("resume-<userId>"), never in the shared database snapshot. Only the owner can read them; the
 * administrator sees settings and aggregate, content-free statistics. Original files are not kept: only the
 * extracted text (needed to re-check against another job), which the user can delete at any time.
 */
import { randomBytes } from 'crypto';
import { readJson, writeJson, deleteJson } from './persist';
import { withDb, accountOf, unverified } from './db';
import { STORAGE_KEYS } from '@/lib/storage';
import type { Job } from '@/types';
import { extractResume, type ExtractedResume } from './resumeExtract';
import { parseResume, type ParsedResume } from '@/lib/resume/parse';
import { parseJobDescription } from '@/lib/resume/jd';
import { analyzeResume, DEFAULT_WEIGHTS, type AnalysisResult, type ScoreWeights } from '@/lib/resume/score';
import { analyzeAcademic, type AcademicProfile } from '@/lib/resume/academic';
import { recommendJobs, type JobRecommendation } from '@/lib/resume/match';
import { cleanBuilderData, builderText, type BuilderResume, type TemplateId, TEMPLATES } from '@/lib/resume/builder';

// ------------------------------------------------------------------ settings and statistics (admin)

export interface ResumeSettings { enabled: boolean; weights: ScoreWeights; dailyLimit: number; historyLimit: number; retentionDays: number; builderEnabled: boolean }
export const DEFAULT_SETTINGS: ResumeSettings = { enabled: true, weights: DEFAULT_WEIGHTS, dailyLimit: 20, historyLimit: 20, retentionDays: 365, builderEnabled: true };

export async function getResumeSettings(): Promise<ResumeSettings> {
  const s = await readJson<Partial<ResumeSettings>>('resume-settings');
  return { ...DEFAULT_SETTINGS, ...(s || {}), weights: { ...DEFAULT_WEIGHTS, ...(s?.weights || {}) } };
}

export async function saveResumeSettings(raw: unknown): Promise<ResumeSettings> {
  const r = (raw || {}) as Partial<ResumeSettings>;
  const cur = await getResumeSettings();
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  const w = (r.weights || {}) as Partial<ScoreWeights>;
  const weights = Object.fromEntries((Object.keys(DEFAULT_WEIGHTS) as (keyof ScoreWeights)[]).map(k => [k, num(w[k], 0, 100, cur.weights[k])])) as unknown as ScoreWeights;
  if (Object.values(weights).reduce((a, b) => a + b, 0) === 0) throw new Error('At least one weight must be above zero.');
  const next: ResumeSettings = {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : cur.enabled,
    builderEnabled: typeof r.builderEnabled === 'boolean' ? r.builderEnabled : cur.builderEnabled,
    weights, dailyLimit: num(r.dailyLimit, 1, 500, cur.dailyLimit), historyLimit: num(r.historyLimit, 1, 100, cur.historyLimit),
    retentionDays: num(r.retentionDays, 7, 3650, cur.retentionDays),
  };
  await writeJson('resume-settings', next);
  return next;
}

/** Aggregate, content-free counters: no names, no text, no per-user rows. */
interface ResumeStats { analyses: number; withJob: number; uploads: Record<string, number>; scoreBuckets: number[]; builderSaves: number; docxExports: number; deletions: number; byDay: Record<string, number>; missingSkills: Record<string, number> }
const EMPTY_STATS: ResumeStats = { analyses: 0, withJob: 0, uploads: {}, scoreBuckets: [0, 0, 0, 0, 0], builderSaves: 0, docxExports: 0, deletions: 0, byDay: {}, missingSkills: {} };

let statsQueue: Promise<unknown> = Promise.resolve();
function bumpStats(fn: (s: ResumeStats) => void): Promise<void> {
  const p = statsQueue.then(async () => {
    const s = { ...EMPTY_STATS, ...((await readJson<ResumeStats>('resume-stats')) || {}) };
    fn(s);
    const days = Object.keys(s.byDay).sort();
    for (const d of days.slice(0, Math.max(0, days.length - 90))) delete s.byDay[d];
    const skills = Object.entries(s.missingSkills).sort((a, b) => b[1] - a[1]).slice(0, 200);
    s.missingSkills = Object.fromEntries(skills);
    await writeJson('resume-stats', s);
  }).catch(() => undefined);
  statsQueue = p;
  return p;
}

export async function resumeStats(): Promise<ResumeStats & { usersWithData: number }> {
  const s = { ...EMPTY_STATS, ...((await readJson<ResumeStats>('resume-stats')) || {}) };
  const index = (await readJson<string[]>('resume-users')) || [];
  return { ...s, usersWithData: index.length };
}

export const recordDocxExport = () => bumpStats(s => { s.docxExports++; });

// ------------------------------------------------------------------ per-user store

export interface ResumeAnalysis {
  id: string;
  createdAt: string;
  source: 'upload' | 'builder';
  fileName: string;
  format: string;
  pages: number | null;
  signals: ExtractedResume['signals'];
  text: string;
  parsed: ParsedResume;
  jobText: string | null;
  jobLabel: string | null;
  jobId: string | null;
  result: AnalysisResult;
  academic: AcademicProfile | null;
  recommendations: JobRecommendation[];
}

export interface UserResumeStore { consentAt: string | null; analyses: ResumeAnalysis[]; builder: BuilderResume[]; usage: Record<string, number> }

const safeId = (userId: string) => userId.replace(/[^A-Za-z0-9_-]/g, '');
const storeName = (userId: string) => `resume-${safeId(userId)}`;
const newId = () => `${Date.now().toString(36)}${randomBytes(5).toString('hex')}`;
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const locks = new Map<string, Promise<unknown>>();
async function withStore<T>(userId: string, fn: (s: UserResumeStore) => T | Promise<T>, write = true): Promise<T> {
  const key = safeId(userId);
  const prev = locks.get(key) || Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>(r => { release = r; });
  const chain = prev.then(() => mine);
  locks.set(key, chain);
  await prev.catch(() => undefined);
  try {
    const s: UserResumeStore = { consentAt: null, analyses: [], builder: [], usage: {}, ...((await readJson<UserResumeStore>(storeName(userId))) || {}) };
    const out = await fn(s);
    if (write) {
      if (!s.consentAt && !s.analyses.length && !s.builder.length) await deleteJson(storeName(userId));
      else await writeJson(storeName(userId), s);
      await trackUser(key, !!(s.analyses.length || s.builder.length));
    }
    return out;
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}

/** Index of users who have resume data (ids only), so retention clean-up and counts work without scanning. */
let indexQueue: Promise<unknown> = Promise.resolve();
function trackUser(id: string, has: boolean): Promise<void> {
  const p = indexQueue.then(async () => {
    const list = new Set((await readJson<string[]>('resume-users')) || []);
    if (has === list.has(id)) return;
    if (has) list.add(id); else list.delete(id);
    await writeJson('resume-users', [...list]);
  }).catch(() => undefined);
  indexQueue = p;
  return p;
}

type Err = { ok: false; error: string; status: number };

async function checkUser(userId: string): Promise<Err | null> {
  const settings = await getResumeSettings();
  if (!settings.enabled) return { ok: false, error: 'The resume checker is switched off at the moment.', status: 403 };
  return withDb(userId, db => {
    const me = accountOf(db, userId);
    if (!me) return { ok: false as const, error: 'Please sign in.', status: 401 };
    if (unverified(me, db)) return { ok: false as const, error: 'Please confirm your email address first: open the link we emailed you, or send a new one from My account.', status: 403 };
    return null;
  });
}

function openJobs(): Promise<Job[]> {
  return withDb(null, db => ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.status === 'published'));
}

export function summary(a: ResumeAnalysis) {
  return { id: a.id, createdAt: a.createdAt, source: a.source, fileName: a.fileName, jobLabel: a.jobLabel, overall: a.result.overall, band: a.result.band, matchPercent: a.result.job?.matchPercent ?? null };
}

export async function getMyResumes(userId: string) {
  return withStore(userId, s => ({
    consentAt: s.consentAt,
    analyses: s.analyses.map(summary),
    builder: s.builder.map(b => ({ id: b.id, label: b.label, template: b.template, updatedAt: b.updatedAt })),
  }), false);
}

export async function getAnalysis(userId: string, id: string): Promise<ResumeAnalysis | null> {
  return withStore(userId, s => s.analyses.find(a => a.id === id) || null, false);
}

export interface AnalyzeInput {
  consent: boolean;
  file?: { name: string; bytes: Buffer };
  reuseId?: string;
  builderId?: string;
  jobText?: string;
  jobId?: string;
}

export async function analyze(userId: string, input: AnalyzeInput): Promise<{ ok: true; analysis: ResumeAnalysis } | Err> {
  const bad = await checkUser(userId);
  if (bad) return bad;
  const settings = await getResumeSettings();
  const jobs = await openJobs();

  // Job description: pasted text, or an AcadeXMatch vacancy the user picked.
  let jobText = (input.jobText || '').trim().slice(0, 30_000) || null;
  let jobLabel: string | null = null;
  let jobId: string | null = null;
  if (input.jobId) {
    const j = jobs.find(x => x.id === input.jobId);
    if (!j) return { ok: false, error: 'That vacancy is no longer open.', status: 404 };
    jobId = j.id;
    jobLabel = `${j.title} — ${j.instituteName}`;
    const q = j.requiredQualifications;
    jobText = [
      `Position: ${j.title}`, `Institution: ${j.instituteName}`, j.department ? `Department: ${j.department}` : '',
      'Eligibility', q.minDegree ? `${q.minDegree} required.` : '', q.netSletMandatory ? 'UGC-NET / SET / SLET qualification is mandatory.' : '',
      q.minExperienceYears ? `Minimum ${q.minExperienceYears} years of experience.` : '', q.experienceText || '',
      q.minUgcCarePubs ? `At least ${q.minUgcCarePubs} UGC-CARE publications required.` : '',
      ...q.specializationRequirements.map(x => `${x} required.`),
      j.specializationTags.length ? `Specialisation: ${j.specializationTags.join(', ')} required.` : '',
    ].filter(Boolean).join('\n');
  }
  if (jobText && jobText.split(/\s+/).length < 8) return { ok: false, error: 'The job description is too short to compare. Paste the full posting.', status: 400 };

  return withStore(userId, async s => {
    if (!input.consent && !s.consentAt) return { ok: false as const, error: 'Please agree to the processing of your resume to continue.', status: 400 };
    const day = todayIst();
    if ((s.usage[day] || 0) >= settings.dailyLimit) return { ok: false as const, error: `You have reached today’s limit of ${settings.dailyLimit} checks. Please try again tomorrow.`, status: 429 };

    let text: string, fileName: string, format: string, pages: number | null, signals: ExtractedResume['signals'], source: ResumeAnalysis['source'] = 'upload';
    if (input.file) {
      const ex = await extractResume(input.file.bytes, input.file.name);
      if (!ex.ok) return { ok: false as const, error: ex.error, status: 400 };
      ({ text, format, pages, signals } = ex.value);
      fileName = input.file.name.replace(/[^\w .()-]/g, '_').slice(0, 120);
    } else if (input.reuseId) {
      const prev = s.analyses.find(a => a.id === input.reuseId);
      if (!prev) return { ok: false as const, error: 'That resume is no longer saved. Please upload it again.', status: 404 };
      ({ text, fileName, format, pages, signals, source } = prev);
    } else if (input.builderId) {
      const b = s.builder.find(x => x.id === input.builderId);
      if (!b) return { ok: false as const, error: 'Draft not found.', status: 404 };
      text = builderText(b.data, b.template);
      fileName = `${b.label} (builder)`; format = 'builder'; pages = null; source = 'builder';
      signals = { tables: 0, textBoxes: 0, images: 0, multiColumn: false, contactInHeader: false, scanned: false };
    } else return { ok: false as const, error: 'Choose a resume file.', status: 400 };

    if (text.split(/\s+/).filter(Boolean).length < 40 && !signals.scanned) return { ok: false as const, error: 'We could read very little text from this file. Please upload a text-based PDF or DOCX.', status: 400 };

    const parsed = parseResume(text, new Date());
    const jd = jobText ? parseJobDescription(jobText) : null;
    if (jd && !jobLabel) jobLabel = [jd.title, jd.organization].filter(Boolean).join(' — ') || 'Pasted job description';
    const result = analyzeResume(parsed, signals, jd, settings.weights, text);
    const academicProfile = analyzeAcademic(parsed, text);
    const academic = academicProfile.isAcademic || jd?.isAcademic ? academicProfile : null;
    const recommendations = recommendJobs(parsed, text, jobs, day);

    const analysis: ResumeAnalysis = {
      id: newId(), createdAt: new Date().toISOString(), source, fileName, format, pages, signals, text, parsed,
      jobText, jobLabel, jobId, result, academic, recommendations,
    };
    s.consentAt = s.consentAt || new Date().toISOString();
    s.analyses.unshift(analysis);
    s.analyses = s.analyses.slice(0, settings.historyLimit);
    s.usage = { [day]: (s.usage[day] || 0) + 1 };

    await bumpStats(st => {
      st.analyses++;
      if (jd) st.withJob++;
      st.uploads[format] = (st.uploads[format] || 0) + 1;
      st.scoreBuckets[Math.min(4, Math.floor(result.overall / 20))]++;
      st.byDay[day] = (st.byDay[day] || 0) + 1;
      for (const g of result.skillGaps.filter(x => x.required).slice(0, 10)) st.missingSkills[g.name] = (st.missingSkills[g.name] || 0) + 1;
    });
    return { ok: true as const, analysis };
  });
}

export async function deleteAnalysis(userId: string, id: string): Promise<boolean> {
  const ok = await withStore(userId, s => {
    const n = s.analyses.length;
    s.analyses = s.analyses.filter(a => a.id !== id);
    return s.analyses.length < n;
  });
  if (ok) await bumpStats(st => { st.deletions++; });
  return ok;
}

/** Deletes everything: analyses, extracted text, builder drafts and the consent record. */
export async function deleteAllResumeData(userId: string): Promise<void> {
  await withStore(userId, s => { s.analyses = []; s.builder = []; s.consentAt = null; s.usage = {}; });
  await deleteJson(storeName(userId));
  await trackUser(safeId(userId), false);
  await bumpStats(st => { st.deletions++; });
}

// ------------------------------------------------------------------ builder drafts

export async function getDraft(userId: string, id: string): Promise<BuilderResume | null> {
  return withStore(userId, s => s.builder.find(b => b.id === id) || null, false);
}

export async function saveDraft(userId: string, raw: { id?: string; label?: unknown; template?: unknown; data?: unknown; fromAnalysis?: string }): Promise<{ ok: true; draft: BuilderResume } | Err> {
  const bad = await checkUser(userId);
  if (bad) return bad;
  const settings = await getResumeSettings();
  if (!settings.builderEnabled) return { ok: false, error: 'The resume builder is switched off at the moment.', status: 403 };
  const { builderFromParsed } = await import('@/lib/resume/builder');
  return withStore(userId, s => {
    const template: TemplateId = TEMPLATES.some(t => t.id === raw.template) ? raw.template as TemplateId : 'ats-classic';
    const label = (typeof raw.label === 'string' ? raw.label.trim().slice(0, 80) : '') || 'My resume';
    let data = cleanBuilderData(raw.data);
    if (raw.fromAnalysis) {
      const a = s.analyses.find(x => x.id === raw.fromAnalysis);
      if (!a) return { ok: false as const, error: 'That analysis is no longer saved.', status: 404 };
      data = builderFromParsed(a.parsed);
    }
    const now = new Date().toISOString();
    if (raw.id) {
      const cur = s.builder.find(b => b.id === raw.id);
      if (!cur) return { ok: false as const, error: 'Draft not found.', status: 404 };
      Object.assign(cur, { label, template, data, updatedAt: now });
      return { ok: true as const, draft: cur };
    }
    if (s.builder.length >= 10) return { ok: false as const, error: 'You can keep up to 10 drafts. Delete one to add another.', status: 400 };
    const draft: BuilderResume = { id: newId(), label, template, data, updatedAt: now };
    s.builder.unshift(draft);
    s.consentAt = s.consentAt || now;
    void bumpStats(st => { st.builderSaves++; });
    return { ok: true as const, draft };
  });
}

export async function deleteDraft(userId: string, id: string): Promise<boolean> {
  return withStore(userId, s => { const n = s.builder.length; s.builder = s.builder.filter(b => b.id !== id); return s.builder.length < n; });
}

// ------------------------------------------------------------------ retention (run by the scheduler)

export async function pruneOldResumeData(): Promise<number> {
  const { retentionDays } = await getResumeSettings();
  const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
  let removed = 0;
  for (const id of (await readJson<string[]>('resume-users')) || []) {
    await withStore(id, s => {
      const n = s.analyses.length;
      s.analyses = s.analyses.filter(a => a.createdAt >= cutoff);
      removed += n - s.analyses.length;
    });
  }
  return removed;
}
