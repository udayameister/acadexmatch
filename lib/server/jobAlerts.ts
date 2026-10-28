import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { STORAGE_KEYS, isDeadlinePassed } from '@/lib/storage';
import { matchesFilters, describeFilters } from '@/lib/jobFilter';
import { deadlineLabel, locationLabel, payLabel } from '@/lib/display';
import { withDb } from './db';
import { appUrl, EmailItem } from './mailer';
import { notify } from './notifications';
import type { Job, JobAlert, UserAccount } from '@/types';

/** Server-only bookkeeping per alert: vacancies already notified and the last day it ran. */
const STATE_KEY = '_alert_state';
const SECRET_KEY = '_app_secret';
const MAX_SEEN = 2000;
const MAX_ITEMS = 25;
/** Alerts go out after this hour, India time, so they arrive after the early-morning vacancy import. */
const SEND_HOUR_IST = 8;

type AlertState = Record<string, { seen: string[]; lastRun?: string }>;

function istNow(): { day: string; hour: number } {
  const d = new Date();
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const hour = Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  return { day, hour };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

async function appSecret(): Promise<string> {
  return withDb(null, (db, c) => {
    let s = db[SECRET_KEY] as string | undefined;
    if (!s) { s = randomBytes(32).toString('hex'); c.set(SECRET_KEY, s); }
    return s;
  });
}

export async function unsubscribeToken(alertId: string): Promise<string> {
  return createHmac('sha256', await appSecret()).update(`alert:${alertId}`).digest('hex').slice(0, 32);
}

export async function unsubscribeTokenValid(alertId: string, token: string): Promise<boolean> {
  const want = Buffer.from(await unsubscribeToken(alertId));
  const got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Pauses an alert from the link in its email (no sign-in needed). */
export async function pauseAlert(alertId: string): Promise<JobAlert | undefined> {
  return withDb(null, (db, c) => {
    const all = (db[STORAGE_KEYS.JOB_ALERTS] as JobAlert[]) || [];
    const found = all.find(a => a.id === alertId);
    if (found) c.set(STORAGE_KEYS.JOB_ALERTS, all.map(a => (a.id === alertId ? { ...a, active: false } : a)));
    return found;
  });
}

function openVacancies(db: Record<string, unknown>): Job[] {
  return ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.status === 'published' && !isDeadlinePassed(j));
}

export interface AlertRunResult { checked: number; emails: number; vacancies: number; skippedUnverified: number }

/**
 * Emails each due alert the vacancies that are new since its last run.
 * A new alert's first run only records the vacancies already open, so the first email
 * contains genuinely new vacancies. `force` ignores the time of day and the daily/weekly schedule.
 */
export async function runJobAlerts(opts: { force?: boolean } = {}): Promise<AlertRunResult> {
  const { day, hour } = istNow();
  const result: AlertRunResult = { checked: 0, emails: 0, vacancies: 0, skippedUnverified: 0 };
  if (!opts.force && hour < SEND_HOUR_IST) return result;

  const due = await withDb(null, (db, c) => {
    const state: AlertState = { ...((db[STATE_KEY] as AlertState) || {}) };
    const alerts = (db[STORAGE_KEYS.JOB_ALERTS] as JobAlert[]) || [];
    const users = (db[STORAGE_KEYS.USERS] as UserAccount[]) || [];
    const open = openVacancies(db);
    const out: { alert: JobAlert; user: UserAccount; jobs: Job[] }[] = [];

    for (const alert of alerts) {
      const st = state[alert.id];
      const matching = open.filter(j => matchesFilters(j, alert.filters));
      if (!st) { state[alert.id] = { seen: matching.map(j => j.id), lastRun: day }; continue; }
      if (!alert.active) continue;
      if (!opts.force && st.lastRun && (alert.frequency === 'weekly' ? daysBetween(st.lastRun, day) < 7 : st.lastRun === day)) continue;
      const user = users.find(u => u.id === alert.userId);
      if (!user) continue;
      result.checked++;
      const seen = new Set(st.seen);
      const fresh = matching.filter(j => !seen.has(j.id));
      st.lastRun = day;
      if (fresh.length === 0) continue;
      if (user.emailVerified === false) { result.skippedUnverified++; continue; }
      st.seen = [...fresh.map(j => j.id), ...st.seen].slice(0, MAX_SEEN);
      out.push({ alert, user, jobs: fresh });
    }
    // forget state of deleted alerts
    for (const id of Object.keys(state)) if (!alerts.some(a => a.id === id)) delete state[id];
    c.set(STATE_KEY, state);
    if (out.length) {
      const sentAt = new Date().toISOString();
      const counts = new Map(out.map(o => [o.alert.id, o.jobs.length]));
      c.set(STORAGE_KEYS.JOB_ALERTS, alerts.map(a => (counts.has(a.id) ? { ...a, lastSentAt: sentAt, lastSentCount: counts.get(a.id) } : a)));
    }
    return out;
  });

  const base = appUrl();
  for (const { alert, user, jobs } of due) {
    const shown = jobs.slice(0, MAX_ITEMS);
    const items: EmailItem[] = shown.map(j => ({
      title: j.title,
      badge: j.isPremium ? 'Premium' : undefined,
      url: `${base}/jobs/${j.id}`,
      lines: [
        `${j.instituteName} · ${locationLabel(j)}`,
        `Pay: ${payLabel(j)} · Last date: ${deadlineLabel(j)}`,
      ],
    }));
    const more = jobs.length - shown.length;
    const r = await notify({
      key: `jobalert:${alert.id}:${day}`, category: 'jobAlerts', kind: 'job_alert', user,
      subject: `${jobs.length} new faculty ${jobs.length === 1 ? 'vacancy' : 'vacancies'}: ${alert.name}`,
      heading: `${jobs.length} new ${jobs.length === 1 ? 'vacancy matches' : 'vacancies match'} “${alert.name}”`,
      paragraphs: [
        `Hello ${user.name},`,
        `These vacancies were published on AcadeXMatch since your last alert. Your search: ${describeFilters(alert.filters)}.`,
        ...(more > 0 ? [`Showing the first ${shown.length}; ${more} more are on the site.`] : []),
      ],
      items,
      button: { label: 'Manage my job alerts', url: `${base}/candidate/alerts` },
      footer: `You get this ${alert.frequency} email because you created the job alert “${alert.name}”.`,
      footerLink: { label: 'Pause this alert', url: `${base}/api/alerts/unsubscribe?a=${encodeURIComponent(alert.id)}&t=${await unsubscribeToken(alert.id)}` },
      ref: { label: alert.name },
    });
    if (!r || r.status === 'skipped') continue;
    result.emails++;
    result.vacancies += jobs.length;
  }
  return result;
}
