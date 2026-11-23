'use client';

import React from 'react';

/** Small form pieces shared by the free tools. */
export const fieldCls = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
export const cardCls = 'p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm';

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">{label}</span>{children}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</label>;
}

export function NumberInput({ value, onChange, min = 0, max, step = 1, placeholder }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return <input type="number" inputMode="decimal" min={min} max={max} step={step} placeholder={placeholder} className={fieldCls} value={value ?? ''}
    onChange={e => { const v = e.target.value; if (v === '') return onChange(null); const x = Number(v); onChange(Number.isFinite(x) ? Math.max(min, max != null ? Math.min(max, x) : x) : null); }} />;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 gap-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${value === v ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{children}</span></label>;
}
