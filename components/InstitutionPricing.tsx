'use client';

import React from 'react';
import { INSTITUTION_CATEGORIES, categoryPricesOf, formatInr, periodLabel } from '@/lib/storage';
import type { InstitutionCategory, PlanSettings } from '@/types';

/** Institution Premium prices by AISHE category. `dark` for the maroon Premium-page panel. */
export function InstitutionPriceTable({ settings, highlight, dark = false }: { settings: PlanSettings; highlight?: InstitutionCategory | null; dark?: boolean }) {
  const prices = categoryPricesOf(settings);
  const period = periodLabel(settings.institutionDurationMonths || 12);
  return (
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
  );
}

/** Lowest category price, for "from ₹…" labels. */
export function lowestInstitutionPrice(settings: PlanSettings): number {
  return Math.min(...Object.values(categoryPricesOf(settings)));
}
