'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StorageService, isPremiumUser, isInstituteSubscribed } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import MiniBarChart, { BarDatum } from '@/components/MiniBarChart';
import type { Application, Institute, Payment, User } from '@/types';
import { TrendingUp } from 'lucide-react';

type Range = 30 | 90 | 365;
const DAY = 86400000;
const istDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Buckets for the range: daily (30), weekly (90) or monthly (365). Each bucket = [startIso, endIso]. */
function buckets(range: Range): { label: string; hint: string; from: string; to: string }[] {
  const now = Date.now();
  if (range === 30) return Array.from({ length: 30 }, (_, i) => { const d = istDay(now - (29 - i) * DAY); return { label: d.slice(8), hint: d, from: d, to: d }; });
  if (range === 90) return Array.from({ length: 13 }, (_, i) => {
    const end = istDay(now - (12 - i) * 7 * DAY); const start = istDay(now - ((12 - i) * 7 + 6) * DAY);
    return { label: start.slice(5).replace('-', '/'), hint: `Week from ${start}`, from: start, to: end };
  });
  const out: { label: string; hint: string; from: string; to: string }[] = [];
  const d = new Date(); d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const from = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    out.push({ label: m.toLocaleDateString('en-IN', { month: 'short' }), hint: m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), from, to });
  }
  return out;
}

/** Accepts YYYY-MM-DD…, ISO timestamps or "dd/mm/yyyy, time" and returns YYYY-MM-DD. */
function isoDay(v: string | undefined): string {
  if (!v) return '';
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return v.length > 10 && v.includes('T') ? istDay(Date.parse(v)) : v.slice(0, 10);
}

function series<T>(items: T[], dateOf: (x: T) => string | undefined, range: Range, value: (x: T) => number = () => 1): BarDatum[] {
  return buckets(range).map(b => ({ label: b.label, hint: b.hint, value: items.reduce((s, x) => { const d = isoDay(dateOf(x)); return d >= b.from && d <= b.to ? s + value(x) : s; }, 0) }));
}

export default function GrowthPanel() {
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const payments = useStorageValue<Payment[]>(() => StorageService.getPayments(), []);
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const apps = useStorageValue<Application[]>(() => StorageService.getAllApplications(), []);
  const [range, setRange] = useState<Range>(30);
  const [visits, setVisits] = useState<{ date: string; count: number }[] | null>(null);

  useEffect(() => {
    fetch('/api/visits?days=366', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => setVisits(d?.series || null)).catch(() => setVisits(null));
  }, []);

  const since = istDay(Date.now() - (range - 1) * DAY);
  const paid = payments.filter(p => p.status === 'paid');
  const candidates = users.filter(u => u.role === 'candidate');
  const premium = candidates.filter(u => isPremiumUser(u));
  const subscribed = institutes.filter(i => isInstituteSubscribed(i));
  const in30 = istDay(Date.now() + 30 * DAY);
  const today = istDay(Date.now());

  const renewals = useMemo(() => [
    ...premium.filter(u => u.premiumUntil && u.premiumUntil <= in30).map(u => ({ kind: 'Candidate Premium', name: u.name, contact: u.email, until: u.premiumUntil! })),
    ...subscribed.filter(i => i.subscription?.activeUntil && i.subscription.activeUntil <= in30).map(i => ({ kind: 'Institution Premium', name: i.name, contact: i.contactEmail || i.subscription?.requestedBy || '', until: i.subscription!.activeUntil! })),
  ].sort((a, b) => a.until.localeCompare(b.until)), [premium, subscribed, in30]);

  const visitsInRange = (visits || []).filter(v => v.date >= since);
  const newUsers = users.filter(u => isoDay(u.createdAt) >= since);
  const revenue = paid.filter(p => isoDay(p.paidAt) >= since).reduce((s, p) => s + p.amount - (p.refundedAmount || 0), 0);
  const conversion = candidates.length ? Math.round((premium.length / candidates.length) * 1000) / 10 : 0;

  const tiles: [string, string, string][] = [
    ['Visits', visits ? visitsInRange.reduce((s, v) => s + v.count, 0).toLocaleString('en-IN') : '—', `last ${range} days`],
    ['New sign-ups', String(newUsers.length), `${newUsers.filter(u => u.role === 'candidate').length} candidates · ${newUsers.filter(u => u.role !== 'candidate').length} institution staff`],
    ['Premium candidates', String(premium.length), `${conversion}% of ${candidates.length} candidates`],
    ['Subscribed institutions', String(subscribed.length), `of ${institutes.length} listed`],
    ['Revenue', inr(revenue), `${paid.filter(p => isoDay(p.paidAt) >= since).length} online payments, last ${range} days`],
    ['Renewals due', String(renewals.length), 'in the next 30 days'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-brand-700" /> Growth and revenue</h3>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs" role="tablist" aria-label="Period">
          {([30, 90, 365] as Range[]).map(r => <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={`px-3 py-2 font-semibold ${range === r ? 'bg-brand-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{r === 365 ? '12 months' : `${r} days`}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(([l, v, sub]) => (
          <div key={l} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{v}</div>
            <div className="text-xs text-slate-500 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {visits && <MiniBarChart title="Visits" data={series(visits, v => v.date, range, v => v.count)} />}
        <MiniBarChart title="New sign-ups" data={series(users, u => u.createdAt, range)} />
        <MiniBarChart title="Revenue (after refunds)" data={series(paid, p => p.paidAt, range, p => p.amount - (p.refundedAmount || 0))} format={inr} color="bg-gold-500" />
        <MiniBarChart title="Applications submitted" data={series(apps, a => a.appliedDate, range)} />
      </div>

      <section className="space-y-2">
        <h4 className="font-semibold text-slate-900">Renewals due in the next 30 days</h4>
        {renewals.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs text-slate-600"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Ends</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {renewals.map(r => <tr key={r.kind + r.name + r.until}><td className="px-4 py-3 text-slate-600">{r.kind}</td><td className="px-4 py-3 font-medium text-slate-900">{r.name}</td><td className="px-4 py-3 text-slate-600">{r.contact}</td><td className={`px-4 py-3 tabular-nums ${r.until < today ? 'text-crimson-700' : 'text-slate-900'}`}>{r.until}{r.until < today ? ' (ended)' : ''}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">Members receive automatic renewal reminder emails before their plan ends.</p>
      </section>
    </div>
  );
}
