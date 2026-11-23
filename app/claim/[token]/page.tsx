'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, BadgeCheck, Briefcase, CalendarDays, CheckCircle2, Filter, Inbox, Loader2, ShieldCheck } from 'lucide-react';

interface Info { college: string; city: string | null; state: string | null; claimed: boolean; jobs: { id: string; title: string; deadline: string | null; department: string | null }[] }

const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Landing page of a "claim your listing" email: the college's live vacancies and a free institution sign-up. */
export default function ClaimPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let first = true;
    try { const k = `acx_claim_${token}`; first = !sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch { /* storage blocked */ }
    fetch(`/api/claim/${encodeURIComponent(token)}${first ? '?visit=1' : ''}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link is not valid any more.'); setInfo(d); })
      .catch(e => setError((e as Error).message));
  }, [token]);

  if (error) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="font-serif text-2xl font-bold text-slate-900">This link has expired</h1>
      <p className="text-slate-600">{error} The vacancies may have closed. You can still register your institution free.</p>
      <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 text-white font-semibold">Register your institution <ArrowRight className="w-4 h-4" /></Link>
    </div>
  );
  if (!info) return <div className="max-w-xl mx-auto px-4 py-24 flex justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const n = info.jobs.length;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">For {info.college}</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
          {info.claimed ? 'These vacancies are already linked to your institution' : `Your ${n === 1 ? 'vacancy is' : `${n} vacancies are`} already live on AcadeXMatch`}
        </h1>
        <p className="text-slate-600 text-lg">{info.claimed ? 'Sign in to see applications.' : 'Register your institution free and receive applications directly, already checked against UGC / AICTE norms.'}</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white divide-y divide-slate-100">
        {info.jobs.map(j => (
          <Link key={j.id} href={`/jobs/${encodeURIComponent(j.id)}`} target="_blank" className="flex items-start gap-3 p-4 sm:p-5 hover:bg-slate-50">
            <Briefcase className="w-5 h-5 text-brand-700 mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{j.title}</span>
              <span className="block text-sm text-slate-500">{[j.department, info.city, info.state].filter(Boolean).join(' · ')}</span>
            </span>
            {j.deadline && <span className="text-xs text-slate-500 inline-flex items-center gap-1 shrink-0"><CalendarDays className="w-3.5 h-3.5" />{date(j.deadline)}</span>}
          </Link>
        ))}
      </section>

      {!info.claimed && (
        <>
          <ul className="grid sm:grid-cols-3 gap-3 text-sm">
            {[
              [Inbox, 'Applications to you', 'Candidates apply on AcadeXMatch with their profile, documents and API score — no inbox of loose CVs.'],
              [Filter, 'Eligibility already checked', 'NET / SET / Ph.D., experience and publications compared with UGC / AICTE norms for each post.'],
              [ShieldCheck, 'Free until 3 Nov 2027', 'All institution tools are free for verified institutions during the launch offer.'],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Inbox;
              return (
                <li key={t as string} className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <I className="w-5 h-5 text-brand-700" />
                  <p className="font-semibold text-slate-900 mt-2">{t as string}</p>
                  <p className="text-slate-600 mt-1">{d as string}</p>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Link href={`/register?claim=${encodeURIComponent(token)}`} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold">
              <BadgeCheck className="w-5 h-5" /> Register free and claim {n === 1 ? 'this vacancy' : 'these vacancies'} <ArrowRight className="w-4 h-4" />
            </Link>
            <span className="text-sm text-slate-500">Takes about two minutes. Already registered? <Link href="/login" className="font-semibold text-brand-800 underline">Sign in</Link> and write to info@acadexmatch.com to link them.</span>
          </div>
          <p className="text-xs text-slate-500 flex gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> We check every institution account before moving vacancies to it, so only your college can claim them.</p>
        </>
      )}
    </div>
  );
}
