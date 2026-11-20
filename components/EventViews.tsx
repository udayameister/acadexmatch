'use client';

import React, { useEffect, useState } from 'react';
import { Eye, FileText, MousePointerClick } from 'lucide-react';
import { useCurrentUser } from '@/lib/useAuth';

/*
 * Event views (FDPs, workshops, seminars, conferences) — counted for everyone, shown to the administrator only.
 * The server only answers the counts to the administrator; these components also render nothing for anyone else.
 */

export interface EventViewSummary { total: number; today: number; last7: number; register: number; brochure: number; last?: string }
type Counts = Record<string, EventViewSummary>;
export const EMPTY_EVENT_VIEWS: EventViewSummary = { total: 0, today: 0, last7: 0, register: 0, brochure: 0 };

// One shared request for every card on the page, refreshed at most once a minute.
let cache: { at: number; data: Counts; since: string } | null = null;
let inflight: Promise<Counts> | null = null;
const listeners = new Set<(c: Counts) => void>();

function load(force = false): Promise<Counts> {
  if (!force && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = fetch('/api/event-views', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { events: {} }))
    .then(d => { cache = { at: Date.now(), data: d.events || {}, since: d.since || '' }; listeners.forEach(l => l(cache!.data)); return cache.data; })
    .catch(() => ({}))
    .finally(() => { inflight = null; });
  return inflight;
}

/** View counts for all events — only fetched (and only returned by the server) for the administrator. */
export function useEventViews(): { isAdmin: boolean; counts: Counts | null; since: string; refresh: () => void } {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'super_admin';
  const [counts, setCounts] = useState<Counts | null>(cache?.data || null);
  useEffect(() => {
    if (!isAdmin) return;
    listeners.add(setCounts);
    load().then(setCounts);
    return () => { listeners.delete(setCounts); };
  }, [isAdmin]);
  return { isAdmin, counts: isAdmin ? counts : null, since: cache?.since || '', refresh: () => { load(true); } };
}

/** Small "123 views" badge on event cards, shown to the administrator only. */
export function EventViewsBadge({ eventId, dark = false, className = '' }: { eventId: string; dark?: boolean; className?: string }) {
  const { isAdmin, counts } = useEventViews();
  if (!isAdmin || !counts) return null;
  const v = counts[eventId] || EMPTY_EVENT_VIEWS;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${dark ? 'bg-white/10 text-white border-white/20' : 'bg-sky-50 text-sky-800 border-sky-200'} ${className}`}
      title={`Admin only · ${v.total} views in total, ${v.last7} in the last 7 days, ${v.today} today · ${v.register} register clicks`}>
      <Eye className="w-3 h-3" aria-hidden /> {v.total.toLocaleString('en-IN')}
      {v.today > 0 && <span className="font-normal opacity-80">· {v.today} today</span>}
    </span>
  );
}

function post(eventId: string, action: 'view' | 'register' | 'brochure') {
  return fetch('/api/event-views', {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, action }),
  }).then(r => r.json()).catch(() => null);
}

/** Counts this visit to an event page (once per browser session per event; the server also de-duplicates). */
export function useRecordEventView(eventId: string | undefined) {
  useEffect(() => {
    if (!eventId) return;
    const key = `acx_ev_${eventId}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* storage blocked: rely on the server */ }
    post(eventId, 'view').then(d => { if (d?.counted) load(true); });
  }, [eventId]);
}

/** Counts a click on the event's Register or Brochure link (does not delay the link). */
export function trackEventLink(eventId: string, action: 'register' | 'brochure') {
  post(eventId, action);
}

/** Admin-only panel on the event page: totals, link clicks and a 30-day bar strip. */
export function EventViewsPanel({ eventId }: { eventId: string }) {
  const { isAdmin } = useEventViews();
  const [d, setD] = useState<{ views: EventViewSummary; series: { date: string; count: number }[]; since: string } | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`/api/event-views?id=${encodeURIComponent(eventId)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, [isAdmin, eventId]);
  if (!isAdmin || !d) return null;
  const max = Math.max(1, ...d.series.map(s => s.count));
  const v = d.views;
  const stats: [string, number, React.ReactNode][] = [
    ['Total views', v.total, <Eye key="i" className="w-4 h-4" />],
    ['Last 7 days', v.last7, <Eye key="i" className="w-4 h-4" />],
    ['Today', v.today, <Eye key="i" className="w-4 h-4" />],
    ['Register clicks', v.register, <MousePointerClick key="i" className="w-4 h-4" />],
    ['Brochure clicks', v.brochure, <FileText key="i" className="w-4 h-4" />],
  ];
  return (
    <section className="p-4 sm:p-5 rounded-2xl bg-sky-50/60 border border-sky-200 space-y-3" aria-label="Event views (admin only)">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Eye className="w-4 h-4 text-sky-700" /> Visits to this event</h2>
        <span className="text-[11px] text-sky-800 font-semibold uppercase tracking-wide">Admin only</span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {stats.map(([label, n, icon]) => (
          <div key={label} className="p-2.5 rounded-xl bg-white border border-sky-100">
            <dd className="text-xl font-bold text-slate-900 tabular-nums">{n.toLocaleString('en-IN')}</dd>
            <dt className="text-[11px] text-slate-500 flex items-center gap-1"><span className="text-sky-700">{icon}</span>{label}</dt>
          </div>
        ))}
      </dl>
      <div>
        <div className="flex items-end gap-[3px] h-16" aria-label="Views per day, last 30 days">
          {d.series.map(s => (
            <div key={s.date} className="flex-1 rounded-t bg-sky-500/80 hover:bg-sky-700 min-h-[2px]" style={{ height: `${(s.count / max) * 100}%` }} title={`${s.date}: ${s.count} view${s.count === 1 ? '' : 's'}`} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>30 days ago</span><span>Today</span></div>
      </div>
      <p className="text-[11px] text-slate-500">A view is one visitor opening this page, counted once per day. Search-engine bots and your own visits are not counted. Counting since {d.since}.</p>
    </section>
  );
}
