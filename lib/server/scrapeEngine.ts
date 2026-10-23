import { spawn } from 'child_process';
import path from 'path';
import type { Job } from '@/types';

/* Server-only: runs scraper.py and maps its output to Job records. Shared by the manual
   scraper endpoint and the daily scraping pipeline. */

export interface ScrapedRawOpening {
  position: string;
  department: string | null;
  qualification: string | null;
  experience: string | null;
  /** Pay level if stated, otherwise the salary / pay-scale text as stated. */
  pay_scale: string | null;
  pay_level?: string | null;
  salary?: string | null;
  deadline: string | null;
  deadline_iso?: string | null;
  number_of_posts?: string | null;
  advt_no?: string | null;
  source_url: string;
  layout?: string;
  extraction_layout?: string;
  description?: string | null;
  details_from_pdf?: boolean;
  pdf_note?: string | null;
}

export interface ScrapeEngineResult {
  institution_title: string | null;
  start_url: string;
  pages_crawled: number;
  career_hubs_discovered: string[];
  openings: ScrapedRawOpening[];
}

/** Blocks obvious internal / private targets so the crawler can't be pointed at the host's own network. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('[')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v || '').replace(/\s+/g, ' ').trim();
  return t ? t : null;
};

/**
 * Converts one scraped opening into a Job using ONLY values found on the source page.
 * Anything the page does not state is null and shows as "Not specified"; nothing is filled
 * in from defaults (no assumed pay level, qualification, regulations, tags or questions).
 */
export function transformRawToJob(raw: ScrapedRawOpening, index: number, institutionName: string | null, domain: string): Job {
  const pageTitle = clean(institutionName);
  const instName = pageTitle || domain;
  const shortName = clean(instName.split(/\s[|–—-]\s|,/)[0]) || instName;
  const experience = clean(raw.experience);
  const expYears = experience?.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  const deadlineText = clean(raw.deadline);
  const payLevel = clean(raw.pay_level);
  const salary = clean(raw.salary ?? (raw.pay_level ? null : raw.pay_scale));
  const now = new Date();

  return {
    id: `scraped-${domain.replace(/[^a-zA-Z0-9]/g, '')}-${index + 1}-${Date.now() % 100000}`,
    instituteId: `inst-${domain.replace(/[^a-zA-Z0-9]/g, '')}`,
    instituteName: instName,
    instituteShortName: shortName,
    instituteLogo: '',
    instituteType: null,
    title: clean(raw.position) || raw.position,
    designation: null,
    department: clean(raw.department),
    specializationTags: [],
    advertisementNumber: clean(raw.advt_no),
    location: { city: null, state: null },
    payScale: {
      cpcBand: payLevel || salary,
      entryPay: null,
      grossMonthlyEstimated: null,
      allowances: [],
    },
    requiredQualifications: {
      minDegree: clean(raw.qualification),
      netSletMandatory: null,
      phdNorms: null,
      minExperienceYears: expYears ? Number(expYears[1]) : null,
      experienceText: experience,
      minUgcCarePubs: null,
      ugcRegulationsYear: null,
      specializationRequirements: [],
    },
    reservationCategory: null,
    applicationDeadline: clean(raw.deadline_iso),
    deadlineText,
    status: 'published',
    isClaimedByInstitute: false,
    screeningQuestions: [],
    selectionProcess: [],
    description: null,
    responsibilities: [],
    benefits: [],
    postedAt: now.toISOString().split('T')[0],
    applicantCount: 0,
    featured: false,
    externalApplyUrl: raw.source_url,
    source: {
      url: raw.source_url,
      pageTitle,
      extractedAt: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      rawText: clean(raw.description),
      numberOfPosts: clean(raw.number_of_posts),
      salaryText: salary,
      fromPdf: !!raw.details_from_pdf,
      pdfNote: clean(raw.pdf_note),
    },
  };
}

export interface ScrapeOutcome {
  ok: boolean;
  error?: string;
  institutionTitle?: string;
  pagesCrawled?: number;
  jobs: Job[];
  raw?: ScrapeEngineResult;
}

/** Validates a public http(s) URL; returns null if it may not be scraped. */
export function normaliseScrapeUrl(input: string): URL | null {
  try {
    const u = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
    if (!['http:', 'https:'].includes(u.protocol) || isPrivateHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Scrapes one URL and returns mapped jobs. Uses the built-in Node.js crawler (works on any host);
 * set SCRAPER_ENGINE=python to use scraper.py instead (needs Python with httpx, beautifulsoup4, pypdf).
 */
export async function runScraper(url: URL, timeoutMs = 60000): Promise<ScrapeOutcome> {
  if (process.env.SCRAPER_ENGINE !== 'python') {
    try {
      const { crawlCollege } = await import('./crawler');
      const parsed = await crawlCollege(url.toString(), 12, 2, timeoutMs - 5000);
      const domain = url.hostname.replace('www.', '');
      const jobs = (parsed.openings || []).map((o, i) => transformRawToJob(o, i, parsed.institution_title, domain));
      return { ok: true, institutionTitle: parsed.institution_title || undefined, pagesCrawled: parsed.pages_crawled, jobs, raw: parsed };
    } catch (e) {
      return { ok: false, error: `Scraper error: ${(e as Error).message}`.slice(0, 500), jobs: [] };
    }
  }
  return runPythonScraper(url, timeoutMs);
}

async function runPythonScraper(url: URL, timeoutMs: number): Promise<ScrapeOutcome> {
  const scriptPath = path.join(process.cwd(), 'scraper.py');
  const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const child = spawn(pythonBin, [scriptPath, url.toString(), '--json-only'], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  let stdout = '';
  let stderr = '';
  const code = await new Promise<number | null>(resolve => {
    const timer = setTimeout(() => { child.kill(); stderr = `Timed out after ${timeoutMs / 1000} seconds.`; resolve(-2); }, timeoutMs);
    child.stdout.on('data', c => { stdout += c.toString('utf-8'); });
    child.stderr.on('data', c => { stderr += c.toString('utf-8'); });
    child.on('close', c => { clearTimeout(timer); resolve(c); });
    child.on('error', err => { clearTimeout(timer); stderr = `Could not start Python (${err.message}). Install Python 3.10+ and run: pip install httpx beautifulsoup4 pypdf — or set PYTHON_BIN.`; resolve(-1); });
  });
  if (code !== 0) return { ok: false, error: (stderr || 'Scraper exited with an error.').trim().slice(0, 500), jobs: [] };
  const a = stdout.indexOf('{');
  const b = stdout.lastIndexOf('}');
  if (a === -1 || b === -1) return { ok: false, error: 'The scraper returned no data.', jobs: [] };
  let parsed: ScrapeEngineResult;
  try {
    parsed = JSON.parse(stdout.slice(a, b + 1));
  } catch {
    return { ok: false, error: 'Could not read the scraper output.', jobs: [] };
  }
  const domain = url.hostname.replace('www.', '');
  const jobs = (parsed.openings || []).map((o, i) => transformRawToJob(o, i, parsed.institution_title, domain));
  return { ok: true, institutionTitle: parsed.institution_title || undefined, pagesCrawled: parsed.pages_crawled, jobs, raw: parsed };
}
