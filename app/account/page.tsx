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
import { CheckCircle2, KeyRound, Mail, ShieldCheck, Crown, Receipt } from 'lucide-react';

const input = 'w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function AccountInner() {
  const { user } = useCurrentUser();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const payments = useStorageValue<Payment[]>(() => StorageService.getPayments(), []);
  if (!user) return null;
  const myPayments = payments.filter(p => p.status !== 'created');

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    const r = await StorageService.changePassword(cur, next);
    setMsg(r.success ? { ok: true, text: 'Password changed.' } : { ok: false, text: r.error || 'Could not change the password.' });
    if (r.success) { setCur(''); setNext(''); setConfirm(''); }
  };

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

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-brand-700" /> Change password</h2>
        <form onSubmit={change} className="grid sm:grid-cols-3 gap-3 items-end">
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Current password</span><input required type="password" autoComplete="current-password" className={input} value={cur} onChange={e => setCur(e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">New password</span><input required minLength={8} type="password" autoComplete="new-password" className={input} value={next} onChange={e => setNext(e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs font-semibold text-slate-700">Confirm new password</span><input required minLength={8} type="password" autoComplete="new-password" className={input} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          <button type="submit" className="sm:col-span-3 justify-self-start px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">Change password</button>
        </form>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-crimson-700'}`} role="status">{msg.text}</p>}
      </section>

      <p className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Forgot your password? Sign out and use <Link href="/forgot-password" className="underline">Forgot password</Link>.</p>
    </div>
  );
}

export default function AccountPage() {
  return <RequireRole roles={['candidate', 'institute_admin', 'recruiter', 'super_admin']}><AccountInner /></RequireRole>;
}
