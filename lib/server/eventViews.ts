/*
 * Views per event (FDPs, workshops, seminars, conferences…), for the administrator only. Same rules as vacancy
 * views (lib/server/jobViews.ts): one view = one visitor opening the event page, counted at most once per event per
 * day (visitor = salted hash of IP + browser, never stored as such); bots and the administrator's own visits are
 * not counted. Also counts clicks on the event's Register and Brochure links (once per visitor per day each).
 * Stored as small JSON ("event-views"), never in the shared snapshot, so organisers and visitors never receive it.
 */
import { createHash, randomBytes } from 'crypto';
import { readJson, writeJson } from './persist';
import { isBot } from './jobViews';

export type EventAction = 'view' | 'register' | 'brochure';
interface EventCount { total: number; days: Record<string, number>; register: number; brochure: number; last?: string }
interface Store { since: string; salt: string; events: Record<string, EventCount>; seenDay: string; seen: string[] }

const KEEP_DAYS = 90;
const MAX_SEEN = 50_000;
const STORE = 'event-views';

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayIst = (offset: number) => new Date(Date.now() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Store> {
  const s = await readJson<Store>(STORE);
  return {
    since: s?.since || todayIst(), salt: s?.salt || randomBytes(16).toString('hex'),
    events: s?.events || {}, seenDay: s?.seenDay || todayIst(), seen: Array.isArray(s?.seen) ? s!.seen : [],
  };
}

/** Records one view or link click; returns false when it was not counted (bot, repeat today, bad id). */
export async function recordEventAction(eventId: string, action: EventAction, visitor: { ip: string; ua: string | null }): Promise<boolean> {
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(eventId) || !['view', 'register', 'brochure'].includes(action) || isBot(visitor.ua)) return false;
  return locked(async () => {
    const s = await read();
    const today = todayIst();
    if (s.seenDay !== today) { s.seenDay = today; s.seen = []; }
    const key = createHash('sha256').update(`${s.salt}|${today}|${eventId}|${action}|${visitor.ip}|${visitor.ua}`).digest('base64url').slice(0, 16);
    if (s.seen.includes(key)) return false;
    s.seen.push(key);
    if (s.seen.length > MAX_SEEN) s.seen = s.seen.slice(-MAX_SEEN);
    const e = s.events[eventId] || { total: 0, days: {}, register: 0, brochure: 0 };
    if (action === 'view') {
      e.total++;
      e.days[today] = (e.days[today] || 0) + 1;
      e.last = new Date().toISOString();
      for (const d of Object.keys(e.days)) if (d < dayIst(KEEP_DAYS)) delete e.days[d];
    } else {
      e[action] = (e[action] || 0) + 1;
    }
    s.events[eventId] = e;
    await writeJson(STORE, s);
    return true;
  });
}

export interface EventViewSummary { total: number; today: number; last7: number; register: number; brochure: number; last?: string }

/** Counts for every event (administrator only — the caller must check). */
export async function eventViewCounts(): Promise<{ since: string; events: Record<string, EventViewSummary> }> {
  const s = await locked(read);
  const today = todayIst();
  const week = Array.from({ length: 7 }, (_, i) => dayIst(i));
  const events: Record<string, EventViewSummary> = {};
  for (const [id, e] of Object.entries(s.events)) {
    events[id] = { total: e.total, today: e.days[today] || 0, last7: week.reduce((n, d) => n + (e.days[d] || 0), 0), register: e.register || 0, brochure: e.brochure || 0, last: e.last };
  }
  return { since: s.since, events };
}

/** Daily views for one event (last `days` days). */
export async function eventViewSeries(eventId: string, days = 30): Promise<{ date: string; count: number }[]> {
  const s = await locked(read);
  const e = s.events[eventId];
  return Array.from({ length: days }, (_, i) => dayIst(days - 1 - i)).map(d => ({ date: d, count: e?.days[d] || 0 }));
}
