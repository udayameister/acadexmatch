'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { TRACKED_STATUS, countdown, daysLeft, downloadIcs, statusInfo } from '@/lib/tracker';
import type { Job, TrackedJob, TrackedStatus } from '@/types';
import { CalendarClock, CalendarPlus, ExternalLink, Plus, Trash2, Pencil, X, Mail } from 'lucide-react';

const input = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const ghost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50';

type View = 'upcoming' | 'applied' | 'all';

function AddExternal({ onDone }: { onDone: (m: string) => void }) {
  const [f, setF] = useState({ title: '', institute: '', deadline: '', url: '', status: 'saved' as TrackedStatus, appliedOn: '', reference: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.addExternalTrackedJob(f);
    if (!r.success) { setErr(r.error || 'Could not add.'); return; }
    setF({ title: '', institute: '', deadline: '', url: '', status: 'saved', appliedOn: '', reference: '', notes: '' });
    setErr(null);
    onDone('Added to your tracker.');
  };
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Position *</span><input required className={input} value={f.title} maxLength={160} placeholder="Assistant Professor — Physics" onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Institution *</span><input required className={input} value={f.institute} maxLength={160} placeholder="University of Hyderabad" onChange={e => setF({ ...f, institute: e.target.value })} /></label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Last date</span><input type="date" className={input} value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Status</span>
        <select className={input} value={f.status} onChange={e => setF({ ...f, status: e.target.value as TrackedStatus })}>{TRACKED_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Link to notice or portal</span><input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} className={input} value={f.url} placeholder="https://" onChange={e => setF({ ...f, url: e.target.value })} /></label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Application / reference no.</span><input className={input} value={f.reference} maxLength={80} onChange={e => setF({ ...f, reference: e.target.value })} /></label>
      {f.status !== 'saved' && <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Applied on</span><input type="date" className={input} value={f.appliedOn} onChange={e => setF({ ...f, appliedOn: e.target.value })} /></label>}
      <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Notes</span><textarea rows={2} className={input} value={f.notes} maxLength={1000} placeholder="Fee paid, documents sent by post, contact person…" onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      {err && <p className="sm:col-span-2 text-sm text-crimson-700" role="alert">{err}</p>}
      <div className="sm:col-span-2"><button type="submit" className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Add to tracker</button></div>
    </form>
  );
}

function Row({ t, job }: { t: TrackedJob; job?: Job }) {
  const [edit, setEdit] = useState(false);
  const [d, setD] = useState({ appliedOn: t.appliedOn || '', reference: t.reference || '', notes: t.notes || '', deadline: t.deadline });
  const deadline = job?.applicationDeadline || t.deadline;
  const cd = countdown(deadline);
  const st = statusInfo(t.status);
  const link = t.jobId ? `/jobs/${t.jobId}` : t.url;
  return (
    <li className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cd.cls}`}>{cd.text}</span>
            {!t.jobId && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-white text-slate-500 border-slate-200">Outside AcadeXMatch</span>}
            {job?.status === 'closed' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Vacancy closed</span>}
          </div>
          <div className="font-semibold text-slate-900 mt-1.5">{link ? (t.jobId ? <Link href={link} className="hover:underline">{t.title}</Link> : <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">{t.title} <ExternalLink className="w-3.5 h-3.5" /></a>) : t.title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{t.institute}{deadline ? ` · Last date ${deadline}` : ''}{t.reference ? ` · Ref ${t.reference}` : ''}{t.appliedOn ? ` · Applied ${t.appliedOn}` : ''}</div>
          {t.notes && !edit && <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-line">{t.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <select aria-label={`Status of ${t.title}`} value={t.status} onChange={e => StorageService.updateTrackedJob(t.id, { status: e.target.value as TrackedStatus })} className={`text-xs font-semibold rounded-lg border px-2 py-2 ${st.cls}`}>
            {TRACKED_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {deadline && <button className={ghost} onClick={() => downloadIcs([{ ...t, deadline }], `deadline-${t.id}.ics`)} title="Add to calendar"><CalendarPlus className="w-3.5 h-3.5" /><span className="sr-only sm:not-sr-only">Calendar</span></button>}
          <button className={ghost} onClick={() => setEdit(v => !v)} aria-label="Edit details">{edit ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}</button>
          <button className={`${ghost} text-crimson-700`} onClick={() => { if (confirm(`Remove “${t.title}” from your tracker?`)) StorageService.removeTrackedJob(t.id); }} aria-label={`Remove ${t.title}`}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {edit && (
        <form className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100" onSubmit={e => { e.preventDefault(); StorageService.updateTrackedJob(t.id, t.jobId ? { appliedOn: d.appliedOn, reference: d.reference, notes: d.notes } : d); setEdit(false); }}>
          {!t.jobId && <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Last date</span><input type="date" className={input} value={d.deadline} onChange={e => setD({ ...d, deadline: e.target.value })} /></label>}
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Applied on</span><input type="date" className={input} value={d.appliedOn} onChange={e => setD({ ...d, appliedOn: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Application / reference no.</span><input className={input} maxLength={80} value={d.reference} onChange={e => setD({ ...d, reference: e.target.value })} /></label>
          <label className="block space-y-1 sm:col-span-3"><span className="text-xs font-semibold text-slate-700">Notes</span><textarea rows={2} maxLength={1000} className={input} value={d.notes} onChange={e => setD({ ...d, notes: e.target.value })} /></label>
          <div className="sm:col-span-3"><button type="submit" className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold">Save</button></div>
        </form>
      )}
    </li>
  );
}

export default function TrackerPage() {
  const { user } = useCurrentUser();
  const items = useStorageValue<TrackedJob[]>(() => StorageService.getMyTrackedJobs(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const [view, setView] = useState<View>('upcoming');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const withDeadline = (t: TrackedJob) => ({ ...t, deadline: (t.jobId && jobById.get(t.jobId)?.applicationDeadline) || t.deadline });

  const sorted = useMemo(() => [...items].map(withDeadline).sort((a, b) => {
    const da = daysLeft(a.deadline), db = daysLeft(b.deadline);
    const ka = da === null ? 9999 : da < 0 ? 10000 - da : da;
    const kb = db === null ? 9999 : db < 0 ? 10000 - db : db;
    return ka - kb;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, jobById]);

  const upcoming = sorted.filter(t => t.status === 'saved' && (daysLeft(t.deadline) ?? 0) >= 0);
  const applied = sorted.filter(t => t.status !== 'saved');
  const shown = view === 'upcoming' ? upcoming : view === 'applied' ? applied : sorted;
  const thisWeek = upcoming.filter(t => { const d = daysLeft(t.deadline); return d !== null && d <= 7; }).length;
  if (!user) return null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-800 flex items-center gap-2"><CalendarClock className="w-7 h-7 text-gold-500" /> Deadlines &amp; tracker</h1>
          <p className="text-sm text-slate-600 mt-1">Vacancies you saved, sorted by last date, and applications you made on institutions’ own websites.</p>
        </div>
        <div className="flex gap-2">
          {sorted.some(t => (daysLeft(t.deadline) ?? -1) >= 0) && <button className={`${ghost} whitespace-nowrap`} onClick={() => downloadIcs(sorted.filter(t => (daysLeft(t.deadline) ?? -1) >= 0))}><CalendarPlus className="w-4 h-4" /> Add all to calendar</button>}
          <button onClick={() => setAdding(a => !a)} className="whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold"><Plus className="w-4 h-4" /> Add from elsewhere</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Closing within 7 days', thisWeek], ['Saved, still open', upcoming.length], ['Applied & beyond', applied.length]].map(([l, v]) => (
          <div key={l as string} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-bold text-slate-900 mt-0.5">{v}</div></div>
        ))}
      </div>

      {user.emailVerified !== false
        ? <p className="text-xs text-slate-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> We email you 3 days and 1 day before the last date of each saved vacancy you have not applied to yet.</p>
        : <p className="text-xs text-gold-900 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> <Link href="/account" className="underline">Confirm your email</Link> to get deadline reminders.</p>}
      {flash && <p className="text-sm text-emerald-800" role="status">{flash}</p>}

      {adding && (
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900">Track a vacancy from outside AcadeXMatch</h2>
          <AddExternal onDone={m => { setFlash(m); setAdding(false); setView('all'); }} />
        </section>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit text-xs font-semibold" role="tablist">
        {([['upcoming', `Upcoming (${upcoming.length})`], ['applied', `Applied (${applied.length})`], ['all', `All (${sorted.length})`]] as [View, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3.5 py-2 rounded-lg ${view === k ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600'}`}>{l}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500 py-6">{view === 'upcoming' ? <>Nothing saved yet. Use the bookmark on any vacancy in <Link href="/jobs" className="underline">Find Jobs</Link>, or add one from elsewhere.</> : view === 'applied' ? 'No applications recorded yet. Mark a vacancy as applied after you submit on the institution’s website.' : 'Your tracker is empty.'}</p>
      ) : (
        <ul className="space-y-3">{shown.map(t => <Row key={t.id} t={t} job={t.jobId ? jobById.get(t.jobId) : undefined} />)}</ul>
      )}
    </div>
  );
}
