import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FREE_TOOLS } from '@/lib/tools';
import ToolIcon from '@/components/ToolIcon';

/** Grid of the free tools (home page and /tools). Live tools first, then the ones coming soon. */
export function FreeToolsGrid({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const tools = [...FREE_TOOLS.filter(t => t.live), ...FREE_TOOLS.filter(t => !t.live)].slice(0, limit);
  return (
    <ul className={`grid sm:grid-cols-2 ${compact ? 'lg:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-3`}>
      {tools.map(t => {
        const inner = (
          <>
            <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${t.live ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-400'}`}><ToolIcon name={t.icon} className="w-5 h-5" /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-2"><span className="font-semibold text-slate-900 leading-snug">{t.title}</span>{!t.live && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Soon</span>}</span>
              <span className="block text-sm text-slate-600 mt-1 leading-snug">{t.short}</span>
              <span className="block text-xs text-slate-400 mt-1.5">For {/^[A-Z][a-z]/.test(t.who) ? t.who.charAt(0).toLowerCase() + t.who.slice(1) : t.who}</span>
            </span>
          </>
        );
        return (
          <li key={t.slug}>
            {t.live
              ? <Link href={t.href} className="group h-full flex gap-3 p-4 rounded-2xl bg-white border border-slate-200 hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5 transition">{inner}</Link>
              : <div className="h-full flex gap-3 p-4 rounded-2xl bg-white/60 border border-dashed border-slate-200" aria-disabled="true">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Home page section. */
export default function FreeToolsSection() {
  const live = FREE_TOOLS.filter(t => t.live).length;
  return (
    <section id="free-tools" className="scroll-mt-20 bg-ivory border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 lg:py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Tools for free</p>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">Free tools for Indian academics.</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">UGC scores, promotion, salary and research tools — free, no sign-up, built on the published UGC rules.</p>
          </div>
          <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline shrink-0">All {live} free tools <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="mt-6"><FreeToolsGrid limit={6} compact /></div>
      </div>
    </section>
  );
}
