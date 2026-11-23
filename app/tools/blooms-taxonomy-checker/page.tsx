'use client';

import React, { useMemo, useState } from 'react';
import { Copy, Check as CheckIcon } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { cardCls, fieldCls } from '@/components/toolsUi';
import { BLOOM, distribution, splitQuestions, tagQuestion, type BloomLevel } from '@/lib/blooms';

const SAMPLE = `1. Define an operating system.
2. Explain the difference between a process and a thread.
3. Calculate the average waiting time for the given processes using Round Robin scheduling.
4. Analyse the causes of deadlock in the given resource allocation graph.
5. Justify the choice of paging over segmentation for a mobile operating system.
6. Design a scheduling algorithm for a real-time system with three priority classes.`;

export default function BloomsPage() {
  const [text, setText] = useState('');
  const [override, setOverride] = useState<Record<number, BloomLevel | 0>>({});
  const [copied, setCopied] = useState(false);
  const tagged = useMemo(() => splitQuestions(text).map(tagQuestion), [text]);
  const final = tagged.map((t, i) => ({ ...t, level: (override[i] ?? t.level) || null }));
  const dist = distribution(final);
  const lower = dist.slice(0, 2).reduce((n, d) => n + d.count, 0), middle = dist.slice(2, 4).reduce((n, d) => n + d.count, 0), higher = dist.slice(4).reduce((n, d) => n + d.count, 0);
  const copy = async () => {
    const rows = final.map((q, i) => `${i + 1}\t${q.level ? `L${q.level} ${BLOOM[q.level - 1].name}` : 'Not detected'}\t${q.text}`);
    try { await navigator.clipboard.writeText(['No.\tBloom level\tQuestion', ...rows].join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };

  return (
    <ToolPage slug="blooms-taxonomy-checker" title="Bloom's taxonomy question checker"
      intro={<>Paste your question paper — numbered or one question per line — and see the <strong>Bloom&apos;s level (L1–L6)</strong> of every question and the balance of the paper. Useful for OBE, NBA and NAAC question-paper audits.</>}
      notes={<>
        <p>Each question gets the highest level among the action verbs it uses (revised Bloom&apos;s taxonomy, Anderson &amp; Krathwohl 2001), e.g. “Explain … and justify …” is L5. Question words count when there is no action verb (“What is …” → L1, “Why …” → L2). Marks and CO tags such as “(10 marks)” or “[CO2]” are ignored.</p>
        <p>Verbs are a guide, not a rule: “Explain the design of …” can be higher-order in context. Change any level with the drop-down. The distribution your university or programme expects is set in its own question-paper blueprint. Nothing you paste leaves your browser.</p>
      </>}>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className={`${cardCls} lg:col-span-5 space-y-3`}>
          <textarea className={`${fieldCls} min-h-[16rem]`} rows={12} value={text} onChange={e => { setText(e.target.value); setOverride({}); }} placeholder="Paste your questions here…" aria-label="Questions" />
          <button type="button" className="text-sm font-semibold text-brand-800 hover:underline" onClick={() => { setText(SAMPLE); setOverride({}); }}>Try a sample paper</button>
          {tagged.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-sm font-semibold text-slate-900">Balance of the paper ({final.length} questions)</p>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">{dist.filter(d => d.count).map(d => <div key={d.level} style={{ width: `${d.pct}%`, background: d.color }} title={`${d.code} ${d.name}: ${d.count}`} />)}</div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {dist.map(d => <li key={d.level} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />{d.code} {d.name}</span><span className="tabular-nums font-semibold">{d.count} <span className="text-slate-400 font-normal">({d.pct}%)</span></span></li>)}
              </ul>
              <p className="text-xs text-slate-600">Lower order (L1–L2): {lower} · middle (L3–L4): {middle} · higher order (L5–L6): {higher}{final.some(q => !q.level) ? ` · not detected: ${final.filter(q => !q.level).length}` : ''}</p>
            </div>
          )}
        </section>
        <section className={`${cardCls} lg:col-span-7 space-y-3`} aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Questions</h2>
            {final.length > 0 && <button className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-1.5" onClick={copy}>{copied ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} Copy as table</button>}
          </div>
          {!final.length && <p className="text-sm text-slate-500">Your questions will appear here with their levels.</p>}
          <ol className="space-y-2">
            {final.map((q, i) => (
              <li key={i} className="flex gap-3 items-start p-3 rounded-xl border border-slate-100">
                <select aria-label={`Level of question ${i + 1}`} className="text-xs font-bold rounded-lg border border-slate-200 px-1.5 py-1 shrink-0" style={{ color: q.level ? BLOOM[q.level - 1].color : '#94a3b8' }}
                  value={q.level || 0} onChange={e => setOverride(o => ({ ...o, [i]: Number(e.target.value) as BloomLevel | 0 }))}>
                  <option value={0}>—</option>{BLOOM.map(b => <option key={b.level} value={b.level}>{b.code} {b.name}</option>)}
                </select>
                <div className="min-w-0 text-sm">
                  <p className="text-slate-800 break-words">{q.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{override[i] !== undefined ? 'Set by you' : q.verb ? `Verb: “${q.verb}”${tagged[i].all.length > 1 ? ` (also ${tagged[i].all.filter(a => a.verb !== q.verb).map(a => `${a.verb} L${a.level}`).join(', ')})` : ''}` : 'No Bloom verb found — choose a level'}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </ToolPage>
  );
}
