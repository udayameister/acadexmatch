'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import OfferModal from '@/components/OfferModal';
import type { Application, Job, ReviewerScoreItem } from '@/types';
import { Download, Trophy, FileSignature } from 'lucide-react';

const RECS: ReviewerScoreItem['recommendation'][] = ['Strongly Recommend', 'Recommend', 'Reserve / Waitlist', 'Not Recommended'];
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

interface Ranked {
  app: Application; total: number; research: number; teaching: number; api: number; interview: number; reviews: number;
  recs: Record<string, number>; apiScore: number | null;
}

export default function SelectionResultsPage() {
  const inst = useStorageValue(() => StorageService.getCurrentInstitute(), undefined);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs().filter(j => j.instituteId === StorageService.getCurrentInstitute()?.id), []);
  const apps = useStorageValue<Application[]>(() => StorageService.getApplications(), []);
  const [jobId, setJobId] = useState('');
  const [offerFor, setOfferFor] = useState<Application | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const withReviews = (jid: string) => apps.filter(a => a.jobId === jid && a.reviewerScores?.length);
  const activeJobId = jobId || jobs.find(j => withReviews(j.id).length)?.id || jobs[0]?.id || '';

  const ranked: Ranked[] = useMemo(() => apps.filter(a => a.jobId === activeJobId && a.reviewerScores?.length).map(a => {
    const s = a.reviewerScores;
    const recs: Record<string, number> = {};
    s.forEach(r => { recs[r.recommendation] = (recs[r.recommendation] || 0) + 1; });
    return {
      app: a, total: avg(s.map(r => r.totalScore)), research: avg(s.map(r => r.researchPotentialScore)), teaching: avg(s.map(r => r.teachingPedagogyScore)),
      api: avg(s.map(r => r.apiScoreValidation)), interview: avg(s.map(r => r.interviewPerformance)), reviews: s.length, recs,
      apiScore: StorageService.getCandidateProfileByUserId(a.candidateId)?.apiScore ?? null,
    };
  }).sort((x, y) => y.total - x.total || (y.apiScore ?? 0) - (x.apiScore ?? 0)), [apps, activeJobId]);

  const awaiting = apps.filter(a => a.jobId === activeJobId && !a.reviewerScores?.length && ['interview_scheduled', 'committee_review'].includes(a.status)).length;
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 4000); };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Rank', 'Candidate', 'Email', 'Average total /100', 'Research /30', 'Teaching /25', 'API validation /20', 'Interview /25', 'Reviews', ...RECS, 'Stage', 'Offer'];
    const rows = ranked.map((r, i) => [i + 1, r.app.candidateName, r.app.candidateEmail, r.total, r.research, r.teaching, r.api, r.interview, r.reviews, ...RECS.map(k => r.recs[k] || 0), r.app.status, r.app.offerDetails?.letterNumber || ''].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `selection-results-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!inst) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {flash && <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-brand-950 text-white text-sm shadow-xl" role="status">{flash}</div>}
      <div className="pb-6 border-b border-slate-200">
        <Link href="/institute/dashboard" className="text-xs text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 flex items-center gap-3"><Trophy className="w-8 h-8 text-gold-500" /> Selection results</h1>
        <p className="text-slate-600 text-sm mt-1">Combined ranking from all committee members’ scores, then offers of appointment. Members score from the applicant pipeline (“Score”).</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[18rem]"><span className="text-xs font-semibold text-slate-700">Vacancy</span>
          <select className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm" value={activeJobId} onChange={e => setJobId(e.target.value)}>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title} ({withReviews(j.id).length} scored)</option>)}
          </select>
        </label>
        {awaiting > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-gold-50 text-gold-800 border border-gold-200">{awaiting} interviewed applicant{awaiting === 1 ? '' : 's'} not scored yet</span>}
        <button className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={exportCsv} disabled={!ranked.length}><Download className="w-3.5 h-3.5" /> Export CSV</button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs text-slate-600">
            <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Average /100</th><th className="px-4 py-3">Research /30</th><th className="px-4 py-3">Teaching /25</th><th className="px-4 py-3">API /20</th><th className="px-4 py-3">Interview /25</th><th className="px-4 py-3">Recommendations</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ranked.map((r, i) => (
              <tr key={r.app.id} className={i === 0 ? 'bg-gold-50/50' : ''}>
                <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.app.candidateName}</div><div className="text-xs text-slate-500">{r.reviews} review{r.reviews === 1 ? '' : 's'}{r.apiScore !== null ? ` · API ${r.apiScore}` : ''} · {r.app.status.replace(/_/g, ' ')}</div></td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="font-bold tabular-nums">{r.total}</span><div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-900" style={{ width: `${r.total}%` }} /></div></div></td>
                <td className="px-4 py-3 tabular-nums">{r.research}</td><td className="px-4 py-3 tabular-nums">{r.teaching}</td><td className="px-4 py-3 tabular-nums">{r.api}</td><td className="px-4 py-3 tabular-nums">{r.interview}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{RECS.filter(k => r.recs[k]).map(k => `${r.recs[k]}× ${k}`).join(' · ') || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 whitespace-nowrap">
                    {r.app.offerDetails?.offerLetterGenerated ? (
                      <>
                        <Link href={`/offer/${r.app.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold"><FileSignature className="w-3.5 h-3.5" /> Letter</Link>
                        {r.app.offerDetails.response && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.app.offerDetails.response === 'accepted' ? 'bg-emerald-50 text-emerald-800' : 'bg-crimson-50 text-crimson-700'}`}>{r.app.offerDetails.response}</span>}
                        {r.app.offerDetails.response === 'accepted' && r.app.status !== 'joined' && <button className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold" onClick={() => { StorageService.updateApplicationStage(r.app.id, 'joined', 'Candidate joined'); say(`${r.app.candidateName} marked as joined.`); }}>Mark joined</button>}
                        <button className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs" onClick={() => setOfferFor(r.app)}>Revise</button>
                      </>
                    ) : r.app.status !== 'rejected' ? (
                      <>
                        <button className="px-2.5 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold" onClick={() => setOfferFor(r.app)}>Issue offer</button>
                        <button className="px-2.5 py-1.5 rounded-lg bg-white border border-crimson-100 text-crimson-700 text-xs" onClick={() => { if (confirm(`Mark ${r.app.candidateName} as not selected?`)) StorageService.updateApplicationStage(r.app.id, 'rejected', 'Not selected after committee review'); }}>Not selected</button>
                      </>
                    ) : <span className="text-xs text-slate-500">Not selected</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranked.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No committee scores for this vacancy yet. Score applicants from the applicant pipeline after their interview.</p>}
      </div>
      {offerFor && <OfferModal app={offerFor} onClose={() => setOfferFor(null)} onDone={say} />}
    </div>
  );
}
