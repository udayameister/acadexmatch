'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import RequireRole from '@/components/RequireRole';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import PaymentsList from '@/components/PaymentsList';
import { Payment } from '@/types';
import { PlanPill } from '@/components/Premium';
import { postJson } from '@/components/AuthCard';
import { CheckCircle2, Mail, ShieldCheck, Crown, Receipt, Bell } from 'lucide-react';
import AccountSecurity from '@/components/AccountSecurity';


function AccountInner() {
  const { user } = useCurrentUser();
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const payments = useStorageValue<Payment[]>(() => StorageService.getPayments(), []);
  if (!user) return null;
  const myPayments = payments.filter(p => p.status !== 'created');

  const resend = async () => {
    const r = await postJson('/api/auth/resend-verification', {});
    setVerifyMsg(r.ok ? 'A new confirmation email is on its way. Check your inbox (and spam folder).' : (r.error as string) || 'Could not send the email.');
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-800">My account</h1>
        <p className="text-sm text-slate-600 mt-1">{user.name} · {user.email}</p>
      </div>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-700" /> Email address</h2>
        {user.emailVerified === false ? (
          <>
            <p className="text-sm text-slate-600">Your email address is not confirmed yet. Open the link we emailed to {user.email}.</p>
            <button onClick={resend} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">Send a new confirmation email</button>
            {verifyMsg && <p className="text-sm text-slate-700" role="status">{verifyMsg}</p>}
          </>
        ) : (
          <p className="text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Confirmed</p>
        )}
      </section>

      {user.role === 'candidate' && (
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Crown className="w-4 h-4 text-gold-500" /> Plan</h2>
            <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-600"><PlanPill user={user} />{user.premiumUntil && <span>until {user.premiumUntil}</span>}</div>
          </div>
          <Link href="/premium" className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-800">Plans</Link>
        </section>
      )}

      {(user.role !== 'super_admin') && (
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><Receipt className="w-4 h-4 text-brand-700" /> Payments and invoices</h2>
          <PaymentsList payments={myPayments} emptyText="No online payments yet." />
        </section>
      )}

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-brand-700" /> Email notifications</h2>
          <p className="text-sm text-slate-600 mt-1">Choose which emails you receive and see the messages we have sent you.</p>
        </div>
        <Link href="/account/notifications" className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-800">Notification settings</Link>
      </section>

      <h2 className="text-xl font-bold text-brand-800 pt-2">Security</h2>
      <AccountSecurity />

      <p className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Forgot your password? Sign out and use <Link href="/forgot-password" className="underline">Forgot password</Link>.</p>
    </div>
  );
}

export default function AccountPage() {
  return <RequireRole roles={['candidate', 'institute_admin', 'recruiter', 'super_admin']}><AccountInner /></RequireRole>;
}
