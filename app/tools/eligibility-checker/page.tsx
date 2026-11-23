'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { Check, Field, NumberInput, cardCls, fieldCls } from '@/components/toolsUi';
import { eligibility, type NetLevel } from '@/lib/ugc';

const JOB_SEARCH: Record<string, string> = {
  'Assistant Professor': '/jobs?search=Assistant%20Professor',
  'Associate Professor': '/jobs?search=Associate%20Professor',
  Professor: '/jobs?search=Professor',
};

export default function EligibilityPage() {
  const [pg, setPg] = useState<number | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [before1991, setBefore1991] = useState(false);
  const [net, setNet] = useState<NetLevel>('none');
  const [phd, setPhd] = useState(false);
  const [phdUgc, setPhdUgc] = useState(false);
  const [exp, setExp] = useState<number | null>(0);
  const [papers, setPapers] = useState<number | null>(0);
  const [score, setScore] = useState<number | null>(null);
  const [guided, setGuided] = useState(false);
  const verdicts = useMemo(() => eligibility({ pgPercent: pg, relaxed, pgBefore1991: before1991, net, phd, phdUgcCompliant: phdUgc, experienceYears: exp || 0, papers: papers || 0, researchScore: score, phdGuided: guided }), [pg, relaxed, before1991, net, phd, phdUgc, exp, papers, score, guided]);

  return (
    <ToolPage slug="eligibility-checker" title="Am I eligible? Faculty eligibility checker"
      intro={<>Check the minimum qualifications for <strong>Assistant Professor, Associate Professor and Professor</strong> posts in universities and colleges under the UGC Regulations 2018 — including the rule that NET/SET/SLET is the minimum for Assistant Professor from 1 July 2023.</>}
      notes={<>
        <p><strong>Assistant Professor:</strong> Master&apos;s degree with 55% (50% for SC/ST/OBC-NCL/PwD, and for Ph.D. holders who completed the Master&apos;s before 19 September 1991) and NET/SET/SLET. Candidates whose Ph.D. was awarded under the UGC 2009 or 2016 Ph.D. regulations are exempt from NET/SET/SLET. Since July 2023 a Ph.D. is optional.</p>
        <p><strong>Associate Professor (direct recruitment):</strong> Ph.D., Master&apos;s with 55%, 8 years of teaching/research experience equivalent to Assistant Professor, at least 7 papers in peer-reviewed or UGC-listed journals and a research score of 75 (Appendix II, Table 2). <strong>Professor:</strong> Ph.D., 10 years of experience, at least 10 papers, a research score of 120 and evidence of having guided Ph.D. candidates. (Outstanding professionals may also be appointed Professor under a separate route.)</p>
        <p>AICTE (technical institutions), medical, law and other regulators have their own norms. The 2025 UGC draft regulations were still under consultation as of August 2026. Always read the advertisement and the official notification.</p>
      </>}>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form className={`${cardCls} lg:col-span-6 space-y-5`} onSubmit={e => e.preventDefault()}>
          <Field label="Master's degree (%)"><NumberInput value={pg} onChange={setPg} max={100} step={0.01} placeholder="e.g. 58.4" /></Field>
          <Check checked={relaxed} onChange={setRelaxed}>SC / ST / OBC (non-creamy layer) or person with disability</Check>
          <Field label="NET / SET / SLET">
            <select className={fieldCls} value={net} onChange={e => setNet(e.target.value as NetLevel)}>
              <option value="none">Not qualified</option><option value="set">SLET / SET</option><option value="net">UGC / CSIR NET</option><option value="jrf">NET with JRF</option>
            </select>
          </Field>
          <div className="space-y-2">
            <Check checked={phd} onChange={setPhd}>Ph.D. awarded</Check>
            {phd && <div className="pl-6 space-y-2">
              <Check checked={phdUgc} onChange={setPhdUgc}>Awarded under the UGC 2009 or 2016 Ph.D. regulations</Check>
              <Check checked={before1991} onChange={setBefore1991}>Master&apos;s completed before 19 September 1991</Check>
              <Check checked={guided} onChange={setGuided}>I have guided Ph.D. candidate(s)</Check>
            </div>}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Teaching / research experience (years)"><NumberInput value={exp} onChange={setExp} max={45} step={0.5} /></Field>
            <Field label="Papers in peer-reviewed / UGC-listed journals"><NumberInput value={papers} onChange={setPapers} max={500} /></Field>
            <Field label="Research score (Table 2)" hint={<Link href="/tools/cas-research-score" className="underline">Calculate it</Link>}><NumberInput value={score} onChange={setScore} max={5000} step={0.1} placeholder="optional" /></Field>
          </div>
        </form>

        <section className="lg:col-span-6 space-y-4" aria-live="polite">
          {verdicts.map(v => (
            <div key={v.post} className={`${cardCls} ${v.eligible ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-bold text-slate-900">{v.post}</h2>
                <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${v.eligible ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{v.eligible ? 'Eligible' : 'Not yet'}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {v.reasons.map((r, i) => <li key={i} className="flex gap-2">{r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}<span className={r.ok ? 'text-slate-800' : 'text-slate-600'}>{r.text}</span></li>)}
              </ul>
              {v.eligible && <Link href={JOB_SEARCH[v.post]} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">See {v.post} vacancies <ArrowRight className="w-4 h-4" /></Link>}
            </div>
          ))}
        </section>
      </div>
    </ToolPage>
  );
}
