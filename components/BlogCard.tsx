import Link from 'next/link';
import { Clock, FileDown } from 'lucide-react';
import { fmtDate, typeLabel, type PostCard } from '@/lib/blog';

const TYPE_STYLE: Record<string, string> = {
  white_paper: 'bg-brand-900 text-white',
  report: 'bg-gold-400 text-brand-950',
  guide: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  news: 'bg-slate-100 text-slate-700 border border-slate-200',
  article: 'bg-brand-50 text-brand-800 border border-brand-100',
};

export function TypeBadge({ type }: { type: PostCard['type'] }) {
  return <span className={`inline-block text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${TYPE_STYLE[type] || TYPE_STYLE.article}`}>{typeLabel(type)}</span>;
}

/** Placeholder art when a post has no cover image: the type name on a maroon/gold pattern. */
function CoverFallback({ type, title }: { type: PostCard['type']; title: string }) {
  return (
    <div className="w-full h-full bg-[radial-gradient(circle_at_20%_20%,#a33b3b_0,#5c0a0a_55%,#3d0606_100%)] p-5 flex flex-col justify-end relative overflow-hidden" aria-hidden="true">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border-[18px] border-gold-400/30" />
      <div className="absolute right-10 bottom-16 w-16 h-16 rounded-full bg-gold-400/20" />
      <span className="text-gold-300 text-xs font-bold uppercase tracking-[0.18em]">{typeLabel(type)}</span>
      <span className="text-white font-bold text-lg leading-snug line-clamp-3 mt-1">{title}</span>
    </div>
  );
}

export default function BlogCard({ p, large = false }: { p: PostCard; large?: boolean }) {
  return (
    <article className={`group relative flex ${large ? 'flex-col lg:flex-row' : 'flex-col'} rounded-3xl bg-white border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition`}>
      <div className={`${large ? 'lg:w-1/2 aspect-[16/9] lg:aspect-auto lg:min-h-[320px]' : 'aspect-[16/9]'} bg-slate-100 overflow-hidden shrink-0`}>
        {p.coverUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.coverUrl} alt={p.coverAlt} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-500" />
          : <CoverFallback type={p.type} title={p.title} />}
      </div>
      <div className={`flex-1 flex flex-col ${large ? 'p-6 sm:p-8 lg:justify-center' : 'p-5'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={p.type} />
          {p.hasPdf && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><FileDown className="w-3.5 h-3.5" aria-hidden="true" /> PDF</span>}
        </div>
        <h3 className={`font-bold text-slate-900 mt-2.5 leading-snug group-hover:text-brand-800 ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
          <Link href={p.url} className="after:absolute after:inset-0">{p.title}</Link>
        </h3>
        <p className={`text-slate-600 mt-2 ${large ? 'text-base line-clamp-4' : 'text-sm line-clamp-3'}`}>{p.summary}</p>
        <div className="mt-auto pt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{p.author}</span>
          <span>{fmtDate(p.publishAt)}</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{p.readMinutes} min read</span>
        </div>
      </div>
    </article>
  );
}
