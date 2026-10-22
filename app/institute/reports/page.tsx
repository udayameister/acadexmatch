'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import type { Application, ApplicationStage, Job } from '@/types';
import { Download, BarChart3 } from 'lucide-react';

const FUNNEL: { key: ApplicationStage; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screened' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_scheduled', label: 'Interviewed' },
  { key: 'committee_review', label: 'Committee review' },
  { key: 'offer', label: 'Offer' },
  { key: 'joined', label: 'Joined' },
];
const ORDER = FUNNEL.map(f => f.key);

/** "21/10/2026, 3:00:50 pm" (IST) or ISO → epoch ms. */
function parseIst(ts: string | undefined): number | null {
  if (!ts) return null;
  const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
}
const dayMs = 86400000;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/** Furthest stage an application reached (not-selected applications keep their last real stage). */
function reached(a: Application): number {
  let best = Math.max(0, ORDER.indexOf(a.status));
  for (const h of a.stageHistory || []) best = Math.max(best, ORDER.indexOf(h.stage));
  return best;
}

function firstTime(a: Application, stage: ApplicationStage): number | null {
  const h = (a.stageHistory || []).find(x => x.stage === stage);
  return h ? parseIst(h.timestamp) : null;
}

export default function HiringReportsPage() {
  const inst = useStorageValue(() => StorageService.getCurrentInstitute(), undefined);
  const jobsAll = useStorageValue<Job[]>(() => StorageService.getJobs().filter(j => j.instituteId === StorageService.getCurrentInstitute()?.id), []);
  const appsAll = useStorageValue<Application[]>(() => StorageService.getApplications(), []);
  const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('365');
  const [jobId, setJobId] = useState('all');

  const { jobs, apps } = useMemo(() => {
    const since = range === 'all' ? 0 : Date.now() - Number(range) * dayMs;
    const jobs = jobsAll.filter(j => (jobId === 'all' || j.id === jobId) && (Date.parse(j.postedAt) || 0) >= since);
    const ids = new Set(jobs.map(j => j.id));
    return { jobs, apps: appsAll.filter(a => ids.has(a.jobId)) };
  }, [jobsAll, appsAll, range, jobId]);

  const stats = useMemo(() => {
    const funnel = FUNNEL.map((f, i) => ({ ...f, count: apps.filter(a => reached(a) >= i).length }));
    const jobPosted = new Map(jobs.map(j => [j.id, Date.parse(j.postedAt)]));
    const toOffer = apps.map(a => { const t = firstTime(a, 'offer'); const p = jobPosted.get(a.jobId); return t && p ? Math.max(0, Math.round((t - p) / dayMs)) : null; }).filter((x): x is number => x !== null);
    const toFirstAction = apps.map(a => { const applied = parseIst(a.stageHistory?.[0]?.timestamp) ?? Date.parse(a.appliedDate); const next = parseIst(a.stageHistory?.[1]?.timestamp); return next && applied ? Math.max(0, Math.round((next - applied) / dayMs)) : null; }).filter((x): x is number => x !== null);
    const profiles = apps.map(a => StorageService.getCandidateProfileByUserId(a.candidateId)).filter(Boolean);
    const offers = apps.filter(a => a.offerDetails?.offerLetterGenerated);
    return {
      funnel,
      open: jobs.filter(j => j.status === 'published').length,
      closed: jobs.filter(j => j.status === 'closed').length,
      perVacancy: jobs.length ? Math.round((apps.length / jobs.length) * 10) / 10 : 0,
      offers: offers.length,
      accepted: offers.filter(a => a.offerDetails?.response === 'accepted').length,
      joined: apps.filter(a => a.status === 'joined').length,
      daysToOffer: median(toOffer),
      daysToFirstAction: median(toFirstAction),
      phdPct: profiles.length ? Math.round((profiles.filter(p => p!.phdStatus?.isCompleted).length / profiles.length) * 100) : null,
      netPct: profiles.length ? Math.round((profiles.filter(p => p!.netSletStatus?.isQualified).length / profiles.length) * 100) : null,
      avgApi: profiles.length ? Math.round(profiles.reduce((s, p) => s + (p!.apiScore || 0), 0) / profiles.length) : null,
      avgMatch: apps.length ? Math.round(apps.reduce((s, a) => s + a.matchScore, 0) / apps.length) : null,
    };
  }, [jobs, apps]);

  const perJob = useMemo(() => jobs.map(j => {
    const ja = apps.filter(a => a.jobId === j.id);
    const at = (i: number) => ja.filter(a => reached(a) >= i).length;
    const posted = Date.parse(j.postedAt);
    const firstOffer = ja.map(a => firstTime(a, 'offer')).filter((x): x is number => x !== null).sort((a, b) => a - b)[0];
    return {
      job: j, applicants: ja.length, shortlisted: at(3), interviewed: at(4), offers: ja.filter(a => a.offerDetails?.offerLetterGenerated).length,
      joined: ja.filter(a => a.status === 'joined').length, avgMatch: ja.length ? Math.round(ja.reduce((s, a) => s + a.matchScore, 0) / ja.length) : null,
      daysToOffer: firstOffer && posted ? Math.round((firstOffer - posted) / dayMs) : null,
    };
  }).sort((a, b) => b.applicants - a.applicants), [jobs, apps]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Vacancy', 'Advertisement no.', 'Reservation', 'Posted', 'Last date', 'Status', 'Applicants', 'Shortlisted', 'Interviewed', 'Offers', 'Joined', 'Average match %', 'Days to first offer'];
    const rows = perJob.map(r => [r.job.title, r.job.advertisementNumber, r.job.reservationCategory, r.job.postedAt, r.job.applicationDeadline, r.job.status, r.applicants, r.shortlisted, r.interviewed, r.offers, r.joined, r.avgMatch, r.daysToOffer].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `hiring-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!inst) return null;
  const top = Math.max(1, stats.funnel[0]?.count || 1);
  const tiles: [string, string, string?][] = [
    ['Vacancies', String(jobs.length), `${stats.open} open · ${stats.closed} closed`],
    ['Applications', String(apps.length), `${stats.perVacancy} per vacancy`],
    ['Offers issued', String(stats.offers), `${stats.accepted} accepted · ${stats.joined} joined`],
    ['Median days to first offer', stats.daysToOffer === null ? '—' : String(stats.daysToOffer), 'from posting the vacancy'],
    ['Median days to first response', stats.daysToFirstAction === null ? '—' : String(stats.daysToFirstAction), 'from application to first stage change'],
    ['Applicant profile', stats.avgApi === null ? '—' : `API ${stats.avgApi}`, stats.phdPct === null ? '' : `${stats.phdPct}% Ph.D. · ${stats.netPct}% NET/SLET · ${stats.avgMatch}% avg match`],
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="pb-6 border-b border-slate-200">
        <Link href="/institute/dashboard" className="text-xs text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 flex items-center gap-3"><BarChart3 className="w-8 h-8 text-brand-700" /> Hiring reports</h1>
        <p className="text-slate-600 text-sm mt-1">How your vacancies are performing, for planning and for NAAC / NBA documentation.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="text-xs font-semibold text-slate-700">Vacancies posted</span>
          <select className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm" value={range} onChange={e => setRange(e.target.value as typeof range)}>
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option>
          </select>
        </label>
        <label className="block min-w-[16rem]"><span className="text-xs font-semibold text-slate-700">Vacancy</span>
          <select className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm" value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="all">All vacancies</option>{jobsAll.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </label>
        <button className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={exportCsv} disabled={!perJob.length}><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
            {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
          </div>
        ))}
      </div>

      <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm" aria-labelledby="funnel-title">
        <h2 id="funnel-title" className="font-bold text-slate-900">Selection funnel</h2>
        <p className="text-xs text-slate-500 mt-0.5">Applications that reached each stage. Applicants not selected count at the furthest stage they reached.</p>
        <div className="mt-4 space-y-2" role="table" aria-label="Applications reaching each stage">
          {stats.funnel.map(f => (
            <div key={f.key} role="row" className="group grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${f.label}: ${f.count} (${Math.round((f.count / top) * 100)}% of applications)`}>
              <span role="cell" className="text-slate-700">{f.label}</span>
              <div role="cell" className="h-6 rounded-md bg-slate-100 overflow-hidden">
                <div className="h-full rounded-r-[4px] bg-brand-900 group-hover:bg-brand-700 transition-colors" style={{ width: `${(f.count / top) * 100}%`, minWidth: f.count ? 4 : 0 }} />
              </div>
              <span role="cell" className="text-right tabular-nums text-slate-900 font-semibold">{f.count}<span className="text-xs text-slate-500 font-normal"> · {Math.round((f.count / top) * 100)}%</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-slate-900">By vacancy</h2>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs text-slate-600">
              <tr><th className="px-4 py-3">Vacancy</th><th className="px-4 py-3">Reservation</th><th className="px-4 py-3">Applicants</th><th className="px-4 py-3">Shortlisted</th><th className="px-4 py-3">Interviewed</th><th className="px-4 py-3">Offers</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Avg match</th><th className="px-4 py-3">Days to offer</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perJob.map(r => (
                <tr key={r.job.id}>
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.job.title}</div><div className="text-xs text-slate-500">Posted {r.job.postedAt} · {r.job.status}</div></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{r.job.reservationCategory || '—'}</td>
                  {[r.applicants, r.shortlisted, r.interviewed, r.offers, r.joined].map((v, i) => <td key={i} className="px-4 py-3 tabular-nums">{v}</td>)}
                  <td className="px-4 py-3 tabular-nums">{r.avgMatch === null ? '—' : `${r.avgMatch}%`}</td>
                  <td className="px-4 py-3 tabular-nums">{r.daysToOffer ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {perJob.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No vacancies in this period.</p>}
        </div>
      </section>
    </div>
  );
}
