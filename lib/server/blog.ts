import { readJson, writeJson, putBlob, getBlob, deleteBlob } from './persist';
import { plainText, readingMinutes, slugify } from '../markdown';
import { POST_TYPES, type BlogPost, type PostType } from '../blog';

/*
 * Blog posts, white papers, reports and guides written by the AcadeXMatch team in the admin console.
 * List: json:blog. Files (cover images, inline images, PDFs): blobs "blog/<file>".
 * A post is public when it is published and its publish time has come (so posts can be scheduled ahead).
 */

const STORE = 'blog';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const FILE_NAME_RE = /^[a-z0-9-]{6,80}\.(png|jpg|webp|pdf)$/;
export const blobId = (file: string) => `blog/${file}`;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
export const mimeOf = (file: string) => MIME[file.split('.').pop() || ''] || 'application/octet-stream';

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

// Short in-memory copy: blog pages are read far more often than they are written, and a fast lookup lets a
// missing post answer with a real 404 before the page starts streaming. Saving refreshes it at once.
const CACHE_MS = 60_000;
let cache: { at: number; list: BlogPost[] } | null = null;

async function read(): Promise<BlogPost[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.list.map(p => ({ ...p, tags: [...p.tags] }));
  const raw = await readJson<BlogPost[]>(STORE);
  const list = Array.isArray(raw) ? raw : [];
  cache = { at: Date.now(), list };
  return list.map(p => ({ ...p, tags: [...p.tags] }));
}
async function write(list: BlogPost[]): Promise<void> {
  list.sort((a, b) => (b.publishAt || b.updatedAt).localeCompare(a.publishAt || a.updatedAt));
  cache = null;
  await writeJson(STORE, list);
  cache = { at: Date.now(), list: list.map(p => ({ ...p, tags: [...p.tags] })) };
}

export const isLive = (p: BlogPost, now = Date.now()) => p.status === 'published' && !!p.publishAt && Date.parse(p.publishAt) <= now;

export async function listPosts(): Promise<BlogPost[]> {
  return locked(read);
}

export async function livePosts(): Promise<BlogPost[]> {
  const now = Date.now();
  return (await listPosts()).filter(p => isLive(p, now));
}

export async function livePostBySlug(slug: string): Promise<BlogPost | null> {
  return (await livePosts()).find(p => p.slug === slug) || null;
}

export async function postById(id: string): Promise<BlogPost | null> {
  return (await listPosts()).find(p => p.id === id) || null;
}

export class BlogError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const clean = (x: unknown, max: number) => String(typeof x === 'string' ? x : '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (x: unknown, max: number) => clean(x, max).replace(/\s+/g, ' ');

export interface PostInput {
  id?: string;
  type?: PostType;
  title?: string;
  slug?: string;
  summary?: string;
  body?: string;
  author?: string;
  authorRole?: string;
  tags?: string[] | string;
  coverFile?: string | null;
  coverAlt?: string;
  pdfFile?: string | null;
  pdfName?: string | null;
  pdfSize?: number | null;
  featured?: boolean;
  /** 'draft' saves without publishing; 'published' publishes at publishAt (now when empty). */
  status?: 'draft' | 'published';
  publishAt?: string | null;
}

function validFile(f: unknown, kind: 'image' | 'pdf'): string | null {
  if (typeof f !== 'string' || !FILE_NAME_RE.test(f)) return null;
  const isPdf = f.endsWith('.pdf');
  return (kind === 'pdf') === isPdf ? f : null;
}

function uniqueSlug(base: string, list: BlogPost[], selfId?: string): string {
  const root = slugify(base) || 'post';
  let s = root;
  for (let n = 2; list.some(p => p.slug === s && p.id !== selfId); n++) s = `${root}-${n}`;
  return s;
}

/** Creates or updates a post. Returns the saved post. */
export function savePost(input: PostInput): Promise<BlogPost> {
  return locked(async () => {
    const list = await read();
    const now = new Date().toISOString();
    const existing = input.id ? list.find(p => p.id === input.id) : undefined;
    if (input.id && !existing) throw new BlogError('Post not found.', 404);

    const title = oneLine(input.title ?? existing?.title, 180);
    if (!title) throw new BlogError('Please add a title.');
    const body = clean(input.body ?? existing?.body, 200_000);
    const type: PostType = POST_TYPES.some(t => t.id === input.type) ? input.type! : existing?.type || 'article';
    const status = input.status === 'published' || input.status === 'draft' ? input.status : existing?.status || 'draft';
    if (status === 'published' && plainText(body).length < 40 && !(input.pdfFile ?? existing?.pdfFile)) {
      throw new BlogError('Write the article (or attach the PDF) before publishing.');
    }
    let publishAt = input.publishAt === undefined ? existing?.publishAt || null : input.publishAt;
    if (publishAt && Number.isNaN(Date.parse(publishAt))) throw new BlogError('Invalid publish date.');
    if (publishAt) publishAt = new Date(publishAt).toISOString();
    if (status === 'published' && !publishAt) publishAt = now;

    const tagsIn = Array.isArray(input.tags) ? input.tags : typeof input.tags === 'string' ? input.tags.split(',') : existing?.tags || [];
    const tags = [...new Set(tagsIn.map(t => oneLine(t, 40)).filter(Boolean))].slice(0, 8);
    const summary = oneLine(input.summary ?? existing?.summary, 400) || plainText(body).slice(0, 220);
    const slugWanted = input.slug !== undefined ? oneLine(input.slug, 90) : '';
    // The address is fixed once a post has been published, so shared links keep working; drafts follow the title.
    const slug = existing?.firstPublishedAt && !slugWanted
      ? existing.slug
      : uniqueSlug(slugWanted || (existing?.firstPublishedAt ? existing.slug : title), list, existing?.id);

    const cover = input.coverFile === undefined ? existing?.coverFile || null : input.coverFile === null ? null : validFile(input.coverFile, 'image');
    const pdf = input.pdfFile === undefined ? existing?.pdfFile || null : input.pdfFile === null ? null : validFile(input.pdfFile, 'pdf');

    const post: BlogPost = {
      id: existing?.id || `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      slug, type, title, summary, body,
      author: oneLine(input.author ?? existing?.author, 80) || 'AcadeXMatch team',
      authorRole: oneLine(input.authorRole ?? existing?.authorRole, 120) || undefined,
      tags,
      coverFile: cover || undefined,
      coverAlt: oneLine(input.coverAlt ?? existing?.coverAlt, 200) || undefined,
      pdfFile: pdf || undefined,
      pdfName: pdf ? (oneLine(input.pdfName ?? existing?.pdfName, 140) || `${slug}.pdf`) : undefined,
      pdfSize: pdf ? (typeof input.pdfSize === 'number' ? input.pdfSize : existing?.pdfSize) : undefined,
      featured: typeof input.featured === 'boolean' ? input.featured : !!existing?.featured,
      status,
      publishAt: publishAt || undefined,
      firstPublishedAt: existing?.firstPublishedAt || (status === 'published' ? publishAt || now : undefined),
      readMinutes: readingMinutes(body),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (post.featured) list.forEach(p => { if (p.id !== post.id) p.featured = false; });
    const next = existing ? list.map(p => (p.id === post.id ? post : p)) : [post, ...list];

    // Files no longer used by this post are removed.
    const unused = [existing?.coverFile, existing?.pdfFile].filter(f => f && f !== post.coverFile && f !== post.pdfFile) as string[];
    await write(next);
    await Promise.all(unused.filter(f => !String(post.body).includes(f)).map(f => deleteBlob(blobId(f)).catch(() => undefined)));
    return post;
  });
}

export function deletePost(id: string): Promise<boolean> {
  return locked(async () => {
    const list = await read();
    const p = list.find(x => x.id === id);
    if (!p) return false;
    await write(list.filter(x => x.id !== id));
    const files = new Set([p.coverFile, p.pdfFile, ...(p.body.match(/[a-z0-9-]{6,80}\.(png|jpg|webp|pdf)/g) || [])].filter(Boolean) as string[]);
    const usedElsewhere = (f: string) => list.some(x => x.id !== id && (x.coverFile === f || x.pdfFile === f || x.body.includes(f)));
    await Promise.all([...files].filter(f => FILE_NAME_RE.test(f) && !usedElsewhere(f)).map(f => deleteBlob(blobId(f)).catch(() => undefined)));
    return true;
  });
}

/** Checks the real file type by its first bytes. */
export function sniff(bytes: Buffer): 'png' | 'jpg' | 'webp' | 'pdf' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length > 5 && bytes.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

export async function storeFile(bytes: Buffer): Promise<{ file: string; mime: string; size: number }> {
  const ext = sniff(bytes);
  if (!ext) throw new BlogError('Upload a PNG, JPG or WebP image, or a PDF.');
  if (ext === 'pdf' && bytes.length > MAX_PDF_BYTES) throw new BlogError('PDF must be 10 MB or smaller.');
  if (ext !== 'pdf' && bytes.length > MAX_IMAGE_BYTES) throw new BlogError('Images must be 2 MB or smaller.');
  const file = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  await putBlob(blobId(file), MIME[ext], bytes);
  return { file, mime: MIME[ext], size: bytes.length };
}

export async function readFile(file: string): Promise<Buffer | null> {
  if (!FILE_NAME_RE.test(file)) return null;
  return getBlob(blobId(file));
}
