/*
 * Views per vacancy, for the administrator only. One view = one visitor opening a vacancy page, counted at
 * most once per vacancy per day (visitor = salted hash of IP + browser, never stored as such). Search-engine
 * bots and the administrator's own visits are not counted. Stored as small JSON ("job-views"), not in the
 * shared snapshot, so candidates and institutions never receive it.
 */
import { createHash, randomBytes } from 'crypto';
import { readJson, writeJson } from './persist';

interface JobCount { total: number; days: Record<string, number>; last?: string }
interface Store { since: string; salt: string; jobs: Record<string, JobCount>; seenDay: string; seen: string[] }

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|curl|wget|python|axios|node-fetch|go-http|java\//i;
const KEEP_DAYS = 90;
const MAX_SEEN = 50_000;

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayIst = (offset: number) => new Date(Date.now() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Store> {
  const s = await readJson<Store>('job-views');
  return {
    since: s?.since || todayIst(), salt: s?.salt || randomBytes(16).toString('hex'),
    jobs: s?.jobs || {}, seenDay: s?.seenDay || todayIst(), seen: Array.isArray(s?.seen) ? s!.seen : [],
  };
}

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

/** Records one view; returns false when it was not counted (bot, repeat today, unknown id). */
export async function recordJobView(jobId: string, visitor: { ip: string; ua: string | null }): Promise<boolean> {
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(jobId) || isBot(visitor.ua)) return false;
  return locked(async () => {
    const s = await read();
    const today = todayIst();
    if (s.seenDay !== today) { s.seenDay = today; s.seen = []; }
    const key = createHash('sha256').update(`${s.salt}|${today}|${jobId}|${visitor.ip}|${visitor.ua}`).digest('base64url').slice(0, 16);
    if (s.seen.includes(key)) return false;
    s.seen.push(key);
    if (s.seen.length > MAX_SEEN) s.seen = s.seen.slice(-MAX_SEEN);
    const j = s.jobs[jobId] || { total: 0, days: {} };
    j.total++;
    j.days[today] = (j.days[today] || 0) + 1;
    j.last = new Date().toISOString();
    for (const d of Object.keys(j.days)) if (d < dayIst(KEEP_DAYS)) delete j.days[d];
    s.jobs[jobId] = j;
    await writeJson('job-views', s);
    return true;
  });
}

export interface JobViewSummary { total: number; today: number; last7: number; last?: string }

/** Counts for every vacancy (administrator only — the caller must check). */
export async function jobViewCounts(): Promise<{ since: string; jobs: Record<string, JobViewSummary> }> {
  const s = await read();
  const today = todayIst();
  const week = Array.from({ length: 7 }, (_, i) => dayIst(i));
  const jobs: Record<string, JobViewSummary> = {};
  for (const [id, j] of Object.entries(s.jobs)) {
    jobs[id] = { total: j.total, today: j.days[today] || 0, last7: week.reduce((n, d) => n + (j.days[d] || 0), 0), last: j.last };
  }
  return { since: s.since, jobs };
}

/** Daily series for one vacancy (last `days` days). */
export async function jobViewSeries(jobId: string, days = 30): Promise<{ date: string; count: number }[]> {
  const s = await read();
  const j = s.jobs[jobId];
  return Array.from({ length: days }, (_, i) => dayIst(days - 1 - i)).map(d => ({ date: d, count: j?.days[d] || 0 }));
}
