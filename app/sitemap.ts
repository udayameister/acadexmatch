import type { MetadataRoute } from 'next';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { isOpenJob } from '@/lib/server/seo';
import { SITE_URL } from '@/lib/site';
import type { Institute, Job } from '@/types';

// Built from the live database on each request, so new, changed and closed vacancies are reflected at once.
export const dynamic = 'force-dynamic';

const MAX_URLS = 45000; // the sitemap protocol allows 50,000 per file

function isoDay(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { jobs, institutes } = await withDb(null, db => ({
    jobs: ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(isOpenJob),
    institutes: ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).filter(i => i.verificationStatus === 'verified'),
  }));
  const latestJob = jobs.map(j => isoDay(j.postedAt)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, ...(latestJob ? { lastModified: latestJob } : {}) },
    { url: `${SITE_URL}/jobs`, ...(latestJob ? { lastModified: latestJob } : {}) },
    { url: `${SITE_URL}/institutes` },
    { url: `${SITE_URL}/salary-calculator` },
    { url: `${SITE_URL}/premium` },
    { url: `${SITE_URL}/about` },
  ];
  const jobUrls = jobs.map(j => ({ url: `${SITE_URL}/jobs/${encodeURIComponent(j.id)}`, ...(isoDay(j.postedAt) ? { lastModified: isoDay(j.postedAt) } : {}) }));
  const instUrls = institutes.map(i => ({ url: `${SITE_URL}/institutes/${encodeURIComponent(i.id)}`, ...(isoDay(i.verifiedAt) ? { lastModified: isoDay(i.verifiedAt) } : {}) }));
  return [...pages, ...jobUrls, ...instUrls].slice(0, MAX_URLS);
}
