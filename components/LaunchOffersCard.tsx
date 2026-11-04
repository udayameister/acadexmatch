'use client';

import React, { useState } from 'react';
import { Gift, Save } from 'lucide-react';
import { StorageService, institutionFreeActive, eventsFreeActive, isInstituteSubscribed } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import type { Institute, PlanSettings } from '@/types';

const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const plusMonths = (months: number) => {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
};

/** Administrator: free launch offers for institutions and for event listings (set, extend or end). */
export default function LaunchOffersCard() {
  const saved = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const [inst, setInst] = useState<string | null>(null);
  const [ev, setEv] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const instUntil = inst ?? saved.institutionFreeUntil ?? '';
  const evUntil = ev ?? saved.eventsFreeUntil ?? '';
  const dirty = inst !== null || ev !== null;

  const verifiedFree = institutes.filter(i => i.verificationStatus === 'verified' && !isInstituteSubscribed(i)).length;
  const waiting = institutes.filter(i => i.verificationStatus === 'pending').length;

  const save = () => {
    StorageService.savePlanSettings({ ...StorageService.getPlanSettings(), institutionFreeUntil: instUntil, eventsFreeUntil: evUntil });
    setInst(null); setEv(null);
    setMsg('Launch offers saved.');
    setTimeout(() => setMsg(''), 4000);
  };

  const row = ({ title, help, value, set, active, presets }: { title: string; help: string; value: string; set: (v: string) => void; active: boolean; presets: [string, number][] }) => (
    <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          {active ? `Free until ${fmt(value)}` : value ? `Ended ${fmt(value)} · paid` : 'Off · paid'}
        </span>
      </div>
      <p className="text-xs text-slate-500">{help}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-600 flex items-center gap-2">Free until (last day)
          <input type="date" value={value} onChange={e => set(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
        </label>
        {presets.map(([label, m]) => <button key={label} type="button" onClick={() => set(plusMonths(m))} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">{label}</button>)}
        <button type="button" onClick={() => set('')} className="px-2.5 py-1.5 rounded-lg border border-crimson-100 text-xs font-semibold text-crimson-700 hover:bg-crimson-50">End offer (make it paid)</button>
      </div>
    </div>
  );

  return (
    <section className="p-5 rounded-3xl bg-emerald-50/50 border border-emerald-200 space-y-4" aria-labelledby="launch-offers">
      <div>
        <h3 id="launch-offers" className="font-semibold text-slate-900 flex items-center gap-2"><Gift className="w-5 h-5 text-emerald-700" /> Launch offers</h3>
        <p className="text-xs text-slate-600 mt-1">Only you can change these. When an offer ends, the normal prices apply automatically.</p>
      </div>
      {row({ title: 'Institutions: all institution tools free', value: instUntil, set: setInst, active: institutionFreeActive({ institutionFreeUntil: instUntil }),
        help: `Only institutions you have verified and approved (Verification tab) get access. Paid subscriptions are not affected. Now: ${verifiedFree} verified institution${verifiedFree === 1 ? '' : 's'} using the offer, ${waiting} waiting for verification.`,
        presets: [['1 year from today', 12], ['6 months', 6]] })}
      {row({ title: 'FDPs, workshops, seminars and conferences: free listings', value: evUntil, set: setEv, active: eventsFreeActive({ eventsFreeUntil: evUntil }),
        help: 'New listings skip payment and go straight to your review (Events tab). Listings stay up until their event ends.',
        presets: [['6 months from today', 6], ['3 months', 3]] })}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty} className="px-5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Save className="w-4 h-4" /> Save launch offers</button>
        {msg && <span className="text-sm text-emerald-800" role="status">{msg}</span>}
      </div>
    </section>
  );
}
