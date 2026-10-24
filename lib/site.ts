/*
 * Site-wide SEO settings. SITE_URL is the canonical origin (the host the site is actually served on after
 * redirects). Override with the SITE_URL environment variable if the preferred host changes.
 */
export const SITE_URL = (process.env.SITE_URL || 'https://acadexmatch.com').replace(/\/$/, '');
export const SITE_NAME = 'AcadeXMatch';
export const DEFAULT_TITLE = 'Academic Jobs & Faculty Recruitment in India | AcadeXMatch';
export const DEFAULT_DESCRIPTION =
  'Find Assistant Professor and faculty vacancies at Indian universities and colleges, with UGC/AICTE eligibility, 7th CPC pay and explainable match scores. Institutions hire faculty end to end on AcadeXMatch.';

/** Pages anyone may see; they are server-rendered with public data. Everything else waits for sign-in data. */
const PUBLIC_PREFIXES = ['/jobs', '/institutes', '/about', '/premium', '/salary-calculator'];
export function isPublicPath(pathname: string | null | undefined): boolean {
  const p = pathname || '/';
  return p === '/' || PUBLIC_PREFIXES.some(x => p === x || p.startsWith(`${x}/`));
}

/** Routes that must never appear in search results (also sent as X-Robots-Tag, see next.config.mjs). */
export const PRIVATE_PREFIXES = [
  '/admin', '/candidate', '/institute', '/account', '/invoice', '/offer', '/scraper',
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/api',
];

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
