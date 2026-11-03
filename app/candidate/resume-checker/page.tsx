'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileSearch, FileText, History, Loader2, PenLine, ShieldCheck, Trash2, Upload, Wand2 } from 'lucide-react';
import { ScoreBadge } from '@/components/resume/ResumeWidgets';

interface Summary { id: string; createdAt: string; source: string; fileName: string; jobLabel: string | null; overall: number; band: { label: string; tone: string }; matchPercent: number | null }
interface Draft { id: string; label: string; template: string; updatedAt: string }
interface Overview { enabled: boolean; builderEnabled: boolean; consentAt: string | null; analyses: Summary[]; builder: Draft[]; jobs: { id: string; title: string; institute: string }[]; historyLimit: number; retentionDays: number }

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ResumeCheckerPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reuseId, setReuseId] = useState('');
  const [jobMode, setJobMode] = useState<'none' | 'paste' | 'vacancy'>('paste');
  const [jobText, setJobText] = useState('');
  const [jobId, setJobId] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/resume', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => null);
    if (r.ok && d) { setData(d); if (d.consentAt) setConsent(true); }
    else setError(d?.error || 'Could not load the resume checker.');
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file && !reuseId) { setError('Choose your resume (PDF, DOCX or TXT).'); return; }
    if (!consent) { setError('Please tick the consent box to continue.'); return; }
    if (jobMode === 'paste' && jobText.trim() && jobText.trim().split(/\s+/).length < 8) { setError('Paste the full job description (or choose “General check”).'); return; }
    if (jobMode === 'vacancy' && !jobId) { setError('Choose a vacancy.'); return; }
    const fd = new FormData();
    if (file) fd.append('file', file); else fd.append('reuseId', reuseId);
    if (jobMode === 'paste' && jobText.trim()) fd.append('jobText', jobText);
    if (jobMode === 'vacancy') fd.append('jobId', jobId);
    fd.append('consent', '1');
    setBusy(true);
    try {
      const r = await fetch('/api/resume', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'The check failed. Please try again.'); return; }
      router.push(`/candidate/resume-checker/${d.analysis.id}`);
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this analysis and its saved resume text?')) return;
    await fetch(`/api/resume/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    load();
  };
  const removeAll = async () => {
    if (!confirm('Delete ALL your resume analyses, saved resume text and builder drafts? This cannot be undone.')) return;
    await fetch('/api/resume', { method: 'DELETE', credentials: 'same-origin' });
    setConsent(false);
    load();
  };
  const newDraft = async (fromAnalysis?: string) => {
    const r = await fetch('/api/resume/builder', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', label: 'My resume', template: 'ats-classic', fromAnalysis }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not create the draft.'); return; }
    router.push(`/candidate/resume-builder?id=${d.draft.id}`);
  };

  if (!data && !error) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <div className="pb-6 border-b border-slate-200">
        <Link href="/candidate/dashboard" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2"><ArrowLeft className="w-3 h-3" /> Dashboard</Link>
        <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900">Resume Intelligence</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-3xl">Check how well your resume reads in applicant tracking systems, compare it with a job description, find missing skills and keywords, and see matching AcadeXMatch vacancies. Free for all candidates.</p>
      </div>

      {data && !data.enabled && <p className="p-4 rounded-xl bg-gold-50 border border-gold-200 text-gold-900 text-sm">The resume checker is switched off at the moment. Your saved analyses are still listed below.</p>}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <form onSubmit={submit} className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><FileSearch className="w-5 h-5 text-brand-700" /> Check a resume</h2>

          <div>
            <p className="text-sm font-medium text-slate-800 mb-2">1. Your resume</p>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full p-5 rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 text-center transition">
              <Upload className="w-6 h-6 mx-auto text-slate-400" />
              <span className="block mt-2 text-sm font-medium text-slate-800 break-all">{file ? file.name : 'Choose a PDF, DOCX or TXT file'}</span>
              <span className="block text-xs text-slate-500 mt-1">Up to 5 MB. Scanned images can’t be read; use a text-based file.</span>
            </button>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={e => { setFile(e.target.files?.[0] || null); setReuseId(''); }} aria-label="Resume file" />
            {!!data?.analyses.length && (
              <label className="block mt-3 text-xs text-slate-600">Or re-check a resume you uploaded before:
                <select value={reuseId} onChange={e => { setReuseId(e.target.value); if (e.target.value) { setFile(null); if (fileRef.current) fileRef.current.value = ''; } }}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                  <option value="">—</option>
                  {[...new Map(data.analyses.map(a => [a.fileName, a])).values()].map(a => <option key={a.id} value={a.id}>{a.fileName} ({when(a.createdAt)})</option>)}
                </select>
              </label>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800 mb-2">2. Target job (optional, recommended)</p>
            <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Target job">
              {([['paste', 'Paste a job description'], ['vacancy', 'An AcadeXMatch vacancy'], ['none', 'General check']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={jobMode === k} onClick={() => setJobMode(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${jobMode === k ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
            {jobMode === 'paste' && (
              <textarea value={jobText} onChange={e => setJobText(e.target.value)} rows={7} maxLength={30000} aria-label="Job description"
                placeholder="Paste the full job description or advertisement: eligibility, required skills, experience, responsibilities…"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
            )}
            {jobMode === 'vacancy' && (
              <select value={jobId} onChange={e => setJobId(e.target.value)} aria-label="Vacancy" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                <option value="">Choose an open vacancy…</option>
                {data?.jobs.map(j => <option key={j.id} value={j.id}>{j.title} — {j.institute}</option>)}
              </select>
            )}
          </div>

          <label className="flex gap-3 items-start text-xs text-slate-600 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-700" />
            <span>I agree that AcadeXMatch may process my resume to produce this analysis. It is analysed by AcadeXMatch’s own in-house engine (no outside AI service). The text is kept private to my account for re-checking, never shown to institutions or administrators, kept for up to {data?.retentionDays || 365} days, and I can delete it at any time.</span>
          </label>

          {error && <p role="alert" className="text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={busy || data?.enabled === false}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {busy ? 'Analysing…' : 'Analyse my resume'}
          </button>
          <p className="text-[11px] text-slate-500">The score is AcadeXMatch’s estimate of how readable and relevant your resume is for applicant tracking systems. It is not a prediction of selection.</p>
        </form>

        <aside className="space-y-6">
          {data?.builderEnabled !== false && (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2"><PenLine className="w-5 h-5 text-brand-700" /> Resume builder</h2>
              <p className="text-xs text-slate-500 mt-1">ATS-friendly templates. Download as PDF or Word.</p>
              <button onClick={() => newDraft()} className="mt-3 w-full px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800">Start a new resume</button>
              {!!data?.builder.length && (
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.builder.map(b => (
                    <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                      <Link href={`/candidate/resume-builder?id=${b.id}`} className="text-sm font-medium text-brand-800 hover:underline truncate">{b.label}</Link>
                      <span className="text-[11px] text-slate-400 shrink-0">{new Date(b.updatedAt).toLocaleDateString('en-IN')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs text-slate-600 space-y-2">
            <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Your privacy</h2>
            <p>Only you can see your resumes and results. Institutions and administrators cannot. The original file is not stored, only its text.</p>
            {(data?.analyses.length || data?.builder.length) ? (
              <button onClick={removeAll} className="text-crimson-700 font-semibold hover:underline">Delete all my resume data</button>
            ) : null}
          </div>
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-brand-700" /> Your analyses</h2>
        {!data?.analyses.length ? <p className="text-sm text-slate-500">No analyses yet.</p> : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {data.analyses.map(a => (
              <li key={a.id} className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4 min-w-0">
                <ScoreBadge score={a.overall} tone={a.band.tone} />
                <div className="min-w-0 flex-1">
                  <Link href={`/candidate/resume-checker/${a.id}`} className="font-semibold text-sm text-slate-900 hover:text-brand-700 flex items-center gap-1.5 min-w-0"><FileText className="w-4 h-4 text-slate-400 shrink-0" /><span className="truncate">{a.fileName}</span></Link>
                  <p className="text-xs text-slate-500 truncate">{a.jobLabel ? `vs ${a.jobLabel}` : 'General check'}{a.matchPercent != null ? ` · ${a.matchPercent}% match` : ''}</p>
                  <p className="text-[11px] text-slate-400">{when(a.createdAt)}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => newDraft(a.id)} title="Open in the resume builder" className="text-xs text-brand-700 font-semibold hover:underline">Edit in builder</button>
                  <button onClick={() => remove(a.id)} aria-label={`Delete analysis of ${a.fileName}`} className="text-xs text-slate-500 hover:text-crimson-700 flex items-center gap-1 justify-end"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-400">The latest {data?.historyLimit || 20} analyses are kept.</p>
      </section>
    </div>
  );
}
