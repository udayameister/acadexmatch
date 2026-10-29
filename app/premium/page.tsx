'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { InstitutionPriceTable, lowestInstitutionPrice } from '@/components/InstitutionPricing';
import { StorageService, premiumPlansOf, formatInr, periodLabel } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { usePlan, PremiumBadge } from '@/components/Premium';
import { PlanSettings, PremiumPlanOption, UpgradeRequest } from '@/types';
import { Check, Minus, Crown, Clock, ArrowRight, ExternalLink, Building2 } from 'lucide-react';
import { INSTITUTION_FEATURES } from '@/components/InstituteSubscriptionGate';
import PayButton, { useOnlinePayment } from '@/components/PayButton';
import { CANDIDATE_PREMIUM_FREE } from '@/lib/storage';

const FEATURES: { label: string; free: boolean | string; premium: boolean | string }[] = [
  { label: 'Browse all faculty job listings', free: true, premium: true },
  { label: 'Full vacancy details, pay scale and eligibility', free: true, premium: true },
  { label: 'Apply on the institution\'s website (external link)', free: true, premium: true },
  { label: 'Academic profile and document proofs', free: true, premium: true },
  { label: 'One-click apply through AcadeXMatch', free: false, premium: true },
  { label: 'Apply to Premium vacancies', free: false, premium: true },
  { label: 'Application tracking, interview schedule and status updates', free: false, premium: true },
  { label: 'Explainable match score for every vacancy', free: false, premium: true },
  { label: 'AI match against your CV and CV import', free: false, premium: true },
  { label: 'UGC Table 3A academic (API) score', free: false, premium: true },
  { label: 'Personalised top-match recommendations', free: false, premium: true },
];

function Cell({ v }: { v: boolean | string }) {
  if (typeof v === 'string') return <span className="text-xs text-slate-700">{v}</span>;
  return v
    ? <Check className="w-5 h-5 text-emerald-600 mx-auto" aria-label="Included" />
    : <Minus className="w-5 h-5 text-slate-300 mx-auto" aria-label="Not included" />;
}

export default function PremiumPage() {
  const { user, ready, isPremium, isCandidate } = usePlan();
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const myRequest = useStorageValue<UpgradeRequest | undefined>(() => StorageService.getMyUpgradeRequest(), undefined);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = useOnlinePayment();
  const plans = premiumPlansOf(settings);
  const [planKey, setPlanKey] = useState<PremiumPlanOption['key'] | null>(null);
  const [scholarOk, setScholarOk] = useState(false);
  const plan = plans.find(p => p.key === planKey) || plans.find(p => p.key === 'yearly') || plans[0];
  const price = plan?.priceInr ? `₹${plan.priceInr.toLocaleString('en-IN')}` : settings.premiumPriceLabel;
  const months = plan?.months || settings.premiumDurationMonths;
  const period = (m: number) => (m === 1 ? 'month' : m === 12 ? 'year' : `${m} months`);
  const needsDeclaration = plan?.key === 'scholar' && !scholarOk;

  const planPicker = plans.length > 1 && (!user || isCandidate) && (
    <fieldset className="space-y-2 mb-4">
      <legend className="text-xs font-semibold text-slate-700 mb-1">Choose a plan</legend>
      {plans.map(p => (
        <label key={p.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${plan?.key === p.key ? 'border-brand-900 bg-brand-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="radio" name="plan" className="mt-1 accent-brand-900" checked={plan?.key === p.key} onChange={() => setPlanKey(p.key)} />
          <span className="flex-1">
            <span className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-900 text-sm">{p.label}</span><span className="font-bold text-brand-900 tabular-nums">₹{p.priceInr.toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-500"> / {period(p.months)}</span></span></span>
            {p.note && <span className="block text-xs text-slate-500 mt-0.5">{p.note}</span>}
          </span>
        </label>
      ))}
      {plan?.key === 'scholar' && isCandidate && !isPremium && (
        <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 accent-brand-900" checked={scholarOk} onChange={e => setScholarOk(e.target.checked)} /> I confirm I am currently registered as a Ph.D. research scholar and can show proof if asked.</label>
      )}
    </fieldset>
  );

  const requestUpgrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (needsDeclaration) { setError('Please confirm that you are a registered research scholar.'); return; }
    const r = StorageService.requestPremiumUpgrade(`${plan ? `Plan: ${plan.label} (₹${plan.priceInr} / ${period(plan.months)}). ` : ''}${note}`.trim());
    if (!r.success) setError(r.error || 'Something went wrong.');
  };

  let cta: React.ReactNode = null;
  if (!ready) cta = <div className="h-12" />;
  else if (!user) {
    cta = (
      <div className="space-y-2">
        {planPicker}
        <Link href="/register" className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">Create a free account <ArrowRight className="w-4 h-4" /></Link>
        <p className="text-xs text-slate-500 text-center">Already registered? <Link href="/login?next=/premium" className="font-semibold text-brand-800 hover:underline">Sign in</Link> to upgrade.</p>
      </div>
    );
  } else if (!isCandidate) {
    cta = <p className="text-sm text-slate-600 text-center">Plans apply to candidate accounts.</p>;
  } else if (isPremium) {
    cta = (
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-900 text-center">
        <div className="font-semibold">Your Premium plan is active</div>
        <div className="text-xs mt-0.5">{user.premiumUntil ? `Valid until ${user.premiumUntil}` : 'No end date'}</div>
        {online?.configured && user.premiumUntil && (
          <div className="mt-3 text-left">{planPicker}<PayButton product="candidate_premium" plan={plan?.key} label={`Renew for ${months} more month${months === 1 ? '' : 's'} — ${price}`} description={`Premium renewal — ${months} months`} /></div>
        )}
      </div>
    );
  } else if (online?.configured) {
    cta = (
      <div className="space-y-3">
        {planPicker}
        {needsDeclaration
          ? <button type="button" disabled className="w-full px-5 py-3 rounded-xl bg-slate-200 text-slate-500 font-semibold text-sm">Confirm the scholar declaration to continue</button>
          : <PayButton product="candidate_premium" plan={plan?.key} label={`Pay ${price} and upgrade now`} description={`Premium — ${months} month${months === 1 ? '' : 's'}`} />}
        {online.testMode && <p className="text-xs text-center text-gold-800">Test mode: use Razorpay test cards; no real money is charged.</p>}
      </div>
    );
  } else if (myRequest) {
    cta = (
      <div className="p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900 flex gap-3">
        <Clock className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Upgrade request received</div>
          <div className="text-xs mt-0.5">Sent {myRequest.requestedAt}. The team will contact you at {user.email} to complete the upgrade.</div>
        </div>
      </div>
    );
  } else {
    cta = (
      <form onSubmit={requestUpgrade} className="space-y-3">
        {planPicker}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Message for the team (optional), e.g. preferred payment method or phone number" className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        {error && <p className="text-xs text-crimson-700">{error}</p>}
        <button type="submit" className="w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm shadow-sm">
          <Crown className="w-4 h-4 text-gold-300" /> Request Premium upgrade
        </button>
        <p className="text-xs text-slate-500">{settings.upgradeInstructions}</p>
      </form>
    );
  }

  return (
    <div className="w-full">
      {CANDIDATE_PREMIUM_FREE ? (
        <>
          <section className="hero-backdrop border-b border-slate-200">
            <div className="max-w-5xl mx-auto px-4 sm:px-8 py-14 text-center">
              <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Plans</p>
              <h1 className="text-3xl sm:text-5xl font-bold text-brand-800 mt-3 tracking-[-0.02em]">Premium is free for every candidate.</h1>
              <p className="text-slate-600 mt-4 text-lg max-w-2xl mx-auto">Every candidate account gets the full AcadeXMatch toolkit at no cost. Only institutions and recruiters subscribe.</p>
            </div>
          </section>
          <section className="max-w-3xl mx-auto px-4 sm:px-8 py-14">
            <div className="relative p-7 rounded-3xl bg-white border-2 border-brand-900 shadow-lg">
              <div className="absolute -top-3 left-7"><PremiumBadge label="Included free" /></div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Crown className="w-5 h-5 text-gold-500" /> Candidate Premium</h2>
              <div className="mt-2 text-3xl font-bold text-brand-900">₹0</div>
              <ul className="mt-6 grid sm:grid-cols-2 gap-2.5 text-sm text-slate-700">
                {FEATURES.map(f => <li key={f.label} className="flex gap-2"><Check className="w-4 h-4 text-gold-600 mt-0.5 shrink-0" />{f.label}</li>)}
              </ul>
              <div className="mt-6 text-sm">
                {isCandidate ? <span className="font-semibold text-emerald-700">Active on your account</span> : !user ? <Link href="/register" className="font-semibold text-brand-800 hover:underline">Create your free profile</Link> : null}
              </div>
            </div>
          </section>
        </>
      ) : (
      <>
      <section className="hero-backdrop border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 py-14 text-center">
            <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Plans</p>
            <h1 className="text-3xl sm:text-5xl font-bold text-brand-800 mt-3 tracking-[-0.02em]">Free to browse. Premium to get hired faster.</h1>
            <p className="text-slate-600 mt-4 text-lg max-w-2xl mx-auto">Every candidate can see every vacancy and apply on the institution&apos;s own website. Premium adds one-click applications, Premium vacancies and all our matching tools.</p>
          </div>
        </section>
  
        <section className="max-w-5xl mx-auto px-4 sm:px-8 py-14 grid md:grid-cols-2 gap-6 items-stretch">
          <div className="p-7 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col">
            <h2 className="text-xl font-bold text-slate-900">Free</h2>
            <div className="mt-2 text-3xl font-bold text-slate-900">₹0</div>
            <p className="text-sm text-slate-500 mt-1">For browsing vacancies and applying directly to institutions.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-700 flex-1">
              {FEATURES.filter(f => f.free).map(f => <li key={f.label} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />{f.label}</li>)}
            </ul>
            <div className="mt-6 text-sm text-slate-500">
              {isCandidate && !isPremium ? <span className="font-semibold text-slate-700">Your current plan</span> : !user ? <Link href="/register" className="font-semibold text-brand-800 hover:underline">Sign up free</Link> : null}
            </div>
          </div>
  
          <div className="relative p-7 rounded-3xl bg-white border-2 border-brand-900 shadow-lg flex flex-col">
            <div className="absolute -top-3 left-7"><PremiumBadge label="Recommended" /></div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Crown className="w-5 h-5 text-gold-500" /> Premium</h2>
            <div className="mt-2 text-3xl font-bold text-brand-900">{plan?.priceInr ? <>{price}<span className="text-base font-semibold text-slate-500"> / {period(months)}</span></> : settings.premiumPriceLabel}</div>
            {plans.length > 1 && <p className="text-xs text-slate-500">Plans from ₹{Math.min(...plans.map(p => p.priceInr)).toLocaleString('en-IN')}</p>}
            <p className="text-sm text-slate-500 mt-1">Everything in Free, plus the full AcadeXMatch toolkit.</p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-700 flex-1">
              {FEATURES.filter(f => !f.free).map(f => <li key={f.label} className="flex gap-2"><Check className="w-4 h-4 text-gold-600 mt-0.5 shrink-0" />{f.label}</li>)}
            </ul>
            <div className="mt-6">{cta}</div>
          </div>
        </section>
  
        <section className="max-w-5xl mx-auto px-4 sm:px-8 pb-6">
          <h2 className="text-2xl font-bold text-brand-800 mb-5">Compare plans</h2>
          <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-cream text-slate-700">
                <tr><th className="text-left px-5 py-3 font-semibold">Feature</th><th className="px-5 py-3 font-semibold w-28">Free</th><th className="px-5 py-3 font-semibold w-28">Premium</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEATURES.map(f => (
                  <tr key={f.label}><td className="px-5 py-3 text-slate-700">{f.label}</td><td className="px-5 py-3 text-center"><Cell v={f.free} /></td><td className="px-5 py-3 text-center"><Cell v={f.premium} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Free members apply through the link the institution provides; AcadeXMatch does not track those applications.</p>
        </section>
      </>
      )}

      <section id="institutions" className="scroll-mt-24 max-w-5xl mx-auto px-4 sm:px-8 py-14">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand-950 text-white p-8 sm:p-12">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full border border-gold-400/30" aria-hidden="true" />
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-sm font-semibold text-gold-300 flex items-center gap-2"><Building2 className="w-4 h-4" /> For universities &amp; colleges</p>
              <h2 className="text-3xl font-bold mt-2">Institution Premium</h2>
              <div className="text-3xl font-bold text-gold-300 mt-3">From {formatInr(lowestInstitutionPrice(settings))} {periodLabel(settings.institutionDurationMonths || 12)}</div>
              <p className="text-brand-100/80 mt-2 text-sm">Institution accounts are Premium only; there is no free plan. One subscription covers your whole institute. The price depends on your AISHE category, read from your AISHE code.</p>
              <div className="mt-4"><InstitutionPriceTable settings={settings} dark /></div>
              <Link href="/register" className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-xl bg-white text-brand-950 font-semibold text-sm hover:bg-gold-50">Register your institute <ArrowRight className="w-4 h-4" /></Link>
            </div>
            <ul className="space-y-2.5 text-sm">
              {INSTITUTION_FEATURES.map(f => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-gold-300 mt-0.5 shrink-0" />{f}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
