'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  MapPin, IndianRupee, CalendarDays, GraduationCap, CheckCircle2, AlertCircle, Sparkles, BookOpen, FlaskConical,
  Briefcase, CalendarClock, TrendingUp, BadgeCheck, Building2, ArrowRight, Users, ScrollText,
} from 'lucide-react';
import { StorageService, isDeadlinePassed } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { calculateMatchScore, calculateUgcApiScore, computeProfileCompleteness } from '@/lib/scoring';
import { payLabel, NOT_SPECIFIED } from '@/lib/display';
import { promotionRank } from '@/components/Promotions';
import type { Application, CandidateProfile, Institute, Job, MatchBreakdown, User } from '@/types';

/*
 * Home-page hero card, built only from real data:
 *  - a signed-in candidate with a profile sees their best-matching open vacancy, their real match
 *    breakdown, their API score and their next interview;
 *  - everyone else sees the best-documented open vacancy on the platform with its real requirements.
 * Nothing is shown when the data is missing (no sample values).
 */

const R = 34;
const CIRC = 2 * Math.PI * R;
const GENERIC_TITLE = /^(job openings?|recruitment|notification|advertisement|careers?|vacanc(y|ies))\b/i;

const has = (v: string | null | undefined) => !!v && v !== NOT_SPECIFIED;
const daysUntil = (iso: string) => Math.ceil((Date.parse(`${iso}T23:59:59+05:30`) - Date.now()) / 86400000);
const shortStage = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** How complete a vacancy's details are (used to pick the one to show). */
function detailScore(job: Job, inst: Institute | undefined): number {
  let s = 0;
  if (!GENERIC_TITLE.test(job.title.trim())) s += 4;
  if (job.designation) s += 2;
  if (job.department) s += 2;
  if (job.location.city || job.location.state) s += 1;
  if (has(payLabel(job))) s += 2;
  if (job.applicationDeadline) s += 2;
  if (job.requiredQualifications.minDegree) s += 1;
  if (inst?.verificationStatus === 'verified') s += 2;
  return s;
}

export default function HeroMatchPreview({ jobs, institutes, user }: { jobs: Job[]; institutes: Institute[]; user: User | null }) {
  const profile = useStorageValue<CandidateProfile | null>(() => StorageService.getCandidateProfile(), null);
  const apps = useStorageValue<Application[]>(() => StorageService.getApplications(), []);
  const isCandidate = user?.role === 'candidate';
  const profileReady = isCandidate && !!profile && computeProfileCompleteness(profile) >= 40;

  const open = useMemo(() => jobs.filter(j => j.status === 'published' && !isDeadlinePassed(j)), [jobs]);
  const instOf = (j: Job) => institutes.find(i => i.id === j.instituteId);

  const pick = useMemo((): { job: Job; match: MatchBreakdown | null } | null => {
    if (!open.length) return null;
    if (profileReady && profile) {
      const scored = open.map(job => ({ job, match: calculateMatchScore(profile, job) }))
        .sort((a, b) => b.match.overallScore - a.match.overallScore || detailScore(b.job, instOf(b.job)) - detailScore(a.job, instOf(a.job)));
      return scored[0];
    }
    const best = [...open].sort((a, b) =>
      detailScore(b, instOf(b)) - detailScore(a, instOf(a)) || promotionRank(b) - promotionRank(a) || b.postedAt.localeCompare(a.postedAt))[0];
    return { job: best, match: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, institutes, profileReady, profile]);

  const apiScore = profileReady && profile ? Math.round(calculateUgcApiScore(profile)) : null;
  const nextInterview = apps
    .filter(a => a.interviewSlot && a.interviewSlot.date >= new Date().toISOString().slice(0, 10) && a.status !== 'rejected')
    .sort((a, b) => a.interviewSlot!.date.localeCompare(b.interviewSlot!.date))[0];
  const verifiedCount = institutes.filter(i => i.verificationStatus === 'verified').length;

  if (!pick) {
    return (
      <div className="relative mx-auto max-w-lg">
        <div className="relative rounded-3xl bg-white border border-brand-100 shadow-2xl shadow-brand-900/15 p-8 text-center space-y-3">
          <Building2 className="w-8 h-8 text-brand-700 mx-auto" />
          <p className="font-serif text-xl font-bold text-slate-900">New vacancies are on their way</p>
          <p className="text-sm text-slate-600">{verifiedCount} verified institution{verifiedCount === 1 ? '' : 's'} on AcadeXMatch. Create a job alert to hear first.</p>
          <Link href="/candidate/alerts" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-semibold">Create a job alert <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    );
  }

  const { job, match } = pick;
  const inst = instOf(job);
  const verified = inst?.verificationStatus === 'verified';
  const naac = inst?.accreditation?.naacGrade && inst.accreditation.naacGrade !== 'Under Review' ? `NAAC ${inst.accreditation.naacGrade}` : null;
  const location = [job.location.city, job.location.state].filter(Boolean).join(', ');
  const payFull = payLabel(job);
  const pay = payFull.length > 34 ? payFull.split('(')[0].trim().slice(0, 34) : payFull;
  const entry = job.payScale.entryPay && !pay.includes('₹') ? ` · ${job.payScale.entryPay}` : '';
  const days = job.applicationDeadline ? daysUntil(job.applicationDeadline) : null;
  const myApp = apps.find(a => a.jobId === job.id);
  const q = job.requiredQualifications;
  const label = match ? 'Your best match' : promotionRank(job) >= 2 ? 'Featured vacancy' : 'Open vacancy';

  const bars = match ? [
    { label: 'Qualifications', value: match.qualificationMatch, icon: GraduationCap },
    { label: 'Research alignment', value: match.researchSynergy, icon: FlaskConical },
    { label: 'Indexed publications', value: match.ugcCarePubsFit, icon: BookOpen },
    { label: 'Experience', value: match.experienceMatch, icon: Briefcase },
  ].map(b => ({ ...b, value: Math.max(0, Math.min(100, Math.round(b.value))) })) : [];

  const requirements = [
    q.minDegree && { icon: GraduationCap, text: q.minDegree },
    q.netSletMandatory && { icon: CheckCircle2, text: 'NET / SLET / SET required' },
    (q.minExperienceYears || q.experienceText) && { icon: Briefcase, text: q.experienceText || `${q.minExperienceYears}+ years of experience` },
    q.minUgcCarePubs && { icon: BookOpen, text: `${q.minUgcCarePubs}+ UGC-CARE / Scopus publications` },
    q.ugcRegulationsYear && { icon: ScrollText, text: q.ugcRegulationsYear },
  ].filter(Boolean).slice(0, 4) as { icon: typeof GraduationCap; text: string }[];

  return (
    <div className="relative mx-auto max-w-lg">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-brand-200/60 via-white to-gold-200/70 blur-2xl opacity-80" aria-hidden="true" />

      <Link href={`/jobs/${job.id}`} className="group relative block rounded-3xl bg-white border border-brand-100 shadow-2xl shadow-brand-900/15 overflow-hidden acx-rise focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 px-6 pt-6 pb-8 text-white">
          <svg className="absolute right-0 top-0 h-full w-48 text-gold-300/20" viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle cx="170" cy="30" r="80" stroke="currentColor" strokeWidth="1" />
            <circle cx="170" cy="30" r="52" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
          </svg>
          <div className={`relative flex items-center gap-2 ${match ? 'pr-24' : ''}`}>
            <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-gold-300/40 grid place-items-center shrink-0">
              <Building2 className="w-5 h-5 text-gold-300" />
            </span>
            <div className="text-xs leading-tight min-w-0">
              <div className="font-semibold text-gold-200 tracking-wide uppercase">{label}</div>
              <div className="text-brand-100/90 truncate flex items-center gap-1">{job.instituteName}{naac ? ` · ${naac}` : ''}{verified && <BadgeCheck className="w-3.5 h-3.5 text-gold-300 shrink-0" aria-label="Verified institution" />}</div>
            </div>
          </div>
          <div className={`relative font-serif text-xl font-bold leading-snug mt-4 line-clamp-2 ${match ? 'pr-24' : ''}`}>{job.title}</div>
          {job.department && <div className={`relative text-sm text-brand-100/90 line-clamp-1 ${match ? 'pr-24' : ''}`}>{job.department}</div>}
          <div className={`relative flex flex-wrap gap-1.5 mt-3 text-xs ${match ? 'pr-24' : ''}`}>
            {location && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10"><MapPin className="w-3 h-3" /> {location}</span>}
            {has(pay) && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10"><IndianRupee className="w-3 h-3" /> {pay}{entry}</span>}
            {days !== null && days >= 0 && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold-400/25 text-gold-100"><CalendarDays className="w-3 h-3" /> {days === 0 ? 'Closes today' : `Closes in ${days} day${days === 1 ? '' : 's'}`}</span>}
            {days === null && job.deadlineText && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold-400/25 text-gold-100"><CalendarDays className="w-3 h-3" /> {job.deadlineText}</span>}
          </div>
        </div>

        {/* Real match ring (signed-in candidates only) */}
        {match && (
          <div className="absolute right-5 top-8 w-24 h-24 rounded-full bg-white shadow-lg shadow-brand-900/20 grid place-items-center">
            <svg viewBox="0 0 80 80" className="absolute inset-1.5 -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="acx-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#C6A15B" />
                  <stop offset="100%" stopColor="#800000" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r={R} stroke="#F4DEDF" strokeWidth="7" fill="none" />
              <circle cx="40" cy="40" r={R} stroke="url(#acx-ring)" strokeWidth="7" fill="none" strokeLinecap="round"
                className="acx-ring" style={{ strokeDasharray: CIRC, ['--acx-ring-end' as string]: CIRC * (1 - match.overallScore / 100) }} />
            </svg>
            <div className="relative text-center leading-none">
              <div className="font-serif text-2xl font-bold text-brand-900">{Math.round(match.overallScore)}%</div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">match</div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-6 pt-5 pb-6 space-y-5">
          {match ? (
            <>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800"><Sparkles className="w-3.5 h-3.5 text-gold-500" /> Why you match</div>
              <div className="space-y-3">
                {bars.map(({ label: l, value, icon: Icon }, i) => (
                  <div key={l}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-600"><Icon className="w-3.5 h-3.5 text-brand-500" />{l}</span>
                      <span className={`font-semibold ${value >= 80 ? 'text-brand-900' : 'text-gold-700'}`}>{value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-brand-50 overflow-hidden">
                      <div className={`h-full rounded-full acx-fill ${value >= 80 ? 'bg-gradient-to-r from-brand-700 to-brand-900' : 'bg-gradient-to-r from-gold-300 to-gold-500'}`} style={{ width: `${value}%`, animationDelay: `${0.3 + i * 0.12}s` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {match.positiveSignals.slice(0, 2).map(t => (
                  <span key={t} className="inline-flex items-start gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 font-medium"><CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" /> <span className="line-clamp-2">{t}</span></span>
                ))}
                {match.potentialGaps.slice(0, 1).map(t => (
                  <span key={t} className="inline-flex items-start gap-1 px-2.5 py-1 rounded-xl bg-gold-50 border border-gold-200 text-gold-800 font-medium"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> <span className="line-clamp-2">{t}</span></span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800"><ScrollText className="w-3.5 h-3.5 text-gold-500" /> What this vacancy asks for</div>
              {requirements.length ? (
                <ul className="space-y-2.5">
                  {requirements.map(r => (
                    <li key={r.text} className="flex items-start gap-2.5 text-sm text-slate-700"><r.icon className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" /><span className="line-clamp-2">{r.text}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600 line-clamp-3">{job.description || 'Full eligibility, pay and selection details are on the vacancy page.'}</p>
              )}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-50 border border-brand-100 text-xs text-brand-900">
                <Sparkles className="w-4 h-4 text-gold-600 shrink-0" />
                {isCandidate ? 'Complete your academic profile to see your personal match score for this vacancy.' : 'Sign up free to see how well you match — criterion by criterion.'}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              {job.applicantCount > 0
                ? <><Users className="w-3.5 h-3.5" /> {job.applicantCount} applicant{job.applicantCount === 1 ? '' : 's'}</>
                : <>Posted {new Date(job.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-900 group-hover:bg-brand-800 text-white text-xs font-semibold shadow-sm whitespace-nowrap">
              View vacancy <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>

      {/* Floating cards — only when there is real data for them */}
      {apiScore !== null && (
        <div className={`hidden sm:flex absolute -top-7 ${myApp ? '-right-8' : 'left-6'} items-center gap-3 rounded-2xl bg-brand-950 text-white shadow-xl shadow-brand-900/30 px-4 py-3 acx-float`}>
          <span className="w-8 h-8 rounded-lg bg-gold-400/20 grid place-items-center"><TrendingUp className="w-4 h-4 text-gold-300" /></span>
          <div className="leading-tight">
            <div className="text-[12px] uppercase tracking-wider text-brand-200">Your API score</div>
            <div className="text-sm font-bold">{apiScore}</div>
          </div>
        </div>
      )}

      {myApp && (
        <div className="hidden sm:flex absolute -top-4 left-8 items-center gap-2 rounded-full bg-white border border-gold-200 shadow-lg px-3 py-1.5 acx-float" style={{ animationDelay: '0.8s' }}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-slate-800">{shortStage(myApp.status)}</span>
        </div>
      )}

      {nextInterview?.interviewSlot ? (
        <div className="hidden sm:flex absolute -bottom-14 -left-10 items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-xl px-4 py-3 acx-float" style={{ animationDelay: '1.5s' }}>
          <span className="relative w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
            <CalendarClock className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white acx-ping" />
          </span>
          <div>
            <div className="text-xs font-semibold text-slate-900">Your interview · {nextInterview.instituteName}</div>
            <div className="text-xs text-slate-500">{new Date(nextInterview.interviewSlot.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, {nextInterview.interviewSlot.time}</div>
          </div>
        </div>
      ) : (
        <div className="hidden sm:flex absolute -bottom-14 -left-10 items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-xl px-4 py-3 acx-float" style={{ animationDelay: '1.5s' }}>
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center"><Building2 className="w-5 h-5" /></span>
          <div>
            <div className="text-xs font-semibold text-slate-900">{open.length} open vacanc{open.length === 1 ? 'y' : 'ies'} right now</div>
            <div className="text-xs text-slate-500">from {verifiedCount} verified institution{verifiedCount === 1 ? '' : 's'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
