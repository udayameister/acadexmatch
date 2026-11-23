import type { Metadata } from 'next';
import React from 'react';
import { FreeToolsGrid } from '@/components/FreeTools';

export const metadata: Metadata = {
  title: 'Free Tools for Indian Academics — UGC Score, CAS, Salary, References',
  description: 'Free tools for college and university teachers in India: UGC shortlisting score (Table 3A/3B), CAS research score, eligibility checker, salary and DA arrears, reference formatter and Bloom’s taxonomy checker.',
  alternates: { canonical: '/tools' },
  openGraph: { url: '/tools' },
};

export default function ToolsPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Tools for free</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-800 mt-2">Free tools for Indian academics</h1>
        <p className="text-slate-600 mt-2 max-w-3xl">Built on the UGC Regulations 2018 and the 7th CPC pay matrix. Free, no sign-up, and nothing you type is stored.</p>
      </div>
      <FreeToolsGrid />
    </div>
  );
}
