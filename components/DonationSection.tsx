'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, ShieldCheck } from 'lucide-react';
import PayButton, { useOnlinePayment } from '@/components/PayButton';
import { useCurrentUser } from '@/lib/useAuth';
import { CONTACT_EMAIL } from '@/lib/contact';
import { DONATION_MAX_INR, DONATION_MIN_INR } from '@/types';

const PRESETS = [100, 500, 1000, 2500, 5000, 10000];
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Home page: voluntary contribution, any whole amount from ₹100 to ₹10,000 (signed-in users). */
export default function DonationSection() {
  const { user, ready } = useCurrentUser();
  const online = useOnlinePayment();
  const [amount, setAmount] = useState<number>(500);
  const [custom, setCustom] = useState('');
  const value = custom ? Number(custom) : amount;
  const valid = Number.isInteger(value) && value >= DONATION_MIN_INR && value <= DONATION_MAX_INR;

  return (
    <section id="support" className="max-w-7xl mx-auto px-4 sm:px-8 pb-24 scroll-mt-24" aria-labelledby="support-heading">
      <div className="rounded-3xl border border-gold-200 bg-gradient-to-br from-white via-gold-50/40 to-white p-6 sm:p-10 grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Support us</p>
          <h2 id="support-heading" className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2 flex items-center gap-3">
            <HeartHandshake className="w-8 h-8 text-brand-700 shrink-0" aria-hidden="true" /> Help keep AcadeXMatch free
          </h2>
          <p className="text-slate-600 mt-3 leading-relaxed">
            AcadeXMatch is built by educators for India&apos;s teachers, researchers and institutions. If it has helped you, you can contribute any amount from {inr(DONATION_MIN_INR)} to {inr(DONATION_MAX_INR)}. Contributions go towards running and improving the platform.
          </p>
          <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />Entirely voluntary: it does not unlock any feature. Payments are processed securely by Razorpay; you get an emailed receipt. AcadeXMatch is not a registered charity, so contributions are not eligible for tax exemption (80G).</p>
        </div>

        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">Choose an amount</legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PRESETS.map(p => (
                <button key={p} type="button" onClick={() => { setAmount(p); setCustom(''); }} aria-pressed={!custom && amount === p}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${!custom && amount === p ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-800 border-slate-200 hover:border-brand-300'}`}>{inr(p)}</button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm text-slate-700">Or enter your own amount (₹)
            <div className="mt-1 flex items-center rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-brand-100 focus-within:border-brand-500 bg-white">
              <span className="pl-3 text-slate-500">₹</span>
              <input type="number" inputMode="numeric" min={DONATION_MIN_INR} max={DONATION_MAX_INR} step={1} value={custom} placeholder={`${DONATION_MIN_INR} – ${DONATION_MAX_INR}`}
                onChange={e => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} className="w-full px-2 py-2.5 rounded-xl text-sm focus:outline-none" aria-describedby="donation-range" />
            </div>
          </label>
          <p id="donation-range" className={`text-xs ${custom && !valid ? 'text-crimson-700' : 'text-slate-500'}`} role={custom && !valid ? 'alert' : undefined}>
            {custom && !valid ? `Enter a whole amount between ${inr(DONATION_MIN_INR)} and ${inr(DONATION_MAX_INR)}.` : `Any whole amount from ${inr(DONATION_MIN_INR)} to ${inr(DONATION_MAX_INR)}.`}
          </p>

          {!ready ? null : !user ? (
            <div className="space-y-2">
              <Link href="/login?next=/%23support" className="w-full inline-flex justify-center px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm">Sign in to contribute {valid ? inr(value) : ''}</Link>
              <p className="text-xs text-slate-500 text-center">Candidates and institutions can contribute from their account, so the receipt reaches the right email address. No account yet? <Link href="/register" className="font-semibold text-brand-800 hover:underline">Create one free</Link>.</p>
            </div>
          ) : online === null ? (
            <p className="text-xs text-slate-500">Checking payment options…</p>
          ) : !online.configured ? (
            <p className="text-sm text-slate-600">Online payment is not available right now. To contribute by bank transfer, email <a className="font-semibold text-brand-800 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          ) : (
            <PayButton key={value} product="donation" amount={valid ? value : undefined} disabled={!valid}
              label={valid ? `Contribute ${inr(value)}` : 'Choose an amount'} description={`Contribution to AcadeXMatch — ${valid ? inr(value) : ''}`} />
          )}
        </div>
      </div>
    </section>
  );
}
