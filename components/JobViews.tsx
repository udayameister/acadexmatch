'use client';

import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useCurrentUser } from '@/lib/useAuth';

export interface JobViewSummary { total: number; today: number; last7: number; last?: string }
type Counts = Record<string, JobViewSummary>;

// One shared request for every card on the page, refreshed at most once a minute.
let cache: { at: number; data: Counts } | null = null;
let inflight: Promise<Counts> | null = null;
const listeners = new Set<(c: Counts) => void>();

function load(force = false): Promise<Counts> {
  if (!force && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = fetch('/api/job-views', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { jobs: {} }))
    .then(d => { cache = { at: Date.now(), data: d.jobs || {} }; listeners.forEach(l => l(cache!.data)); return cache.data; })
    .catch(() => ({}))
    .finally(() => { inflight = null; });
  return inflight;
}

/** View counts for all vacancies — only fetched (and only returned by the server) for the administrator. */
export function useJobViews(): { isAdmin: boolean; counts: Counts | null } {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'super_admin';
  const [counts, setCounts] = useState<Counts | null>(cache?.data || null);
  useEffect(() => {
    if (!isAdmin) return;
    listeners.add(setCounts);
    load().then(setCounts);
    return () => { listeners.delete(setCounts); };
  }, [isAdmin]);
  return { isAdmin, counts: isAdmin ? counts : null };
}

/** Small "123 views" badge, shown to the administrator only. */
export function JobViewsBadge({ jobId, className = '' }: { jobId: string; className?: string }) {
  const { isAdmin, counts } = useJobViews();
  if (!isAdmin || !counts) return null;
  const v = counts[jobId] || { total: 0, today: 0, last7: 0 };
  return (
    <span className={`text-xs font-semibold bg-sky-50 text-sky-800 px-2.5 py-1 rounded-lg border border-sky-200 inline-flex items-center gap-1 ${className}`}
      title={`Admin only · ${v.total} views in total, ${v.last7} in the last 7 days, ${v.today} today`}>
      <Eye className="w-3.5 h-3.5" aria-hidden /> {v.total.toLocaleString('en-IN')} view{v.total === 1 ? '' : 's'}
      {v.today > 0 && <span className="font-normal text-sky-700">· {v.today} today</span>}
    </span>
  );
}

/** Counts this visit to a vacancy page (once per browser session per vacancy; the server also de-duplicates). */
export function useRecordJobView(jobId: string | undefined) {
  useEffect(() => {
    if (!jobId) return;
    const key = `acx_jv_${jobId}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* storage blocked: rely on the server */ }
    fetch('/api/job-views', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }), keepalive: true })
      .then(r => r.json()).then(d => { if (d?.counted) load(true); }).catch(() => undefined);
  }, [jobId]);
}

/** Admin-only panel on the vacancy page: totals and a 30-day bar strip. */
export function JobViewsPanel({ jobId }: { jobId: string }) {
  const { isAdmin } = useJobViews();
  const [d, setD] = useState<{ views: JobViewSummary; series: { date: string; count: number }[]; since: string } | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`/api/job-views?id=${encodeURIComponent(jobId)}`, { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, [isAdmin, jobId]);
  if (!isAdmin || !d) return null;
  const max = Math.max(1, ...d.series.map(s => s.count));
  return (
    <section className="p-4 rounded-2xl bg-sky-50/60 border border-sky-200 space-y-3" aria-label="Vacancy views (admin only)">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Eye className="w-4 h-4 text-sky-700" /> Views</h3>
        <span className="text-[11px] text-sky-800 font-semibold uppercase tracking-wide">Admin only</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {([['Total', d.views.total], ['Last 7 days', d.views.last7], ['Today', d.views.today]] as const).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white border border-sky-100 py-2"><dt className="text-[11px] text-slate-500">{k}</dt><dd className="text-lg font-bold text-slate-900 tabular-nums">{v.toLocaleString('en-IN')}</dd></div>
        ))}
      </dl>
      <div>
        <div className="flex items-end gap-[2px] h-12" role="img" aria-label={`Views per day, last 30 days: ${d.series.map(s => s.count).join(', ')}`}>
          {d.series.map(s => <div key={s.date} title={`${s.date}: ${s.count}`} className="flex-1 rounded-t-sm bg-sky-600" style={{ height: `${Math.max(s.count ? 8 : 2, (s.count / max) * 100)}%`, opacity: s.count ? 1 : 0.25 }} />)}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{d.series[0]?.date.slice(5)}</span><span>Last 30 days</span><span>today</span></div>
      </div>
      <p className="text-[11px] text-slate-500">Each visitor counts once per day. Bots and your own visits are not counted. Counting started {d.since}.</p>
    </section>
  );
}
