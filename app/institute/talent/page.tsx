'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import type { Job, TalentInvite } from '@/types';
import { Search, Send, BadgeCheck, X, Loader2 } from 'lucide-react';

interface TalentResult {
  candidateId: string; name: string; designation: string | null; institute: string | null; highestDegree: string | null;
  city: string | null; state: string | null; researchInterests: string[]; phd: boolean; net: boolean; apiScore: number;
  indexedPublications: number; publications: number; academicExperienceYears: number; verified: boolean;
  invitedFor: string[]; appliedFor: string[];
}

const field = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const STATUS_LABEL: Record<TalentInvite['status'], string> = { sent: 'Sent', interested: 'Interested', declined: 'Not now', applied: 'Applied' };

export default function TalentSearchPage() {
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs().filter(j => j.instituteId === StorageService.getCurrentInstitute()?.id && j.status === 'published'), []);
  const invites = useStorageValue<TalentInvite[]>(() => StorageService.getTalentInvites(), []);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ minApi: 0, minExp: 0, phd: false, net: false, state: '' });
  const [results, setResults] = useState<TalentResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<TalentResult | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true); setError(null);
    const p = new URLSearchParams({ q, minApi: String(filters.minApi), minExp: String(filters.minExp), phd: filters.phd ? '1' : '0', net: filters.net ? '1' : '0', state: filters.state });
    try {
      const r = await fetch(`/api/talent?${p}`, { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed.');
      setResults(d.results);
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {flash && <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-brand-950 text-white text-sm shadow-xl" role="status">{flash}</div>}
      <div className="pb-6 border-b border-slate-200">
        <Link href="/institute/dashboard" className="text-xs text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2">Talent search</h1>
        <p className="text-slate-600 text-sm mt-1">Find Premium candidates who have chosen to be discoverable, and invite them to apply. Contact details and documents are shared only when a candidate applies.</p>
      </div>

      <form onSubmit={search} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <label className="block lg:col-span-2"><span className="text-xs font-semibold text-slate-700">Keywords</span>
          <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={`${field} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. machine learning, VLSI, organic chemistry" /></div>
        </label>
        <label className="block"><span className="text-xs font-semibold text-slate-700">Min. API score</span><input type="number" min={0} max={100} className={field} value={filters.minApi} onChange={e => setFilters({ ...filters, minApi: Number(e.target.value) || 0 })} /></label>
        <label className="block"><span className="text-xs font-semibold text-slate-700">Min. academic experience (yrs)</span><input type="number" min={0} className={field} value={filters.minExp} onChange={e => setFilters({ ...filters, minExp: Number(e.target.value) || 0 })} /></label>
        <label className="block"><span className="text-xs font-semibold text-slate-700">State</span><input className={field} value={filters.state} onChange={e => setFilters({ ...filters, state: e.target.value })} placeholder="Any" /></label>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-900" checked={filters.phd} onChange={e => setFilters({ ...filters, phd: e.target.checked })} /> Ph.D. completed</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-900" checked={filters.net} onChange={e => setFilters({ ...filters, net: e.target.checked })} /> NET / SLET</label>
        </div>
        <button type="submit" className="lg:col-span-6 justify-self-start px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search</button>
      </form>

      {error && <p className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700" role="alert">{error}</p>}

      {results && (
        <section className="space-y-3">
          <h2 className="font-bold text-slate-900">{results.length} candidate{results.length === 1 ? '' : 's'}</h2>
          {results.length === 0 && <p className="text-sm text-slate-500">No discoverable candidates match. Try fewer filters.</p>}
          <ul className="grid md:grid-cols-2 gap-4">
            {results.map(r => (
              <li key={r.candidateId} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">{r.name}{r.verified && <BadgeCheck className="w-4 h-4 text-emerald-600" aria-label="Documents verified" />}</div>
                    <div className="text-xs text-slate-600">{[r.designation, r.institute].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="text-xs text-slate-500">{[r.highestDegree, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-right shrink-0"><div className="text-2xl font-bold text-brand-900">{r.apiScore}</div><div className="text-[10px] text-slate-500">API score</div></div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {r.phd && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">Ph.D.</span>}
                  {r.net && <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-100">NET / SLET</span>}
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{r.indexedPublications} indexed of {r.publications} papers</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{r.academicExperienceYears} yrs academic</span>
                </div>
                {r.researchInterests.length > 0 && <p className="text-xs text-slate-600"><strong className="text-slate-800">Research: </strong>{r.researchInterests.join(', ')}</p>}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500">{r.appliedFor.length ? `Applied for ${r.appliedFor.length} of your vacancies` : r.invitedFor.length ? `Invited for ${r.invitedFor.length}` : ''}</span>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold disabled:opacity-50" disabled={!jobs.length} onClick={() => setInviting(r)}><Send className="w-3.5 h-3.5" /> Invite to apply</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-slate-900">Invitations sent ({invites.length})</h2>
        {invites.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs text-slate-600"><tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Vacancy</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map(i => (
                  <tr key={i.id}><td className="px-4 py-3 font-medium text-slate-900">{i.candidateName}</td><td className="px-4 py-3 text-slate-600">{i.jobTitle}</td><td className="px-4 py-3 text-slate-500 whitespace-nowrap">{i.sentAt}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${i.status === 'applied' ? 'bg-emerald-50 text-emerald-800' : i.status === 'interested' ? 'bg-gold-50 text-gold-800' : i.status === 'declined' ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-800'}`}>{STATUS_LABEL[i.status]}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inviting && <InviteModal candidate={inviting} jobs={jobs.filter(j => !inviting.invitedFor.includes(j.id) && !inviting.appliedFor.includes(j.id))} onClose={() => setInviting(null)} onDone={m => { setInviting(null); setFlash(m); setTimeout(() => setFlash(null), 4000); search(); }} />}
    </div>
  );
}

function InviteModal({ candidate, jobs, onClose, onDone }: { candidate: TalentResult; jobs: Job[]; onClose: () => void; onDone: (m: string) => void }) {
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const [message, setMessage] = useState(`Dear ${candidate.name},\n\nWe came across your profile on AcadeXMatch and believe your work would be a strong fit for this position. We would be glad to receive your application.`);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await StorageService.sendTalentInvite(candidate.candidateId, jobId, message);
    setBusy(false);
    if (r.success) onDone(`Invitation sent to ${candidate.name}.`); else setErr(r.error || 'Could not send.');
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Invite to apply">
      <form onSubmit={send} className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><h3 className="font-bold text-slate-900">Invite {candidate.name}</h3><button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
        <div className="p-5 space-y-3">
          {jobs.length === 0 ? <p className="text-sm text-slate-600">This candidate has already been invited to (or applied for) all your published vacancies.</p> : (
            <>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Vacancy</span><select className={field} value={jobId} onChange={e => setJobId(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Message</span><textarea rows={6} maxLength={1000} className={field} value={message} onChange={e => setMessage(e.target.value)} /></label>
            </>
          )}
          {err && <p className="text-sm text-crimson-700" role="alert">{err}</p>}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm">Cancel</button>
          <button type="submit" disabled={busy || !jobs.length} className="px-4 py-2 rounded-lg bg-brand-900 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Sending…' : 'Send invitation'}</button>
        </div>
      </form>
    </div>
  );
}
