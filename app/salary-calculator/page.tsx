'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CITIES, CityClass, DEFAULT_DA_PERCENT, PAY_LEVELS, basicAfter, calculateSalary, inr } from '@/lib/salary';
import { Calculator, Info } from 'lucide-react';

const field = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function Calculator_() {
  const params = useSearchParams();
  const initialLevel = PAY_LEVELS.some(l => l.key === params.get('level')) ? params.get('level')! : '10';
  const [levelKey, setLevelKey] = useState(initialLevel);
  const [years, setYears] = useState(0);
  const [city, setCity] = useState('');
  const [cityClass, setCityClass] = useState<CityClass>('Y');
  const [higherTa, setHigherTa] = useState(false);
  const [da, setDa] = useState(DEFAULT_DA_PERCENT);
  const [housing, setHousing] = useState(false);
  const [nps, setNps] = useState(true);
  const [pt, setPt] = useState(200);

  const r = useMemo(() => calculateSalary({ levelKey, years, cityClass, higherTaCity: higherTa, daPercent: da, housingProvided: housing, nps, professionalTax: pt }), [levelKey, years, cityClass, higherTa, da, housing, nps, pt]);
  const level = PAY_LEVELS.find(l => l.key === levelKey)!;

  const pickCity = (name: string) => {
    setCity(name);
    const c = CITIES.find(x => x.name === name);
    if (c) { setCityClass(c.cls); setHigherTa(c.tpta); }
  };

  const rows: [string, number, string?][] = r ? [
    ['Basic pay', r.basic, years ? `after ${years} annual increment${years === 1 ? '' : 's'}` : 'entry pay of the level'],
    ['Dearness allowance (DA)', r.da, `${da}% of basic`],
    ['House rent allowance (HRA)', r.hra, housing ? 'not paid when campus housing is provided' : `${r.hraPct}% of basic, class ${cityClass} city`],
    ['Transport allowance (TA)', r.ta, higherTa ? 'higher-TA city' : 'other city'],
    ['DA on transport allowance', r.daOnTa],
  ] : [];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Tools</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-800 mt-2 flex items-center gap-3"><Calculator className="w-8 h-8 text-gold-500" /> Faculty salary calculator</h1>
        <p className="text-slate-600 mt-2 max-w-3xl">Estimate monthly pay under the 7th CPC academic pay matrix used by UGC and AICTE. Change the DA rate, city and deductions to match your situation.</p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <form className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4" onSubmit={e => e.preventDefault()}>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Pay level</span>
            <select className={field} value={levelKey} onChange={e => setLevelKey(e.target.value)}>
              {PAY_LEVELS.map(l => <option key={l.key} value={l.key}>{l.label} — {l.posts} ({inr(l.entry)})</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Years in this level (annual increments)</span>
            <input type="number" min={0} max={40} className={field} value={years} onChange={e => setYears(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} />
            <span className="text-xs text-slate-500">Basic pay {inr(basicAfter(level, years))} · level maximum {inr(level.max)}</span>
          </label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">City</span>
            <select className={field} value={city} onChange={e => pickCity(e.target.value)}>
              <option value="">Choose a city or set the class below…</option>
              {CITIES.map(c => <option key={c.name} value={c.name}>{c.name} (class {c.cls})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">City class (HRA)</span>
              <select className={field} value={cityClass} onChange={e => { setCityClass(e.target.value as CityClass); setCity(''); }}>
                <option value="X">X — large metro</option><option value="Y">Y — other city</option><option value="Z">Z — town / rural</option>
              </select>
            </label>
            <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">DA rate (%)</span>
              <input type="number" min={0} max={200} className={field} value={da} onChange={e => setDa(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 accent-brand-900" checked={higherTa} onChange={e => { setHigherTa(e.target.checked); setCity(''); }} /> Higher transport-allowance city</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 accent-brand-900" checked={housing} onChange={e => setHousing(e.target.checked)} /> Campus housing provided (no HRA)</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 accent-brand-900" checked={nps} onChange={e => setNps(e.target.checked)} /> Deduct NPS contribution (10% of basic + DA)</label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Professional tax per month (₹)</span>
            <input type="number" min={0} max={2500} className={field} value={pt} onChange={e => setPt(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </form>

        {r && (
          <section className="lg:col-span-7 space-y-4" aria-live="polite">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-brand-950 text-white">
                <div className="text-xs text-brand-100/80">Estimated gross per month</div>
                <div className="text-3xl font-bold mt-1">{inr(r.gross)}</div>
                <div className="text-xs text-brand-100/70 mt-1">{inr(r.annualGross)} per year</div>
              </div>
              <div className="p-5 rounded-2xl bg-gold-50 border border-gold-200">
                <div className="text-xs text-gold-800">Estimated take-home (before income tax)</div>
                <div className="text-3xl font-bold text-slate-900 mt-1">{inr(r.takeHome)}</div>
                <div className="text-xs text-slate-600 mt-1">after {inr(r.deductions)} deductions</div>
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {rows.map(([label, value, note]) => (
                    <tr key={label}><td className="px-5 py-3"><div className="text-slate-800">{label}</div>{note && <div className="text-xs text-slate-500">{note}</div>}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{inr(value)}</td></tr>
                  ))}
                  <tr className="bg-cream"><td className="px-5 py-3 font-semibold">Gross pay</td><td className="px-5 py-3 text-right font-bold tabular-nums">{inr(r.gross)}</td></tr>
                  {nps && <tr><td className="px-5 py-3 text-slate-800">NPS contribution (employee)</td><td className="px-5 py-3 text-right tabular-nums text-crimson-700">− {inr(r.npsDeduction)}</td></tr>}
                  {r.professionalTax > 0 && <tr><td className="px-5 py-3 text-slate-800">Professional tax</td><td className="px-5 py-3 text-right tabular-nums text-crimson-700">− {inr(r.professionalTax)}</td></tr>}
                  <tr className="bg-cream"><td className="px-5 py-3 font-semibold">Take-home before income tax</td><td className="px-5 py-3 text-right font-bold tabular-nums">{inr(r.takeHome)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
              <p>This is an estimate for central / UGC-scale posts. State universities and private institutions may pay differently, and the DA rate changes twice a year ({DEFAULT_DA_PERCENT}% from January 2026; check the latest order). Increments are taken as 3% a year, rounded up to the next ₹100. Income tax, other allowances (such as CPDA, research or academic allowances) and other deductions are not included.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function SalaryCalculatorPage() {
  return <Suspense fallback={null}><Calculator_ /></Suspense>;
}
