/* Blog types and labels shared by the public pages and the admin editor. */

export type PostType = 'article' | 'white_paper' | 'report' | 'guide' | 'news';

export const POST_TYPES: { id: PostType; label: string; plural: string; blurb: string }[] = [
  { id: 'article', label: 'Article', plural: 'Articles', blurb: 'Insights and opinion on academic hiring' },
  { id: 'white_paper', label: 'White paper', plural: 'White papers', blurb: 'In-depth research and analysis, with PDF download' },
  { id: 'report', label: 'Report', plural: 'Reports', blurb: 'Data and trends from Indian higher education' },
  { id: 'guide', label: 'Guide', plural: 'Guides', blurb: 'Practical how-tos for candidates and institutions' },
  { id: 'news', label: 'News', plural: 'News', blurb: 'Platform updates and announcements' },
];

export const typeLabel = (t: PostType) => POST_TYPES.find(x => x.id === t)?.label || 'Article';

export interface BlogPost {
  id: string;
  slug: string;
  type: PostType;
  title: string;
  summary: string;
  /** Markdown (see lib/markdown.ts). */
  body: string;
  author: string;
  authorRole?: string;
  tags: string[];
  coverFile?: string;
  coverAlt?: string;
  pdfFile?: string;
  pdfName?: string;
  pdfSize?: number;
  featured: boolean;
  status: 'draft' | 'published';
  /** When the post goes (or went) public. In the future = scheduled. */
  publishAt?: string;
  firstPublishedAt?: string;
  readMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export const fileUrl = (file: string) => `/api/blog/files/${file}`;
export const postUrl = (p: Pick<BlogPost, 'slug'>) => `/blog/${p.slug}`;

export function postState(p: BlogPost, now = Date.now()): 'draft' | 'scheduled' | 'published' {
  if (p.status !== 'published' || !p.publishAt) return 'draft';
  return Date.parse(p.publishAt) > now ? 'scheduled' : 'published';
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

export function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Start of the current week (Monday 00:00, India time) as a timestamp — for the weekly publishing tracker. */
export function weekStart(now = Date.now()): number {
  const ist = new Date(now + 5.5 * 3600_000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day);
  return mondayIst - 5.5 * 3600_000;
}

export interface PostCard {
  id: string; slug: string; url: string; type: PostType; title: string; summary: string; author: string; tags: string[];
  coverUrl: string | null; coverAlt: string; hasPdf: boolean; featured: boolean; publishAt?: string; readMinutes: number;
}

/** What list pages and cards need (no article body). */
export function toCard(p: BlogPost): PostCard {
  return {
    id: p.id, slug: p.slug, url: postUrl(p), type: p.type, title: p.title, summary: p.summary, author: p.author,
    tags: p.tags, coverUrl: p.coverFile ? fileUrl(p.coverFile) : null, coverAlt: p.coverAlt || '', hasPdf: !!p.pdfFile,
    featured: p.featured, publishAt: p.publishAt, readMinutes: p.readMinutes,
  };
}
