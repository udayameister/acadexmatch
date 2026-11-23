'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { Check, Field, NumberInput, Segmented, cardCls, fieldCls } from '@/components/toolsUi';
import { EMPTY_TABLE2, IMPACT_BANDS, STAGES, table2Checks, table2Score, type Authorship, type ImpactBand, type Stage, type Table2Input } from '@/lib/ugc';

type Group = Exclude<keyof Table2Input, 'discipline' | 'papers' | 'addImpactToBase'>;
const SECTIONS: { title: string; group: Group; items: [string, string, number | string][] }[] = [
  { title: '2. Books, chapters and translations', group: 'books', items: [['intl', 'Books authored — international publisher', 12], ['national', 'Books authored — national publisher', 10], ['chapters', 'Chapters in edited books', 5], ['editorIntl', 'Editor of a book — international publisher', 10], ['editorNational', 'Editor of a book — national publisher', 8], ['translationChapters', 'Translated chapters or papers', 3], ['translationBooks', 'Translated books', 8]] },
  { title: '3. ICT teaching, MOOCs, e-content and curricula', group: 'ict', items: [['pedagogy', 'Innovative pedagogy developed', 5], ['curricula', 'New curricula / courses designed', 2], ['moocFull4Credit', 'Complete 4-credit MOOC developed (4 quadrants)', 20], ['moocCredits', 'Credits of smaller MOOCs developed', '5 / credit'], ['moocModules', 'MOOC modules / lectures developed', 5], ['moocContentModules', 'MOOC modules as content writer / subject expert', 2], ['moocCoordinator4Credit', 'Course coordinator of a 4-credit MOOC', 8], ['moocCoordinatorCredits', 'Credits coordinated in smaller MOOCs', '2 / credit'], ['econtentFull', 'Complete e-content course / e-book (4 quadrants)', 12], ['econtentModules', 'E-content modules (4 quadrants)', 5], ['econtentContrib', 'Contributions to e-content modules', 2], ['econtentEditor', 'Editor of an e-content course / e-book', 10]] },
  { title: '4. Research guidance, projects and consultancy', group: 'guidance', items: [['phdAwarded', 'Ph.D. awarded — sole supervisor', 10], ['phdJointAwarded', 'Ph.D. awarded — joint supervisor', 7], ['phdSubmitted', 'Ph.D. theses submitted', 5], ['mphilPg', 'M.Phil. / PG dissertations awarded', 2]] },
  { title: '', group: 'projects', items: [['completedAbove10L', 'Completed projects above ₹10 lakh', 10], ['completedBelow10L', 'Completed projects below ₹10 lakh', 5], ['ongoingAbove10L', 'Ongoing projects above ₹10 lakh', 5], ['ongoingBelow10L', 'Ongoing projects below ₹10 lakh', 2], ['consultancy', 'Consultancy assignments', 3]] },
  { title: '5. Patents, policy documents and awards', group: 'patents', items: [['intl', 'International patents', 10], ['national', 'National patents', 7]] },
  { title: '', group: 'policy', items: [['intl', 'Policy documents — international body', 10], ['national', 'Policy documents — central government', 7], ['state', 'Policy documents — state government', 4]] },
  { title: '', group: 'awards', items: [['intl', 'International awards / fellowships', 7], ['national', 'National awards / fellowships', 5]] },
  { title: '6. Invited lectures, resource person, papers presented', group: 'talks', items: [['abroad', 'International (abroad)', 7], ['intlIndia', 'International (within India)', 5], ['national', 'National', 3], ['state', 'State / university', 2]] },
];
const AUTHORS: [Authorship, string][] = [['sole', 'Sole author (100%)'], ['two', 'One of two authors (70%)'], ['main', 'First / corresponding author of 3+ (70%)'], ['joint', 'Joint author of 3+ (30%)']];

export default function CasScorePage() {
  const [inp, setInp] = useState<Table2Input>({ ...EMPTY_TABLE2, papers: [{ impact: 'none', authorship: 'main', count: 0 }] });
  const [stage, setStage] = useState<Stage>('cas-assoc');
  const r = useMemo(() => table2Score(inp), [inp]);
  const checks = table2Checks(r, stage);
  const st = STAGES.find(s => s.key === stage)!;
  const setGroup = (g: Group, k: string, v: number | null) => setInp(x => ({ ...x, [g]: { ...(x[g] as object), [k]: v || 0 } }));
  const setPaper = (i: number, patch: Partial<Table2Input['papers'][number]>) => setInp(x => ({ ...x, papers: x.papers.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const base = inp.discipline === 'science' ? 8 : 10;

  return (
    <ToolPage slug="cas-research-score" title="CAS research score calculator"
      intro={<>Your academic/research score under the <strong>UGC Regulations 2018, Appendix II, Table 2</strong> — for Career Advancement Scheme promotion to Associate Professor and Professor, and for direct recruitment.</>}
      notes={<>
        <p>Research papers in peer-reviewed or UGC-listed journals get {base} marks each ({inp.discipline === 'science' ? 'sciences, engineering, agriculture, medical, veterinary' : 'languages, humanities, arts, social sciences, library, education, physical education, commerce, management'}). Table 2 says the paper score is “augmented” by the impact factor (no impact factor 5, below 1: 10, 1–2: 15, 2–5: 20, 5–10: 25, above 10: 30). Most universities add these points to the base marks; untick the option above if yours uses the impact-factor marks instead.</p>
        <p>Joint work: two authors get 70% each; with more than two, the first, principal or corresponding author gets 70% and every other author 30%. Joint project investigators share 50/50; joint Ph.D. supervisors get 7 each. Policy documents and invited lectures/presentations together may count for at most 30% of the total. The score must come from at least three of the six categories.</p>
        <p>CAS (universities): research score 70 and 7 papers for Associate Professor; 110 and 10 papers for Professor. Direct recruitment: 75 and 120. Your university&apos;s IQAC proforma and the selection committee decide; papers must be in journals accepted at the time of publication.</p>
      </>}>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-5">
          <section className={`${cardCls} space-y-4`}>
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <Segmented label="Discipline" value={inp.discipline} onChange={v => setInp(x => ({ ...x, discipline: v }))} options={[['science', 'Sciences / Engineering / Medical'], ['humanities', 'Humanities / Social sciences / Commerce']]} />
            </div>
            <h2 className="font-semibold text-slate-900">1. Research papers in peer-reviewed or UGC-listed journals</h2>
            <ul className="space-y-2">
              {inp.papers.map((p, i) => (
                <li key={i} className="grid sm:grid-cols-[1fr_1fr_6rem_auto] gap-2 items-end">
                  <Field label="Journal"><select className={fieldCls} value={p.impact} onChange={e => setPaper(i, { impact: e.target.value as ImpactBand })}>{IMPACT_BANDS.map(b => <option key={b.key} value={b.key}>{b.label} (+{b.points})</option>)}</select></Field>
                  <Field label="Your authorship"><select className={fieldCls} value={p.authorship} onChange={e => setPaper(i, { authorship: e.target.value as Authorship })}>{AUTHORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                  <Field label="Papers"><NumberInput value={p.count} onChange={v => setPaper(i, { count: v || 0 })} max={500} /></Field>
                  <button type="button" aria-label="Remove this row" className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500" onClick={() => setInp(x => ({ ...x, papers: x.papers.filter((_, j) => j !== i) }))}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50" onClick={() => setInp(x => ({ ...x, papers: [...x.papers, { impact: 'lt1', authorship: 'main', count: 1 }] }))}><Plus className="w-4 h-4" /> Add a group of papers</button>
            <Check checked={inp.addImpactToBase} onChange={v => setInp(x => ({ ...x, addImpactToBase: v }))}>Add the impact-factor points to the {base} marks per paper (usual practice)</Check>
          </section>
          {SECTIONS.map((s, si) => (
            <section key={si} className={`${cardCls} space-y-3 ${s.title ? '' : '-mt-3'}`}>
              {s.title && <h2 className="font-semibold text-slate-900">{s.title}</h2>}
              <div className="grid sm:grid-cols-2 gap-3">
                {s.items.map(([k, label, pts]) => (
                  <Field key={k} label={`${label} — ${pts}${typeof pts === 'number' ? ' each' : ''}`}>
                    <NumberInput value={((inp[s.group] as unknown as Record<string, number>)[k]) || 0} onChange={v => setGroup(s.group, k, v)} max={999} />
                  </Field>
                ))}
              </div>
              {s.group === 'projects' && <Check checked={inp.projects.jointShare} onChange={v => setInp(x => ({ ...x, projects: { ...x.projects, jointShare: v } }))}>These projects were joint (PI and Co-PI share 50% each)</Check>}
            </section>
          ))}
        </div>

        <section className={`${cardCls} lg:col-span-4 lg:sticky lg:top-24 space-y-4`} aria-live="polite">
          <Field label="Check against">
            <select className={fieldCls} value={stage} onChange={e => setStage(e.target.value as Stage)}>{STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </Field>
          <p className="font-serif text-5xl font-bold text-brand-900 tabular-nums">{r.total}<span className="text-xl text-slate-400"> / {st.score}</span></p>
          <ul className="space-y-1.5 text-sm">
            {r.categories.map(c => <li key={c.key} className="flex justify-between gap-2"><span className="text-slate-600">{c.label}</span><span className="font-semibold tabular-nums">{c.score}</span></li>)}
          </ul>
          {r.cappedPart.raw > r.cappedPart.allowed && <p className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">Policy documents and talks add {r.cappedPart.raw}, but only {r.cappedPart.allowed} can count (30% of the total).</p>}
          <ul className="space-y-1.5 text-sm pt-3 border-t border-slate-100">
            {checks.map(c => <li key={c.label} className="flex gap-2">{c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}<span><span className="text-slate-800">{c.label}</span> <span className="text-slate-500">— {c.detail}</span></span></li>)}
          </ul>
          <p className="text-xs text-slate-500">Also required: {st.extra}</p>
        </section>
      </div>
    </ToolPage>
  );
}
