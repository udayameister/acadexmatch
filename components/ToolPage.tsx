import React from 'react';
import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import { FREE_TOOLS } from '@/lib/tools';
import ToolIcon from '@/components/ToolIcon';

/** Frame shared by every free tool: heading, the tool, sources/notes, and other tools. */
export default function ToolPage({ slug, title, intro, children, notes }: { slug: string; title: string; intro: React.ReactNode; children: React.ReactNode; notes?: React.ReactNode }) {
  const t = FREE_TOOLS.find(x => x.slug === slug);
  const others = FREE_TOOLS.filter(x => x.live && x.slug !== slug).slice(0, 4);
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <header>
        <Link href="/tools" className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3 hover:underline"><span className="gold-rule" />Free tools</Link>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-800 mt-2 flex items-start gap-3">{t && <ToolIcon name={t.icon} className="w-8 h-8 text-gold-500 mt-1 shrink-0" />}<span>{title}</span></h1>
        <div className="text-slate-600 mt-2 max-w-3xl">{intro}</div>
      </header>
      {children}
      {notes && <aside className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600 space-y-2"><p className="font-semibold text-slate-800 flex items-center gap-2"><Info className="w-4 h-4" /> How this is calculated</p>{notes}</aside>}
      <section>
        <h2 className="font-serif text-xl font-bold text-slate-900">More free tools</h2>
        <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {others.map(o => (
            <li key={o.slug}><Link href={o.href} className="h-full flex flex-col gap-1 p-4 rounded-2xl bg-white border border-slate-200 hover:border-brand-300 hover:shadow-sm">
              <span className="font-semibold text-slate-900 text-sm flex items-center gap-2"><ToolIcon name={o.icon} className="w-4 h-4 text-brand-700" />{o.title}</span>
              <span className="text-xs text-slate-500">{o.short}</span>
              <span className="text-xs font-semibold text-brand-700 mt-auto pt-1 inline-flex items-center gap-1">Open <ArrowRight className="w-3 h-3" /></span>
            </Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
