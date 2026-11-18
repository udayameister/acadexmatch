import Link from 'next/link';
import { ArrowLeft, Clock, Download, ExternalLink, FileText, ListTree } from 'lucide-react';
import JsonLd from '@/components/JsonLd';
import BlogCard, { TypeBadge } from '@/components/BlogCard';
import ShareButtons from '@/components/BlogShare';
import { livePostBySlug, livePosts } from '@/lib/server/blog';
import { renderMarkdown } from '@/lib/markdown';
import { fileUrl, fmtDate, fmtSize, postUrl, toCard, typeLabel } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';


type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const p = await livePostBySlug(slug);
  if (!p) return null; // the layout answers 404 for missing posts
  const { html, headings } = renderMarkdown(p.body);
  const url = `${SITE_URL}${postUrl(p)}`;
  const toc = headings.filter(h => h.level === 2);
  const others = (await livePosts()).filter(x => x.id !== p.id);
  const related = [...others.filter(x => x.type === p.type || x.tags.some(t => p.tags.includes(t))), ...others].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3).map(toCard);
  const pdfHref = p.pdfFile ? fileUrl(p.pdfFile) : null;

  const data = {
    '@context': 'https://schema.org',
    '@type': p.type === 'news' ? 'NewsArticle' : p.type === 'report' || p.type === 'white_paper' ? 'Report' : 'BlogPosting',
    headline: p.title.slice(0, 110),
    description: p.summary,
    datePublished: p.publishAt,
    dateModified: p.updatedAt,
    author: { '@type': p.author === 'AcadeXMatch team' ? 'Organization' : 'Person', name: p.author, ...(p.authorRole ? { jobTitle: p.authorRole } : {}) },
    publisher: { '@type': 'Organization', name: 'AcadeXMatch', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.svg` } },
    mainEntityOfPage: url,
    url,
    keywords: p.tags.join(', ') || undefined,
    ...(p.coverFile ? { image: `${SITE_URL}${fileUrl(p.coverFile)}` } : {}),
    ...(pdfHref ? { associatedMedia: { '@type': 'MediaObject', contentUrl: `${SITE_URL}${pdfHref}`, encodingFormat: 'application/pdf', name: p.pdfName } } : {}),
    wordCount: p.readMinutes * 200,
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 2, name: typeLabel(p.type), item: `${SITE_URL}/blog?type=${p.type}` },
      { '@type': 'ListItem', position: 3, name: p.title, item: url },
    ],
  };

  const pdfBox = pdfHref && (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="w-12 h-12 rounded-xl bg-brand-900 text-white grid place-items-center shrink-0"><FileText className="w-6 h-6" aria-hidden="true" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900">{p.type === 'white_paper' ? 'Download the full white paper' : 'Download the PDF'}</p>
        <p className="text-sm text-slate-600 break-words">{p.pdfName}{p.pdfSize ? ` · ${fmtSize(p.pdfSize)}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`${pdfHref}?download=1`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><Download className="w-4 h-4" /> Download PDF</a>
        <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50">Open <ExternalLink className="w-4 h-4" /></a>
      </div>
    </div>
  );

  return (
    <article className="w-full">
      <JsonLd data={data} />
      <JsonLd data={crumbs} />
      <header className="bg-gradient-to-b from-brand-50/70 to-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline"><ArrowLeft className="w-4 h-4" /> All posts</Link>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={`/blog?type=${p.type}`}><TypeBadge type={p.type} /></Link>
            {p.tags.map(t => <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:border-brand-300">{t}</Link>)}
          </div>
          <h1 className="text-3xl sm:text-[2.6rem] font-bold text-slate-900 mt-4 leading-tight break-words">{p.title}</h1>
          <p className="text-lg text-slate-600 mt-4 leading-relaxed">{p.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-brand-900 text-white grid place-items-center text-xs font-bold" aria-hidden="true">{p.author.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              <span><span className="font-semibold text-slate-800">{p.author}</span>{p.authorRole ? <span className="block text-xs">{p.authorRole}</span> : null}</span>
            </span>
            <span>{fmtDate(p.publishAt)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4" aria-hidden="true" />{p.readMinutes} min read</span>
          </div>
        </div>
      </header>

      {p.coverFile && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(p.coverFile)} alt={p.coverAlt || ''} className="w-full max-h-[520px] object-cover rounded-3xl border border-slate-200 shadow-sm" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {pdfBox}
        {toc.length >= 3 && (
          <nav aria-label="Contents" className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-slate-900 flex items-center gap-2"><ListTree className="w-4 h-4 text-brand-800" aria-hidden="true" /> Contents</p>
            <ol className="mt-3 space-y-1.5 text-sm list-decimal pl-5 marker:text-slate-400">
              {toc.map(h => <li key={h.id}><a href={`#${h.id}`} className="text-slate-700 hover:text-brand-800 hover:underline">{h.text}</a></li>)}
            </ol>
          </nav>
        )}
        {p.body.trim() && <div className="acx-prose" dangerouslySetInnerHTML={{ __html: html }} />}
        {p.body.trim() && pdfBox}
        <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <ShareButtons url={url} title={p.title} />
          <Link href="/blog" className="text-sm font-semibold text-brand-800 hover:underline">More from the blog →</Link>
        </div>
      </div>

      {related.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-5">Keep reading</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{related.map(r => <BlogCard key={r.id} p={r} />)}</div>
        </section>
      )}
    </article>
  );
}
