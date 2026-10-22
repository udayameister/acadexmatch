'use client';

import { PromotionBadges } from '@/components/Promotions';
import { isJobFeatured } from '@/lib/storage';
import React from 'react';
import { SaveJobIcon } from '@/components/TrackJobButton';
import Link from 'next/link';
import InstituteLogo from '@/components/InstituteLogo';
import { Job, CandidateProfile } from '@/types';
import { 
  Building2, 
  MapPin, 
  Clock, 
  IndianRupee, 
  GraduationCap, 
  Sparkles, 
  ChevronRight,
} from 'lucide-react';
import { calculateMatchScore } from '@/lib/scoring';
import { payLabel, orNS, deadlineLabel, locationLabel } from '@/lib/display';
import { PremiumBadge } from '@/components/Premium';

interface JobCardProps {
  job: Job;
  candidateProfile?: CandidateProfile;
  onOpenMatchModal?: (job: Job) => void;
  featured?: boolean;
}

export default function JobCard({ job, candidateProfile, onOpenMatchModal, featured: featuredProp }: JobCardProps) {
  const featured = featuredProp || isJobFeatured(job);
  const matchResult = candidateProfile && candidateProfile.aiMatchingConsent !== false ? calculateMatchScore(candidateProfile, job) : null;
  const matchScore = matchResult?.overallScore || null;

  return (
    <div className={`group relative rounded-3xl bg-white border transition-all duration-300 hover:shadow-academic-hover hover:-translate-y-0.5 ${
      featured 
        ? 'border-gold-300 bg-gradient-to-br from-white via-gold-50/30 to-white shadow-sm' 
        : 'border-slate-200 hover:border-brand-300 shadow-sm'
    } p-6 sm:p-7`}>
      
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {job.instituteType && (
          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-brand-700" />
            {job.instituteType.split(' ')[0]}
          </span>
          )}
          {job.reservationCategory && (
            <span className="text-[11px] font-bold bg-gold-100 text-gold-800 px-2.5 py-1 rounded-lg border border-gold-200">
              {job.reservationCategory}
            </span>
          )}
          <PromotionBadges job={job} />
          {job.isPremium && <PremiumBadge />}
          {job.requiredQualifications.netSletMandatory && (
            <span className="text-[11px] font-semibold bg-brand-50 text-brand-800 px-2.5 py-1 rounded-lg border border-brand-200">
              NET/SLET Required
            </span>
          )}
        </div>

        {/* AI Match Score Badge */}
        {matchScore !== null && (
          <button
            onClick={() => onOpenMatchModal && onOpenMatchModal(job)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition ${
              matchScore >= 85
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                : matchScore >= 70
                ? 'bg-gold-50 text-gold-800 border border-gold-300 hover:bg-gold-100'
                : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
            }`}
            title="Click to view transparent explainable match breakdown"
          >
            <Sparkles className="w-3.5 h-3.5 text-gold-600" />
            <span>{matchScore}% Profile Fit</span>
          </button>
        )}
      </div>

      {/* Title & Institute Header */}
      <div className="flex items-start gap-4">
        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
          <InstituteLogo src={job.instituteLogo} name={job.instituteName} size={56} className="rounded-xl" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link 
              href={`/jobs/${job.id}`}
              className="text-base sm:text-lg font-serif font-bold text-slate-900 group-hover:text-brand-700 transition line-clamp-1"
            >
              {job.title}
            </Link>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{job.instituteName}</span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1 text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {locationLabel(job)}
            </span>
          </div>
        </div>
      </div>

      {/* Specialization Tags */}
      <div className="flex flex-wrap gap-1.5 mt-4">
        {job.specializationTags.slice(0, 4).map((tag, idx) => (
          <span 
            key={idx}
            className="text-[11px] font-medium bg-slate-50 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 font-sans"
          >
            {tag}
          </span>
        ))}
        {job.specializationTags.length > 4 && (
          <span className="text-[11px] text-slate-500 px-1 py-1 font-medium">
            +{job.specializationTags.length - 4} more
          </span>
        )}
      </div>

      {/* Pay Scale & Qualifications Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-3.5 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <IndianRupee className="w-4 h-4 text-gold-600 shrink-0" />
          <span className={`font-bold line-clamp-1 ${job.payScale.cpcBand ? 'text-slate-900' : 'text-slate-400'}`}>{payLabel(job)}</span>
          {job.payScale.entryPay && <span className="text-slate-500 text-[11px]">({job.payScale.entryPay} Entry)</span>}
        </div>

        <div className="flex items-center gap-2 text-slate-700">
          <GraduationCap className="w-4 h-4 text-brand-600 shrink-0" />
          <span className={`font-medium line-clamp-1 ${job.requiredQualifications.minDegree ? 'text-slate-800' : 'text-slate-400'}`}>{orNS(job.requiredQualifications.minDegree)}</span>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-slate-100 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Deadline: <strong className="text-slate-800 font-semibold">{deadlineLabel(job)}</strong></span>
        </div>

        <div className="flex items-center gap-2.5">
          {matchResult && onOpenMatchModal && (
            <button
              onClick={() => onOpenMatchModal(job)}
              className="text-xs text-brand-700 hover:text-brand-900 underline font-bold px-2 py-1"
            >
              Why this match?
            </button>
          )}
          <SaveJobIcon job={job} />
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-100 hover:bg-brand-900 hover:text-white text-slate-800 font-bold transition duration-200 text-xs border border-slate-200 shadow-sm"
          >
            <span>View &amp; Apply</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
