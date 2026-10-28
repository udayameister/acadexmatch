'use client';

import React from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { countdown, daysLeft } from '@/lib/tracker';
import type { Job, TrackedJob } from '@/types';
import { CalendarClock, ChevronRight } from 'lucide-react';

/** Dashboard strip: the next saved vacancies to close. */
export default function UpcomingDeadlines() {
  const items = useStorageValue<TrackedJob[]>(() => StorageService.getMyTrackedJobs(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const byId = new Map(jobs.map(j => [j.id, j]));
  const next = items
    .filter(t => t.status === 'saved')
    .map(t => ({ ...t, deadline: (t.jobId && byId.get(t.jobId)?.applicationDeadline) || t.deadline }))
    .filter(t => (daysLeft(t.deadline) ?? -1) >= 0)
    .sort((a, b) => (daysLeft(a.deadline)! - daysLeft(b.deadline)!))
    .slice(0, 3);
  return (
    <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm"><CalendarClock className="w-4 h-4 text-gold-600" /> Upcoming deadlines</h2>
        <Link href="/candidate/tracker" className="text-xs font-bold text-brand-700 hover:underline inline-flex items-center gap-0.5">Open tracker <ChevronRight className="w-3.5 h-3.5" /></Link>
      </div>
      {next.length === 0 ? (
        <p className="text-xs text-slate-500 mt-2">Save vacancies with the bookmark icon to see their last dates here and get reminders.</p>
      ) : (
        <ul className="mt-3 grid sm:grid-cols-3 gap-3">
          {next.map(t => {
            const cd = countdown(t.deadline);
            return (
              <li key={t.id} className="p-3 rounded-xl bg-ivory border border-slate-200">
                <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${cd.cls}`}>{cd.text}</span>
                <div className="text-sm font-semibold text-slate-900 mt-1.5 line-clamp-2">{t.jobId ? <Link href={`/jobs/${t.jobId}`} className="hover:underline">{t.title}</Link> : t.title}</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">{t.institute}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
