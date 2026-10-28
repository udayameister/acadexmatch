import React from 'react';

/** Layout for the Terms of Service and Privacy Policy pages. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="w-full">
      <section className="hero-backdrop border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-800">{title}</h1>
          <p className="text-sm text-slate-600 mt-2">Last updated: {updated}</p>
        </div>
      </section>
      <article className="max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-6 text-slate-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-brand-800 [&_a]:underline">
        {children}
      </article>
    </div>
  );
}
