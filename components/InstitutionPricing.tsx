'use client';

import React from 'react';
import { INSTITUTION_CATEGORIES, categoryPricesOf, formatInr, periodLabel, institutionFreeActive } from '@/lib/storage';
import type { InstitutionCategory, PlanSettings } from '@/types';

/** Institution Premium prices by AISHE category. `dark` for the maroon Premium-page panel. */
export function InstitutionPriceTable({ settings, highlight, dark = false }: { settings: PlanSettings; highlight?: InstitutionCategory | null; dark?: boolean }) {
  const prices = categoryPricesOf(settings);
  const period = periodLabel(settings.institutionDurationMonths || 12);
  const free = institutionFreeActive(settings);
  const until = free && settings.institutionFreeUntil ? new Date(`${settings.institutionFreeUntil}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return (
    <div className="space-y-2">
    {free && (
      <p className={`text-sm rounded-xl px-3.5 py-2.5 border ${dark ? 'bg-emerald-400/10 border-emerald-300/40 text-emerald-100' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`} role="status">
        <strong>Launch offer:</strong> Institution Premium is free until {until} for every institution verified by AcadeXMatch. The prices below apply after that.
      </p>
    )}
    <div className={`rounded-xl border overflow-hidden ${dark ? 'border-gold-400/30' : 'border-slate-200 bg-white'}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={dark ? 'text-gold-200/80' : 'text-slate-500 bg-slate-50'}>
            <th className="text-left font-medium px-3.5 py-2">AISHE category</th>
            <th className="text-left font-medium px-3.5 py-2">Code</th>
            <th className="text-right font-medium px-3.5 py-2">Price {period}</th>
          </tr>
        </thead>
        <tbody>
          {INSTITUTION_CATEGORIES.map(c => {
            const on = highlight === c.key;
            return (
              <tr key={c.key} className={`border-t ${dark ? 'border-gold-400/20' : 'border-slate-100'} ${on ? (dark ? 'bg-white/10' : 'bg-gold-50') : ''}`}>
                <td className={`px-3.5 py-2 ${on ? 'font-semibold' : ''}`}>{c.label}</td>
                <td className={`px-3.5 py-2 font-mono text-xs whitespace-nowrap ${dark ? 'text-gold-100/80' : 'text-slate-500'}`}>{c.prefix}-XXXXX</td>
                <td className={`px-3.5 py-2 text-right font-bold tabular-nums ${dark ? 'text-gold-300' : 'text-brand-900'}`}>{formatInr(prices[c.key])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}

/** Lowest category price, for "from ₹…" labels. */
export function lowestInstitutionPrice(settings: PlanSettings): number {
  return Math.min(...Object.values(categoryPricesOf(settings)));
}
