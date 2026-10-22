'use client';

import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

export interface VisitStats {
  total: number;
  today: number;
  since: string;
  last7: { date: string; count: number }[];
}

const LAST_SEEN_KEY = 'acad_visit_last_seen';
const VISIT_GAP_MS = 30 * 60 * 1000; // a new visit after 30 minutes without activity

/** Counts one visit per browser per 30 minutes of activity and returns the site-wide totals. */
export function useVisitStats(count = false): VisitStats | null {
  const [stats, setStats] = useState<VisitStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    let isNewVisit = false;
    if (count) {
      try {
        const now = Date.now();
        const last = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
        isNewVisit = !last || now - last > VISIT_GAP_MS;
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        isNewVisit = false;
      }
    }
    fetch('/api/visits', { method: isNewVisit ? 'POST' : 'GET', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setStats(d); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [count]);
  return stats;
}

export default function VisitCounter() {
  const stats = useVisitStats(true);
  if (!stats) return null;
  const fmt = (n: number) => n.toLocaleString('en-IN');
  return (
    <span className="inline-flex items-center gap-2" aria-live="polite">
      <Eye className="w-3.5 h-3.5 text-gold-300" aria-hidden="true" />
      <span>
        <span className="font-semibold text-white">{fmt(stats.total)}</span> {stats.total === 1 ? 'visit' : 'visits'}
        <span className="mx-1.5 text-brand-100/40">·</span>
        <span className="font-semibold text-white">{fmt(stats.today)}</span> today
      </span>
    </span>
  );
}
