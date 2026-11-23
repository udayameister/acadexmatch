'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, IndianRupee, Scale } from 'lucide-react';
import { DA_HISTORY, daArrears, inr, nextCell, nextIncrementDate, payRevision } from '@/lib/salary';

const field = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const card = 'p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4';
const L = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">{label}</span>{children}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</label>;
const num = (v: string) => Math.max(0, Number(v) || 0);
const todayIso = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** DA arrears, next increment date and a pay commission estimator, below the salary calculator. */
export default function SalaryExtras({ basic, ta, hraPct, gross }: { basic: number; ta: number; hraPct: number; gross: number }) {
  const latest = DA_HISTORY[DA_HISTORY.length - 1], prev = DA_HISTORY[DA_HISTORY.length - 2];
  // DA arrears
  const [aBasic, setABasic] = useState(basic);
  const [oldPct, setOldPct] = useState(prev.pct);
  const [newPct, setNewPct] = useState(latest.pct);
  const [from, setFrom] = useState(latest.from.slice(0, 7));
  const [to, setTo] = useState('2026-10');
  const [withTa, setWithTa] = useState(true);
  const [nps, setNps] = useState(true);
  useEffect(() => { setABasic(basic); }, [basic]);
  const ar = useMemo(() => daArrears({ basic: aBasic, oldPct, newPct, from, to, ta: withTa ? ta : 0, nps }), [aBasic, oldPct, newPct, from, to, withTa, ta, nps]);
  // Increment
  const [joined, setJoined] = useState('');
  const [iBasic, setIBasic] = useState(basic);
  useEffect(() => { setIBasic(basic); }, [basic]);
  const nextInc = joined ? nextIncrementDate(joined, todayIso()) : null;
  // Pay commission
  const [fit, setFit] = useState(2.0);
  const [newHra, setNewHra] = useState(hraPct === 30 ? 24 : hraPct === 20 ? 16 : hraPct === 10 ? 8 : 0);
  const rev = payRevision(basic, fit, newHra, ta);

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <section id="da-arrears" className={`${card} scroll-mt-24`}>
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-gold-500" /> DA arrears</h2>
        <L label="Basic pay (₹ per month)" hint="Filled from the calculator above; change it if needed."><input type="number" className={field} value={aBasic} onChange={e => setABasic(num(e.target.value))} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Old DA (%)"><input type="number" className={field} value={oldPct} onChange={e => setOldPct(num(e.target.value))} /></L>
          <L label="New DA (%)"><input type="number" className={field} value={newPct} onChange={e => setNewPct(num(e.target.value))} /></L>
          <L label="Arrears from"><input type="month" className={field} value={from} onChange={e => setFrom(e.target.value)} /></L>
          <L label="Up to (last month)"><input type="month" className={field} value={to} onChange={e => setTo(e.target.value)} /></L>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4" checked={withTa} onChange={e => setWithTa(e.target.checked)} /> Include DA on transport allowance ({inr(ta)})</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4" checked={nps} onChange={e => setNps(e.target.checked)} /> Deduct NPS (10% of DA arrears)</label>
        <div className="p-4 rounded-2xl bg-brand-950 text-white">
          <p className="text-xs text-brand-100/80">Arrears for {ar.months} month{ar.months === 1 ? '' : 's'}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{inr(ar.gross)}</p>
          <p className="text-xs text-brand-100/80 mt-1">{inr(ar.perMonthDa)} DA{withTa ? ` + ${inr(ar.perMonthTa)} DA on TA` : ''} a month{nps ? ` · ${inr(ar.net)} after NPS` : ''}</p>
        </div>
        <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">DA rates (central government)</summary>
          <ul className="mt-2 grid grid-cols-2 gap-1">{[...DA_HISTORY].reverse().map(d => <li key={d.from}>{longDate(d.from)}: <strong>{d.pct}%</strong></li>)}</ul>
          <p className="mt-2">63% from 1 July 2026 was announced on 29 October 2026, so arrears for July–October are paid with a later salary. State governments announce their own DA.</p>
        </details>
      </section>

      <section id="increment" className={`${card} scroll-mt-24`}>
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-gold-500" /> Next increment date</h2>
        <L label="Date of joining, promotion or upgradation"><input type="date" className={field} value={joined} onChange={e => setJoined(e.target.value)} /></L>
        <L label="Current basic pay (₹)"><input type="number" className={field} value={iBasic} onChange={e => setIBasic(num(e.target.value))} /></L>
        {nextInc ? (
          <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200">
            <p className="text-xs text-gold-800">Next annual increment</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{longDate(nextInc)}</p>
            <p className="text-sm text-slate-700 mt-1">Basic pay {inr(iBasic)} → <strong>{inr(nextCell(iBasic))}</strong> (+{inr(nextCell(iBasic) - iBasic)} a month, plus DA on it)</p>
          </div>
        ) : <p className="text-sm text-slate-500">Enter a date to see your increment.</p>}
        <p className="text-xs text-slate-600">7th CPC rule: there are two increment dates, 1 January and 1 July. Joining, promotion or financial upgradation between 2 January and 1 July gives the increment on 1 January of the next year; between 2 July and 1 January, on 1 July. Each increment is 3%, to the next cell of the pay matrix (capped at the level maximum). Leave without pay can move the date.</p>
      </section>

      <section id="pay-commission" className={`${card} scroll-mt-24`}>
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Scale className="w-5 h-5 text-gold-500" /> Pay commission estimator</h2>
        <L label={`Fitment factor: ${fit.toFixed(2)}`} hint="The 7th CPC used 2.57. The 8th CPC factor has not been announced.">
          <input type="range" min={1.5} max={3.5} step={0.01} value={fit} onChange={e => setFit(Number(e.target.value))} className="w-full accent-brand-900" />
        </L>
        <L label="HRA after revision (%)" hint="When DA resets to 0, HRA has started at 24 / 16 / 8%."><select className={field} value={newHra} onChange={e => setNewHra(Number(e.target.value))}><option value={24}>24% (X city)</option><option value={16}>16% (Y city)</option><option value={8}>8% (Z city)</option><option value={0}>No HRA (campus housing)</option></select></L>
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1 text-sm">
          <div className="flex justify-between"><span>New basic pay ({inr(basic)} × {fit.toFixed(2)})</span><strong className="tabular-nums">{inr(rev.newBasic)}</strong></div>
          <div className="flex justify-between"><span>HRA {newHra}% + TA</span><strong className="tabular-nums">{inr(rev.hra + rev.ta)}</strong></div>
          <div className="flex justify-between pt-1 border-t border-slate-200"><span className="font-semibold">Gross (DA 0%)</span><strong className="tabular-nums">{inr(rev.gross)}</strong></div>
          <div className="flex justify-between text-slate-600"><span>Today&apos;s gross</span><span className="tabular-nums">{inr(gross)}</span></div>
          <div className={`flex justify-between font-semibold ${rev.gross >= gross ? 'text-emerald-700' : 'text-crimson-700'}`}><span>Change</span><span className="tabular-nums">{rev.gross >= gross ? '+' : '−'}{inr(Math.abs(rev.gross - gross))} ({((rev.gross / Math.max(1, gross) - 1) * 100).toFixed(1)}%)</span></div>
        </div>
        <p className="text-xs text-slate-600">Illustration only. The 8th Central Pay Commission was constituted on 3 November 2025 (chair: Justice Ranjana Prakash Desai) with 18 months to report; the fitment factor, pay matrix and date of effect will be known only when the government accepts its report. UGC scales follow after a separate notification.</p>
      </section>
    </div>
  );
}
