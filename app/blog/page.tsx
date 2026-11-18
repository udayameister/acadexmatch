import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, FileText, Rss } from 'lucide-react';
import BlogCard from '@/components/BlogCard';
import { livePosts } from '@/lib/server/blog';
import { POST_TYPES, toCard, type PostType } from '@/lib/blog';

export const dynamic = 'force-dynamic';

type Search = { searchParams: Promise<{ type?: string; tag?: string }> };

export async function generateMetadata({ searchParams }: Search): Promise<Metadata> {
  const { type } = await searchParams;
  const t = POST_TYPES.find(x => x.id === type);
  const title = t ? `${t.plural} on academic hiring in India` : 'Blog, white papers and reports on academic hiring in India';
  return {
    title,
    description: t ? `${t.plural} from AcadeXMatch: ${t.blurb.toLowerCase()}.` : 'Weekly articles, white papers, reports and guides from AcadeXMatch on faculty recruitment, UGC/AICTE norms, careers and hiring in Indian higher education.',
    alternates: { canonical: t ? `/blog?type=${t.id}` : '/blog', types: { 'application/rss+xml': '/blog/rss.xml' } },
    openGraph: { type: 'website', url: '/blog', title: `${title} | AcadeXMatch` },
  };
}

export default async function BlogIndex({ searchParams }: Search) {
  const { type, tag } = await searchParams;
  const active = POST_TYPES.find(x => x.id === type)?.id as PostType | undefined;
  const all = (await livePosts()).map(toCard);
  let list = active ? all.filter(p => p.type === active) : all;
  if (tag) list = list.filter(p => p.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
  const featured = !active && !tag ? (list.find(p => p.featured) || list[0]) : undefined;
  const rest = featured ? list.filter(p => p.id !== featured.id) : list;
  const counts = Object.fromEntries(POST_TYPES.map(t => [t.id, all.filter(p => p.type === t.id).length]));
  const papers = all.filter(p => p.type === 'white_paper').slice(0, 3);

  return (
    <div className="w-full">
      <section className="bg-brand-950 text-white border-b-2 border-gold-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300 flex items-center gap-2"><BookOpen className="w-4 h-4" aria-hidden="true" /> Insights &amp; resources</p>
          <h1 className="text-3xl sm:text-5xl font-bold mt-3 max-w-3xl leading-tight">Ideas, research and guides for academic hiring in India</h1>
          <p className="text-brand-100/85 mt-4 max-w-2xl text-base sm:text-lg">New every week: white papers, reports and practical guides for faculty, researchers and the institutions that hire them.</p>
          <nav className="flex flex-wrap gap-2 mt-7" aria-label="Filter by type">
            <Link href="/blog" aria-current={!active ? 'page' : undefined} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${!active ? 'bg-gold-400 text-brand-950 border-gold-400' : 'border-white/25 text-white hover:bg-white/10'}`}>All <span className="opacity-70">({all.length})</span></Link>
            {POST_TYPES.filter(t => counts[t.id] > 0 || t.id === 'white_paper').map(t => (
              <Link key={t.id} href={`/blog?type=${t.id}`} aria-current={active === t.id ? 'page' : undefined} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${active === t.id ? 'bg-gold-400 text-brand-950 border-gold-400' : 'border-white/25 text-white hover:bg-white/10'}`}>
                {t.plural} <span className="opacity-70">({counts[t.id]})</span>
              </Link>
            ))}
            <a href="/blog/rss.xml" className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gold-200 hover:bg-white/10" title="Follow with an RSS reader"><Rss className="w-4 h-4" aria-hidden="true" /> RSS</a>
          </nav>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-10">
        {tag && (
          <p className="text-sm text-slate-600">Showing posts tagged <strong className="text-slate-900">“{tag}”</strong>. <Link href={active ? `/blog?type=${active}` : '/blog'} className="font-semibold text-brand-800 underline">Clear</Link></p>
        )}
        {active && <p className="text-slate-600 -mt-2">{POST_TYPES.find(t => t.id === active)!.blurb}.</p>}

        {list.length === 0 ? (
          <div className="text-center py-16 rounded-3xl border border-dashed border-slate-300 bg-white">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" aria-hidden="true" />
            <p className="font-semibold text-slate-800 mt-3">{all.length ? 'Nothing here yet.' : 'Our first posts are on the way.'}</p>
            <p className="text-sm text-slate-500 mt-1">{all.length ? <Link href="/blog" className="underline text-brand-800 font-semibold">See all posts</Link> : 'A new article or white paper is published every week.'}</p>
          </div>
        ) : (
          <>
            {featured && <BlogCard p={featured} large />}
            {rest.length > 0 && (
              <section aria-label={featured ? 'More posts' : 'Posts'}>
                {featured && <h2 className="text-xl font-bold text-slate-900 mb-5">Latest</h2>}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{rest.map(p => <BlogCard key={p.id} p={p} />)}</div>
              </section>
            )}
          </>
        )}

        {!active && papers.length > 0 && (
          <section className="rounded-3xl bg-gradient-to-br from-gold-50 to-white border border-gold-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-brand-800" aria-hidden="true" /> White papers</h2>
            <p className="text-sm text-slate-600 mt-1">In-depth research you can read online or download as PDF.</p>
            <ul className="mt-4 divide-y divide-gold-200/70">
              {papers.map(p => (
                <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <Link href={p.url} className="font-semibold text-slate-900 hover:text-brand-800">{p.title}</Link>
                  <Link href={p.url} className="text-sm font-semibold text-brand-800 hover:underline">Read →</Link>
                </li>
              ))}
            </ul>
            <Link href="/blog?type=white_paper" className="inline-block mt-3 text-sm font-semibold text-brand-800 hover:underline">All white papers →</Link>
          </section>
        )}
      </div>
    </div>
  );
}
