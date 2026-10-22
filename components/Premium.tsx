'use client';

import React from 'react';
import Link from 'next/link';
import { Crown, Lock, ArrowRight } from 'lucide-react';
import { isPremiumUser } from '@/lib/storage';
import { useCurrentUser } from '@/lib/useAuth';
import { User } from '@/types';

/** Current user and whether they have an active Premium plan. */
export function usePlan(): { user: User | null; ready: boolean; isPremium: boolean; isCandidate: boolean } {
  const { user, ready } = useCurrentUser();
  return { user, ready, isPremium: isPremiumUser(user), isCandidate: user?.role === 'candidate' };
}

export function PremiumBadge({ className = '', label = 'Premium' }: { className?: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-gold-100 to-gold-50 text-gold-800 border border-gold-300 ${className}`}>
      <Crown className="w-3.5 h-3.5 text-gold-600" aria-hidden="true" /> {label}
    </span>
  );
}

export function PlanPill({ user }: { user: User }) {
  if (user.role !== 'candidate') return null;
  return isPremiumUser(user)
    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 border border-gold-300"><Crown className="w-3 h-3" />Premium</span>
    : <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Free plan</span>;
}

/** Placeholder shown to Free members where a Premium feature would be. */
export function PremiumLock({ title, text, compact = false, className = '' }: { title: string; text?: string; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <Link href="/premium" className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gold-50 hover:bg-gold-100 text-gold-800 border border-gold-300 text-xs font-bold transition ${className}`}>
        <Lock className="w-3.5 h-3.5" aria-hidden="true" /> {title} <Crown className="w-3.5 h-3.5 text-gold-600" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <div className={`p-5 rounded-2xl bg-gradient-to-br from-gold-50 to-ivory border border-gold-200 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-white border border-gold-200 grid place-items-center shrink-0"><Lock className="w-4 h-4 text-gold-700" aria-hidden="true" /></span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">{title} <PremiumBadge /></div>
          {text && <p className="text-xs text-slate-600 mt-1">{text}</p>}
          <Link href="/premium" className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-brand-900 hover:underline">
            See Premium <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
