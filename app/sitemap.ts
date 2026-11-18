import type { MetadataRoute } from 'next';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { isOpenJob } from '@/lib/server/seo';
import { SITE_URL } from '@/lib/site';
import { isEventLive } from '@/lib/events';
import { livePosts } from '@/lib/server/blog';
import { postUrl } from '@/lib/blog';
import type { AcademicEvent, Institute, Job } from '@/types';

// Built from the live database on each request, so new, changed and closed vacancies are reflected at once.
export const dynamic = 'force-dynamic';

const MAX_URLS = 45000; // the sitemap protocol allows 50,000 per file

function isoDay(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { jobs, institutes, events } = await withDb(null, db => ({
    events: ((db[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).filter(e => isEventLive(e)),
    jobs: ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(isOpenJob),
    institutes: ((db[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).filter(i => i.verificationStatus === 'verified'),
  }));
  const posts = await livePosts().catch(() => []);
  const latestJob = jobs.map(j => isoDay(j.postedAt)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, ...(latestJob ? { lastModified: latestJob } : {}) },
    { url: `${SITE_URL}/jobs`, ...(latestJob ? { lastModified: latestJob } : {}) },
    { url: `${SITE_URL}/institutes` },
    { url: `${SITE_URL}/events` },
    { url: `${SITE_URL}/conferences` },
    { url: `${SITE_URL}/blog`, ...(posts[0]?.publishAt ? { lastModified: new Date(posts[0].publishAt) } : {}) },
    { url: `${SITE_URL}/salary-calculator` },
    { url: `${SITE_URL}/premium` },
    { url: `${SITE_URL}/about` },
    { url: `${SITE_URL}/terms` },
    { url: `${SITE_URL}/privacy` },
  ];
  const jobUrls = jobs.map(j => ({ url: `${SITE_URL}/jobs/${encodeURIComponent(j.id)}`, ...(isoDay(j.postedAt) ? { lastModified: isoDay(j.postedAt) } : {}) }));
  const instUrls = institutes.map(i => ({ url: `${SITE_URL}/institutes/${encodeURIComponent(i.id)}`, ...(isoDay(i.verifiedAt) ? { lastModified: isoDay(i.verifiedAt) } : {}) }));
  const eventUrls = events.map(e => ({ url: `${SITE_URL}/events/${encodeURIComponent(e.id)}`, ...(isoDay(e.updatedAt || e.createdAt) ? { lastModified: isoDay(e.updatedAt || e.createdAt) } : {}) }));
  const postUrls = posts.map(p => ({ url: `${SITE_URL}${postUrl(p)}`, lastModified: new Date(p.updatedAt) }));
  return [...pages, ...postUrls, ...jobUrls, ...eventUrls, ...instUrls].slice(0, MAX_URLS);
}
