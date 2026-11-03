import { STORAGE_KEYS, isDeadlinePassed } from '@/lib/storage';
import { deadlineLabel, locationLabel, payLabel } from '@/lib/display';
import { EVENT_KIND_SHORT, formatEventDates, isEventLive } from '@/lib/events';
import { withDb } from './db';
import { appUrl, type EmailItem } from './mailer';
import { notify } from './notifications';
import type { AcademicEvent, Job, UserAccount } from '@/types';

/*
 * "New on AcadeXMatch" email to every candidate when the administrator approves new posts: vacancies (from the
 * FacultyTick and college-website scrapers, or added by the administrator) and FDP / workshop / seminar /
 * conference listings.
 *
 * Approvals made close together are sent as ONE email: the email goes out once no new approval has arrived for
 * QUIET_MINUTES, and not more often than every minGapHours (later approvals wait for the next email). Each
 * candidate's notification setting "New vacancies and events", unconfirmed addresses and bounced addresses are
 * respected by the email queue, and every email has a one-click unsubscribe link.
 */

const KEY = '_new_post_digest';
const MAX_JOBS_SHOWN = 15;
const MAX_EVENTS_SHOWN = 6;
const MAX_HISTORY = 30;
const MAX_PENDING = 2000;

export interface DigestSettings {
  enabled: boolean;
  /** Wait this long after the last approval, so one sitting of approvals becomes one email. */
  quietMinutes: number;
  /** At most one email in this many hours. */
  minGapHours: number;
}

export interface DigestRun { id: string; at: string; jobs: number; events: number; queued: number; skipped: number; trigger: 'auto' | 'manual' }

interface DigestState {
  settings: DigestSettings;
  pending: { type: 'job' | 'event'; id: string; at: number }[];
  lastSentAt?: number;
  history: DigestRun[];
}

export const DEFAULT_DIGEST_SETTINGS: DigestSettings = { enabled: true, quietMinutes: 20, minGapHours: 3 };

const stateOf = (db: Record<string, unknown>): DigestState => {
  const s = (db[KEY] as Partial<DigestState>) || {};
  return { settings: { ...DEFAULT_DIGEST_SETTINGS, ...(s.settings || {}) }, pending: s.pending || [], lastSentAt: s.lastSentAt, history: s.history || [] };
};

/** Records newly approved posts for the next email. Call after the approval has been saved. */
export async function recordApproved(items: { type: 'job' | 'event'; id: string }[]): Promise<void> {
  const fresh = items.filter(i => i.id);
  if (!fresh.length) return;
  await withDb(null, (db, c) => {
    const s = stateOf(db);
    const have = new Set(s.pending.map(p => `${p.type}:${p.id}`));
    const now = Date.now();
    for (const i of fresh) if (!have.has(`${i.type}:${i.id}`)) s.pending.push({ ...i, at: now });
    s.pending = s.pending.slice(-MAX_PENDING);
    c.set(KEY, s);
  });
}

export async function digestStatus(): Promise<DigestState & { candidates: number; nextAfter: number | null }> {
  return withDb(null, db => {
    const s = stateOf(db);
    const candidates = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => u.role === 'candidate').length;
    return { ...s, candidates, nextAfter: nextSendTime(s) };
  });
}

export async function saveDigestSettings(patch: Partial<DigestSettings>): Promise<void> {
  await withDb(null, (db, c) => {
    const s = stateOf(db);
    if (typeof patch.enabled === 'boolean') s.settings.enabled = patch.enabled;
    if (Number.isFinite(patch.quietMinutes)) s.settings.quietMinutes = Math.min(240, Math.max(5, Math.round(patch.quietMinutes!)));
    if (Number.isFinite(patch.minGapHours)) s.settings.minGapHours = Math.min(168, Math.max(1, Math.round(patch.minGapHours!)));
    c.set(KEY, s);
  });
}

/** Clears the waiting posts without emailing (e.g. after a bulk import that should not be announced). */
export async function discardPending(): Promise<number> {
  return withDb(null, (db, c) => { const s = stateOf(db); const n = s.pending.length; s.pending = []; c.set(KEY, s); return n; });
}

function nextSendTime(s: DigestState): number | null {
  if (!s.pending.length) return null;
  const quietUntil = Math.max(...s.pending.map(p => p.at)) + s.settings.quietMinutes * 60_000;
  const gapUntil = s.lastSentAt ? s.lastSentAt + s.settings.minGapHours * 3600_000 : 0;
  return Math.max(quietUntil, gapUntil);
}

let sending: Promise<DigestRun | null> | null = null;

/**
 * Sends the email when it is due (called by the 10-minute scheduler), or at once with `force` (the
 * administrator's "Send now"). Returns what was sent, or null when nothing was due.
 */
export function maybeSendDigest(opts: { force?: boolean } = {}): Promise<DigestRun | null> {
  if (sending) return sending;
  sending = (async () => {
    const base = appUrl();
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const batch = await withDb(null, (db, c) => {
      const s = stateOf(db);
      if (!s.pending.length) return null;
      if (!opts.force && (!s.settings.enabled || (nextSendTime(s) ?? Infinity) > Date.now())) return null;
      const jobIds = new Set(s.pending.filter(p => p.type === 'job').map(p => p.id));
      const eventIds = new Set(s.pending.filter(p => p.type === 'event').map(p => p.id));
      // Only what is still open: closed, expired or removed posts are not announced.
      const jobs = ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => jobIds.has(j.id) && j.status === 'published' && !isDeadlinePassed(j));
      const events = ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).filter(e => eventIds.has(e.id) && isEventLive(e, day));
      const candidates = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => u.role === 'candidate');
      s.pending = [];
      if (jobs.length || events.length) s.lastSentAt = Date.now();
      c.set(KEY, s);
      return { jobs, events, candidates, id: `np-${Date.now().toString(36)}` };
    });
    if (!batch || (!batch.jobs.length && !batch.events.length)) return null;

    const { jobs, events, candidates, id } = batch;
    const jobItems: EmailItem[] = jobs.slice(0, MAX_JOBS_SHOWN).map(j => ({
      title: j.title,
      badge: j.isPremium ? 'Premium' : undefined,
      url: `${base}/jobs/${encodeURIComponent(j.id)}`,
      lines: [`${j.instituteName} · ${locationLabel(j)}`, `Pay: ${payLabel(j)} · Last date: ${deadlineLabel(j)}`],
    }));
    const eventItems: EmailItem[] = events.slice(0, MAX_EVENTS_SHOWN).map(e => ({
      title: e.title,
      badge: EVENT_KIND_SHORT[e.kind],
      url: `${base}/events/${encodeURIComponent(e.id)}`,
      lines: [`${e.organizer} · ${e.mode === 'online' ? 'Online' : [e.city, e.state].filter(Boolean).join(', ')}`, formatEventDates(e)],
    }));
    const parts = [
      jobs.length ? `${jobs.length} new ${jobs.length === 1 ? 'vacancy' : 'vacancies'}` : '',
      events.length ? `${events.length} ${events.length === 1 ? 'event' : 'events'}` : '',
    ].filter(Boolean).join(' and ');
    const moreJobs = jobs.length - Math.min(jobs.length, MAX_JOBS_SHOWN);
    const moreEvents = events.length - Math.min(events.length, MAX_EVENTS_SHOWN);

    let queued = 0, skipped = 0;
    for (const user of candidates) {
      const r = await notify({
        key: `newposts:${id}:${user.id}`, category: 'newVacancies', kind: 'new_posts', user,
        subject: `${parts.charAt(0).toUpperCase()}${parts.slice(1)} on AcadeXMatch`,
        heading: `${parts.charAt(0).toUpperCase()}${parts.slice(1)}`,
        paragraphs: [
          `Hello ${user.name},`,
          jobs.length && events.length ? 'These faculty vacancies, FDPs, workshops and conferences were just published on AcadeXMatch.'
            : jobs.length ? 'These faculty vacancies were just published on AcadeXMatch.' : 'These FDPs, workshops and conferences were just published on AcadeXMatch.',
          ...(moreJobs > 0 || moreEvents > 0 ? [`Showing the newest; ${[moreJobs > 0 ? `${moreJobs} more ${moreJobs === 1 ? 'vacancy' : 'vacancies'}` : '', moreEvents > 0 ? `${moreEvents} more ${moreEvents === 1 ? 'event' : 'events'}` : ''].filter(Boolean).join(' and ')} on the site.`] : []),
        ],
        items: [...jobItems, ...eventItems],
        button: jobs.length ? { label: 'See all vacancies', url: `${base}/jobs` } : { label: 'See all events', url: `${base}/events` },
        footer: 'You get this email because you have a candidate account on AcadeXMatch. Turn it off any time in your notification settings.',
        ref: { label: parts },
      }).catch(() => null);
      if (r && r.status === 'queued') queued++; else skipped++;
    }

    const run: DigestRun = { id, at: new Date().toISOString(), jobs: jobs.length, events: events.length, queued, skipped, trigger: opts.force ? 'manual' : 'auto' };
    await withDb(null, (db, c) => { const s = stateOf(db); s.history = [run, ...s.history].slice(0, MAX_HISTORY); c.set(KEY, s); });
    console.log(`[AcadeXMatch] New-post email: ${parts}; ${queued} candidates queued, ${skipped} skipped (settings off, unconfirmed or bounced)`);
    return run;
  })().finally(() => { sending = null; });
  return sending;
}
