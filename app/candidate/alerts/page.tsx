'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService, isDeadlinePassed } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { DEFAULT_FILTERS, describeFilters, matchesFilters, nameFromFilters } from '@/lib/jobFilter';
import { INDIAN_STATES, DESIGNATIONS, INSTITUTE_TYPES } from '@/components/FacetedFilter';
import type { AlertFrequency, Job, JobAlert, JobSearchFilters } from '@/types';
import { Bell, BellOff, BellPlus, Pencil, Trash2, Mail, Search } from 'lucide-react';

const input = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

type Draft = { id?: string; name: string; filters: JobSearchFilters; frequency: AlertFrequency };
const blank: Draft = { name: '', filters: { ...DEFAULT_FILTERS }, frequency: 'daily' };

function AlertForm({ draft, onCancel, onSaved }: { draft: Draft; onCancel?: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [err, setErr] = useState<string | null>(null);
  const f = d.filters;
  const setF = (patch: Partial<JobSearchFilters>) => setD({ ...d, filters: { ...f, ...patch } });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.saveJobAlert({ ...d, name: d.name || nameFromFilters(f) });
    if (!r.success) { setErr(r.error || 'Could not save.'); return; }
    onSaved(d.id ? 'Alert updated.' : 'Alert created. New matching vacancies will be emailed to you.');
    if (!d.id) setD(blank);
  };
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
      <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Keywords (subject, department, institute or specialisation)</span>
        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" /><input className={`${input} pl-9`} value={f.search} maxLength={100} placeholder="e.g. Computer Science, VLSI, IIT" onChange={e => setF({ search: e.target.value })} /></div>
      </label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Designation</span>
        <select className={input} value={f.designation} onChange={e => setF({ designation: e.target.value })}>{DESIGNATIONS.map(x => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">State</span>
        <select className={input} value={f.state} onChange={e => setF({ state: e.target.value })}>{INDIAN_STATES.map(x => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Institution type</span>
        <select className={input} value={f.instituteType} onChange={e => setF({ instituteType: e.target.value })}>{INSTITUTE_TYPES.map(x => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">How often</span>
        <select className={input} value={d.frequency} onChange={e => setD({ ...d, frequency: e.target.value as AlertFrequency })}><option value="daily">Daily (about 8 AM)</option><option value="weekly">Weekly</option></select>
      </label>
      <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.netSletOnly} onChange={e => setF({ netSletOnly: e.target.checked })} /> Only where NET/SLET is required</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.phdOnly} onChange={e => setF({ phdOnly: e.target.checked })} /> Only where Ph.D. is required</label>
      </div>
      <label className="block space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Alert name (optional)</span>
        <input className={input} value={d.name} maxLength={80} placeholder={nameFromFilters(f)} onChange={e => setD({ ...d, name: e.target.value })} />
      </label>
      {err && <p className="sm:col-span-2 text-sm text-crimson-700" role="alert">{err}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">{d.id ? 'Save changes' : 'Create alert'}</button>
        {onCancel && <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>}
      </div>
    </form>
  );
}

export default function AlertsPage() {
  const { user } = useCurrentUser();
  const alerts = useStorageValue<JobAlert[]>(() => StorageService.getMyJobAlerts(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getPublishedJobs().filter(j => !isDeadlinePassed(j)), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(alerts.map(a => [a.id, jobs.filter(j => matchesFilters(j, a.filters)).length])), [alerts, jobs]);
  if (!user) return null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-800 flex items-center gap-2"><Bell className="w-7 h-7 text-gold-500" /> Job alerts</h1>
        <p className="text-sm text-slate-600 mt-1">Save a search and we email you new vacancies that match it. You can keep up to 10 alerts.</p>
      </div>

      {user.emailVerified === false && (
        <div className="p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900 flex gap-2"><Mail className="w-4 h-4 mt-0.5 shrink-0" /><span>Alerts are only emailed to confirmed addresses. <Link href="/account" className="font-semibold underline">Confirm {user.email}</Link> to start receiving them.</span></div>
      )}
      {flash && <p className="text-sm text-emerald-800" role="status">{flash}</p>}

      <section className="space-y-3">
        {alerts.length === 0 && <p className="text-sm text-slate-500">You have no job alerts yet. Create one below, or use “Email me new matches” on the <Link href="/jobs" className="underline">vacancy search</Link>.</p>}
        {alerts.map(a => (
          <div key={a.id} className={`p-5 rounded-2xl bg-white border shadow-sm ${a.active ? 'border-slate-200' : 'border-slate-200 opacity-75'}`}>
            {editing === a.id ? (
              <AlertForm draft={{ id: a.id, name: a.name, filters: a.filters, frequency: a.frequency }} onCancel={() => setEditing(null)} onSaved={m => { setEditing(null); setFlash(m); }} />
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">{a.name}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${a.active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{a.active ? `On · ${a.frequency}` : 'Paused'}</span>
                  </div>
                  {describeFilters(a.filters) !== a.name && nameFromFilters(a.filters) !== a.name && <div className="text-xs text-slate-500 mt-1">{describeFilters(a.filters)}</div>}
                  <div className="text-xs text-slate-500 mt-1">{counts[a.id] ?? 0} open {counts[a.id] === 1 ? 'vacancy matches' : 'vacancies match'} now{a.lastSentAt ? ` · last email ${new Date(a.lastSentAt).toLocaleDateString('en-IN')} (${a.lastSentCount} new)` : ''}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => StorageService.setJobAlertActive(a.id, !a.active)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">{a.active ? <><BellOff className="w-3.5 h-3.5" /> Pause</> : <><Bell className="w-3.5 h-3.5" /> Resume</>}</button>
                  <button onClick={() => setEditing(a.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                  <button onClick={() => { if (confirm(`Delete the alert “${a.name}”?`)) StorageService.deleteJobAlert(a.id); }} aria-label={`Delete ${a.name}`} className="inline-flex items-center px-3 py-2 rounded-lg bg-white border border-slate-200 text-crimson-700 hover:bg-crimson-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {alerts.length < 10 && (
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><BellPlus className="w-4 h-4 text-brand-700" /> New alert</h2>
          <AlertForm draft={blank} onSaved={setFlash} />
        </section>
      )}
    </div>
  );
}
