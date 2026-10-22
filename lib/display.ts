import type { Job } from '@/types';

/** Shown wherever a vacancy does not state a value (e.g. scraped vacancies). */
export const NOT_SPECIFIED = 'Not specified';

export function orNS(v: string | number | null | undefined): string {
  return v === null || v === undefined || v === '' ? NOT_SPECIFIED : String(v);
}

/** Short pay label: "Level 12" from "Level 12 (₹79,800 - …)", or the source text as-is. */
export function payLabel(job: Job): string {
  const band = job.payScale.cpcBand;
  if (!band) return NOT_SPECIFIED;
  return /^level/i.test(band) ? band.split('(')[0].trim() : band;
}

export function deadlineLabel(job: Job): string {
  return job.applicationDeadline || job.deadlineText || NOT_SPECIFIED;
}

export function locationLabel(job: Job): string {
  const parts = [job.location.city, job.location.state].filter(Boolean);
  return parts.length ? parts.join(', ') : NOT_SPECIFIED;
}
