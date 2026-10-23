import { readJson, writeJson } from './persist';
import type { Job } from '@/types';
import { normaliseScrapeUrl, runScraper } from './scrapeEngine';

/*
 * Server-side store for the daily scraping pipeline, kept in data/scrape-pipeline.json:
 *  - sources: college career pages to scrape every day
 *  - queue:   vacancies found, waiting for admin approval (pending / approved / rejected)
 *  - runs:    history of scraping runs
 */

export type QueueStatus = 'pending' | 'approved' | 'rejected';
export type Audience = 'all' | 'premium';

export interface ScrapeSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  addedAt: string;
  lastRunAt?: string;
  lastStatus?: 'ok' | 'error';
  lastMessage?: string;
  lastFound?: number;
}

export interface QueueItem {
  id: string;
  key: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  foundAt: string;
  status: QueueStatus;
  decidedAt?: string;
  audience?: Audience;
  job: Job;
}

export interface ScrapeRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  trigger: 'schedule' | 'manual' | 'command';
  sources: number;
  newItems: number;
  errors: number;
}

export interface PipelineSettings {
  dailyEnabled: boolean;
  /** 24-hour time in IST, e.g. "06:00". */
  dailyTime: string;
  lastDailyRunDate?: string;
}

export interface PipelineStore {
  settings: PipelineSettings;
  sources: ScrapeSource[];
  queue: QueueItem[];
  runs: ScrapeRun[];
  running?: boolean;
}

const MAX_RUNS = 60;
const MAX_DECIDED = 1000;

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export function nowIstString(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function nowIstHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_STORE: PipelineStore = {
  settings: { dailyEnabled: true, dailyTime: '06:00' },
  sources: [
    { id: 'src-mits', name: 'MITS Madanapalle', url: 'https://mits.ac.in/positionsoffered', enabled: true, addedAt: '2026-10-21' },
  ],
  queue: [],
  runs: [],
};

async function read(): Promise<PipelineStore> {
  const s = await readJson<PipelineStore>('scrape-pipeline');
  if (s) {
    return {
      settings: { ...DEFAULT_STORE.settings, ...(s.settings || {}) },
      sources: s.sources || [],
      queue: s.queue || [],
      runs: s.runs || [],
      running: s.running,
    };
  }
  return JSON.parse(JSON.stringify(DEFAULT_STORE));
}

async function write(store: PipelineStore): Promise<void> {
  const pending = store.queue.filter(q => q.status === 'pending');
  const decided = store.queue.filter(q => q.status !== 'pending').slice(0, MAX_DECIDED);
  store.queue = [...pending, ...decided];
  store.runs = store.runs.slice(0, MAX_RUNS);
  await writeJson('scrape-pipeline', store);
}

export function getStore(): Promise<PipelineStore> {
  return locked(read);
}

export function updateStore(fn: (s: PipelineStore) => void | Promise<void>): Promise<PipelineStore> {
  return locked(async () => {
    const s = await read();
    await fn(s);
    await write(s);
    return s;
  });
}

/** Same title at the same institute (or same source) counts as the same vacancy. */
function dedupeKey(job: Job, sourceId: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${sourceId}|${norm(job.instituteName)}|${norm(job.title)}|${norm(job.department || '')}`;
}

export async function addSource(name: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const u = normaliseScrapeUrl(url);
  if (!u) return { ok: false, error: 'Enter a public college website address (http or https).' };
  let error: string | undefined;
  await updateStore(s => {
    if (s.sources.some(x => x.url.replace(/\/$/, '') === u.toString().replace(/\/$/, ''))) { error = 'This source is already in the list.'; return; }
    s.sources.push({ id: newId('src'), name: name.trim() || u.hostname.replace('www.', ''), url: u.toString(), enabled: true, addedAt: todayIst() });
  });
  return error ? { ok: false, error } : { ok: true };
}

let activeRun: Promise<ScrapeRun> | null = null;

/** Scrapes every enabled source (or one source) and queues new vacancies for approval. */
export function runPipeline(trigger: ScrapeRun['trigger'], onlySourceId?: string): Promise<ScrapeRun> {
  if (activeRun) return activeRun;
  activeRun = (async () => {
    const run: ScrapeRun = { id: newId('run'), startedAt: nowIstString(), trigger, sources: 0, newItems: 0, errors: 0 };
    const store = await updateStore(s => {
      s.running = true;
      if (trigger === 'schedule') s.settings.lastDailyRunDate = todayIst();
    });
    const sources = store.sources.filter(x => (onlySourceId ? x.id === onlySourceId : x.enabled));
    try {
      for (const src of sources) {
        run.sources++;
        const u = normaliseScrapeUrl(src.url);
        const outcome = u ? await runScraper(u) : { ok: false, error: 'Invalid address.', jobs: [] as Job[] };
        await updateStore(s => {
          const target = s.sources.find(x => x.id === src.id);
          let added = 0;
          if (outcome.ok) {
            const keys = new Set(s.queue.map(q => q.key));
            for (const job of outcome.jobs) {
              const key = dedupeKey(job, src.id);
              if (keys.has(key)) continue;
              keys.add(key);
              s.queue.unshift({
                id: newId('q'),
                key,
                sourceId: src.id,
                sourceName: src.name,
                sourceUrl: src.url,
                foundAt: nowIstString(),
                status: 'pending',
                job: { ...job, id: `scraped-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, status: 'published' },
              });
              added++;
            }
          } else {
            run.errors++;
          }
          run.newItems += added;
          if (target) {
            target.lastRunAt = nowIstString();
            target.lastStatus = outcome.ok ? 'ok' : 'error';
            target.lastMessage = outcome.ok ? `${outcome.jobs.length} faculty openings found, ${added} new` : outcome.error;
            target.lastFound = outcome.jobs.length;
          }
        });
      }
    } finally {
      run.finishedAt = nowIstString();
      await updateStore(s => {
        s.running = false;
        s.runs.unshift(run);
      });
      activeRun = null;
    }
    return run;
  })();
  return activeRun;
}

export function isRunning(): boolean {
  return activeRun !== null;
}

/** Called periodically by the server: runs once per day after the configured IST time. */
export async function maybeRunDaily(): Promise<void> {
  const s = await getStore();
  if (!s.settings.dailyEnabled || isRunning()) return;
  if (s.settings.lastDailyRunDate === todayIst()) return;
  if (nowIstHHMM() < s.settings.dailyTime) return;
  console.log(`[AcadeXMatch] Daily vacancy scrape started (${nowIstString()})`);
  const run = await runPipeline('schedule');
  console.log(`[AcadeXMatch] Daily vacancy scrape finished: ${run.newItems} new vacancies from ${run.sources} sources, ${run.errors} errors`);
}
