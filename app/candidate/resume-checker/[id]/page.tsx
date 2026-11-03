'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Briefcase, CheckCircle2, GraduationCap, Info, Loader2, PenLine, Printer, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Chips, DimensionBar, ScoreGauge, toneFor, toneStyle } from '@/components/resume/ResumeWidgets';
import type { AnalysisResult } from '@/lib/resume/score';
import { DIMENSION_LABEL, type Dimension } from '@/lib/resume/score';
import type { AcademicProfile } from '@/lib/resume/academic';
import type { JobRecommendation } from '@/lib/resume/match';
import type { ParsedResume } from '@/lib/resume/parse';

interface Analysis {
  id: string; createdAt: string; fileName: string; format: string; pages: number | null; jobLabel: string | null; jobId: string | null;
  parsed: ParsedResume; result: AnalysisResult; academic: AcademicProfile | null; recommendations: JobRecommendation[];
}

type Tab = 'overview' | 'job' | 'skills' | 'format' | 'academic' | 'jobs' | 'parsed';

const SEV = {
  high: { icon: XCircle, cls: 'text-red-600', label: 'High priority' },
  medium: { icon: AlertTriangle, cls: 'text-amber-600', label: 'Medium priority' },
  low: { icon: Info, cls: 'text-sky-600', label: 'Low priority' },
} as const;

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    fetch(`/api/resume/${id}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (r.ok) setA(d.analysis); else setErr(d.error || 'Not found.'); });
  }, [id]);

  if (err) return <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-3"><p className="text-slate-700">{err}</p><Link href="/candidate/resume-checker" className="text-brand-700 font-semibold">Back to the resume checker</Link></div>;
  if (!a) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const r = a.result;
  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ...(r.job ? [['job', 'Job match'] as [Tab, string]] : []),
    ['skills', 'Skills & keywords'],
    ['format', 'ATS formatting'],
    ...(a.academic ? [['academic', 'Academic CV'] as [Tab, string]] : []),
    ['jobs', 'Matching vacancies'],
    ['parsed', 'What we read'],
  ];
  const remove = async () => {
    if (!confirm('Delete this analysis and its saved resume text?')) return;
    await fetch(`/api/resume/${a.id}`, { method: 'DELETE', credentials: 'same-origin' });
    router.push('/candidate/resume-checker');
  };
  const toBuilder = async () => {
    const res = await fetch('/api/resume/builder', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', label: a.parsed.name ? `${a.parsed.name} – resume` : 'My resume', template: a.academic ? 'academic' : 'ats-classic', fromAnalysis: a.id }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) router.push(`/candidate/resume-builder?id=${d.draft.id}`); else alert(d.error || 'Could not open the builder.');
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="min-w-0">
          <Link href="/candidate/resume-checker" className="no-print inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2"><ArrowLeft className="w-3 h-3" /> Resume checker</Link>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 break-words">Resume analysis</h1>
          <p className="text-sm text-slate-500 break-words">{a.fileName} · {a.jobLabel ? `compared with ${a.jobLabel}` : 'general check'} · {new Date(a.createdAt).toLocaleString('en-IN')}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={toBuilder} className="px-4 py-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold flex items-center gap-1.5"><PenLine className="w-4 h-4" /> Improve in builder</button>
          <Link href="/candidate/resume-checker" className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Check again</Link>
          <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Printer className="w-4 h-4" /> Save report as PDF</button>
          <button onClick={remove} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 hover:text-red-700 flex items-center gap-1.5" aria-label="Delete this analysis"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid md:grid-cols-[auto_1fr] gap-6 p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm items-center">
        <div className="flex flex-wrap justify-center gap-6">
          <ScoreGauge score={r.overall} label={r.band.label} tone={r.band.tone} caption="ATS score" />
          {r.job && <ScoreGauge score={r.job.matchPercent} label={`${r.job.matchPercent}% job match`} tone={toneFor(r.job.matchPercent)} caption="Job match" />}
        </div>
        <div className="space-y-3 min-w-0">
          {(Object.keys(r.dimensions) as Dimension[]).map(k => <DimensionBar key={k} label={DIMENSION_LABEL[k]} score={r.dimensions[k]} weight={Math.round((r.weights[k] / Object.values(r.weights).reduce((x, y) => x + y, 0)) * 100)} />)}
          <DimensionBar label="Section completeness (not weighted)" score={r.completeness.score} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500 -mt-3">The score is AcadeXMatch’s estimate of ATS readability and relevance using its own weighted method. Different employers’ systems work differently; it does not predict selection.</p>

      <div className="no-print flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3 sm:px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900">What to improve first</h2>
            {!r.findings.length && <p className="text-sm text-slate-600">No issues found. Nicely done.</p>}
            <ol className="space-y-2">
              {r.findings.map((f, i) => {
                const s = SEV[f.severity];
                return (
                  <li key={i} className="p-3 rounded-xl bg-white border border-slate-200 flex gap-3">
                    <s.icon className={`w-5 h-5 shrink-0 ${s.cls}`} aria-label={s.label} />
                    <div className="text-sm text-slate-700"><span className="sr-only">{s.label}: </span>{f.text}</div>
                  </li>
                );
              })}
            </ol>
            {!!r.weakBullets.length && (
              <div className="pt-3 space-y-2">
                <h3 className="font-semibold text-slate-900 text-sm">Stronger bullet points</h3>
                <p className="text-xs text-slate-500">Suggestions keep your facts; add real numbers only if you have them.</p>
                {r.weakBullets.map((b, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white border border-slate-200 text-sm space-y-1">
                    <p className="text-slate-500 line-through decoration-red-300">{b.text}</p>
                    <p className="text-slate-900"><span className="text-emerald-700 font-semibold">Try: </span>{b.suggestion}</p>
                    <p className="text-[11px] text-slate-500">{b.issue}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-sm space-y-2">
              <h3 className="font-semibold text-slate-900">At a glance</h3>
              <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Words</dt><dd className="text-right font-medium">{r.stats.words}</dd>
                <dt className="text-slate-500">Experience</dt><dd className="text-right font-medium">{r.stats.experienceYears} yrs</dd>
                <dt className="text-slate-500">Skills found</dt><dd className="text-right font-medium">{r.stats.skills}</dd>
                <dt className="text-slate-500">Bullet points</dt><dd className="text-right font-medium">{r.stats.bullets}</dd>
                <dt className="text-slate-500">Start with action verb</dt><dd className="text-right font-medium">{r.stats.actionVerbShare}%</dd>
                <dt className="text-slate-500">With numbers</dt><dd className="text-right font-medium">{r.stats.quantifiedShare}%</dd>
              </dl>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-sm space-y-2">
              <h3 className="font-semibold text-slate-900">Sections</h3>
              <ul className="space-y-1 text-xs">
                {r.completeness.present.map(p => <li key={p} className="flex gap-1.5 text-slate-700"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Present" />{p}</li>)}
                {r.completeness.missing.map(p => <li key={p} className="flex gap-1.5 text-slate-700"><XCircle className="w-4 h-4 text-red-500 shrink-0" aria-label="Missing" />{p}</li>)}
              </ul>
            </div>
          </aside>
        </div>
      )}

      {tab === 'job' && r.job && (
        <div className="space-y-5">
          <div className="grid md:grid-cols-3 gap-4">
            <Fact title="Experience" ok={r.job.experience.ok} text={r.job.experience.required != null ? `Job asks ${r.job.experience.required}+ years; resume shows about ${r.job.experience.have}` : `No minimum stated; resume shows about ${r.job.experience.have} years`} />
            <Fact title="Qualification" ok={r.job.education.ok} text={r.job.education.required ? `Job asks ${r.job.education.required}; resume shows ${r.job.education.have || 'none stated'}` : 'No specific degree level found in the posting'} />
            <Fact title="NET / SET / SLET" ok={r.job.education.net.required ? r.job.education.net.have : null} text={r.job.education.net.required ? (r.job.education.net.have ? 'Required, and stated in your resume' : 'Required, not found in your resume') : 'Not mentioned in the posting'} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Box title="Required skills you have"><Chips items={r.job.matchedRequired} tone="good" /></Box>
            <Box title="Required skills missing"><Chips items={r.job.missingRequired} tone="bad" /></Box>
            <Box title="Preferred skills you have"><Chips items={r.job.matchedPreferred} tone="good" /></Box>
            <Box title="Preferred skills missing"><Chips items={r.job.missingPreferred} tone="bad" /></Box>
          </div>
          {!!r.job.responsibilities.length && (
            <Box title="Job responsibilities vs your resume">
              <ul className="space-y-1.5 text-sm">
                {r.job.responsibilities.map((x, i) => (
                  <li key={i} className="flex gap-2">{x.covered ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-label="Covered" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-label="Not covered" />}<span className="text-slate-700">{x.text}</span></li>
                ))}
              </ul>
            </Box>
          )}
          {!!r.job.certifications.mentioned.length && <Box title="Certifications in the posting"><Chips items={r.job.certifications.mentioned} tone="neutral" /></Box>}
        </div>
      )}

      {tab === 'skills' && (
        <div className="space-y-5">
          {r.job && (
            <div className="grid md:grid-cols-2 gap-4">
              <Box title="Job keywords found in your resume"><Chips items={r.job.matchedKeywords} tone="good" /></Box>
              <Box title="Job keywords missing"><Chips items={r.job.missingKeywords} tone="bad" /></Box>
            </div>
          )}
          <Box title="Skills found in your resume">
            <SkillGroups skills={a.parsed.skills} />
          </Box>
          {!!r.skillGaps.length && (
            <Box title="Skill gaps for this job">
              <ul className="space-y-2 text-sm">
                {r.skillGaps.map(g => (
                  <li key={g.name} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="font-medium text-slate-900">{g.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border w-fit ${g.required ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{g.required ? 'Required' : 'Preferred'}</span>
                    {g.hint && <span className="text-xs text-slate-500">{g.hint}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-3">Add a skill to your resume only if you genuinely have it.</p>
            </Box>
          )}
        </div>
      )}

      {tab === 'format' && (
        <Box title="ATS formatting checks">
          <ul className="divide-y divide-slate-100">
            {r.formatting.map(f => (
              <li key={f.check} className="py-2.5 flex gap-3 text-sm">
                {f.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Pass" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0" aria-label="Needs attention" />}
                <div><p className="text-slate-900 font-medium">{f.check}</p>{!f.ok && <p className="text-xs text-slate-500">{f.note}</p>}</div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 mt-3">File: {a.format.toUpperCase()}{a.pages ? ` · ${a.pages} page${a.pages > 1 ? 's' : ''}` : ''}</p>
        </Box>
      )}

      {tab === 'academic' && a.academic && <AcademicView p={a.academic} />}

      {tab === 'jobs' && (
        <div className="space-y-3">
          {!a.recommendations.length ? <p className="text-sm text-slate-600">No open vacancies closely match this resume right now. <Link href="/jobs" className="text-brand-700 font-semibold">Browse all jobs</Link>.</p> : a.recommendations.map(j => (
            <div key={j.jobId} className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex-1 min-w-0">
                <Link href={`/jobs/${j.jobId}`} className="font-semibold text-slate-900 hover:text-brand-700 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-slate-400 shrink-0" /><span className="break-words">{j.title}</span></Link>
                <p className="text-xs text-slate-500">{j.institute}{j.location ? ` · ${j.location}` : ''}{j.deadline ? ` · apply by ${j.deadline}` : ''}</p>
                <ul className="mt-1.5 text-xs text-emerald-800 space-y-0.5">{j.reasons.map(x => <li key={x}>✓ {x}</li>)}</ul>
                {!!j.gaps.length && <ul className="mt-1 text-xs text-red-700 space-y-0.5">{j.gaps.map(x => <li key={x}>✗ {x}</li>)}</ul>}
              </div>
              <div className={`text-sm font-bold ${toneStyle(toneFor(j.score)).text} shrink-0`}>{j.score}% fit</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'parsed' && <ParsedView p={a.parsed} />}
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-3 min-w-0"><h3 className="font-semibold text-slate-900 text-sm">{title}</h3>{children}</section>;
}

function Fact({ title, ok, text }: { title: string; ok: boolean | null; text: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        {ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Meets" /> : ok === false ? <XCircle className="w-4 h-4 text-red-500" aria-label="Gap" /> : <Info className="w-4 h-4 text-slate-400" aria-label="Info" />} {title}
      </p>
      <p className="text-sm text-slate-800 mt-1.5">{text}</p>
    </div>
  );
}

function SkillGroups({ skills }: { skills: ParsedResume['skills'] }) {
  const groups = new Map<string, string[]>();
  for (const s of skills) groups.set(s.category, [...(groups.get(s.category) || []), s.name]);
  if (!groups.size) return <p className="text-sm text-slate-500">No recognised skills. Add a “Skills” section listing your tools, methods and subjects.</p>;
  return <div className="space-y-3">{[...groups].map(([c, n]) => <div key={c}><p className="text-xs font-semibold text-slate-500 mb-1">{c}</p><Chips items={n} tone="neutral" /></div>)}</div>;
}

function AcademicView({ p }: { p: AcademicProfile }) {
  const STATUS = { meets: ['Appears to meet the basic criteria', 'bg-emerald-50 text-emerald-800 border-emerald-200'], check: ['Check the remaining criteria', 'bg-amber-50 text-amber-800 border-amber-200'], not_yet: ['Not yet, based on the CV', 'bg-slate-50 text-slate-700 border-slate-200'] } as const;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Ph.D.', p.phd ? p.phd[0].toUpperCase() + p.phd.slice(1) : 'Not stated'],
          ['NET / SET / GATE', p.netSet.length ? p.netSet.join(', ') : 'Not stated'],
          ['Teaching experience', `${p.teachingYears} yrs`],
          ['Research experience', `${p.researchYears} yrs`],
          ['Publications', `${p.publications.total} (${p.publications.journals} journal, ${p.publications.conferences} conference)`],
          ['Indexing mentioned', p.publications.indexed.join(', ') || 'None'],
          ['Patents · Grants', `${p.patents} · ${p.grants}`],
          ['Memberships · FDPs', `${p.memberships} · ${p.trainings}`],
        ].map(([k, v]) => <div key={k} className="p-3 rounded-xl bg-white border border-slate-200"><p className="text-[11px] text-slate-500 font-semibold uppercase">{k}</p><p className="text-sm font-medium text-slate-900 mt-0.5 break-words">{v}</p></div>)}
      </div>
      <Box title="UGC eligibility (indicative)">
        <div className="space-y-4">
          {p.eligibility.map(e => (
            <div key={e.post} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2"><GraduationCap className="w-4 h-4 text-brand-700" /><span className="font-semibold text-sm text-slate-900">{e.post}</span><span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS[e.status][1]}`}>{STATUS[e.status][0]}</span></div>
              <ul className="text-xs space-y-0.5 pl-6">
                {e.met.map(m => <li key={m} className="text-emerald-800">✓ {m}</li>)}
                {e.missing.map(m => <li key={m} className="text-slate-600">• {m}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{p.note}</p>
      </Box>
      {!!p.suggestions.length && <Box title="Suggestions for your academic CV"><ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">{p.suggestions.map(s => <li key={s}>{s}</li>)}</ul></Box>}
    </div>
  );
}

function ParsedView({ p }: { p: ParsedResume }) {
  const row = (k: string, v: React.ReactNode) => <div className="grid sm:grid-cols-[160px_1fr] gap-1 py-2 border-b border-slate-100 text-sm"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900 break-words">{v || <span className="text-slate-400">Not found</span>}</dd></div>;
  return (
    <Box title="What the checker read from your resume">
      <p className="text-xs text-slate-500">If something is missing or wrong here, an ATS may read it the same way. Check the wording and layout of that part.</p>
      <dl>
        {row('Name', p.name)}{row('Email', p.email)}{row('Phone', p.phone)}{row('Location', p.location)}
        {row('Links', [p.links.linkedin, p.links.github, p.links.scholar, p.links.orcid, p.links.portfolio].filter(Boolean).join(' · '))}
        {row('Experience', p.experience.length ? <ul className="space-y-1">{p.experience.map((e, i) => <li key={i}>{e.title || '—'}{e.organization ? `, ${e.organization}` : ''} <span className="text-slate-500">({e.start || '?'} – {e.current ? 'Present' : e.end || '?'})</span></li>)}</ul> : null)}
        {row('Education', p.education.length ? <ul className="space-y-1">{p.education.map((e, i) => <li key={i}>{e.degree}{e.field ? ` in ${e.field}` : ''}{e.institution ? `, ${e.institution}` : ''}{e.year ? ` (${e.year})` : ''}</li>)}</ul> : null)}
        {row('Certifications', p.certifications.join('; '))}
        {row('Publications', p.publications.items.length ? `${p.publications.items.length} listed` : null)}
        {row('Languages', p.languages.join(', '))}
      </dl>
    </Box>
  );
}
