/*
 * Google Indexing API for vacancy pages. Google accepts this API only for pages with JobPosting structured data
 * (and livestreams), which is exactly what each open, single-post vacancy page carries. Every scheduler run:
 *   - new or changed open vacancies with JobPosting data → URL_UPDATED (newest first)
 *   - vacancies we announced that have since closed, expired or been removed → URL_DELETED
 * within a daily quota (Google's default is 200 requests a day). Off unless GOOGLE_INDEXING_CREDENTIALS holds
 * a service-account JSON key whose client_email is an Owner of the Search Console property.
 * The same URLs also go to IndexNow (Bing, Yandex…) when INDEXNOW_KEY is set.
 */
import { createHash, createSign } from 'crypto';
import { readJson, writeJson } from './persist';
import { withDb } from './db';
import { STORAGE_KEYS } from '@/lib/storage';
import { SITE_URL } from '@/lib/site';
import { isOpenJob, isSingleJob } from './seo';
import { pingIndexNow } from './indexnow';
import type { Job } from '@/types';

const SCOPE = 'https://www.googleapis.com/auth/indexing';
const TOKEN_URL = () => process.env.GOOGLE_INDEXING_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const PUBLISH_URL = () => process.env.GOOGLE_INDEXING_API_URL || 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const dailyLimit = () => Math.max(1, Math.min(10_000, Number(process.env.GOOGLE_INDEXING_DAILY_LIMIT) || 190));
const PER_RUN = 60;

interface Creds { client_email: string; private_key: string }
export function indexingCreds(): Creds | null {
  const raw = (process.env.GOOGLE_INDEXING_CREDENTIALS || '').trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const c = JSON.parse(json) as Partial<Creds>;
    if (!c.client_email || !c.private_key) return null;
    return { client_email: c.client_email, private_key: c.private_key.replace(/\\n/g, '\n') };
  } catch { return null; }
}

let token: { value: string; exp: number } | null = null;
async function accessToken(c: Creds): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: c.client_email, scope: SCOPE, aud: TOKEN_URL(), iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(c.private_key).toString('base64url');
  const r = await fetch(TOKEN_URL(), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !d.access_token) throw new Error(`Google sign-in for the Indexing API failed: ${d.error_description || d.error || r.status}`);
  token = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return token.value;
}

type Kind = 'URL_UPDATED' | 'URL_DELETED';
interface Sent { v: string; at: string; type: Kind }
interface State {
  sent: Record<string, Sent>;
  day: { date: string; count: number };
  lastRunAt?: string; lastError?: string | null; lastErrorAt?: string;
  totals: { updated: number; deleted: number; failed: number };
}
const KEY = 'google-indexing';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
async function readState(): Promise<State> {
  const s = await readJson<State>(KEY);
  return { sent: s?.sent || {}, day: s?.day || { date: today(), count: 0 }, lastRunAt: s?.lastRunAt, lastError: s?.lastError ?? null, lastErrorAt: s?.lastErrorAt, totals: s?.totals || { updated: 0, deleted: 0, failed: 0 } };
}

/** Changes that matter to Google (title, dates, place, pay, status). */
function version(j: Job): string {
  return createHash('sha1').update(JSON.stringify([j.title, j.status, j.applicationDeadline, j.location, j.payScale, j.postedAt, (j.description || '').length])).digest('hex').slice(0, 12);
}
const jobUrl = (id: string) => `${SITE_URL}/jobs/${encodeURIComponent(id)}`;

interface Plan { updates: { id: string; v: string; postedAt: string }[]; deletes: string[] }
async function plan(state: State): Promise<Plan> {
  const jobs = await withDb(null, db => (db[STORAGE_KEYS.JOBS] as Job[]) || []);
  const byId = new Map(jobs.map(j => [j.id, j]));
  // JobPosting pages only (open, single post, with a location) — the same rule the page uses for its structured data.
  const eligible = jobs.filter(j => isOpenJob(j) && isSingleJob(j) && (j.location?.city || j.location?.state));
  const updates = eligible
    .map(j => ({ id: j.id, v: version(j), postedAt: j.postedAt || '' }))
    .filter(x => { const s = state.sent[x.id]; return !s || s.type !== 'URL_UPDATED' || s.v !== x.v; })
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const eligibleIds = new Set(eligible.map(j => j.id));
  const deletes = Object.entries(state.sent)
    .filter(([id, s]) => s.type === 'URL_UPDATED' && !eligibleIds.has(id) && (!byId.get(id) || !isOpenJob(byId.get(id)!)))
    .map(([id]) => id);
  return { updates, deletes };
}

let running: Promise<SyncResult> | null = null;
export interface SyncResult { configured: boolean; sent: number; failed: number; pending: number; error?: string | null }

/** Scheduler entry point (also "Submit now" in the admin). Sends what is due within today's quota. */
export function syncGoogleIndexing(opts: { max?: number } = {}): Promise<SyncResult> {
  if (running) return running;
  running = (async (): Promise<SyncResult> => {
    const c = indexingCreds();
    const state = await readState();
    if (state.day.date !== today()) state.day = { date: today(), count: 0 };
    const p = await plan(state);
    const pending = p.updates.length + p.deletes.length;
    if (!c) return { configured: false, sent: 0, failed: 0, pending };
    const room = Math.min(opts.max ?? PER_RUN, dailyLimit() - state.day.count);
    // New and changed vacancies first; removals after (they also drop out of the sitemap on their own).
    const queue: { id: string; type: Kind; v: string }[] = [
      ...p.updates.map(u => ({ id: u.id, type: 'URL_UPDATED' as Kind, v: u.v })),
      ...p.deletes.map(id => ({ id, type: 'URL_DELETED' as Kind, v: '' })),
    ].slice(0, Math.max(0, room));
    let sent = 0, failed = 0;
    const done: string[] = [];
    if (queue.length) {
      let bearer: string;
      try { bearer = await accessToken(c); } catch (e) {
        state.lastError = (e as Error).message.slice(0, 300); state.lastErrorAt = new Date().toISOString(); state.lastRunAt = state.lastErrorAt;
        await writeJson(KEY, state);
        return { configured: true, sent: 0, failed: 0, pending, error: state.lastError };
      }
      for (const q of queue) {
        try {
          const r = await fetch(PUBLISH_URL(), {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
            body: JSON.stringify({ url: jobUrl(q.id), type: q.type }), signal: AbortSignal.timeout(15_000),
          });
          if (r.ok) {
            state.sent[q.id] = { v: q.v, at: new Date().toISOString(), type: q.type };
            if (q.type === 'URL_DELETED') delete state.sent[q.id];
            state.day.count++; sent++; done.push(`/jobs/${encodeURIComponent(q.id)}`);
            if (q.type === 'URL_UPDATED') state.totals.updated++; else state.totals.deleted++;
            continue;
          }
          const d = await r.json().catch(() => ({})) as { error?: { message?: string; status?: string } };
          failed++; state.totals.failed++;
          state.lastError = `${r.status} ${d.error?.status || ''}: ${d.error?.message || 'request refused'}`.slice(0, 300); state.lastErrorAt = new Date().toISOString();
          // Quota used up or no permission: stop for now (the next run retries).
          if (r.status === 429 || r.status === 403 || r.status === 401) { if (r.status === 429) state.day.count = dailyLimit(); break; }
        } catch (e) {
          failed++; state.totals.failed++; state.lastError = (e as Error).message.slice(0, 300); state.lastErrorAt = new Date().toISOString();
          break;
        }
      }
      if (sent && failed === 0) state.lastError = null;
    }
    state.lastRunAt = new Date().toISOString();
    await writeJson(KEY, state);
    if (done.length) pingIndexNow(done).catch(() => undefined);
    return { configured: true, sent, failed, pending: pending - sent, error: state.lastError };
  })().finally(() => { running = null; });
  return running;
}

/** Admin status card. */
export async function googleIndexingStatus() {
  const c = indexingCreds();
  const state = await readState();
  const p = await plan(state);
  return {
    configured: !!c, serviceAccount: c?.client_email || null, dailyLimit: dailyLimit(),
    today: state.day.date === today() ? state.day.count : 0,
    pendingUpdates: p.updates.length, pendingDeletes: p.deletes.length,
    announced: Object.values(state.sent).filter(s => s.type === 'URL_UPDATED').length,
    totals: state.totals, lastRunAt: state.lastRunAt || null, lastError: state.lastError || null, lastErrorAt: state.lastErrorAt || null,
    indexNow: !!process.env.INDEXNOW_KEY,
  };
}
