'use client';

import VerifiedBadge from '@/components/VerifiedBadge';
import React, { useMemo, useState } from 'react';
import { StorageService } from '@/lib/storage';
import { useSelection, BulkBar } from '@/components/Selection';
import type { Application, ApplicationStage, CandidateProfile } from '@/types';
import { Download, Trophy, CalendarPlus } from 'lucide-react';

export const STAGE_OPTIONS: { key: ApplicationStage; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'committee_review', label: 'Committee review' },
  { key: 'offer', label: 'Offer extended' },
  { key: 'joined', label: 'Joined' },
  { key: 'rejected', label: 'Not selected' },
];

type SortKey = 'match' | 'api' | 'pubs' | 'committee' | 'applied_new' | 'applied_old';

const bulkBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition';
const bulkSelect = 'px-2 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold border border-white/20 [&>option]:text-slate-900';
const ctl = 'px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-brand-500';

export interface ApplicantRow {
  app: Application;
  api: number | null;
  pubs: number;
  phd: boolean;
  net: boolean;
  committee: number | null;
  reviews: number;
  verified: CandidateProfile['documentsVerified'];
}

export function buildRows(apps: Application[]): ApplicantRow[] {
  return apps.map(app => {
    const p = StorageService.getCandidateProfileByUserId(app.candidateId);
    const scores = app.reviewerScores || [];
    return {
      app,
      api: p ? p.apiScore : null,
      pubs: p ? p.publications.filter(x => x.ugcCareListed || x.scopusIndexed || x.sciScieIndexed).length : 0,
      phd: !!p?.phdStatus?.isCompleted,
      net: !!p?.netSletStatus?.isQualified,
      committee: scores.length ? Math.round((scores.reduce((s, r) => s + r.totalScore, 0) / scores.length) * 10) / 10 : null,
      reviews: scores.length,
      verified: p?.documentsVerified || null,
    };
  });
}

function csv(rows: ApplicantRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Candidate', 'Email', 'Phone', 'Vacancy', 'Stage', 'Match %', 'API score', 'Indexed papers', 'Ph.D.', 'NET/SLET', 'Committee average', 'Reviews', 'Applied'];
  const body = rows.map(r => [r.app.candidateName, r.app.candidateEmail, r.app.candidatePhone, r.app.jobTitle, STAGE_OPTIONS.find(s => s.key === r.app.status)?.label, r.app.matchScore, r.api ?? '', r.pubs, r.phd ? 'Yes' : 'No', r.net ? 'Yes' : 'No', r.committee ?? '', r.reviews, r.app.appliedDate].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

export default function ApplicantListView({ apps, onOpen, onInvite }: { apps: Application[]; onOpen: (a: Application) => void; onInvite?: (ids: string[]) => void }) {
  const [jobId, setJobId] = useState('all');
  const [stage, setStage] = useState<'all' | 'active' | ApplicationStage>('active');
  const [needPhd, setNeedPhd] = useState(false);
  const [needNet, setNeedNet] = useState(false);
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [minMatch, setMinMatch] = useState(0);
  const [minApi, setMinApi] = useState(0);
  const [minPubs, setMinPubs] = useState(0);
  const [sort, setSort] = useState<SortKey>('match');
  const [topN, setTopN] = useState(5);
  const [flash, setFlash] = useState<string | null>(null);

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    apps.forEach(a => m.set(a.jobId, a.jobTitle));
    return [...m.entries()];
  }, [apps]);

  const rows = useMemo(() => {
    const r = buildRows(apps).filter(x =>
      (jobId === 'all' || x.app.jobId === jobId) &&
      (stage === 'all' || (stage === 'active' ? x.app.status !== 'rejected' : x.app.status === stage)) &&
      (!needPhd || x.phd) && (!needNet || x.net) && (!onlyEligible || x.app.matchBreakdown?.meetsMandatoryNetPhd) &&
      x.app.matchScore >= minMatch && (x.api ?? 0) >= minApi && x.pubs >= minPubs);
    const by: Record<SortKey, (a: ApplicantRow, b: ApplicantRow) => number> = {
      match: (a, b) => b.app.matchScore - a.app.matchScore,
      api: (a, b) => (b.api ?? -1) - (a.api ?? -1),
      pubs: (a, b) => b.pubs - a.pubs,
      committee: (a, b) => (b.committee ?? -1) - (a.committee ?? -1),
      applied_new: (a, b) => b.app.appliedDate.localeCompare(a.app.appliedDate),
      applied_old: (a, b) => a.app.appliedDate.localeCompare(b.app.appliedDate),
    };
    return r.sort((a, b) => by[sort](a, b) || b.app.matchScore - a.app.matchScore);
  }, [apps, jobId, stage, needPhd, needNet, onlyEligible, minMatch, minApi, minPubs, sort]);

  const sel = useSelection(rows.map(r => r.app.id));
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const move = (to: ApplicationStage) => {
    const ids = sel.ids;
    if (to === 'rejected' && !confirm(`Mark ${ids.length} applicant${ids.length === 1 ? '' : 's'} as not selected?`)) return;
    ids.forEach(id => StorageService.updateApplicationStage(id, to, 'Updated in bulk from the applicant list'));
    sel.clear();
    say(`${ids.length} applicant${ids.length === 1 ? '' : 's'} moved to ${STAGE_OPTIONS.find(s => s.key === to)?.label}.`);
  };

  const pickTop = () => {
    const ids = rows.slice(0, Math.max(1, topN)).map(r => r.app.id);
    sel.clear();
    ids.forEach(id => sel.toggle(id));
  };

  const exportCsv = () => {
    const blob = new Blob([csv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `applicants-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {flash && <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-brand-950 text-white text-sm shadow-xl" role="status">{flash}</div>}

      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-end gap-3 text-xs">
        <label className="space-y-1 w-56"><span className="block font-semibold text-slate-600">Vacancy</span>
          <select className={`${ctl} w-full`} value={jobId} onChange={e => setJobId(e.target.value)}><option value="all">All vacancies</option>{jobs.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
        </label>
        <label className="space-y-1 w-44"><span className="block font-semibold text-slate-600">Stage</span>
          <select className={`${ctl} w-full`} value={stage} onChange={e => setStage(e.target.value as typeof stage)}>
            <option value="active">All active</option><option value="all">All, including not selected</option>
            {STAGE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block font-semibold text-slate-600">Min. match %</span><input type="number" min={0} max={100} className={`${ctl} w-20`} value={minMatch} onChange={e => setMinMatch(Number(e.target.value) || 0)} /></label>
        <label className="space-y-1"><span className="block font-semibold text-slate-600">Min. API</span><input type="number" min={0} max={100} className={`${ctl} w-20`} value={minApi} onChange={e => setMinApi(Number(e.target.value) || 0)} /></label>
        <label className="space-y-1"><span className="block font-semibold text-slate-600">Min. indexed papers</span><input type="number" min={0} className={`${ctl} w-20`} value={minPubs} onChange={e => setMinPubs(Number(e.target.value) || 0)} /></label>
        <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" className="accent-brand-900" checked={needPhd} onChange={e => setNeedPhd(e.target.checked)} /> Ph.D. completed</label>
        <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" className="accent-brand-900" checked={needNet} onChange={e => setNeedNet(e.target.checked)} /> NET / SLET</label>
        <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" className="accent-brand-900" checked={onlyEligible} onChange={e => setOnlyEligible(e.target.checked)} /> Meets mandatory criteria</label>
        <label className="space-y-1 ml-auto"><span className="block font-semibold text-slate-600">Sort by</span>
          <select className={ctl} value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="match">Match score</option><option value="api">API score</option><option value="pubs">Indexed papers</option>
            <option value="committee">Committee average</option><option value="applied_new">Newest applications</option><option value="applied_old">Oldest applications</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-600">{rows.length} applicant{rows.length === 1 ? '' : 's'} shown.</span>
        <span className="text-slate-400">|</span>
        <label className="flex items-center gap-1.5 text-slate-700">Select top <input type="number" min={1} max={500} className={`${ctl} w-16 py-1`} value={topN} onChange={e => setTopN(Math.max(1, Number(e.target.value) || 1))} /></label>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50" onClick={pickTop} disabled={!rows.length}><Trophy className="w-3.5 h-3.5 text-gold-600" /> Select</button>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 ml-auto" onClick={exportCsv} disabled={!rows.length}><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      <BulkBar sel={sel} noun="applicant">
        <button className={bulkBtn} onClick={() => move('shortlisted')}>Shortlist</button>
        <select className={bulkSelect} aria-label="Move to stage" value="" onChange={e => { if (e.target.value) move(e.target.value as ApplicationStage); }}>
          <option value="">Move to stage…</option>
          {STAGE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {onInvite && <button className={bulkBtn} onClick={() => { onInvite(sel.ids); sel.clear(); }}><CalendarPlus className="w-3.5 h-3.5" /> Invite to book an interview slot</button>}
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white text-xs font-semibold" onClick={() => move('rejected')}>Not selected</button>
      </BulkBar>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs text-slate-600">
            <tr>
              <th className="pl-4 pr-1 py-3 w-8"><input type="checkbox" className="w-4 h-4 accent-brand-900" aria-label="Select all shown" checked={sel.allOn} onChange={sel.toggleAll} /></th>
              <th className="px-3 py-3">#</th><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Vacancy</th>
              <th className="px-3 py-3">Match</th><th className="px-3 py-3">API</th><th className="px-3 py-3">Papers</th><th className="px-3 py-3">Ph.D. / NET</th>
              <th className="px-3 py-3">Committee</th><th className="px-3 py-3">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.app.id} className={sel.has(r.app.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
                <td className="pl-4 pr-1 py-3"><input type="checkbox" className="w-4 h-4 accent-brand-900" aria-label={`Select ${r.app.candidateName}`} checked={sel.has(r.app.id)} onChange={() => sel.toggle(r.app.id)} /></td>
                <td className="px-3 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-3"><button className="font-medium text-slate-900 hover:text-brand-800 text-left" onClick={() => onOpen(r.app)}>{r.app.candidateName}</button>{r.verified && <span className="ml-1.5 align-middle"><VerifiedBadge verified={r.verified} compact /></span>}<div className="text-xs text-slate-500">{r.app.currentDesignation || r.app.highestDegree || '—'}</div></td>
                <td className="px-3 py-3 text-slate-600 max-w-[14rem]"><span className="line-clamp-2">{r.app.jobTitle}</span></td>
                <td className="px-3 py-3"><span className={`font-semibold ${r.app.matchBreakdown?.meetsMandatoryNetPhd ? 'text-emerald-700' : 'text-crimson-700'}`}>{r.app.matchScore}%</span></td>
                <td className="px-3 py-3 tabular-nums">{r.api ?? '—'}</td>
                <td className="px-3 py-3 tabular-nums">{r.pubs}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap"><span className={r.phd ? 'text-emerald-700' : 'text-slate-400'}>{r.phd ? 'Ph.D. ✓' : 'Ph.D. –'}</span> · <span className={r.net ? 'text-emerald-700' : 'text-slate-400'}>{r.net ? 'NET ✓' : 'NET –'}</span></td>
                <td className="px-3 py-3 tabular-nums">{r.committee === null ? '—' : <>{r.committee}<span className="text-xs text-slate-500"> /100 ({r.reviews})</span></>}</td>
                <td className="px-3 py-3">
                  <select aria-label={`Stage of ${r.app.candidateName}`} className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1" value={r.app.status} onChange={e => StorageService.updateApplicationStage(r.app.id, e.target.value as ApplicationStage)}>
                    {STAGE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No applicants match these filters.</p>}
      </div>
    </div>
  );
}
