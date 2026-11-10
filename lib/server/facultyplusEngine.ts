import { readJson, writeJson } from './persist';
import { withDb } from './db';
import { STORAGE_KEYS } from '@/lib/storage';
import { FACULTYPLUS_ORIGIN, parseFacultyPlusPost, type WpPost } from '@/lib/facultyplus';
import { findDuplicate, type DupCandidate } from '@/lib/jobDuplicates';
import { getFtStore } from './facultytickEngine';
import type { Job } from '@/types';

/*
 * FacultyPlus scraping engine (same design as the FacultyTick engine).
 *
 * Reads new posts from FacultyPlus's public WordPress posts API (its robots.txt allows this), keeps only the facts
 * of each vacancy with lib/facultyplus.ts and queues it for the platform administrator. Nothing is published until
 * the administrator approves it in the admin console, and possible duplicates (already on the job board, waiting
 * in the FacultyTick queue, or queued twice from FacultyPlus) are flagged so they can be removed instead.
 *
 * Politeness: one request at a time, a pause between requests, an honest user agent, only recent posts.
 */

export type FpStatus = 'pending' | 'approved' | 'rejected';
export interface FpCategory { id: number; name: string; count: number }

export interface FpSettings {
  dailyEnabled: boolean;
  /** 24-hour IST time, e.g. "08:15". */
  dailyTime: string;
  lastDailyRunDate?: string;
  /** Read posts in any of these categories… */
  includeCategories: number[];
  /** …except posts in any of these. */
  excludeCategories: number[];
  /** How many days back to look on the first run (later runs continue from the newest post seen). */
  lookbackDays: number;
  maxPosts: number;
}

export interface FpQueueItem {
  id: string;
  postId: number;
  /** FacultyPlus post address: shown to the administrator only, never published. */
  link: string;
  postDate: string;
  foundAt: string;
  categories: string[];
  status: FpStatus;
  decidedAt?: string;
  /** Why it was rejected, e.g. 'duplicate'. */
  reason?: string;
  issues: string[];
  job: Job;
}

export interface FpRun {
  id: string;
  trigger: 'schedule' | 'manual' | 'link';
  startedAt: string;
  finishedAt?: string;
  requests: number;
  read: number;
  added: number;
  skippedSeen: number;
  skippedExpired: number;
  skippedNotVacancy: number;
  error?: string;
}

export interface FpStore {
  settings: FpSettings;
  categories: FpCategory[];
  queue: FpQueueItem[];
  runs: FpRun[];
  seen: number[];
  newestPostDate?: string;
  running?: boolean;
}

const STORE = 'facultyplus';
const USER_AGENT = 'AcadeXMatchBot/1.0 (+https://acadexmatch.com/about; info@acadexmatch.com)';
const PAUSE_MS = 1500;
const PAGE_SIZE = 50;
const MAX_SEEN = 20000;
const MAX_DECIDED = 1500;
const MAX_RUNS = 60;

/** FacultyPlus categories offered in the settings (ids from facultyplus.com/wp-json/wp/v2/categories). */
export const DEFAULT_CATEGORIES: FpCategory[] = [
  { id: 1459, name: 'Teaching jobs', count: 0 }, { id: 518, name: 'Research Jobs', count: 0 },
  { id: 520, name: 'Engineering College Jobs', count: 0 }, { id: 509, name: 'Arts and Science', count: 0 },
  { id: 514, name: 'MBA Faculty Jobs', count: 0 }, { id: 517, name: 'Pharmacy', count: 0 }, { id: 1507, name: 'Law', count: 0 },
  { id: 1461, name: 'Walk-in', count: 0 }, { id: 516, name: 'Non-Teaching', count: 0 }, { id: 1899, name: 'School Jobs', count: 0 },
];

const DEFAULT_STORE: FpStore = {
  settings: { dailyEnabled: true, dailyTime: '08:15', includeCategories: [1459, 518], excludeCategories: [1899], lookbackDays: 2, maxPosts: 150 },
  categories: DEFAULT_CATEGORIES,
  queue: [],
  runs: [],
  seen: [],
};

// ------------------------------------------------------------------ store

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export const nowIst = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
export const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const hhmmIst = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function read(): Promise<FpStore> {
  const s = await readJson<Partial<FpStore>>(STORE);
  const d: FpStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
  if (!s) return d;
  return {
    settings: { ...d.settings, ...(s.settings || {}) },
    categories: s.categories?.length ? s.categories : d.categories,
    queue: s.queue || [],
    runs: s.runs || [],
    seen: s.seen || [],
    newestPostDate: s.newestPostDate,
    running: s.running,
  };
}

async function write(s: FpStore): Promise<void> {
  const pending = s.queue.filter(q => q.status === 'pending');
  const decided = s.queue.filter(q => q.status !== 'pending').slice(0, MAX_DECIDED);
  s.queue = [...pending, ...decided];
  s.runs = s.runs.slice(0, MAX_RUNS);
  s.seen = s.seen.slice(-MAX_SEEN);
  await writeJson(STORE, s);
}

export function getFpStore(): Promise<FpStore> {
  return locked(read);
}

export function updateFpStore(fn: (s: FpStore) => void | Promise<void>): Promise<FpStore> {
  return locked(async () => {
    const s = await read();
    await fn(s);
    await write(s);
    return s;
  });
}

// ------------------------------------------------------------------ fetching

/** FACULTYPLUS_API_ORIGIN is only for automated tests (a local stand-in server); production uses facultyplus.com. */
const apiOrigin = () => process.env.FACULTYPLUS_API_ORIGIN?.replace(/\/$/, '') || FACULTYPLUS_ORIGIN;
const pauseMs = () => (process.env.FACULTYPLUS_API_ORIGIN ? 20 : PAUSE_MS);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastRequestAt = 0;

async function fpGet(pathAndQuery: string, run?: FpRun): Promise<{ data: unknown; totalPages: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastRequestAt + pauseMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    if (run) run.requests++;
    let res: Response;
    try {
      res = await fetch(`${apiOrigin()}${pathAndQuery}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(25_000),
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch (e) {
      if (attempt === 0) { await sleep(process.env.FACULTYPLUS_API_ORIGIN ? 20 : 5000); continue; }
      throw new Error(`FacultyPlus did not respond (${(e as Error).name === 'TimeoutError' ? 'timed out' : (e as Error).message}).`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const after = Math.min(60, Number(res.headers.get('retry-after')) || 15);
      await sleep(process.env.FACULTYPLUS_API_ORIGIN ? 20 : after * 1000);
      continue;
    }
    if (res.status === 400 && /page=/.test(pathAndQuery)) return { data: [], totalPages: 0 };
    if (res.status === 403) throw new Error('FacultyPlus refused the request (403). Its firewall may be blocking the server; try again later.');
    if (!res.ok) throw new Error(`FacultyPlus answered ${res.status} ${res.statusText}.`);
    if (!/json/i.test(res.headers.get('content-type') || '')) throw new Error('FacultyPlus sent a web page instead of data (perhaps a security check). Try again later.');
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 12 * 1024 * 1024) throw new Error('FacultyPlus sent an unexpectedly large response.');
    return { data: await res.json(), totalPages: Number(res.headers.get('x-wp-totalpages') || 1) };
  }
  throw new Error('FacultyPlus did not respond.');
}

const FIELDS = '_fields=id,date,modified,link,title,content,categories';

export async function refreshCategories(): Promise<FpCategory[]> {
  const { data } = await fpGet('/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc&_fields=id,name,count,parent');
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;/g, '’');
  const list = (Array.isArray(data) ? data : []) as { id: number; name: string; count: number; parent: number }[];
  // Top-level categories, plus the defaults wherever they sit.
  const keep = new Set(DEFAULT_CATEGORIES.map(c => c.id));
  const cats = list
    .filter(c => c.id && c.name && (c.parent === 0 || keep.has(Number(c.id))) && !/^(uncategori[sz]ed|faculty plus|featured post)$/i.test(c.name))
    .map(c => ({ id: Number(c.id), name: decode(String(c.name)), count: Number(c.count) || 0 }))
    .slice(0, 40);
  if (cats.length) await updateFpStore(s => { s.categories = cats; });
  return cats;
}

function isPost(p: unknown): p is WpPost {
  const x = p as WpPost;
  return !!x && typeof x.id === 'number' && typeof x.link === 'string' && !!x.content?.rendered && !!x.title;
}

function enqueue(s: FpStore, posts: WpPost[], run: FpRun, opts: { keepExpired?: boolean } = {}): FpQueueItem[] {
  const seen = new Set(s.seen);
  const names = Object.fromEntries(s.categories.map(c => [c.id, c.name]));
  const today = todayIst();
  const added: FpQueueItem[] = [];
  for (const p of posts) {
    if (!isPost(p)) continue;
    run.read++;
    if (seen.has(p.id)) { run.skippedSeen++; continue; }
    seen.add(p.id);
    s.seen.push(p.id);
    const parsed = parseFacultyPlusPost(p, { today });
    if (!parsed.isVacancy) { run.skippedNotVacancy++; continue; }
    if (parsed.expired && !opts.keepExpired) { run.skippedExpired++; continue; }
    const item: FpQueueItem = {
      id: newId('fp'),
      postId: p.id,
      link: p.link,
      postDate: p.date,
      foundAt: nowIst(),
      categories: (p.categories || []).map(c => names[c]).filter(Boolean).slice(0, 6),
      status: 'pending',
      issues: parsed.expired ? [...parsed.issues, 'Last date has passed'] : parsed.issues,
      job: parsed.job,
    };
    s.queue.unshift(item);
    added.push(item);
    run.added++;
  }
  return added;
}

let active: Promise<FpRun> | null = null;
export const fpRunning = () => active !== null;
const newRun = (trigger: FpRun['trigger']): FpRun => ({ id: newId('run'), trigger, startedAt: nowIst(), requests: 0, read: 0, added: 0, skippedSeen: 0, skippedExpired: 0, skippedNotVacancy: 0 });

/** Reads new FacultyPlus posts and queues them for approval. */
export function runFacultyPlus(trigger: 'schedule' | 'manual'): Promise<FpRun> {
  if (active) return active;
  active = (async () => {
    const run = newRun(trigger);
    const s0 = await updateFpStore(s => { s.running = true; if (trigger === 'schedule') s.settings.lastDailyRunDate = todayIst(); });
    try {
      const { settings } = s0;
      if (!settings.includeCategories.length) throw new Error('No categories are selected.');
      // FacultyPlus dates are Indian time. Continue from the newest post already read (an hour of overlap),
      // but never further back than lookbackDays.
      const istIso = (t: number) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 19);
      const floor = istIso(Date.now() - Math.max(1, settings.lookbackDays) * 86400_000);
      const fromNewest = s0.newestPostDate ? istIso(new Date(`${s0.newestPostDate.slice(0, 19)}Z`).getTime() - 5.5 * 3600_000 - 3600_000) : null;
      const after = fromNewest && fromNewest > floor ? fromNewest : floor;
      const exclude = settings.excludeCategories.length ? `&categories_exclude=${settings.excludeCategories.join(',')}` : '';
      const maxPages = Math.max(1, Math.ceil(Math.min(500, settings.maxPosts) / PAGE_SIZE));
      const posts: WpPost[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const { data, totalPages } = await fpGet(`/wp-json/wp/v2/posts?per_page=${PAGE_SIZE}&page=${page}&after=${encodeURIComponent(after)}&orderby=date&order=desc&categories=${settings.includeCategories.join(',')}${exclude}&${FIELDS}`, run);
        const list = Array.isArray(data) ? (data as WpPost[]) : [];
        posts.push(...list);
        if (list.length < PAGE_SIZE || page >= totalPages || posts.length >= settings.maxPosts) break;
      }
      await updateFpStore(s => {
        enqueue(s, posts.slice(0, settings.maxPosts), run);
        const newest = posts.map(p => p.date).filter(Boolean).sort().pop();
        if (newest && (!s.newestPostDate || newest > s.newestPostDate)) s.newestPostDate = newest;
      });
    } catch (e) {
      run.error = (e as Error).message;
    } finally {
      run.finishedAt = nowIst();
      await updateFpStore(s => { s.running = false; s.runs.unshift(run); });
      active = null;
    }
    return run;
  })();
  return active;
}

/** Queues one post from its FacultyPlus address, even if it was handled before. */
export async function addFacultyPlusLink(url: string): Promise<{ ok: true; item: FpQueueItem } | { ok: false; error: string }> {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { ok: false, error: 'Paste a full FacultyPlus post address.' }; }
  if (!/(^|\.)facultyplus\.com$/i.test(u.hostname)) return { ok: false, error: 'This is not a facultyplus.com address.' };
  const pid = u.searchParams.get('p');
  const slug = u.pathname.split('/').filter(Boolean).pop() || '';
  if (!pid && !/^[a-z0-9-]{3,300}$/i.test(slug)) return { ok: false, error: 'Paste the address of one FacultyPlus post.' };
  const run = newRun('link');
  try {
    const { data } = await fpGet(pid && /^\d+$/.test(pid) ? `/wp-json/wp/v2/posts?include=${pid}&${FIELDS}` : `/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&${FIELDS}`, run);
    const post = Array.isArray(data) ? (data as WpPost[])[0] : null;
    if (!isPost(post)) return { ok: false, error: 'FacultyPlus has no post at that address.' };
    if (!parseFacultyPlusPost(post).isVacancy) return { ok: false, error: 'That post does not look like a vacancy (no institution or post found).' };
    let item: FpQueueItem | undefined;
    let duplicate = false;
    await updateFpStore(s => {
      const existing = s.queue.find(q => q.postId === post.id);
      if (existing) { item = existing; duplicate = true; return; }
      s.seen = s.seen.filter(id => id !== post.id);
      item = enqueue(s, [post], run, { keepExpired: true })[0];
      run.finishedAt = nowIst();
      s.runs.unshift(run);
    });
    if (!item) return { ok: false, error: 'That post could not be added.' };
    if (duplicate) return { ok: false, error: `That post is already in the list (${item.status}).` };
    return { ok: true, item };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Called by the server's 10-minute scheduler: runs once a day after the configured IST time. */
export async function maybeRunFacultyPlusDaily(): Promise<void> {
  const s = await getFpStore();
  if (!s.settings.dailyEnabled || fpRunning()) return;
  if (s.settings.lastDailyRunDate === todayIst()) return;
  if (hhmmIst() < s.settings.dailyTime) return;
  const run = await runFacultyPlus('schedule');
  console.log(`[AcadeXMatch] FacultyPlus: read ${run.read} posts, ${run.added} new for approval${run.error ? `, error: ${run.error}` : ''}`);
}

// ------------------------------------------------------------------ duplicates

export interface DuplicateOf { where: 'board' | 'facultytick' | 'facultyplus'; id: string; title: string; instituteName: string; applicationDeadline: string | null }

const asCandidate = (j: Job): DupCandidate => ({
  id: j.id, title: j.title, instituteName: j.instituteName, applicationDeadline: j.applicationDeadline,
  postedAt: j.postedAt, officialWebsite: j.details?.officialWebsite || null,
});

/** For each waiting FacultyPlus item, the vacancy it seems to repeat (on the job board, in FacultyTick's queue, or earlier in this queue). */
export async function duplicatesFor(s: FpStore): Promise<Record<string, DuplicateOf>> {
  const pending = s.queue.filter(q => q.status === 'pending');
  if (!pending.length) return {};
  const board = await withDb(null, db => ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.status !== 'closed' && j.status !== 'draft'));
  const ft = await getFtStore().then(f => f.queue.filter(q => q.status === 'pending').map(q => q.job)).catch(() => [] as Job[]);
  const boardC = board.map(asCandidate);
  const ftC = ft.map(asCandidate);
  const out: Record<string, DuplicateOf> = {};
  // Oldest first, so the later copy is the one flagged.
  const ordered = [...pending].sort((a, b) => a.postDate.localeCompare(b.postDate));
  const earlier: { item: FpQueueItem; c: DupCandidate }[] = [];
  for (const q of ordered) {
    const c = asCandidate(q.job);
    const onBoard = findDuplicate(c, boardC);
    const inFt = onBoard ? null : findDuplicate(c, ftC);
    const inFp = onBoard || inFt ? null : earlier.find(e => findDuplicate(c, [e.c]))?.item;
    const hit = onBoard ? { where: 'board' as const, job: board.find(j => j.id === onBoard.id)! }
      : inFt ? { where: 'facultytick' as const, job: ft.find(j => j.id === inFt.id)! }
        : inFp ? { where: 'facultyplus' as const, job: inFp.job } : null;
    if (hit) out[q.id] = { where: hit.where, id: hit.where === 'facultyplus' ? inFp!.id : hit.job.id, title: hit.job.title, instituteName: hit.job.instituteName, applicationDeadline: hit.job.applicationDeadline };
    earlier.push({ item: q, c });
  }
  return out;
}
