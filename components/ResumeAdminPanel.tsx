'use client';

import React, { useEffect, useState } from 'react';
import { Check, FileSearch, Loader2, Lock, Save } from 'lucide-react';
import MiniBarChart from '@/components/MiniBarChart';

interface Weights { keywords: number; skills: number; experience: number; formatting: number; education: number; summary: number }
interface Settings { enabled: boolean; builderEnabled: boolean; weights: Weights; dailyLimit: number; historyLimit: number; retentionDays: number }
interface Stats { analyses: number; withJob: number; uploads: Record<string, number>; scoreBuckets: number[]; builderSaves: number; docxExports: number; deletions: number; byDay: Record<string, number>; missingSkills: Record<string, number>; usersWithData: number }

const LABEL: Record<keyof Weights, string> = { keywords: 'Keyword optimisation', skills: 'Skills relevance', experience: 'Work experience relevance', formatting: 'Structure and formatting', education: 'Education and certifications', summary: 'Professional summary' };

/** Administrator view of the resume checker: settings and content-free usage statistics. */
export default function ResumeAdminPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/resume', { credentials: 'same-origin', cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setS(d.settings); setStats(d.stats); } else setErr(d.error || 'Could not load.');
    });
  }, []);

  if (err && !s) return <p className="text-sm text-red-700">{err}</p>;
  if (!s || !stats) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const total = Object.values(s.weights).reduce((a, b) => a + b, 0);
  const upd = (patch: Partial<Settings>) => { setState('idle'); setS({ ...s, ...patch }); };
  const save = async () => {
    setState('saving'); setErr(null);
    const r = await fetch('/api/admin/resume', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setS(d.settings); setState('saved'); } else { setErr(d.error || 'Could not save.'); setState('idle'); }
  };
  const days = Object.entries(stats.byDay).sort().slice(-30);
  const topMissing = Object.entries(stats.missingSkills).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const num = 'w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <FileSearch className="w-6 h-6 text-brand-700 shrink-0" />
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900">Resume checker</h2>
          <p className="text-sm text-slate-500 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Candidates’ resumes and results are private to them. This page shows settings and totals only.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Analyses', stats.analyses], ['With a job description', stats.withJob], ['Candidates with saved data', stats.usersWithData], ['Word downloads', stats.docxExports], ['Builder drafts saved', stats.builderSaves], ['Deletions by users', stats.deletions], ['PDF / DOCX / TXT', `${stats.uploads.pdf || 0} / ${stats.uploads.docx || 0} / ${stats.uploads.txt || 0}`], ['From builder', stats.uploads.builder || 0]].map(([k, v]) => (
          <div key={String(k)} className="p-3 rounded-xl bg-white border border-slate-200"><p className="text-[11px] text-slate-500 font-semibold uppercase">{k}</p><p className="text-xl font-bold text-slate-900 tabular-nums">{v}</p></div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="p-4 rounded-2xl bg-white border border-slate-200">
          <h3 className="font-semibold text-sm text-slate-900 mb-3">Analyses per day (last 30 days)</h3>
          {days.length ? <MiniBarChart title="Analyses per day" data={days.map(([d, n]) => ({ label: d.slice(5), value: n }))} /> : <p className="text-xs text-slate-500">No analyses yet.</p>}
        </section>
        <section className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
          <h3 className="font-semibold text-sm text-slate-900">Score distribution</h3>
          {['0–19', '20–39', '40–59', '60–79', '80–100'].map((l, i) => {
            const n = stats.scoreBuckets[i] || 0, max = Math.max(1, ...stats.scoreBuckets);
            return <div key={l} className="flex items-center gap-2 text-xs"><span className="w-14 text-slate-500">{l}</span><div className="flex-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-700" style={{ width: `${(n / max) * 100}%` }} /></div><span className="w-8 text-right tabular-nums">{n}</span></div>;
          })}
          <h3 className="font-semibold text-sm text-slate-900 pt-2">Most-missed required skills</h3>
          {topMissing.length ? <ul className="flex flex-wrap gap-1.5">{topMissing.map(([k, n]) => <li key={k} className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-xs">{k} · {n}</li>)}</ul> : <p className="text-xs text-slate-500">None yet.</p>}
        </section>
      </div>

      <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
        <h3 className="font-semibold text-sm text-slate-900">Settings</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4 accent-brand-700" checked={s.enabled} onChange={e => upd({ enabled: e.target.checked })} /> Resume checker on</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4 accent-brand-700" checked={s.builderEnabled} onChange={e => upd({ builderEnabled: e.target.checked })} /> Resume builder on</label>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <label className="flex items-center justify-between gap-2">Checks per candidate per day<input type="number" className={num} min={1} max={500} value={s.dailyLimit} onChange={e => upd({ dailyLimit: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-2">Analyses kept per candidate<input type="number" className={num} min={1} max={100} value={s.historyLimit} onChange={e => upd({ historyLimit: Number(e.target.value) })} /></label>
          <label className="flex items-center justify-between gap-2">Delete analyses after (days)<input type="number" className={num} min={7} max={3650} value={s.retentionDays} onChange={e => upd({ retentionDays: Number(e.target.value) })} /></label>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">Score weights <span className="text-xs text-slate-500 font-normal">(total {total}; they are scaled to 100%)</span></p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2 text-sm">
            {(Object.keys(LABEL) as (keyof Weights)[]).map(k => (
              <label key={k} className="flex items-center justify-between gap-2">{LABEL[k]}<input type="number" className={num} min={0} max={100} value={s.weights[k]} onChange={e => upd({ weights: { ...s.weights, [k]: Number(e.target.value) } })} /></label>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-brand-700 font-semibold" onClick={() => upd({ weights: { keywords: 25, skills: 20, experience: 20, formatting: 15, education: 10, summary: 10 } })}>Reset to the default weights</button>
        </div>
        {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        <button onClick={save} className="px-5 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold flex items-center gap-1.5">
          {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {state === 'saved' ? 'Saved' : 'Save settings'}
        </button>
        <p className="text-[11px] text-slate-500">New weights apply to new analyses; earlier results keep the weights they were scored with.</p>
      </section>
    </div>
  );
}
