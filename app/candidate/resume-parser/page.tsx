'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import CvParserPanel from '@/components/CvParserPanel';
import { usePlan, PremiumLock } from '@/components/Premium';

export default function ResumeParserPage() {
  const router = useRouter();
  const { isPremium, ready } = usePlan();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <Link href="/candidate/dashboard" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
          <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900">CV Import</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload your academic CV to fill in degrees, appointments, publications and NET/SLET status in one step.
          </p>
        </div>
        <Link
          href="/candidate/profile"
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center gap-1.5 transition border border-slate-200 self-start sm:self-auto"
        >
          <GraduationCap className="w-4 h-4 text-brand-700" /> My profile
        </Link>
      </div>

      {!ready ? null : isPremium ? (
        <CvParserPanel onSaved={() => setTimeout(() => router.push('/candidate/profile'), 900)} />
      ) : (
        <PremiumLock title="CV import is a Premium feature" text="Upgrade to fill in your degrees, appointments, publications and NET/SLET status from your CV in one step. On the Free plan you can enter these details on your profile." />
      )}
    </div>
  );
}
