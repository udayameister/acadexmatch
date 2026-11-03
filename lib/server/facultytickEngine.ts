import { readJson, writeJson } from './persist';
import { FACULTYTICK_ORIGIN, parseFacultyTickPost, type WpPost } from '@/lib/facultytick';
import type { Job } from '@/types';

/*
 * FacultyTick scraping engine, separate from the college-website scraper.
 *
 * Reads new posts from FacultyTick's public WordPress posts API (allowed by its robots.txt), turns each into a
 * vacancy with lib/facultytick.ts and queues it for the platform administrator. Nothing is published until the
 * administrator approves it in the admin console. Kept in data/facultytick.json (or the database table).
 *
 * Politeness: one request at a time, a pause between requests, an honest user agent, only recent posts, and
 * only the categories the administrator chose.
 */

export type FtStatus = 'pending' | 'approved' | 'rejected';

export interface FtCategory { id: number; name: string; count: number }

export interface FtSettings {
  dailyEnabled: boolean;
  /** 24-hour IST time, e.g. "07:30". */
  dailyTime: string;
  lastDailyRunDate?: string;
  /** FacultyTick category ids to read. */
  categories: number[];
  /** How many days back to look on the first run (later runs continue from the newest post seen). */
  lookbackDays: number;
  /** Upper limit of posts read per run. */
  maxPosts: number;
}

export interface FtQueueItem {
  id: string;
  postId: number;
  link: string;
  postDate: string;
  foundAt: string;
  categories: string[];
  status: FtStatus;
  decidedAt?: string;
  issues: string[];
  layout: 'template' | 'freeform';
  job: Job;
}

export interface FtRun {
  id: string;
  trigger: 'schedule' | 'manual' | 'link';
  startedAt: string;
  finishedAt?: string;
  requests: number;
  read: number;
  added: number;
  skippedSeen: number;
  skippedExpired: number;
  error?: string;
}

export interface FtStore {
  settings: FtSettings;
  categories: FtCategory[];
  queue: FtQueueItem[];
  runs: FtRun[];
  /** Post ids already handled, so a post is queued only once. */
  seen: number[];
  /** Publication time of the newest post read (FacultyTick's local time, as the API gives it). */
  newestPostDate?: string;
  running?: boolean;
}

const STORE = 'facultytick';
const USER_AGENT = 'AcadeXMatchBot/1.0 (+https://acadexmatch.com/about; info@acadexmatch.com)';
const PAUSE_MS = 1500;
const PAGE_SIZE = 50;
const MAX_SEEN = 20000;
const MAX_DECIDED = 1500;
const MAX_RUNS = 60;

/** Higher-education categories by default; School, Junior College and Announcement are left out. */
export const DEFAULT_CATEGORIES: FtCategory[] = [
  { id: 7, name: 'Engineering', count: 0 }, { id: 8, name: 'Arts & Science', count: 0 }, { id: 13, name: 'Research', count: 0 },
  { id: 9, name: 'Medical', count: 0 }, { id: 10, name: 'Law', count: 0 }, { id: 187364, name: 'Pharmacy', count: 0 },
  { id: 187372, name: 'Architecture', count: 0 }, { id: 187386, name: 'Design', count: 0 }, { id: 11, name: 'Polytechnic', count: 0 },
  { id: 12, name: 'School', count: 0 }, { id: 187477, name: 'Junior College', count: 0 }, { id: 54, name: 'Announcement', count: 0 },
];
const DEFAULT_INCLUDED = [7, 8, 13, 9, 10, 187364, 187372, 187386];

const DEFAULT_STORE: FtStore = {
  settings: { dailyEnabled: true, dailyTime: '07:30', categories: DEFAULT_INCLUDED, lookbackDays: 3, maxPosts: 150 },
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

async function read(): Promise<FtStore> {
  const s = await readJson<Partial<FtStore>>(STORE);
  const d: FtStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
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

async function write(s: FtStore): Promise<void> {
  const pending = s.queue.filter(q => q.status === 'pending');
  const decided = s.queue.filter(q => q.status !== 'pending').slice(0, MAX_DECIDED);
  s.queue = [...pending, ...decided];
  s.runs = s.runs.slice(0, MAX_RUNS);
  s.seen = s.seen.slice(-MAX_SEEN);
  await writeJson(STORE, s);
}

export function getFtStore(): Promise<FtStore> {
  return locked(read);
}

export function updateFtStore(fn: (s: FtStore) => void | Promise<void>): Promise<FtStore> {
  return locked(async () => {
    const s = await read();
    await fn(s);
    await write(s);
    return s;
  });
}

// ------------------------------------------------------------------ fetching

/** FACULTYTICK_API_ORIGIN is only for automated tests (a local stand-in server); production uses facultytick.com. */
const apiOrigin = () => process.env.FACULTYTICK_API_ORIGIN?.replace(/\/$/, '') || FACULTYTICK_ORIGIN;
const pauseMs = () => (process.env.FACULTYTICK_API_ORIGIN && apiOrigin() !== FACULTYTICK_ORIGIN ? 50 : PAUSE_MS);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastRequestAt = 0;

/** GET from FacultyTick's API with a pause between requests, a timeout and one retry when asked to slow down. */
async function ftGet(pathAndQuery: string, run?: FtRun): Promise<{ data: unknown; totalPages: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastRequestAt + pauseMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    if (run) run.requests++;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${apiOrigin()}${pathAndQuery}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: ctl.signal,
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 0) { await sleep(5000); continue; }
      throw new Error(`FacultyTick did not respond (${(e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message}).`);
    }
    clearTimeout(timer);
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const after = Math.min(60, Number(res.headers.get('retry-after')) || 15);
      await sleep(after * 1000);
      continue;
    }
    if (res.status === 400 && /page/.test(pathAndQuery)) return { data: [], totalPages: 0 }; // past the last page
    if (!res.ok) throw new Error(`FacultyTick answered ${res.status} ${res.statusText}.`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 8 * 1024 * 1024) throw new Error('FacultyTick sent an unexpectedly large response.');
    const data = await res.json();
    return { data, totalPages: Number(res.headers.get('x-wp-totalpages') || 1) };
  }
  throw new Error('FacultyTick did not respond.');
}

const FIELDS = '_fields=id,date,modified,link,title,content,categories';

export async function refreshCategories(): Promise<FtCategory[]> {
  const { data } = await ftGet('/wp-json/wp/v2/categories?per_page=100&_fields=id,name,count');
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;/g, '’');
  const cats = (Array.isArray(data) ? data : [])
    .map((c: { id: number; name: string; count: number }) => ({ id: Number(c.id), name: decode(String(c.name || '')).replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase()), count: Number(c.count) || 0 }))
    .filter(c => c.id && c.name && !/^uncategori[sz]ed$/i.test(c.name));
  if (cats.length) await updateFtStore(s => { s.categories = cats; });
  return cats;
}

function isPost(p: unknown): p is WpPost {
  const x = p as WpPost;
  return !!x && typeof x.id === 'number' && typeof x.link === 'string' && !!x.content?.rendered && !!x.title;
}

/** Adds parsed posts to the queue (skipping ones already handled or already past their last date). */
function enqueue(s: FtStore, posts: WpPost[], run: FtRun, opts: { keepExpired?: boolean } = {}): FtQueueItem[] {
  const seen = new Set(s.seen);
  const names = Object.fromEntries(s.categories.map(c => [c.id, c.name]));
  const today = todayIst();
  const keyOf = (j: Job) => `${j.instituteName}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim();
  const pendingKeys = new Set(s.queue.filter(q => q.status === 'pending').map(q => keyOf(q.job)));
  const added: FtQueueItem[] = [];
  for (const p of posts) {
    if (!isPost(p)) continue;
    run.read++;
    if (seen.has(p.id)) { run.skippedSeen++; continue; }
    seen.add(p.id);
    s.seen.push(p.id);
    const parsed = parseFacultyTickPost(p, { today });
    if (parsed.expired && !opts.keepExpired) { run.skippedExpired++; continue; }
    const key = keyOf(parsed.job);
    if (pendingKeys.has(key)) { run.skippedSeen++; continue; }
    pendingKeys.add(key);
    const item: FtQueueItem = {
      id: newId('ft'),
      postId: p.id,
      link: p.link,
      postDate: p.date,
      foundAt: nowIst(),
      categories: (p.categories || []).map(c => names[c]).filter(Boolean),
      status: 'pending',
      issues: parsed.expired ? [...parsed.issues, 'Last date has passed'] : parsed.issues,
      layout: parsed.layout,
      job: parsed.job,
    };
    s.queue.unshift(item);
    added.push(item);
    run.added++;
  }
  return added;
}

let active: Promise<FtRun> | null = null;
export const ftRunning = () => active !== null;

/** Reads new FacultyTick posts and queues them for approval. */
export function runFacultyTick(trigger: 'schedule' | 'manual'): Promise<FtRun> {
  if (active) return active;
  active = (async () => {
    const run: FtRun = { id: newId('run'), trigger, startedAt: nowIst(), requests: 0, read: 0, added: 0, skippedSeen: 0, skippedExpired: 0 };
    const s0 = await updateFtStore(s => { s.running = true; if (trigger === 'schedule') s.settings.lastDailyRunDate = todayIst(); });
    try {
      const { settings } = s0;
      if (!settings.categories.length) throw new Error('No categories are selected.');
      // FacultyTick's dates are Indian time (the API compares "after" with them as written). Continue from the
      // newest post already read, with an hour of overlap, but never further back than lookbackDays.
      const istIso = (t: number) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 19);
      const floor = istIso(Date.now() - Math.max(1, settings.lookbackDays) * 86400_000);
      const fromNewest = s0.newestPostDate ? istIso(new Date(`${s0.newestPostDate.slice(0, 19)}Z`).getTime() - 5.5 * 3600_000 - 3600_000) : null;
      const after = fromNewest && fromNewest > floor ? fromNewest : floor;
      const maxPages = Math.max(1, Math.ceil(Math.min(500, settings.maxPosts) / PAGE_SIZE));
      const posts: WpPost[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const { data, totalPages } = await ftGet(`/wp-json/wp/v2/posts?per_page=${PAGE_SIZE}&page=${page}&after=${encodeURIComponent(after)}&orderby=date&order=desc&categories=${settings.categories.join(',')}&${FIELDS}`, run);
        const list = Array.isArray(data) ? (data as WpPost[]) : [];
        posts.push(...list);
        if (list.length < PAGE_SIZE || page >= totalPages || posts.length >= settings.maxPosts) break;
      }
      await updateFtStore(s => {
        enqueue(s, posts.slice(0, settings.maxPosts), run);
        const newest = posts.map(p => p.date).filter(Boolean).sort().pop();
        if (newest && (!s.newestPostDate || newest > s.newestPostDate)) s.newestPostDate = newest;
      });
    } catch (e) {
      run.error = (e as Error).message;
    } finally {
      run.finishedAt = nowIst();
      await updateFtStore(s => { s.running = false; s.runs.unshift(run); });
      active = null;
    }
    return run;
  })();
  return active;
}

/** Queues one post from its FacultyTick address (e.g. the sample NITC post), even if it was handled before. */
export async function addFacultyTickLink(url: string): Promise<{ ok: true; item: FtQueueItem } | { ok: false; error: string }> {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { ok: false, error: 'Paste a full FacultyTick post address.' }; }
  if (!/(^|\.)facultytick\.com$/i.test(u.hostname)) return { ok: false, error: 'This is not a facultytick.com address.' };
  const slug = u.pathname.split('/').filter(Boolean).pop() || '';
  if (!/^[a-z0-9-]{3,300}$/i.test(slug)) return { ok: false, error: 'Paste the address of one FacultyTick post.' };
  const run: FtRun = { id: newId('run'), trigger: 'link', startedAt: nowIst(), requests: 0, read: 0, added: 0, skippedSeen: 0, skippedExpired: 0 };
  try {
    const { data } = await ftGet(`/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&${FIELDS}`, run);
    const post = Array.isArray(data) ? (data as WpPost[])[0] : null;
    if (!isPost(post)) return { ok: false, error: 'FacultyTick has no post at that address.' };
    let item: FtQueueItem | undefined;
    let duplicate = false;
    await updateFtStore(s => {
      const existing = s.queue.find(q => q.postId === post.id);
      if (existing) { item = existing; duplicate = true; return; }
      s.seen = s.seen.filter(id => id !== post.id);
      item = enqueue(s, [post], run, { keepExpired: true })[0];
      run.finishedAt = nowIst();
      s.runs.unshift(run);
    });
    if (!item) return { ok: false, error: 'That post is already in the list.' };
    if (duplicate) return { ok: false, error: `That post is already in the list (${item.status}).` };
    return { ok: true, item };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Called by the server's 10-minute scheduler: runs once a day after the configured IST time. */
export async function maybeRunFacultyTickDaily(): Promise<void> {
  const s = await getFtStore();
  if (!s.settings.dailyEnabled || ftRunning()) return;
  if (s.settings.lastDailyRunDate === todayIst()) return;
  if (hhmmIst() < s.settings.dailyTime) return;
  const run = await runFacultyTick('schedule');
  console.log(`[AcadeXMatch] FacultyTick: read ${run.read} posts, ${run.added} new for approval${run.error ? `, error: ${run.error}` : ''}`);
}
