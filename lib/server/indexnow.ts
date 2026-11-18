import crypto from 'crypto';
import { readJson, writeJson } from './persist';
import { SITE_URL } from '@/lib/site';

/*
 * IndexNow: tells Bing (and through Bing, Yahoo and DuckDuckGo), Yandex, Seznam, Naver and Yep that pages were added
 * or changed, so they are crawled within hours instead of weeks. https://www.indexnow.org
 *
 * - The key is generated once on the server and kept in the database (json:indexnow), or set with INDEXNOW_KEY.
 *   It is public by design: search engines fetch it from /<key>.txt to confirm the site sent the ping.
 *   Google does not use IndexNow (it reads the sitemap; see Search Console).
 * - Every run compares the sitemap with what was already submitted and sends only new or changed addresses.
 * - Only the live site submits (not preview copies or local tests); set INDEXNOW=off to stop it.
 */

const STORE = 'indexnow';
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
const BATCH = 10_000; // protocol limit per request
const DAILY_LIMIT = 10_000;

export interface SubmitLog { at: string; count: number; status: number; ok: boolean; note: string; reason: string }
interface Store {
  key?: string;
  /** url -> last-modified value (or '' when the page has none) as last submitted */
  sent: Record<string, string>;
  log: SubmitLog[];
  lastRun?: string;
}

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Store> {
  const s = await readJson<Partial<Store>>(STORE);
  return { key: s?.key, sent: s?.sent && typeof s.sent === 'object' ? s.sent : {}, log: Array.isArray(s?.log) ? s!.log : [], lastRun: s?.lastRun };
}

const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

/** The site's IndexNow key (created on first use). */
export function getKey(): Promise<string> {
  const fromEnv = (process.env.INDEXNOW_KEY || '').trim();
  if (KEY_RE.test(fromEnv)) return Promise.resolve(fromEnv);
  return locked(async () => {
    const s = await read();
    if (s.key && KEY_RE.test(s.key)) return s.key;
    s.key = crypto.randomBytes(16).toString('hex');
    await writeJson(STORE, s);
    return s.key;
  });
}

export const keyLocation = (key: string) => `${SITE_URL}/${key}.txt`;

/** Only the real, public site may submit: not localhost, not preview copies, not when switched off. */
export function enabled(): { on: boolean; why?: string } {
  if ((process.env.INDEXNOW || '').toLowerCase() === 'off') return { on: false, why: 'switched off with INDEXNOW=off' };
  if (process.env.INDEXNOW_FORCE === '1') return { on: true };
  if (process.env.NODE_ENV !== 'production') return { on: false, why: 'not a production server' };
  if (!/^https:\/\//.test(SITE_URL) || /localhost|127\.0\.0\.1/.test(SITE_URL)) return { on: false, why: 'the site address is not a public https address' };
  const here = (process.env.APP_URL || '').toLowerCase();
  if (/preview|airoapp\.ai|localhost/.test(here)) return { on: false, why: 'this is a preview copy, only the live site submits' };
  return { on: true };
}

async function post(urls: string[], key: string): Promise<{ status: number; note: string }> {
  const host = new URL(SITE_URL).host;
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: keyLocation(key), urlList: urls }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = (await r.text().catch(() => '')).slice(0, 200);
    const note: Record<number, string> = {
      200: 'Accepted', 202: 'Accepted (key check pending)', 400: 'Bad request', 403: 'Key not valid (is the key file live on the site?)',
      422: 'Addresses do not match the site', 429: 'Too many requests, will retry later',
    };
    return { status: r.status, note: note[r.status] || text || r.statusText };
  } catch (e) {
    return { status: 0, note: `Could not reach IndexNow: ${(e as Error).message}`.slice(0, 200) };
  }
}

/** All public addresses with their last-modified values, from the sitemap. */
async function siteUrls(): Promise<{ url: string; mod: string }[]> {
  const { default: sitemap } = await import('../../app/sitemap');
  const list = await sitemap();
  return list.map(e => ({ url: e.url, mod: e.lastModified ? new Date(e.lastModified as string | Date).toISOString() : '' }));
}

export interface SyncResult { submitted: number; pending: number; skipped?: string; results: SubmitLog[] }

/**
 * Submits new or changed public pages. `force` re-submits everything (e.g. after setting up Bing Webmaster Tools);
 * `urls` submits only those addresses (e.g. a post just published).
 */
export function sync(opts: { force?: boolean; urls?: string[]; reason?: string } = {}): Promise<SyncResult> {
  return locked(async () => {
    const on = enabled();
    if (!on.on) return { submitted: 0, pending: 0, skipped: on.why, results: [] };
    const s = await read();
    const envKey = (process.env.INDEXNOW_KEY || '').trim();
    if (!s.key || !KEY_RE.test(s.key)) s.key = crypto.randomBytes(16).toString('hex');
    const key = KEY_RE.test(envKey) ? envKey : s.key;
    const all = await siteUrls();
    const host = new URL(SITE_URL).host;
    let todo = opts.urls?.length
      ? opts.urls.filter(u => { try { return new URL(u).host === host; } catch { return false; } }).map(url => ({ url, mod: all.find(a => a.url === url)?.mod ?? new Date().toISOString() }))
      : all.filter(a => opts.force || s.sent[a.url] === undefined || (a.mod && s.sent[a.url] !== a.mod));
    // Respect a daily budget across runs.
    const since = Date.now() - 86400_000;
    const usedToday = s.log.filter(l => l.ok && Date.parse(l.at) > since).reduce((n, l) => n + l.count, 0);
    const room = Math.max(0, DAILY_LIMIT - usedToday);
    const pending = Math.max(0, todo.length - room);
    todo = todo.slice(0, room);

    const results: SubmitLog[] = [];
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const r = await post(batch.map(b => b.url), key);
      const ok = r.status === 200 || r.status === 202;
      const entry = { at: new Date().toISOString(), count: batch.length, status: r.status, ok, note: r.note, reason: opts.reason || (opts.force ? 'Submit all' : 'New or changed pages') };
      results.push(entry);
      if (ok) for (const b of batch) s.sent[b.url] = b.mod;
      else break;
    }
    // Forget addresses that left the sitemap (closed vacancies, deleted posts), so they are sent again if they return.
    const live = new Set(all.map(a => a.url));
    for (const u of Object.keys(s.sent)) if (!live.has(u)) delete s.sent[u];
    s.log = [...results, ...s.log].slice(0, 30);
    s.lastRun = new Date().toISOString();
    await writeJson(STORE, s);
    return { submitted: results.filter(r => r.ok).reduce((n, r) => n + r.count, 0), pending, results };
  });
}

export async function status() {
  const key = await getKey();
  const s = await locked(read);
  const all = await siteUrls().catch(() => []);
  const waiting = all.filter(a => s.sent[a.url] === undefined || (a.mod && s.sent[a.url] !== a.mod)).length;
  return {
    enabled: enabled(),
    keyLocation: keyLocation(key),
    totalPages: all.length,
    submittedPages: Object.keys(s.sent).length,
    waiting,
    lastRun: s.lastRun || null,
    log: s.log.slice(0, 10),
    verification: {
      google: !!process.env.GOOGLE_SITE_VERIFICATION,
      bing: !!process.env.BING_SITE_VERIFICATION,
      yandex: !!process.env.YANDEX_SITE_VERIFICATION,
    },
  };
}

let soon: ReturnType<typeof setTimeout> | null = null;
/** Called after something is published: submits shortly after, so several quick changes go in one request. */
export function submitSoon(reason: string): void {
  if (!enabled().on) return;
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => { soon = null; sync({ reason }).catch(e => console.error('[AcadeXMatch] IndexNow error', (e as Error).message)); }, 15_000);
}

/** A few public pages changed (vacancy added or edited, institution updated…): submit them now. Paths start with "/". */
export async function pingIndexNow(paths: string[]): Promise<void> {
  const urls = [...new Set(paths.filter(p => typeof p === 'string' && p.startsWith('/')))].slice(0, 1000).map(p => `${SITE_URL}${p}`);
  if (!urls.length || !enabled().on) return;
  await sync({ urls, reason: 'Pages changed' }).catch(() => undefined);
}
