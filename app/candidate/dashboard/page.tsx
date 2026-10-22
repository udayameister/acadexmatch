'use client';

import { PartnerOffers } from '@/components/Partners';
import VerifiedBadge from '@/components/VerifiedBadge';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StorageService, isDeadlinePassed } from '@/lib/storage';
import { calculateMatchScore } from '@/lib/scoring';
import { CandidateProfile, Application, Job } from '@/types';
import JobCard from '@/components/JobCard';
import ExplainableMatchModal from '@/components/ExplainableMatchModal';
import ResumeParserModal from '@/components/ResumeParserModal';
import { CandidateAvatar } from '@/components/CandidateDocuments';
import { usePlan, PremiumLock, PlanPill } from '@/components/Premium';
import { useDocuments, missingRequired } from '@/lib/documents';
import UpcomingDeadlines from '@/components/UpcomingDeadlines';
import { TalentInvitesCard } from '@/components/ApplicationExtras';
import { 
  GraduationCap, 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Mic,
  Calculator,
} from 'lucide-react';

export default function CandidateDashboardPage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedMatchJob, setSelectedMatchJob] = useState<Job | null>(null);
  const [showCvModal, setShowCvModal] = useState(false);
  const { isPremium, user: planUser } = usePlan();
  const { docs: photoDocs, ready: docsReady } = useDocuments(profile?.userId);

  useEffect(() => {
    setProfile(StorageService.getCandidateProfile());
    setApplications(StorageService.getApplications());
    setJobs(StorageService.getPublishedJobs());

    const handleUpdate = () => {
      setProfile(StorageService.getCandidateProfile());
      setApplications(StorageService.getApplications());
      setJobs(StorageService.getPublishedJobs());
    };
    window.addEventListener('acad-storage-updated', handleUpdate);
    return () => window.removeEventListener('acad-storage-updated', handleUpdate);
  }, []);

  if (!profile) return null;

  const appliedJobIds = new Set(applications.map(a => a.jobId));
  const consent = profile.aiMatchingConsent !== false;
  const showScores = consent && isPremium;
  const topMatches = jobs
    .filter(j => !isDeadlinePassed(j) && !appliedJobIds.has(j.id))
    .map(j => ({ job: j, score: showScores ? calculateMatchScore(profile, j).overallScore : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(m => m.job);
  const initial = profile.name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').charAt(0).toUpperCase() || '?';

  const missingDocs = docsReady ? missingRequired(photoDocs, profile.experience.length > 0) : [];

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">

      {missingDocs.length > 0 && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
          <div>
            <div className="font-semibold text-slate-900 text-sm">Upload your proof documents</div>
            <p className="text-xs text-slate-600">Still missing: {missingDocs.map(m => m.title.toLowerCase()).join(', ')}. Institutions use these to verify your profile.</p>
          </div>
          <Link href="/candidate/profile#documents" className="px-3.5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold shrink-0 text-center">Upload documents</Link>
        </div>
      )}
      
      {/* Header Profile Banner - Full Width */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          
          <div className="flex items-center gap-4 sm:gap-6">
            {photoDocs.some(d => d.category === 'photo') ? (
              <CandidateAvatar userId={profile.userId} name={profile.name} className="w-16 h-16 sm:w-20 sm:h-20" />
            ) : (
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-brand-900 to-brand-600 p-0.5 shadow-sm shrink-0">
                <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center font-serif text-2xl font-black text-brand-900">
                  {initial}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                  {profile.name}
                </h1>
                {planUser && <PlanPill user={planUser} />}
                <VerifiedBadge verified={profile.documentsVerified} />
                {profile.phdStatus.isCompleted && (
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">Ph.D.</span>
                )}
                {profile.netSletStatus.isQualified && (
                  <span className="text-[10px] font-bold bg-brand-50 text-brand-800 px-2.5 py-0.5 rounded-full border border-brand-200">{profile.netSletStatus.examType || 'NET/SLET'}</span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {[profile.currentDesignation, profile.currentInstitute].filter(Boolean).join(' • ') || 'Add your current position on your profile'}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5 font-medium">
                {profile.location.city && <span>{[profile.location.city, profile.location.state].filter(Boolean).join(', ')}</span>}
                <span>{profile.publications.length} publication{profile.publications.length === 1 ? '' : 's'}</span>
                {profile.scholarLinks.orcid && <span>ORCID: {profile.scholarLinks.orcid}</span>}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            {isPremium ? (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">UGC API Score</span>
              <span className="font-mono text-2xl font-black text-brand-900">{profile.apiScore} / 100</span>
            </div>
            ) : (
              <PremiumLock compact title="API score" />
            )}

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Dossier Readiness</span>
              <span className="font-mono text-2xl font-black text-emerald-700">{profile.profileCompleteness}%</span>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-6 mt-6 border-t border-slate-100 text-xs font-semibold">
          <Link
            href="/candidate/profile"
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 transition border border-slate-200"
          >
            <GraduationCap className="w-4 h-4 text-brand-700" />
            <span>Manage Academic Dossier &amp; API Score</span>
          </Link>

          <Link
            href="/candidate/cv"
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 transition border border-slate-200"
          >
            <FileText className="w-4 h-4 text-brand-700" />
            <span>Download CV (PDF)</span>
          </Link>

          {isPremium ? (
          <button
            onClick={() => setShowCvModal(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-900 border border-brand-200 font-bold flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-4 h-4 text-brand-700" />
            <span>Import from CV</span>
          </button>
          ) : (
            <PremiumLock compact title="Import from CV" />
          )}

          <Link href="/candidate/interview-prep" className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold flex items-center gap-1.5 transition border border-slate-200">
            <Mic className="w-4 h-4 text-brand-700" /><span>Interview prep</span>
          </Link>
          <Link href="/salary-calculator" className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold flex items-center gap-1.5 transition border border-slate-200">
            <Calculator className="w-4 h-4 text-gold-600" /><span>Salary calculator</span>
          </Link>

          <Link
            href="/candidate/applications"
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 transition border border-slate-200 ml-auto"
          >
            <FileText className="w-4 h-4 text-emerald-700" />
            <span>View All Applications ({applications.length})</span>
          </Link>
        </div>
      </div>

      <TalentInvitesCard />
      <UpcomingDeadlines />

      {/* Main Grid: Active Applications + Top Matches */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        
        {/* Left Column: Active Applications Status Tracker */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold-600" />
              <span>Active Selection Pipelines ({applications.length})</span>
            </h2>
            <Link href="/candidate/applications" className="text-xs font-bold text-brand-700 hover:underline">
              Full Tracker &rarr;
            </Link>
          </div>

          <div className="space-y-4">
            {applications.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-slate-300 transition space-y-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-brand-900 block font-mono">
                      {app.instituteName}
                    </span>
                    <h3 className="font-serif font-bold text-slate-900 text-base mt-0.5 line-clamp-1">
                      {app.jobTitle}
                    </h3>
                  </div>

                  <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full border ${
                    app.status === 'interview_scheduled' || app.status === 'shortlisted'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-gold-50 text-gold-800 border-gold-300'
                  }`}>
                    {app.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Interview Notice if scheduled */}
                {app.interviewSlot && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Colloquium: <strong>{app.interviewSlot.date} at {app.interviewSlot.time}</strong></span>
                    </div>
                    {app.interviewSlot.meetingLink && (
                      <a
                        href={app.interviewSlot.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold bg-emerald-700 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-800 transition shadow-sm"
                      >
                        Join Link
                      </a>
                    )}
                  </div>
                )}

                {/* Progress Bar through 8 stages */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-slate-500 font-medium font-mono">
                    <span>Applied: {app.appliedDate}</span>
                    <span className="text-emerald-700 font-bold">Fit Index: {app.matchScore}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full"
                      style={{
                        width:
                          app.status === 'applied' ? '15%' :
                          app.status === 'screening' ? '30%' :
                          app.status === 'eligible' ? '45%' :
                          app.status === 'shortlisted' ? '65%' :
                          app.status === 'interview_scheduled' ? '80%' :
                          app.status === 'committee_review' ? '90%' : '100%',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {applications.length === 0 && (
              <div className="p-8 text-center rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">No Active Applications</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-0.5">
                    You haven&apos;t applied to any positions yet. Review recommended positions or browse all openings.
                  </p>
                </div>
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-900 text-white font-bold text-xs hover:bg-brand-800 transition"
                >
                  <span>Browse Vacancies</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Recommended Positions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-700" />
              <span>{isPremium ? 'Recommended for you' : 'Latest vacancies'}</span>
            </h2>
            <Link href="/jobs" className="text-xs font-bold text-brand-700 hover:underline">
              Browse All &rarr;
            </Link>
          </div>

          <div className="space-y-4">
            {!isPremium && (
              <PremiumLock title="Personalised recommendations" text="Premium ranks vacancies by how well they fit your profile and explains every score." />
            )}
            {isPremium && !consent && (
              <p className="text-xs text-slate-500 p-4 rounded-2xl bg-white border border-slate-200">
                Automated matching is switched off for your profile. Turn it on from your profile to see ranked recommendations.
              </p>
            )}
            {topMatches.length === 0 && (
              <p className="text-xs text-slate-500 p-4 rounded-2xl bg-white border border-slate-200">No new open vacancies right now — check back soon.</p>
            )}
            {topMatches.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                candidateProfile={showScores ? profile : undefined}
                onOpenMatchModal={(j) => setSelectedMatchJob(j)}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Explainable Match Modal */}
      {selectedMatchJob && profile && (
        <ExplainableMatchModal
          job={selectedMatchJob}
          candidateProfile={profile}
          onClose={() => setSelectedMatchJob(null)}
        />
      )}

      <PartnerOffers />

      {/* Resume Parser Modal */}
      <ResumeParserModal
        isOpen={showCvModal}
        onClose={() => setShowCvModal(false)}
        onProfileUpdated={() => {
          setProfile(StorageService.getCandidateProfile());
        }}
      />

    </div>
  );
}
