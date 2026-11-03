'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Download, FileSearch, Loader2, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { EMPTY_DATA, TEMPLATES, renderSections, type BuilderData, type BuilderResume, type TemplateId } from '@/lib/resume/builder';

export default function BuilderWrapper() {
  return <Suspense fallback={null}><Builder /></Suspense>;
}

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
const input = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white';

function Builder() {
  const id = useSearchParams().get('id') || '';
  const router = useRouter();
  const [draft, setDraft] = useState<BuilderResume | null>(null);
  const [d, setD] = useState<BuilderData>(EMPTY_DATA);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'checking'>('idle');
  const dirty = useRef(false);

  useEffect(() => {
    if (!id) { router.replace('/candidate/resume-checker'); return; }
    fetch(`/api/resume/builder?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (r.ok) { setDraft(j.draft); setD({ ...EMPTY_DATA, ...j.draft.data }); } else setErr(j.error || 'Draft not found.'); });
  }, [id, router]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (err) return <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-3"><p>{err}</p><Link href="/candidate/resume-checker" className="text-brand-700 font-semibold">Back</Link></div>;
  if (!draft) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const set = <K extends keyof BuilderData>(k: K, v: BuilderData[K]) => { dirty.current = true; setState('idle'); setD(p => ({ ...p, [k]: v })); };
  const meta = (patch: Partial<BuilderResume>) => { dirty.current = true; setState('idle'); setDraft(p => (p ? { ...p, ...patch } : p)); };

  const save = async (): Promise<boolean> => {
    setState('saving');
    const r = await fetch('/api/resume/builder', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id: draft.id, label: draft.label, template: draft.template, data: d }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(null); alert(j.error || 'Could not save.'); setState('idle'); return false; }
    dirty.current = false;
    setState('saved');
    return true;
  };
  const check = async () => {
    if (!(await save())) return;
    setState('checking');
    const fd = new FormData();
    fd.append('builderId', draft.id); fd.append('consent', '1');
    const r = await fetch('/api/resume', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    setState('idle');
    if (r.ok) router.push(`/candidate/resume-checker/${j.analysis.id}`); else alert(j.error || 'The check failed.');
  };
  const docx = async () => { if (await save()) window.location.href = `/api/resume/docx?id=${encodeURIComponent(draft.id)}`; };
  const pdf = async () => { if (await save()) window.print(); };
  const remove = async () => {
    if (!confirm(`Delete the draft “${draft.label}”?`)) return;
    await fetch('/api/resume/builder', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: draft.id }) });
    dirty.current = false;
    router.push('/candidate/resume-checker');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-5">
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="min-w-0">
          <Link href="/candidate/resume-checker" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2"><ArrowLeft className="w-3 h-3" /> Resume Intelligence</Link>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">Resume builder</h1>
          <p className="text-xs text-slate-500">Enter only true information. Single-column, text-based templates that applicant tracking systems read well.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={save} className="px-4 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold flex items-center gap-1.5">
            {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'saved' ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {state === 'saved' ? 'Saved' : 'Save'}
          </button>
          <button onClick={check} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 flex items-center gap-1.5">{state === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />} Check ATS score</button>
          <button onClick={pdf} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Printer className="w-4 h-4" /> PDF</button>
          <button onClick={docx} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Download className="w-4 h-4" /> Word</button>
          <button onClick={remove} aria-label="Delete draft" className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div className="no-print space-y-5 min-w-0">
          <Card title="Draft">
            <label className="block text-xs text-slate-600">Draft name<input className={input} value={draft.label} maxLength={80} onChange={e => meta({ label: e.target.value })} /></label>
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Template">
              {TEMPLATES.map(t => (
                <button key={t.id} type="button" role="radio" aria-checked={draft.template === t.id} onClick={() => meta({ template: t.id as TemplateId })}
                  className={`text-left p-3 rounded-xl border ${draft.template === t.id ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <span className="block text-sm font-semibold text-slate-900">{t.name}</span><span className="block text-[11px] text-slate-500">{t.description}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Contact">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Full name" v={d.fullName} on={v => set('fullName', v)} />
              <Field label="Headline (e.g. Assistant Professor, CSE)" v={d.headline} on={v => set('headline', v)} />
              <Field label="Email" v={d.email} on={v => set('email', v)} />
              <Field label="Phone" v={d.phone} on={v => set('phone', v)} />
              <Field label="City, State" v={d.location} on={v => set('location', v)} />
              <Field label="Links (LinkedIn, ORCID, Scholar…; one per line)" v={d.links.join('\n')} on={v => set('links', lines(v))} area />
            </div>
          </Card>

          <Card title="Professional summary">
            <textarea className={input} rows={4} value={d.summary} maxLength={1500} onChange={e => set('summary', e.target.value)} aria-label="Professional summary"
              placeholder="3–4 lines: your role, years of experience, key skills and one notable result." />
          </Card>

          <Card title="Experience">
            {d.experience.map((e, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-200 space-y-2 relative">
                <button aria-label="Remove this role" onClick={() => set('experience', d.experience.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                <div className="grid sm:grid-cols-2 gap-2 pr-6">
                  {(['title', 'organization', 'location', 'start', 'end'] as const).map(k => (
                    <Field key={k} label={{ title: 'Job title', organization: 'Organisation', location: 'Location', start: 'Start (e.g. Jun 2018)', end: 'End (or Present)' }[k]} v={e[k]} on={v => set('experience', d.experience.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />
                  ))}
                </div>
                <Field label="Achievements (one per line; start with an action verb)" v={e.bullets.join('\n')} on={v => set('experience', d.experience.map((x, j) => (j === i ? { ...x, bullets: v.split('\n') } : x)))} area />
              </div>
            ))}
            <AddBtn on={() => set('experience', [...d.experience, { title: '', organization: '', location: '', start: '', end: '', bullets: [] }])} label="Add a role" />
          </Card>

          <Card title="Education">
            {d.education.map((e, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-200 grid sm:grid-cols-2 gap-2 relative pr-8">
                <button aria-label="Remove this qualification" onClick={() => set('education', d.education.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                {(['degree', 'institution', 'year', 'score'] as const).map(k => (
                  <Field key={k} label={{ degree: 'Degree and subject', institution: 'Institution', year: 'Year', score: 'Score (%, CGPA)' }[k]} v={e[k]} on={v => set('education', d.education.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />
                ))}
              </div>
            ))}
            <AddBtn on={() => set('education', [...d.education, { degree: '', institution: '', year: '', score: '' }])} label="Add a qualification" />
          </Card>

          <Card title="Skills and more">
            <Field label="Skills (comma-separated)" v={d.skills.join(', ')} on={v => set('skills', v.split(',').map(s => s.trim()).filter(Boolean))} area />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Certifications (one per line)" v={d.certifications.join('\n')} on={v => set('certifications', v.split('\n'))} area />
              <Field label="Awards (one per line)" v={d.awards.join('\n')} on={v => set('awards', v.split('\n'))} area />
              <Field label="Research interests (one per line)" v={d.research.join('\n')} on={v => set('research', v.split('\n'))} area />
              <Field label="Subjects taught (one per line)" v={d.teaching.join('\n')} on={v => set('teaching', v.split('\n'))} area />
              <Field label="FDPs, workshops, training (one per line)" v={d.trainings.join('\n')} on={v => set('trainings', v.split('\n'))} area />
              <Field label="Professional memberships (one per line)" v={d.memberships.join('\n')} on={v => set('memberships', v.split('\n'))} area />
              <Field label="Languages (comma-separated)" v={d.languages.join(', ')} on={v => set('languages', v.split(',').map(s => s.trim()).filter(Boolean))} />
            </div>
            <Field label="Publications (one per line, with journal, year and DOI)" v={d.publications.join('\n')} on={v => set('publications', v.split('\n'))} area />
          </Card>

          <Card title="Projects">
            {d.projects.map((p, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-200 space-y-2 relative pr-8">
                <button aria-label="Remove this project" onClick={() => set('projects', d.projects.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                <Field label="Project name" v={p.name} on={v => set('projects', d.projects.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
                <Field label="What you did and the result" v={p.description} on={v => set('projects', d.projects.map((x, j) => (j === i ? { ...x, description: v } : x)))} area />
              </div>
            ))}
            <AddBtn on={() => set('projects', [...d.projects, { name: '', description: '' }])} label="Add a project" />
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 min-w-0">
          <p className="no-print text-xs text-slate-500 mb-2">Preview ({TEMPLATES.find(t => t.id === draft.template)?.name})</p>
          <ResumePreview d={d} t={draft.template} />
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3"><h2 className="font-semibold text-slate-900 text-sm">{title}</h2>{children}</section>;
}
function Field({ label, v, on, area }: { label: string; v: string; on: (v: string) => void; area?: boolean }) {
  return (
    <label className="block text-xs text-slate-600 min-w-0">{label}
      {area ? <textarea className={`${input} mt-1`} rows={3} value={v} onChange={e => on(e.target.value)} /> : <input className={`${input} mt-1`} value={v} onChange={e => on(e.target.value)} />}
    </label>
  );
}
function AddBtn({ on, label }: { on: () => void; label: string }) {
  return <button type="button" onClick={on} className="text-sm text-brand-700 font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> {label}</button>;
}

/** The printable resume. Plain black text on white, one column, so "Save as PDF" stays ATS-readable. */
function ResumePreview({ d, t }: { d: BuilderData; t: TemplateId }) {
  const accent = t === 'modern' ? '#1F4E79' : '#111827';
  const clean = { ...d, certifications: d.certifications.filter(Boolean), awards: d.awards.filter(Boolean), research: d.research.filter(Boolean), teaching: d.teaching.filter(Boolean), trainings: d.trainings.filter(Boolean), memberships: d.memberships.filter(Boolean), publications: d.publications.filter(Boolean), experience: d.experience.map(e => ({ ...e, bullets: e.bullets.filter(b => b.trim()) })) };
  return (
    <article id="resume-print" className="bg-white text-slate-900 border border-slate-200 shadow-sm print:shadow-none print:border-0 p-6 sm:p-10 text-[13px] leading-snug" style={{ fontFamily: 'Calibri, Carlito, Arial, sans-serif', color: '#111827' }}>
      <h1 className="text-2xl font-bold" style={{ color: t === 'modern' ? accent : undefined }}>{d.fullName || 'Your Name'}</h1>
      {d.headline && <p className="text-[15px]">{d.headline}</p>}
      <p className="mt-1 break-words">{[d.email, d.phone, d.location].filter(Boolean).join(' | ')}</p>
      {!!d.links.length && <p className="break-words">{d.links.join(' | ')}</p>}
      {renderSections(clean, t).map(s => (
        <section key={s.heading} className="mt-4">
          <h2 className="font-bold uppercase text-[13px] tracking-wide border-b pb-0.5 mb-1.5" style={{ color: accent, borderColor: '#9ca3af' }}>{s.heading}</h2>
          {s.paragraph && <p className="whitespace-pre-line">{s.paragraph}</p>}
          {s.kind === 'inline' && <p>{s.items?.join(', ')}</p>}
          {s.kind === 'list' && <ul className="list-disc pl-5 space-y-0.5">{s.items?.map((i, k) => <li key={k}>{i}</li>)}</ul>}
          {s.entries?.map((e, k) => (
            <div key={k} className="mt-1.5 break-inside-avoid">
              <div className="flex justify-between gap-3"><span className="font-bold">{e.title}</span>{e.dates && <span className="shrink-0">{e.dates}</span>}</div>
              {e.sub && <p className="italic">{e.sub}</p>}
              {!!e.bullets.length && <ul className="list-disc pl-5 space-y-0.5">{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}
