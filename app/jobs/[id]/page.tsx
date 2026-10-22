'use client';

import React, { useState, useEffect } from 'react';
import { TrackJobPanel } from '@/components/TrackJobButton';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import InstituteLogo from '@/components/InstituteLogo';
import confetti from 'canvas-confetti';
import { externalApplyLink, isPremiumUser, StorageService, isDeadlinePassed } from '@/lib/storage';
import { useCurrentUser } from '@/lib/useAuth';
import { calculateMatchScore } from '@/lib/scoring';
import { Job, CandidateProfile, Institute, Application } from '@/types';
import ExplainableMatchModal from '@/components/ExplainableMatchModal';
import { PremiumBadge, PremiumLock } from '@/components/Premium';
import { levelKeyFrom } from '@/lib/salary';
import { NOT_SPECIFIED, deadlineLabel, locationLabel, orNS } from '@/lib/display';
import { 
  Building2, 
  MapPin, 
  IndianRupee, 
  GraduationCap, 
  CheckCircle2, 
  Clock, 
  ArrowLeft, 
  Send, 
  Award,
  ChevronRight,
  FileCheck,
  ExternalLink,
} from 'lucide-react';

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params?.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [existingApp, setExistingApp] = useState<Application | null>(null);
  const [screeningAnswers, setScreeningAnswers] = useState<{ [qIdx: number]: string }>({});
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const { user } = useCurrentUser();

  useEffect(() => {
    if (!jobId) return;
    const j = StorageService.getJobById(jobId);
    if (j) {
      setJob(j);
      const inst = StorageService.getInstituteById(j.instituteId);
      if (inst) setInstitute(inst);
    }
    setCandidateProfile(StorageService.getCandidateProfile());
    setExistingApp(StorageService.getMyApplicationForJob(jobId) || null);
  }, [jobId, user]);

  if (!job) {
    return (
      <div className="w-full px-4 sm:px-8 py-20 text-center text-slate-500 space-y-4">
        <h2 className="text-xl font-serif text-slate-900 font-bold">Faculty Vacancy Not Found</h2>
        <p className="text-xs">The requested academic vacancy does not exist or has expired.</p>
        <Link href="/jobs" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-900 text-white text-xs font-bold shadow-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Job Directory
        </Link>
      </div>
    );
  }

  const isPremium = isPremiumUser(user);
  const matchBreakdown = isPremium && candidateProfile && candidateProfile.aiMatchingConsent !== false ? calculateMatchScore(candidateProfile, job) : null;
  const externalUrl = externalApplyLink(job, institute);
  const closed = job.status !== 'published' || isDeadlinePassed(job);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setIsApplying(true);
    setApplyError(null);

    const formattedAnswers = job.screeningQuestions.map((q, idx) => ({
      question: q,
      answer: (screeningAnswers[idx] || '').trim(),
    }));

    const res = StorageService.applyToJob(job.id, formattedAnswers);
    if (!res.success) {
      setApplyError(res.error);
      setIsApplying(false);
      return;
    }

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#B48A3E', '#A3283A', '#10B981'],
      });
    } catch (err) {
      console.error(err);
    }

    setTimeout(() => {
      setIsApplying(false);
      setAppliedSuccess(true);
      setExistingApp(res.application);
    }, 500);
  };

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
      
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/jobs" className="hover:text-brand-700 flex items-center gap-1 font-medium">
          <ArrowLeft className="w-3 h-3" /> All Vacancies
        </Link>
        <span>/</span>
        <span className="text-slate-700">{job.instituteShortName}</span>
        <span>/</span>
        <span className="text-brand-900 font-bold truncate max-w-md">{job.title}</span>
      </div>

      {/* Main Header Card */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-50 border border-slate-200 p-1.5 shrink-0 overflow-hidden shadow-sm">
              <InstituteLogo src={job.instituteLogo} name={job.instituteName} size={80} className="rounded-xl" />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {job.advertisementNumber && (
                  <span className="text-[11px] font-bold bg-gold-100 text-gold-800 px-2.5 py-0.5 rounded-lg border border-gold-200">
                    Advt No: {job.advertisementNumber}
                  </span>
                )}
                {job.reservationCategory && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200">
                    {job.reservationCategory}
                  </span>
                )}
                {job.source && (
                  <span className="text-[11px] font-bold bg-white text-slate-600 px-2.5 py-0.5 rounded-lg border border-slate-200">
                    From the institution&apos;s website
                  </span>
                )}
                {institute?.accreditation.naacGrade && (
                  <span className="text-[11px] font-mono font-bold bg-brand-50 text-brand-800 px-2 py-0.5 rounded-lg border border-brand-200">
                    NAAC {institute.accreditation.naacGrade}
                  </span>
                )}
              </div>

              {job.isPremium && <PremiumBadge label="Premium vacancy" className="mb-1" />}
              <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900 leading-tight">
                {job.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-0.5 font-medium">
                <span className="font-bold text-slate-900">{job.instituteName}</span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {locationLabel(job)}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Deadline: <strong className="text-gold-800 font-bold">{deadlineLabel(job)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Match Pill */}
          {!isPremium && user?.role === 'candidate' && (
            <PremiumLock compact title="See your match score" className="self-start shrink-0" />
          )}
          {matchBreakdown && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center shrink-0 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Candidate Profile Fit
              </span>
              <div className="font-mono text-3xl font-black text-gold-700">
                {matchBreakdown.overallScore}%
              </div>
              <button
                onClick={() => setShowMatchModal(true)}
                className="text-[11px] text-brand-700 hover:text-brand-900 font-bold underline block mx-auto"
              >
                Explainable Breakdown &rarr;
              </button>
            </div>
          )}

        </div>

        {/* 7th CPC Pay Scale & Highlights Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">{job.source ? 'Pay / salary (as stated)' : '7th CPC Pay Scale'}</span>
            <div className={`font-bold flex items-center gap-1 text-sm ${job.payScale.cpcBand ? 'text-slate-900' : 'text-slate-400'}`}>
              <IndianRupee className="w-4 h-4 text-gold-600 shrink-0" />
              <span>{orNS(job.payScale.cpcBand)}</span>
            </div>
            {job.payScale.entryPay && <div className="text-[11px] text-slate-500 mt-0.5">Entry Pay: {job.payScale.entryPay}</div>}
            {levelKeyFrom(job.payScale.cpcBand) && <Link href={`/salary-calculator?level=${levelKeyFrom(job.payScale.cpcBand)}`} className="inline-block text-[11px] font-semibold text-brand-800 hover:underline mt-1">Estimate monthly pay →</Link>}
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">{job.source ? 'Number of posts' : 'Estimated Gross Monthly'}</span>
            <div className={`font-bold text-sm ${(job.source ? job.source.numberOfPosts : job.payScale.grossMonthlyEstimated) ? 'text-emerald-800' : 'text-slate-400'}`}>{orNS(job.source ? job.source.numberOfPosts : job.payScale.grossMonthlyEstimated)}</div>
            {!job.source && job.payScale.grossMonthlyEstimated && <div className="text-[11px] text-slate-500 mt-0.5">With 50% DA + 27% HRA + TA</div>}
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Minimum Qualification</span>
            <div className={`font-bold flex items-start gap-1 text-sm ${job.requiredQualifications.minDegree ? 'text-slate-900' : 'text-slate-400'}`}>
              <GraduationCap className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
              <span>{orNS(job.requiredQualifications.minDegree)}</span>
            </div>
            {job.requiredQualifications.ugcRegulationsYear && <div className="text-[11px] text-slate-500 mt-0.5">{job.requiredQualifications.ugcRegulationsYear}</div>}
          </div>
        </div>

      </div>

      {/* Main Content Layout - Full Space */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        
        {/* Left Column: Detailed Descriptions & Requirements */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Overview */}
          <div className="p-7 rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
            <h3 className="font-serif font-bold text-slate-900 text-lg">Position Overview</h3>
            <p className={`text-xs sm:text-sm leading-relaxed whitespace-pre-line font-normal ${job.description ? 'text-slate-600' : 'text-slate-400'}`}>
              {job.description || 'The source does not give a description. See the original notice for details.'}
            </p>
            {job.source && (
              <div className="mt-2 p-3.5 rounded-2xl bg-cream border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <div>
                  Found on <a href={job.source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-800 underline break-all">{job.source.url}</a> on {job.source.extractedAt}. Only details stated on that page are shown; always check the original notice.
                </div>
                {job.source.rawText && (
                  <details>
                    <summary className="cursor-pointer font-semibold text-slate-700">Text from the source page</summary>
                    <p className="mt-1.5 whitespace-pre-line">{job.source.rawText}</p>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Statutory Minimum Qualifications */}
          <div className="p-7 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-gold-600" />
              <h3 className="font-serif font-bold text-slate-900 text-lg">
                {job.source ? 'Eligibility (as stated in the notice)' : 'Statutory Qualifications per UGC / AICTE Gazette'}
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              {([
                ['Qualification', job.requiredQualifications.minDegree
                  ? `${job.requiredQualifications.minDegree}${job.requiredQualifications.phdNorms ? ` (${job.requiredQualifications.phdNorms})` : ''}`
                  : null],
                ['NET / SLET', job.requiredQualifications.netSletMandatory === null
                  ? null
                  : job.requiredQualifications.netSletMandatory
                    ? 'UGC/CSIR NET or SLET qualification is mandatory.'
                    : 'Not required for this post.'],
                ['Publications', job.requiredQualifications.minUgcCarePubs === null
                  ? null
                  : `Minimum ${job.requiredQualifications.minUgcCarePubs} papers in UGC-CARE / Scopus / SCI indexed journals.`],
                ['Experience', job.requiredQualifications.experienceText
                  || (job.requiredQualifications.minExperienceYears === null ? null : `Minimum ${job.requiredQualifications.minExperienceYears} years of teaching / research / postdoc experience.`)],
              ] as [string, string | null][]).map(([label, value]) => (
                <div key={label} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${value ? 'text-emerald-600' : 'text-slate-300'}`} />
                  <div>
                    <strong className="text-slate-900">{label}: </strong>
                    <span className={value ? '' : 'text-slate-400'}>{value || NOT_SPECIFIED}</span>
                  </div>
                </div>
              ))}
            </div>

            {job.requiredQualifications.specializationRequirements.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Domain Specialization Priorities:
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {job.requiredQualifications.specializationRequirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-gold-600 font-bold">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Institutional Allowances & Benefits */}
          {(job.payScale.allowances.length > 0 || job.benefits.length > 0) && (
          <div className="p-7 rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
            <h3 className="font-serif font-bold text-slate-900 text-lg">Institutional Grants &amp; Campus Perks</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {job.payScale.allowances.map((allw, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-2.5">
                  <Award className="w-4 h-4 text-gold-600 shrink-0" />
                  <span className="font-medium">{allw}</span>
                </div>
              ))}
              {job.benefits.map((ben, idx) => (
                <div key={`b-${idx}`} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="font-medium">{ben}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* 8-Stage Selection Roadmap */}
          {job.selectionProcess.length > 0 && (
          <div className="p-7 rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
            <h3 className="font-serif font-bold text-slate-900 text-lg">Selection Process Roadmap</h3>
            <div className="space-y-2 text-xs">
              {job.selectionProcess.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="font-mono font-bold text-brand-700 bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-sm">
                    0{idx + 1}
                  </span>
                  <span className="text-slate-700 mt-0.5 font-medium">{step}</span>
                </div>
              ))}
            </div>
          </div>
          )}

        </div>

        {/* Right Column: Application Form */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="sticky top-24 rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 space-y-5 shadow-md">
            
            {appliedSuccess || existingApp ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-lg">Application Submitted!</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Your academic dossier has been logged into {job.instituteShortName}&apos;s ATS selection committee queue.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Stage:</span>
                    <span className="font-bold text-brand-900 uppercase">
                      {(existingApp?.status || 'applied').replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Computed Fit:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {existingApp?.matchScore || matchBreakdown?.overallScore}%
                    </span>
                  </div>
                </div>

                <Link
                  href="/candidate/applications"
                  className="w-full px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                >
                  <span>Track in My Applications</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ) : closed ? (
              <div className="space-y-3 text-center py-4">
                <Clock className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="font-serif font-bold text-slate-900 text-lg">Applications closed</h4>
                <p className="text-xs text-slate-500">The deadline for this vacancy was {deadlineLabel(job)}.</p>
                <Link href="/jobs" className="inline-flex px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs">Browse open vacancies</Link>
              </div>
            ) : !user ? (
              <div className="space-y-4 text-center py-4">
                <h4 className="font-serif font-bold text-slate-900 text-lg">Apply for this position</h4>
                <p className="text-xs text-slate-500">Sign in with a candidate account to see your match score and apply.</p>
                <Link href={`/login?next=/jobs/${job.id}`} className="w-full inline-flex justify-center px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">Sign in to apply</Link>
                <Link href="/register" className="block text-xs font-semibold text-brand-700 hover:text-brand-900">New here? Create a free profile</Link>
              </div>
            ) : user.role !== 'candidate' ? (
              <div className="space-y-2 text-center py-4">
                <h4 className="font-serif font-bold text-slate-900 text-lg">Candidate accounts only</h4>
                <p className="text-xs text-slate-500">You are signed in as an institution or administrator account, which cannot apply to vacancies.</p>
              </div>
            ) : !isPremium ? (
              job.isPremium ? (
                <div className="space-y-4 py-2">
                  <PremiumBadge label="Premium vacancy" />
                  <h4 className="font-serif font-bold text-slate-900 text-lg">Open to Premium members</h4>
                  <p className="text-xs text-slate-600">Applications for this vacancy are accepted only through AcadeXMatch Premium, with one-click apply and status tracking.</p>
                  <Link href="/premium" className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">Upgrade to apply</Link>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div>
                    <h4 className="font-serif font-bold text-slate-900 text-lg">Apply for this position</h4>
                    <p className="text-xs text-slate-600 mt-1">On the Free plan you apply directly on {job.instituteShortName}&apos;s website{job.advertisementNumber ? <> quoting advertisement no. <strong className="text-slate-900">{job.advertisementNumber}</strong></> : ''}.</p>
                  </div>
                  {externalUrl ? (
                    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">
                      Apply on institution website <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : null}
                  {externalUrl && <TrackJobPanel job={job} external />}
                  {externalUrl ? null : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                      No application link has been published yet.{institute?.contactEmail && <> Contact <a className="font-semibold text-brand-800 underline" href={`mailto:${institute.contactEmail}`}>{institute.contactEmail}</a>.</>}
                    </div>
                  )}
                  {job.isClaimedByInstitute !== false && <PremiumLock title="Apply in one click with Premium" text="Send your verified profile and documents straight to the selection committee, see your match score and track every stage." />}
                </div>
              )
            ) : !job.isClaimedByInstitute && externalUrl ? (
              <div className="space-y-4 py-2">
                {job.isPremium && <PremiumBadge label="Premium vacancy" />}
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-lg">Apply for this position</h4>
                  <p className="text-xs text-slate-600 mt-1">{job.instituteShortName} recruits through its own website. Apply there{job.advertisementNumber ? <> quoting advertisement no. <strong className="text-slate-900">{job.advertisementNumber}</strong></> : ''}.</p>
                </div>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">
                  Apply on institution website <ExternalLink className="w-4 h-4" />
                </a>
                <TrackJobPanel job={job} external />
                <p className="text-[11px] text-slate-500">Found by AcadeXMatch from the institution&apos;s official careers page. Check the original notice for the latest details.</p>
              </div>
            ) : (
              <form onSubmit={handleApply} className="space-y-4 text-xs">
                <div>
                  <h3 className="font-serif font-bold text-slate-900 text-base">
                    Submit Formal Application
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Applying as <strong className="text-slate-900">{candidateProfile?.name}</strong>.{' '}
                    <Link href="/candidate/profile" className="text-brand-700 font-semibold hover:underline">Review profile</Link>
                  </p>
                </div>

                {/* Candidate Credentials Quick Summary */}
                {candidateProfile && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Highest Degree:</span>
                      <span className="text-slate-900 font-semibold truncate max-w-[150px]">{candidateProfile.highestDegree}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">UGC 2018 API Score:</span>
                      <span className="font-mono text-brand-900 font-bold">{candidateProfile.apiScore} / 100</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Publications:</span>
                      <span className="text-emerald-700 font-bold">{candidateProfile.publications.length} Papers</span>
                    </div>
                  </div>
                )}

                {/* Mandatory Screening Questions */}
                {job.screeningQuestions.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                      Departmental Screening Questions ({job.screeningQuestions.length})
                    </span>

                    {job.screeningQuestions.map((q, qIdx) => (
                      <div key={qIdx} className="space-y-1">
                        <label className="block text-xs text-slate-700 leading-snug font-medium">
                          {qIdx + 1}. {q}
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={screeningAnswers[qIdx] || ''}
                          onChange={(e) => setScreeningAnswers({ ...screeningAnswers, [qIdx]: e.target.value })}
                          placeholder="Provide specific details or citations..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {applyError && (
                  <div className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-700">
                    {applyError}{' '}
                    {applyError.includes('profile') && <Link href="/candidate/profile" className="font-semibold underline">Complete profile</Link>}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isApplying}
                    className="w-full px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                  >
                    {isApplying ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Transmitting Dossier...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Submit to Selection Committee
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  By submitting, you authorize the institution&apos;s Faculty Search Committee to verify your publications and academic credentials per DPDP Act (2023) guidelines.
                </p>
                <TrackJobPanel job={job} external={false} />
              </form>
            )}

          </div>

        </div>

      </div>

      {/* Explainable Match Modal */}
      {showMatchModal && candidateProfile && (
        <ExplainableMatchModal
          job={job}
          candidateProfile={candidateProfile}
          onClose={() => setShowMatchModal(false)}
          showApplyLink={false}
        />
      )}

    </div>
  );
}
