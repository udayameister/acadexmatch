import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { livePostBySlug } from '@/lib/server/blog';
import { fileUrl, postUrl } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';
import { X_HANDLE } from '@/lib/contact';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await livePostBySlug(slug);
  if (!p) return { title: 'Post not found', robots: { index: false, follow: true } };
  const path = postUrl(p);
  const image = p.coverFile ? `${SITE_URL}${fileUrl(p.coverFile)}` : undefined;
  return {
    title: p.title,
    description: p.summary,
    alternates: { canonical: path },
    authors: [{ name: p.author }],
    keywords: p.tags,
    openGraph: {
      type: 'article', url: path, title: p.title, description: p.summary,
      publishedTime: p.publishAt, modifiedTime: p.updatedAt, authors: [p.author], tags: p.tags,
      ...(image ? { images: [{ url: image, alt: p.coverAlt || p.title }] } : {}),
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: p.title, description: p.summary, ...(image ? { images: [image] } : {}), ...(X_HANDLE ? { site: `@${X_HANDLE}` } : {}) },
  };
}

/** Drafts, scheduled and deleted posts answer with a real 404 (checked before the page starts streaming). */
export default async function Layout({ params, children }: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  if (!(await livePostBySlug(slug))) notFound();
  return children;
}
