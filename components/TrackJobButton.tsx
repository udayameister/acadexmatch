'use client';

import React from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import type { Job, TrackedJob } from '@/types';
import { Bookmark, BookmarkCheck, CheckCircle2 } from 'lucide-react';

function useTracked(jobId: string): TrackedJob | undefined {
  return useStorageValue<TrackedJob | undefined>(() => StorageService.getMyTrackedJobs().find(t => t.jobId === jobId), undefined);
}

/** Bookmark icon on vacancy cards: saves the vacancy to the deadline tracker. */
export function SaveJobIcon({ job }: { job: Job }) {
  const { user } = useCurrentUser();
  const tracked = useTracked(job.id);
  if (!user || user.role !== 'candidate') return null;
  const toggle = () => (tracked ? (tracked.status === 'saved' ? StorageService.untrackJob(job.id) : undefined) : StorageService.trackJob(job.id));
  return (
    <button type="button"
      onClick={toggle}
      aria-pressed={!!tracked}
      aria-label={tracked ? `Saved to deadline tracker: ${job.title}` : `Save ${job.title} to deadline tracker`}
      title={tracked ? (tracked.status === 'saved' ? 'Saved — click to remove' : 'In your tracker') : 'Save to deadline tracker'}
      className={`p-2 rounded-xl border transition ${tracked ? 'bg-gold-50 border-gold-300 text-gold-700' : 'bg-white border-slate-200 text-slate-500 hover:text-brand-800 hover:border-brand-300'}`}
    >
      {tracked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
    </button>
  );
}

/** On the vacancy page: save for the deadline, or record an application made on the institution's website. */
export function TrackJobPanel({ job, external }: { job: Job; external: boolean }) {
  const { user } = useCurrentUser();
  const tracked = useTracked(job.id);
  if (!user || user.role !== 'candidate') return null;
  return (
    <div className="pt-3 mt-1 border-t border-slate-100 space-y-2 text-xs">
      {tracked ? (
        <p className="flex items-center gap-1.5 text-emerald-800 font-semibold"><CheckCircle2 className="w-4 h-4" /> In your tracker as “{tracked.status === 'applied' ? 'Applied' : tracked.status === 'saved' ? 'Saved' : tracked.status}”. <Link href="/candidate/tracker" className="underline">Open tracker</Link></p>
      ) : (
        <button type="button" onClick={() => StorageService.trackJob(job.id)} className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-slate-800"><Bookmark className="w-4 h-4" /> Save to deadline tracker</button>
      )}
      {external && tracked?.status !== 'applied' && (
        <button type="button" onClick={() => StorageService.trackJob(job.id, 'applied')} className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-slate-800"><CheckCircle2 className="w-4 h-4 text-emerald-700" /> I have applied on their website</button>
      )}
    </div>
  );
}
