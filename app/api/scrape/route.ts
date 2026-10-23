import { NextRequest, NextResponse } from 'next/server';
import { normaliseScrapeUrl, runScraper } from '@/lib/server/scrapeEngine';
import { requireAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Crawls one university / college website for faculty vacancies (preview only; nothing is saved). */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const input = String(body.url || '').trim();
    if (!input) return NextResponse.json({ success: false, error: 'University URL is required.' }, { status: 400 });
    const url = normaliseScrapeUrl(input);
    if (!url) return NextResponse.json({ success: false, error: 'Only public university websites (http or https) can be scraped.' }, { status: 400 });

    const out = await runScraper(url);
    if (!out.ok) return NextResponse.json({ success: false, error: `Scraping failed: ${out.error}` }, { status: 500 });
    const parsed = out.raw;
    return NextResponse.json({
      success: true,
      telemetry: {
        institutionTitle: parsed?.institution_title ?? null,
        seedUrl: parsed?.start_url ?? url.toString(),
        pagesCrawled: parsed?.pages_crawled ?? 0,
        careerHubsDiscovered: parsed?.career_hubs_discovered || [],
        totalFacultyFound: out.jobs.length,
      },
      openings: parsed?.openings || [],
      jobs: out.jobs,
    });
  } catch (err) {
    console.error('[Scraper API Route] Internal error:', err);
    return NextResponse.json({ success: false, error: (err as Error).message || 'Internal server error' }, { status: 500 });
  }
}
