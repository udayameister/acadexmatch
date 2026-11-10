/* Deadline status of a vacancy for the admin console: live, closing soon, completed, or no last date. Pure. */
import type { Job } from '@/types';

export type DeadlineKind = 'live' | 'closing' | 'today' | 'completed' | 'none';

export interface DeadlineState {
  kind: DeadlineKind;
  /** Days left (≥ 0) for live/closing/today, days since for completed, null when there is no last date. */
  days: number | null;
  label: string;
}

export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86400000);

/** Closing within this many days counts as "closing soon". */
export const CLOSING_SOON_DAYS = 7;

export function deadlineState(job: Pick<Job, 'applicationDeadline'>, today = istToday()): DeadlineState {
  const d = job.applicationDeadline;
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return { kind: 'none', days: null, label: 'No last date' };
  const diff = dayNum(d) - dayNum(today);
  if (diff < 0) return { kind: 'completed', days: -diff, label: `Deadline completed ${-diff === 1 ? 'yesterday' : `${-diff} days ago`}` };
  if (diff === 0) return { kind: 'today', days: 0, label: 'Last day today' };
  if (diff <= CLOSING_SOON_DAYS) return { kind: 'closing', days: diff, label: `Live · closes in ${diff} day${diff === 1 ? '' : 's'}` };
  return { kind: 'live', days: diff, label: `Live · ${diff} days left` };
}

/** "live" filter includes closing-soon and last-day vacancies. */
export type DeadlineFilter = 'all' | 'live' | 'closing' | 'completed' | 'none';

export function matchesDeadline(job: Pick<Job, 'applicationDeadline'>, f: DeadlineFilter, today = istToday()): boolean {
  if (f === 'all') return true;
  const k = deadlineState(job, today).kind;
  if (f === 'live') return k === 'live' || k === 'closing' || k === 'today';
  if (f === 'closing') return k === 'closing' || k === 'today';
  return k === f;
}

export type JobSort = 'deadline-asc' | 'deadline-desc' | 'expired-recent' | 'posted-desc' | 'posted-asc' | 'title' | 'institute';

export const JOB_SORTS: { value: JobSort; label: string }[] = [
  { value: 'deadline-asc', label: 'Last date: soonest first' },
  { value: 'deadline-desc', label: 'Last date: latest first' },
  { value: 'expired-recent', label: 'Live first, then recently completed' },
  { value: 'posted-desc', label: 'Posted: newest first' },
  { value: 'posted-asc', label: 'Posted: oldest first' },
  { value: 'institute', label: 'Institution A–Z' },
  { value: 'title', label: 'Post name A–Z' },
];

type Sortable = Pick<Job, 'applicationDeadline' | 'postedAt' | 'title' | 'instituteName'>;

/** Sorted copy. Vacancies without a last date go last in deadline sorts. */
export function sortJobs<T extends Sortable>(list: T[], sort: JobSort, today = istToday()): T[] {
  const dl = (j: T) => j.applicationDeadline || '';
  const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  const cmp: Record<JobSort, (a: T, b: T) => number> = {
    'deadline-asc': (a, b) => (!dl(a) ? 1 : 0) - (!dl(b) ? 1 : 0) || dl(a).localeCompare(dl(b)),
    'deadline-desc': (a, b) => (!dl(a) ? 1 : 0) - (!dl(b) ? 1 : 0) || dl(b).localeCompare(dl(a)),
    // Live (soonest first), then no date, then completed (most recently completed first).
    'expired-recent': (a, b) => {
      const rank = (j: T) => { const k = deadlineState(j, today).kind; return k === 'completed' ? 2 : k === 'none' ? 1 : 0; };
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return ra === 2 ? dl(b).localeCompare(dl(a)) : dl(a).localeCompare(dl(b));
    },
    'posted-desc': (a, b) => String(b.postedAt || '').localeCompare(String(a.postedAt || '')),
    'posted-asc': (a, b) => String(a.postedAt || '').localeCompare(String(b.postedAt || '')),
    institute: (a, b) => byText(a.instituteName, b.instituteName) || byText(a.title, b.title),
    title: (a, b) => byText(a.title, b.title) || byText(a.instituteName, b.instituteName),
  };
  return [...list].sort(cmp[sort]);
}

export function deadlineCounts(list: Pick<Job, 'applicationDeadline'>[], today = istToday()) {
  const c = { all: list.length, live: 0, closing: 0, completed: 0, none: 0 };
  for (const j of list) {
    const k = deadlineState(j, today).kind;
    if (k === 'completed') c.completed++;
    else if (k === 'none') c.none++;
    else { c.live++; if (k !== 'live') c.closing++; }
  }
  return c;
}

/** Colour classes for a deadline badge. */
export const DEADLINE_BADGE: Record<DeadlineKind, string> = {
  live: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  closing: 'bg-gold-50 text-gold-900 border-gold-300',
  today: 'bg-gold-100 text-gold-900 border-gold-400',
  completed: 'bg-crimson-50 text-crimson-700 border-crimson-200',
  none: 'bg-slate-100 text-slate-600 border-slate-200',
};
