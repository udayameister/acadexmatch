'use client';

import React from 'react';

const TONE: Record<string, { ring: string; text: string; bg: string; bar: string }> = {
  excellent: { ring: '#059669', text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-600' },
  strong: { ring: '#0d9488', text: 'text-teal-700', bg: 'bg-teal-50', bar: 'bg-teal-600' },
  improve: { ring: '#d97706', text: 'text-amber-700', bg: 'bg-amber-50', bar: 'bg-amber-500' },
  significant: { ring: '#ea580c', text: 'text-orange-700', bg: 'bg-orange-50', bar: 'bg-orange-600' },
  major: { ring: '#dc2626', text: 'text-red-700', bg: 'bg-red-50', bar: 'bg-red-600' },
};
export const toneFor = (score: number) => (score >= 90 ? 'excellent' : score >= 75 ? 'strong' : score >= 60 ? 'improve' : score >= 40 ? 'significant' : 'major');
export const toneStyle = (tone: string) => TONE[tone] || TONE.improve;

export function ScoreBadge({ score, tone }: { score: number; tone?: string }) {
  const t = toneStyle(tone || toneFor(score));
  return (
    <div className={`w-12 h-12 shrink-0 rounded-full ${t.bg} ${t.text} font-bold text-base flex items-center justify-center border-2`} style={{ borderColor: t.ring }} aria-label={`Score ${score} out of 100`}>
      {score}
    </div>
  );
}

/** Circular gauge for the overall score; the band label always accompanies the colour. */
export function ScoreGauge({ score, label, tone, caption }: { score: number; label: string; tone: string; caption?: string }) {
  const t = toneStyle(tone);
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 128 128" className="w-36 h-36" role="img" aria-label={`${caption || 'Score'}: ${score} out of 100, ${label}`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={t.ring} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 64 64)" />
        <text x="64" y="66" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 34, fontWeight: 700 }}>{score}</text>
        <text x="64" y="86" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11 }}>out of 100</text>
      </svg>
      {caption && <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{caption}</p>}
      <p className={`mt-1 text-sm font-semibold ${t.text}`}>{label}</p>
    </div>
  );
}

export function DimensionBar({ label, score, weight }: { label: string; score: number; weight?: number }) {
  const t = toneStyle(toneFor(score));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1 gap-2">
        <span className="text-slate-700 font-medium">{label}{weight != null && <span className="text-slate-400 font-normal"> · weight {weight}%</span>}</span>
        <span className="text-slate-900 font-semibold tabular-nums">{score}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={label}>
        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
    </div>
  );
}

export function Chips({ items, tone }: { items: string[]; tone: 'good' | 'bad' | 'neutral' }) {
  if (!items.length) return <p className="text-xs text-slate-400">None</p>;
  const cls = tone === 'good' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : tone === 'bad' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map(i => <li key={i} className={`px-2 py-0.5 rounded-full border text-xs ${cls}`}>{tone === 'good' ? '✓ ' : tone === 'bad' ? '✗ ' : ''}{i}</li>)}
    </ul>
  );
}
