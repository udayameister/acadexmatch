'use client';

import { promotionRank } from '@/components/Promotions';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FacetedFilter, { FilterState } from '@/components/FacetedFilter';
import JobCard from '@/components/JobCard';
import ExplainableMatchModal from '@/components/ExplainableMatchModal';
import ResumeParserModal from '@/components/ResumeParserModal';
import { usePlan, PremiumLock } from '@/components/Premium';
import { StorageService, isDeadlinePassed } from '@/lib/storage';
import { matchesFilters, DEFAULT_FILTERS } from '@/lib/jobFilter';
import SaveAlertButton from '@/components/SaveAlertButton';
import { Job, CandidateProfile } from '@/types';
import { Search, Sparkles, Filter, Briefcase, RotateCcw } from 'lucide-react';

function JobsContent() {
  const { isPremium } = usePlan();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [selectedMatchJob, setSelectedMatchJob] = useState<Job | null>(null);
  const [showCvModal, setShowCvModal] = useState(false);
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS, search: initialSearch });

  useEffect(() => {
    setJobs(StorageService.getPublishedJobs().filter(j => !isDeadlinePassed(j)));
    setCandidateProfile((StorageService.isCurrentUserPremium() ? StorageService.getCandidateProfile() : null));

    const handleUpdate = () => {
      setJobs(StorageService.getPublishedJobs().filter(j => !isDeadlinePassed(j)));
      setCandidateProfile((StorageService.isCurrentUserPremium() ? StorageService.getCandidateProfile() : null));
    };
    window.addEventListener('acad-storage-updated', handleUpdate);
    return () => window.removeEventListener('acad-storage-updated', handleUpdate);
  }, []);

  const handleResetFilters = () => setFilters({ ...DEFAULT_FILTERS });

  const filteredJobs = useMemo(() => jobs.filter(job => matchesFilters(job, filters)).map((j, i) => ({ j, i })).sort((a, b) => promotionRank(b.j) - promotionRank(a.j) || a.i - b.i).map(x => x.j), [jobs, filters]);

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-gold-700 uppercase tracking-wider mb-1">
            <Briefcase className="w-4 h-4" /> Live Academic Vacancies
          </div>
          <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900">
            Explore Faculty &amp; Research Positions
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Filter compliant vacancies across India by 7th CPC bands, UGC regulations, and research domains.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isPremium ? (
          <button
            onClick={() => setShowCvModal(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-900 border border-brand-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-brand-700" />
            <span>AI Match Against My CV</span>
          </button>
          ) : (
            <PremiumLock compact title="AI Match Against My CV" />
          )}

          <button
            onClick={() => setShowMobileFilter(!showMobileFilter)}
            className="lg:hidden px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Filter className="w-4 h-4 text-brand-700" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Main Full-Width Grid: Sidebar + Job Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        
        {/* Sidebar Filters */}
        <div className={`lg:col-span-3.5 xl:col-span-3 ${showMobileFilter ? 'block' : 'hidden lg:block'}`}>
          <FacetedFilter
            filters={filters}
            onFilterChange={setFilters}
            onReset={handleResetFilters}
            totalResults={filteredJobs.length}
          />
        </div>

        {/* Job Listings List */}
        <div className="lg:col-span-8.5 xl:col-span-9 space-y-4">
          
          {/* Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span>
              Showing <strong className="text-slate-900 font-mono font-bold text-sm">{filteredJobs.length}</strong> vacancies matching your criteria
            </span>
            <SaveAlertButton filters={filters} />
            {candidateProfile && (
              <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Live Profile Fit Computed
              </span>
            )}
          </div>

          {filteredJobs.length > 0 ? (
            <div className="space-y-4">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  candidateProfile={candidateProfile || undefined}
                  onOpenMatchModal={(j) => setSelectedMatchJob(j)}
                  featured={job.featured}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="font-serif font-bold text-slate-900 text-lg">No Faculty Vacancies Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No positions matched all active filters. Try broadening your state, reservation category, or keyword search.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-brand-900 text-xs font-bold transition inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear All Filters
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Explainable Match Modal */}
      {selectedMatchJob && candidateProfile && (
        <ExplainableMatchModal
          job={selectedMatchJob}
          candidateProfile={candidateProfile}
          onClose={() => setSelectedMatchJob(null)}
        />
      )}

      {/* Resume Parser Modal */}
      <ResumeParserModal
        isOpen={showCvModal}
        onClose={() => setShowCvModal(false)}
        onProfileUpdated={() => {
          setCandidateProfile((StorageService.isCurrentUserPremium() ? StorageService.getCandidateProfile() : null));
        }}
      />

    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="w-full px-4 py-16 text-center text-slate-500">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-xs">Loading faculty vacancies...</p>
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
