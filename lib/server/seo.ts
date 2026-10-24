import { cache } from 'react';
import { STORAGE_KEYS, isDeadlinePassed } from '@/lib/storage';
import { withDb } from './db';
import { SITE_URL } from '@/lib/site';
import type { Institute, Job } from '@/types';

/*
 * Server-side helpers for search metadata. Only public data is read here (published / closed vacancies and
 * verified institutions) — never anything tied to a user.
 */

export const getJobForSeo = cache(async (id: string): Promise<{ job: Job; institute: Institute | null } | null> =>
  withDb(null, db => {
    const job = ((db[STORAGE_KEYS.JOBS] as Job[]) || []).find(j => j.id === id);
    if (!job || (job.status !== 'published' && job.status !== 'closed')) return null;
    const institute = ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).find(i => i.id === job.instituteId) || null;
    return { job, institute };
  }));

export const getInstituteForSeo = cache(async (id: string): Promise<{ institute: Institute; openJobs: Job[] } | null> =>
  withDb(null, db => {
    const institute = ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).find(i => i.id === id);
    if (!institute || institute.verificationStatus !== 'verified') return null;
    const openJobs = ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.instituteId === id && j.status === 'published' && !isDeadlinePassed(j));
    return { institute, openJobs };
  }));

/** Is this vacancy open (published and not past its deadline)? Closed ones are kept out of the index. */
export function isOpenJob(job: Job): boolean {
  return job.status === 'published' && !isDeadlinePassed(job);
}

/** Notice-style titles from scraped pages ("Job Openings") describe several posts, not one job. */
const GENERIC_TITLE = /^(job openings?|recruitment( notification)?|notifications?|advertisements?|careers?|vacanc(y|ies)|positions? offered)\b/i;
export function isSingleJob(job: Job): boolean {
  return !GENERIC_TITLE.test(job.title.trim());
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

export function jobTitleForSeo(job: Job): string {
  const where = [job.instituteShortName || job.instituteName, job.location.city].filter(Boolean).join(', ');
  return clip(`${clean(job.title)}${where ? ` – ${where}` : ''}`, 65);
}

export function jobDescriptionForSeo(job: Job): string {
  const parts = [
    `${clean(job.title)} at ${clean(job.instituteName)}${job.location.city ? `, ${job.location.city}` : ''}${job.location.state ? `, ${job.location.state}` : ''}.`,
    job.department ? `${clean(job.department)}.` : '',
    job.requiredQualifications.minDegree ? `Qualification: ${clean(job.requiredQualifications.minDegree)}.` : '',
    job.applicationDeadline && isOpenJob(job) ? `Apply by ${job.applicationDeadline}.` : '',
    !isOpenJob(job) ? 'This vacancy is closed.' : '',
  ];
  return clip(parts.filter(Boolean).join(' '), 158);
}

/** 7th CPC pay level text such as "Level 10 (₹57,700 - ₹1,82,400)" → monthly pay range. Anything else → none. */
function monthlyPayRange(job: Job): { min: number; max: number } | null {
  const m = (job.payScale.cpcBand || '').match(/^Level\s*\d+[A-Z]?\s*\(\s*₹\s*([\d,]+)\s*[-–]\s*₹\s*([\d,]+)\s*\)/i);
  if (!m || job.payScale.consolidated) return null;
  const min = Number(m[1].replace(/,/g, '')), max = Number(m[2].replace(/,/g, ''));
  return min > 0 && max >= min ? { min, max } : null;
}

const istDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toISOString().slice(0, 10));
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * schema.org JobPosting built only from what the vacancy page shows. Returns null when Google's required
 * fields are not reliably known (no location, no description, not a single job) or the vacancy is closed.
 */
export function jobPostingJsonLd(job: Job, institute: Institute | null): Record<string, unknown> | null {
  if (!isOpenJob(job) || !isSingleJob(job)) return null;
  if (!job.location.city && !job.location.state) return null;
  const q = job.requiredQualifications;
  const sections = [
    job.description ? `<p>${esc(job.description).replace(/\n+/g, '<br>')}</p>` : '',
    q.minDegree ? `<p><strong>Minimum qualification:</strong> ${esc(q.minDegree)}</p>` : '',
    q.experienceText || q.minExperienceYears ? `<p><strong>Experience:</strong> ${esc(q.experienceText || `${q.minExperienceYears} years`)}</p>` : '',
  ].filter(Boolean).join('');
  if (!sections) return null;
  const pay = monthlyPayRange(job);
  const website = institute?.website && /^https?:\/\//.test(institute.website) ? institute.website : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: clean(job.title),
    description: sections,
    datePosted: istDate(job.postedAt),
    ...(job.applicationDeadline ? { validThrough: `${job.applicationDeadline}T23:59:59+05:30` } : {}),
    hiringOrganization: {
      '@type': 'Organization',
      name: clean(job.instituteName),
      ...(website ? { sameAs: website } : {}),
      ...(job.instituteLogo && /^https?:\/\//.test(job.instituteLogo) ? { logo: job.instituteLogo } : {}),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(job.location.city ? { addressLocality: job.location.city } : {}),
        ...(job.location.state ? { addressRegion: job.location.state } : {}),
        addressCountry: 'IN',
      },
    },
    ...(job.advertisementNumber ? { identifier: { '@type': 'PropertyValue', name: clean(job.instituteName), value: job.advertisementNumber } } : {}),
    ...(pay ? { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', minValue: pay.min, maxValue: pay.max, unitText: 'MONTH' } } } : {}),
    url: `${SITE_URL}/jobs/${encodeURIComponent(job.id)}`,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

export function instituteDescriptionForSeo(inst: Institute, openCount: number): string {
  const where = [inst.location.city, inst.location.state].filter(Boolean).join(', ');
  const base = `${clean(inst.name)}${where ? `, ${where}` : ''}: faculty recruitment on AcadeXMatch.`;
  const jobs = openCount ? ` ${openCount} open faculty vacanc${openCount === 1 ? 'y' : 'ies'}.` : ' See current and upcoming faculty vacancies.';
  const extra = inst.accreditation?.naacGrade && inst.accreditation.naacGrade !== 'Under Review' ? ` NAAC ${inst.accreditation.naacGrade}.` : '';
  return clip(base + jobs + extra, 158);
}
