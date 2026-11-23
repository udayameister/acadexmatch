'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { Check, Field, NumberInput, Segmented, cardCls, fieldCls } from '@/components/toolsUi';
import { shortlistScore, SHORTLIST_TABLES, type Institution, type NetLevel } from '@/lib/ugc';

export default function ShortlistingScorePage() {
  const [inst, setInst] = useState<Institution>('university');
  const [ug, setUg] = useState<number | null>(null);
  const [pg, setPg] = useState<number | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [hasMphil, setHasMphil] = useState(false);
  const [mphil, setMphil] = useState<number | null>(null);
  const [phd, setPhd] = useState(false);
  const [net, setNet] = useState<NetLevel>('net');
  const [papers, setPapers] = useState<number | null>(0);
  const [exp, setExp] = useState<number | null>(0);
  const [award, setAward] = useState<'none' | 'state' | 'national'>('none');
  const r = useMemo(() => shortlistScore({ institution: inst, ugPercent: ug, pgPercent: pg, relaxed, mphilPercent: hasMphil ? mphil : null, phd, net, papers: papers || 0, experienceYears: exp || 0, award }), [inst, ug, pg, relaxed, hasMphil, mphil, phd, net, papers, exp, award]);
  const t = SHORTLIST_TABLES[inst];

  return (
    <ToolPage slug="ugc-shortlisting-score" title="UGC shortlisting score calculator"
      intro={<>Your academic score for <strong>Assistant Professor</strong> shortlisting under the UGC Regulations 2018 — Table 3A for universities and Table 3B for colleges. Selection itself is by interview; this score decides who is called.</>}
      notes={<>
        <p>Table 3A (universities): academic record 80, research papers 10, teaching experience 10. Table 3B (colleges): academic record 84, research papers 6, teaching experience 10. M.Phil. + Ph.D. together are capped (30 / 25), as are JRF/NET/SET (7 / 10) and awards (3).</p>
        <p>Percentages are your qualifying marks without grace marks. For a CGPA, use the conversion your university prescribes. Teaching or post-doctoral experience gets 2 marks a year; part of a year counts proportionately. Awards count only from international bodies, the Government of India or national bodies it recognises (3), or a state government (2). SET/SLET is valid only in that state.</p>
        <p>Universities publish their own screening guidelines and may differ in details. The UGC notification and the institution&apos;s advertisement prevail. The 2025 draft regulations are still under consultation, so the 2018 tables apply.</p>
      </>}>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form className={`${cardCls} lg:col-span-7 space-y-5`} onSubmit={e => e.preventDefault()}>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 block">Applying to</span>
            <Segmented label="Applying to" value={inst} onChange={setInst} options={[['university', 'University (Table 3A)'], ['college', 'College (Table 3B)']]} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Graduation (%)" hint={`80+ = ${t.ug[0][1]}, 60–80 = ${t.ug[1][1]}, 55–60 = ${t.ug[2][1]}, 45–55 = ${t.ug[3][1]}`}><NumberInput value={ug} onChange={setUg} max={100} step={0.01} placeholder="e.g. 72.5" /></Field>
            <Field label="Post-graduation (%)" hint={`80+ = 25, 60–80 = 23, ${relaxed ? 50 : 55}–60 = 20`}><NumberInput value={pg} onChange={setPg} max={100} step={0.01} placeholder="e.g. 68" /></Field>
          </div>
          <Check checked={relaxed} onChange={setRelaxed}>SC / ST / OBC (non-creamy layer) or person with disability — the lowest post-graduation band starts at 50%</Check>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Check checked={hasMphil} onChange={setHasMphil}>I have an M.Phil.</Check>
              {hasMphil && <Field label="M.Phil. (%)" hint="60+ = 7, 55–60 = 5"><NumberInput value={mphil} onChange={setMphil} max={100} step={0.01} /></Field>}
            </div>
            <Check checked={phd} onChange={setPhd}>Ph.D. awarded ({t.phd} marks)</Check>
          </div>
          <Field label="Eligibility test">
            <select className={fieldCls} value={net} onChange={e => setNet(e.target.value as NetLevel)}>
              <option value="jrf">NET with JRF ({t.net.jrf})</option><option value="net">NET ({t.net.net})</option><option value="set">SLET / SET ({t.net.set})</option><option value="none">None</option>
            </select>
          </Field>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Papers in peer-reviewed / UGC-listed journals" hint={`2 each, max ${t.paperCap}`}><NumberInput value={papers} onChange={setPapers} max={99} /></Field>
            <Field label="Teaching / post-doc experience (years)" hint="2 a year, max 10"><NumberInput value={exp} onChange={setExp} max={40} step={0.1} /></Field>
            <Field label="Awards">
              <select className={fieldCls} value={award} onChange={e => setAward(e.target.value as typeof award)}><option value="none">None</option><option value="state">State level (2)</option><option value="national">International / national (3)</option></select>
            </Field>
          </div>
        </form>

        <section className={`${cardCls} lg:col-span-5 lg:sticky lg:top-24 space-y-4`} aria-live="polite">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.table}</p>
            <p className="font-serif text-5xl font-bold text-brand-900 mt-1 tabular-nums">{r.total}<span className="text-2xl text-slate-400"> / 100</span></p>
          </div>
          <ul className="space-y-2.5">
            {r.lines.map(l => (
              <li key={l.key} className="text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-700">{l.label}</span><span className="font-semibold tabular-nums text-slate-900">{l.score} <span className="text-slate-400 font-normal">/ {l.max}</span></span></div>
                <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full bg-brand-700 rounded-full" style={{ width: `${(l.score / l.max) * 100}%` }} /></div>
                <p className="text-xs text-slate-500 mt-0.5">{l.note}</p>
              </li>
            ))}
          </ul>
          <div className="pt-3 border-t border-slate-100 space-y-2 text-sm">
            <Link href="/tools/eligibility-checker" className="flex items-center justify-between gap-2 font-semibold text-brand-800 hover:underline">Check your eligibility <ArrowRight className="w-4 h-4" /></Link>
            <Link href="/jobs" className="flex items-center justify-between gap-2 font-semibold text-brand-800 hover:underline">See Assistant Professor vacancies <ArrowRight className="w-4 h-4" /></Link>
            <Link href="/register" className="flex items-center justify-between gap-2 text-slate-600 hover:underline">Create a free profile — your score is calculated automatically <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </section>
      </div>
    </ToolPage>
  );
}
