import type { Job, JobSearchFilters } from '@/types';
import { detailsSearchText } from './jobDetailsText';

export const DEFAULT_FILTERS: JobSearchFilters = {
  search: '',
  state: 'All States',
  designation: 'All Designations',
  instituteType: 'All Institution Types',
  reservationCategory: 'All Reservation Categories',
  netSletOnly: false,
  phdOnly: false,
};

/** True when the vacancy satisfies every active filter (shared by the search page and job alerts). */
export function matchesFilters(job: Job, f: JobSearchFilters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase().trim();
    const hit = job.title.toLowerCase().includes(q)
      || (job.department || '').toLowerCase().includes(q)
      || job.instituteName.toLowerCase().includes(q)
      || job.instituteShortName.toLowerCase().includes(q)
      || job.specializationTags.some(t => t.toLowerCase().includes(q))
      || detailsSearchText(job.details).toLowerCase().includes(q);
    if (!hit) return false;
  }
  if (f.state !== DEFAULT_FILTERS.state && job.location.state !== f.state) return false;
  if (f.designation !== DEFAULT_FILTERS.designation && job.designation !== f.designation) return false;
  if (f.instituteType !== DEFAULT_FILTERS.instituteType && job.instituteType !== f.instituteType) return false;
  if (f.reservationCategory !== DEFAULT_FILTERS.reservationCategory) {
    if (f.reservationCategory === 'Open to All Categories') {
      if (job.reservationCategory !== 'Open to All Categories' && job.reservationCategory !== 'Unreserved (UR / General)') return false;
    } else if (job.reservationCategory !== f.reservationCategory) return false;
  }
  if (f.netSletOnly && !job.requiredQualifications.netSletMandatory) return false;
  if (f.phdOnly && !/ph\.?\s?d/i.test(job.requiredQualifications.minDegree || '')) return false;
  return true;
}

/** Short human description of the filters, e.g. "Assistant Professor · Maharashtra · \"machine learning\"". */
export function describeFilters(f: JobSearchFilters): string {
  const parts: string[] = [];
  if (f.search) parts.push(`"${f.search}"`);
  if (f.designation !== DEFAULT_FILTERS.designation) parts.push(f.designation);
  if (f.state !== DEFAULT_FILTERS.state) parts.push(f.state);
  if (f.instituteType !== DEFAULT_FILTERS.instituteType) parts.push(f.instituteType);
  if (f.reservationCategory !== DEFAULT_FILTERS.reservationCategory) parts.push(f.reservationCategory);
  if (f.netSletOnly) parts.push('NET/SLET required');
  if (f.phdOnly) parts.push('Ph.D. required');
  return parts.length ? parts.join(' · ') : 'All new vacancies';
}

/** Default alert name: the filters without quotes, e.g. "Quantum · Maharashtra". */
export function nameFromFilters(f: JobSearchFilters): string {
  return describeFilters({ ...f, search: '' }) === 'All new vacancies'
    ? (f.search ? f.search.trim() : 'All new vacancies')
    : [f.search.trim(), describeFilters({ ...f, search: '' })].filter(Boolean).join(' · ');
}

export function cleanFilters(input: Partial<JobSearchFilters> | undefined): JobSearchFilters {
  const f = { ...DEFAULT_FILTERS, ...(input || {}) };
  return {
    search: String(f.search || '').slice(0, 100),
    state: String(f.state || DEFAULT_FILTERS.state).slice(0, 80),
    designation: String(f.designation || DEFAULT_FILTERS.designation).slice(0, 80),
    instituteType: String(f.instituteType || DEFAULT_FILTERS.instituteType).slice(0, 80),
    reservationCategory: String(f.reservationCategory || DEFAULT_FILTERS.reservationCategory).slice(0, 80),
    netSletOnly: !!f.netSletOnly,
    phdOnly: !!f.phdOnly,
  };
}
