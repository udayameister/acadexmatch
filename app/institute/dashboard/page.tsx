'use client';

import { PromoteButton, PromotionBadges } from '@/components/Promotions';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { StorageService, STORAGE_EVENT } from '@/lib/storage';
import { payLabel, orNS, deadlineLabel, locationLabel, NOT_SPECIFIED } from '@/lib/display';
import { Institute, Job, Application } from '@/types';
import SelectionCommitteeModal from '@/components/SelectionCommitteeModal';
import InterviewScheduleModal from '@/components/InterviewScheduleModal';
import { 
  Building2, 
  Briefcase, 
  Users, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Award
} from 'lucide-react';

export default function InstituteDashboardPage() {
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedScoreApp, setSelectedScoreApp] = useState<Application | null>(null);
  const [selectedScheduleApp, setSelectedScheduleApp] = useState<Application | null>(null);

  useEffect(() => {
    const sync = () => {
      const inst = StorageService.getCurrentInstitute();
      setInstitute(inst || null);
      setJobs(inst ? StorageService.getJobs().filter(j => j.instituteId === inst.id) : []);
      setApplications(StorageService.getApplications());
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  if (!institute) {
    return (
      <div className="w-full px-4 py-24 text-center text-sm text-slate-500">
        Your account is not linked to an institute. Please contact the platform administrator.
      </div>
    );
  }

  const isVerified = institute.verificationStatus === 'verified';
  const openJobs = jobs.filter(j => j.status === 'published');
  const interviewsScheduled = applications.filter(a => a.status === 'interview_scheduled').length;
  const avgMatch = applications.length
    ? Math.round(applications.reduce((sum, a) => sum + a.matchScore, 0) / applications.length)
    : null;

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
      
      {/* Header Profile - Full Width */}
      <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-50 border border-slate-200 p-1.5 shrink-0 overflow-hidden shadow-sm grid place-items-center">
              {institute.logo ? (
                <Image src={institute.logo} alt={institute.name} width={80} height={80} unoptimized className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Building2 className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                  {institute.name}
                </h1>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  AISHE: {institute.aisheCode}
                </span>
                <span className="text-[10px] font-bold bg-gold-50 text-gold-800 px-2.5 py-0.5 rounded-full border border-gold-200">
                  NAAC {institute.accreditation.naacGrade}
                </span>
                {!isVerified && (
                  <span className="text-[10px] font-bold bg-crimson-50 text-crimson-700 px-2.5 py-0.5 rounded-full border border-crimson-100 capitalize">
                    {institute.verificationStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {institute.type} • {institute.location.city}, {institute.location.state}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5 font-medium">
                <span>Sanctioned Faculty: <strong>{institute.stats.facultyCount}</strong></span>
                <span>•</span>
                <span>Open vacancies: <strong className="text-brand-900">{openJobs.length}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isVerified && (
              <Link
                href="/institute/post-job"
                className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Post a vacancy</span>
              </Link>
            )}

            <Link
              href="/institute/ats"
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition border border-slate-200"
            >
              <Briefcase className="w-4 h-4 text-brand-700" />
              <span>Applicant pipeline</span>
            </Link>
          </div>

        </div>

        <div className="flex flex-wrap gap-2 pt-5 mt-5 border-t border-slate-100 text-xs">
          {[
            ['/institute/interviews', 'Interview slots', 'Offer times; applicants book them'],
            ['/institute/selection', 'Selection results', 'Committee ranking and offer letters'],
            ['/institute/talent', 'Talent search', 'Invite discoverable candidates'],
            ['/institute/reports', 'Hiring reports', 'Funnel, time to hire, CSV'],
          ].map(([href, label, sub]) => (
            <Link key={href} href={href} className="flex-1 min-w-[11rem] px-4 py-3 rounded-xl bg-ivory border border-slate-200 hover:border-brand-200 hover:bg-brand-50/40 transition">
              <span className="block font-bold text-slate-900">{label}</span>
              <span className="block text-slate-500 mt-0.5">{sub}</span>
            </Link>
          ))}
        </div>

        {/* Quick Institutional Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-slate-100 text-center">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Open vacancies</span>
            <strong className="font-mono text-2xl font-black text-brand-900">{openJobs.length}</strong>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Total Applicants</span>
            <strong className="font-mono text-2xl font-black text-gold-700">{applications.length}</strong>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Interviews scheduled</span>
            <strong className="font-mono text-2xl font-black text-emerald-700">{interviewsScheduled}</strong>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
            <span className="text-[10px] uppercase text-slate-500 font-bold block">Average match</span>
            <strong className="font-mono text-2xl font-black text-purple-700">{avgMatch === null ? '—' : `${avgMatch}%`}</strong>
          </div>
        </div>
      </div>

      {!isVerified && (
        <div className="p-5 rounded-2xl bg-gold-50 border border-gold-200 text-sm text-gold-900">
          <strong className="font-semibold">Verification {institute.verificationStatus}.</strong>{' '}
          {institute.verificationStatus === 'pending'
            ? `The platform administrator is reviewing AISHE code ${institute.aisheCode}. You can post vacancies once it is verified.`
            : 'Your institute registration was rejected. Please contact the platform administrator.'}
        </div>
      )}

      {/* Main Grid: Active Postings + Recent Applicant Fast Triage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        
        {/* Left Column: Active Faculty Postings */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand-700" />
              <span>Vacancies ({jobs.length})</span>
            </h2>
            {isVerified && (
              <Link href="/institute/post-job" className="text-xs font-bold text-brand-700 hover:underline">
                + Post new
              </Link>
            )}
          </div>

          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gold-800 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">
                      {orNS(job.reservationCategory)}
                    </span>
                    <h3 className="font-serif font-bold text-slate-900 text-base sm:text-lg mt-1">
                      {job.title}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-1"><PromotionBadges job={job} /></div>
                    <p className="text-xs text-slate-500 font-medium">{orNS(job.department)} • Advt: {orNS(job.advertisementNumber)}</p>
                  </div>

                  <span className="text-xs font-bold font-mono text-slate-900 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                    {payLabel(job)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
                  <span className="capitalize">Status: <strong className="text-slate-900">{job.status.replace('_', ' ')}</strong></span>
                  <span>•</span>
                  <span>Deadline: <strong className="text-slate-900">{deadlineLabel(job)}</strong></span>
                  <span>•</span>
                  <span>Applicants: <strong className="text-brand-900 font-bold">{job.applicantCount}</strong></span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-3">
                    <Link href={`/jobs/${job.id}`} className="text-brand-700 hover:text-brand-900 font-bold underline">
                      View public page
                    </Link>
                    <button
                      onClick={() => StorageService.setJobStatus(job.id, job.status === 'published' ? 'closed' : 'published')}
                      className="text-slate-500 hover:text-slate-900 font-semibold"
                    >
                      {job.status === 'published' ? 'Close vacancy' : 'Reopen'}
                    </button>
                    <PromoteButton job={job} />
                  </div>

                  <Link
                    href="/institute/ats"
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-brand-900 text-white hover:bg-brand-800 font-bold text-xs transition shadow-sm"
                  >
                    <span>Manage applicants</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Fast-Triage Candidate Stream */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-gold-600" />
              <span>Recent applicants</span>
            </h2>
            <Link href="/institute/ats" className="text-xs font-bold text-brand-700 hover:underline">
              Open pipeline &rarr;
            </Link>
          </div>

          <div className="space-y-4">
            {applications.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-500 rounded-3xl bg-white border border-slate-200">No applications yet.</p>
            )}
            {applications.slice(0, 8).map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3.5 hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">
                      {app.candidateName}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Applied for: {app.jobTitle}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                      {app.matchScore}% Match
                    </span>
                    <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                      {app.highestDegree || '—'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-[11px] uppercase font-bold text-gold-800 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">
                    Stage: {app.status.replace(/_/g, ' ')}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedScoreApp(app)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition text-xs border border-slate-200"
                    >
                      Committee score
                    </button>
                    <button
                      onClick={() => setSelectedScheduleApp(app)}
                      className="px-3 py-1.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold transition text-xs shadow-sm"
                    >
                      Schedule interview
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Selection Committee Score Modal */}
      {selectedScoreApp && (
        <SelectionCommitteeModal
          application={selectedScoreApp}
          onClose={() => setSelectedScoreApp(null)}
          onScoreSubmitted={() => {
            setApplications(StorageService.getApplications());
          }}
        />
      )}

      {/* Interview Scheduler Modal */}
      {selectedScheduleApp && (
        <InterviewScheduleModal
          application={selectedScheduleApp}
          onClose={() => setSelectedScheduleApp(null)}
          onScheduled={() => {
            setApplications(StorageService.getApplications());
          }}
        />
      )}

    </div>
  );
}
