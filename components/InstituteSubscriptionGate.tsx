'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorageService, isInstituteSubscribed } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { Institute, PlanSettings } from '@/types';
import { Crown, Clock, CheckCircle2, XCircle, Building2, Check } from 'lucide-react';
import PayButton, { useOnlinePayment } from '@/components/PayButton';

export const INSTITUTION_FEATURES = [
  'Publish unlimited faculty vacancies with 7th CPC, reservation and UGC / AICTE norms',
  'Premium vacancies reserved for verified Premium candidates',
  'Eight-stage applicant pipeline from screening to joining',
  'Applicant dossiers with documents, match scores and screening answers',
  'Interview scheduling and confidential selection-committee scoring',
  'Verified institution profile page',
];

/** Blocks institution tools until the institute has an active Institution Premium subscription. */
export default function InstituteSubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useCurrentUser();
  const institute = useStorageValue<Institute | undefined>(() => StorageService.getCurrentInstitute(), undefined);
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const [note, setNote] = useState('');
  const online = useOnlinePayment();

  if (!ready || !user) return null;
  if (institute && isInstituteSubscribed(institute)) return <>{children}</>;

  const sub = institute?.subscription;
  const expired = sub?.status === 'active' && !isInstituteSubscribed(institute);
  const canRequest = institute && user.role === 'institute_admin' && sub?.status !== 'pending';

  return (
    <div className="w-full px-4 sm:px-8 py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-gold-100 text-gold-800 border border-gold-300"><Crown className="w-3.5 h-3.5" /> Institution Premium</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-800">
            {!institute ? 'Your account is not linked to an institute' : sub?.status === 'pending' ? 'Subscription awaiting activation' : expired ? 'Your subscription has expired' : 'Activate Institution Premium'}
          </h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            {!institute
              ? 'Ask the platform administrator to link your account to your institute.'
              : `Institution accounts on AcadeXMatch are Premium only. ${institute.name}'s recruitment tools open as soon as the subscription is active.`}
          </p>
        </div>

        {institute && (
          <div className="p-6 sm:p-7 rounded-3xl bg-white border-2 border-brand-900 shadow-lg space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-800 grid place-items-center"><Building2 className="w-5 h-5" /></span>
                <div>
                  <div className="font-semibold text-slate-900">{institute.name}</div>
                  <div className="text-xs text-slate-500">AISHE {institute.aisheCode} · Verification: {institute.verificationStatus}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-brand-900">{settings.institutionPriceLabel}</div>
                <div className="text-xs text-slate-500">No free plan for institutions</div>
              </div>
            </div>

            <ul className="grid sm:grid-cols-2 gap-2 text-sm text-slate-700">
              {INSTITUTION_FEATURES.map(f => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-gold-600 mt-0.5 shrink-0" />{f}</li>)}
            </ul>

            {sub?.status === 'pending' && (
              <div className="p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900 flex gap-3" role="status">
                <Clock className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Request received{sub.requestedAt ? ` on ${sub.requestedAt}` : ''}</div>
                  <div className="text-xs mt-0.5">{settings.institutionInstructions}</div>
                </div>
              </div>
            )}
            {sub?.status === 'declined' && (
              <div className="p-4 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex gap-3"><XCircle className="w-5 h-5 shrink-0" />The previous request was not approved. You can send a new request below.</div>
            )}
            {expired && (
              <div className="p-4 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex gap-3"><XCircle className="w-5 h-5 shrink-0" />The subscription ended on {sub?.activeUntil}. Renew to continue posting vacancies and managing applicants.</div>
            )}

            {online?.configured && institute && user.role === 'institute_admin' && (
              <PayButton product="institution_premium" label={`Pay ${settings.institutionPriceInr ? `₹${settings.institutionPriceInr.toLocaleString('en-IN')}` : settings.institutionPriceLabel} and activate now`} description={`Institution Premium — ${institute.name}`} />
            )}
            {online?.configured ? null : canRequest ? (
              <form onSubmit={e => { e.preventDefault(); StorageService.requestInstituteSubscription(institute.id, user.email, note); }} className="space-y-3">
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Billing contact, GSTIN or purchase-order details (optional)" className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                <button type="submit" className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm"><Crown className="w-4 h-4 text-gold-300" /> {expired ? 'Request renewal' : 'Request Institution Premium'}</button>
              </form>
            ) : user.role === 'recruiter' && sub?.status !== 'pending' ? (
              <p className="text-sm text-slate-600">Ask your institute administrator to request the subscription.</p>
            ) : null}
          </div>
        )}

        <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Your vacancies already listed stay visible to candidates. <Link href="/premium#institutions" className="font-semibold text-brand-800 hover:underline">Compare plans</Link>
        </p>
      </div>
    </div>
  );
}
