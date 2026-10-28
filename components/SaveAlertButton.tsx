'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useCurrentUser } from '@/lib/useAuth';
import { describeFilters, nameFromFilters } from '@/lib/jobFilter';
import type { AlertFrequency, JobSearchFilters } from '@/types';
import { BellPlus, Check, X } from 'lucide-react';

/** "Email me new matches" on the vacancy search page: saves the current filters as a job alert. */
export default function SaveAlertButton({ filters }: { filters: JobSearchFilters }) {
  const { user, ready } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('daily');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!ready) return null;
  if (!user) {
    return <Link href="/register" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-900 font-semibold hover:bg-brand-100"><BellPlus className="w-3.5 h-3.5" /> Get new vacancies by email</Link>;
  }
  if (user.role !== 'candidate') return null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.saveJobAlert({ name: name || nameFromFilters(filters), filters, frequency });
    setMsg(r.success ? { ok: true, text: 'Alert saved.' } : { ok: false, text: r.error || 'Could not save the alert.' });
    if (r.success) { setOpen(false); setName(''); }
  };

  return (
    <div className="relative">
      {msg?.ok ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-800 font-semibold" role="status"><Check className="w-3.5 h-3.5" /> {msg.text} <Link href="/candidate/alerts" className="underline">Manage alerts</Link></span>
      ) : (
        <button onClick={() => { setOpen(o => !o); setMsg(null); }} aria-expanded={open} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white font-semibold">
          <BellPlus className="w-3.5 h-3.5" /> Email me new matches
        </button>
      )}
      {open && (
        <form onSubmit={save} className="absolute right-0 top-full mt-2 z-30 w-[min(20rem,calc(100vw-2rem))] p-4 rounded-2xl bg-white border border-slate-200 shadow-xl space-y-3 text-left">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-900">New job alert</div>
              <div className="text-xs text-slate-500 mt-0.5">{describeFilters(filters)}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Alert name</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={nameFromFilters(filters).slice(0, 60)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          </label>
          <fieldset className="flex gap-2 text-xs">
            {(['daily', 'weekly'] as const).map(f => (
              <label key={f} className={`flex-1 text-center px-3 py-2 rounded-lg border cursor-pointer font-semibold capitalize ${frequency === f ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" name="freq" value={f} checked={frequency === f} onChange={() => setFrequency(f)} className="sr-only" />{f}
              </label>
            ))}
          </fieldset>
          {msg && !msg.ok && <p className="text-xs text-crimson-700" role="alert">{msg.text}</p>}
          <button type="submit" className="w-full px-3 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">Save alert</button>
        </form>
      )}
    </div>
  );
}
