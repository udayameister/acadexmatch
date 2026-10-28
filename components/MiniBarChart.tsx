'use client';

import React, { useState } from 'react';

export interface BarDatum { label: string; value: number; hint?: string }

/**
 * One-series column chart: single hue, thin columns with rounded tops, recessive baseline,
 * hover tooltip, sparse x labels and a table view for screen readers / exact values.
 */
export default function MiniBarChart({ title, data, format = v => v.toLocaleString('en-IN'), height = 140, color = 'bg-brand-900' }: {
  title: string; data: BarDatum[]; format?: (v: number) => string; height?: number; color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <figure className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-slate-900 text-sm">{title}</span>
        <span className="text-xs text-slate-500">Total <strong className="text-slate-900 tabular-nums">{format(total)}</strong></span>
      </figcaption>
      <div className="relative mt-4" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-200" aria-hidden="true" />
        {total === 0 && <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">No data in this period</div>}
        <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden="true">
          {data.map((d, i) => (
            <div key={d.label + i} className="relative flex-1 h-full flex items-end" onMouseEnter={() => setHover(i)}>
              <div className={`w-full rounded-t-[4px] ${color} ${hover === i ? 'opacity-80' : ''}`} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
            </div>
          ))}
        </div>
        {hover !== null && data[hover] && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full px-2.5 py-1.5 rounded-lg bg-brand-950 text-white text-xs shadow-lg whitespace-nowrap"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%`, transform: 'translate(-50%, -100%)' }}>
            <div className="font-semibold tabular-nums">{format(data[hover].value)}</div>
            <div className="text-brand-100/80">{data[hover].hint || data[hover].label}</div>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[12px] text-slate-500" aria-hidden="true">
        {data.map((d, i) => <span key={d.label + i} className="flex-1 text-center truncate">{i % every === 0 ? d.label : ''}</span>)}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-slate-500">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-slate-100">
            {data.map((d, i) => <tr key={d.label + i}><td className="py-1 text-slate-600">{d.hint || d.label}</td><td className="py-1 text-right tabular-nums text-slate-900">{format(d.value)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
