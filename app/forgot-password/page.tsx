'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Mail } from 'lucide-react';
import AuthCard, { authButton, authInput, postJson } from '@/components/AuthCard';
import { OtpInput, PasswordField, PhoneField, Spinner, useAuthMethods, useCountdown } from '@/components/AuthWidgets';
import { passwordProblem } from '@/lib/passwordPolicy';
import type { CountryCode } from 'libphonenumber-js/min';

type SmsStep = { kind: 'phone' } | { kind: 'code'; challengeId: string; sentTo: string } | { kind: 'password'; resetToken: string } | { kind: 'done' };

export default function ForgotPasswordPage() {
  const methods = useAuthMethods();
  const [mode, setMode] = useState<'email' | 'sms'>('email');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [country, setCountry] = useState<CountryCode>('IN');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [sms, setSms] = useState<SmsStep>({ kind: 'phone' });
  const [resendIn, setResendIn] = useCountdown();

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await postJson('/api/auth/forgot', { email });
    setBusy(false);
    if (r.ok) setSent(true); else setError(r.error || 'Something went wrong.');
  };

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    const r = await postJson('/api/auth/otp/request', { purpose: 'reset', phone, country });
    setBusy(false);
    if (typeof r.resendIn === 'number') setResendIn(r.resendIn as number);
    if (!r.ok) { setError(r.error || 'Could not send the code.'); return; }
    setCode('');
    setSms({ kind: 'code', challengeId: String(r.challengeId), sentTo: String(r.sentTo || '') });
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sms.kind !== 'code') return;
    setBusy(true); setError(null);
    const r = await postJson('/api/auth/otp/verify', { purpose: 'reset', challengeId: sms.challengeId, code });
    setBusy(false);
    if (!r.ok || !r.resetToken) { setError(r.error || 'That code is not correct.'); return; }
    setSms({ kind: 'password', resetToken: String(r.resetToken) });
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sms.kind !== 'password') return;
    const weak = passwordProblem(pw);
    if (weak) { setError(weak); return; }
    if (pw !== pw2) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    const r = await postJson('/api/auth/reset', { token: sms.resetToken, password: pw, via: 'phone' });
    setBusy(false);
    if (r.ok) setSms({ kind: 'done' }); else setError(r.error || 'Something went wrong.');
  };

  const subtitle = mode === 'email'
    ? "Enter your account email and we'll send you a link to choose a new password."
    : 'Enter the mobile number confirmed on your account. We will send you a code by SMS.';

  return (
    <AuthCard title="Forgot your password?" subtitle={subtitle}>
      {methods?.sms && !sent && sms.kind === 'phone' && (
        <div role="tablist" aria-label="Recovery method" className="flex gap-1 p-1 rounded-xl bg-slate-100">
          {(['email', 'sms'] as const).map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg ${mode === m ? 'bg-white shadow-sm text-brand-900' : 'text-slate-600'}`}>
              {m === 'email' ? 'By email' : 'By SMS code'}
            </button>
          ))}
        </div>
      )}

      {mode === 'email' ? (
        sent ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3" role="status"><Mail className="w-5 h-5 shrink-0" /> If an account exists for {email}, a reset link is on its way. It is valid for 30 minutes and can be used once; check your spam folder too.</p>
            <Link href="/login" className="block text-center text-sm font-semibold text-brand-800 hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submitEmail} className="space-y-4">
            <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Email</span><input required type="email" autoComplete="email" className={authInput} value={email} onChange={e => setEmail(e.target.value)} /></label>
            {error && <p className="text-sm text-crimson-700" role="alert">{error}</p>}
            <button type="submit" className={authButton} disabled={busy}>{busy ? <Spinner /> : 'Send reset link'}</button>
            <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-800 hover:underline">Back to sign in</Link></p>
          </form>
        )
      ) : sms.kind === 'phone' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <PhoneField id="fp-phone" label="Mobile number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} />
          {error && <p className="text-sm text-crimson-700" role="alert">{error}</p>}
          <button type="submit" className={authButton} disabled={busy || resendIn > 0}>{busy ? <Spinner /> : resendIn > 0 ? `Send code (wait ${resendIn}s)` : 'Send code'}</button>
        </form>
      ) : sms.kind === 'code' ? (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-sm text-slate-600">If {sms.sentTo || 'this number'} is confirmed on an AcadeXMatch account, a 6-digit code is on its way.</p>
          <OtpInput value={code} onChange={setCode} />
          {error && <p className="text-sm text-crimson-700" role="alert">{error}</p>}
          <button type="submit" className={authButton} disabled={busy || code.length < 6}>{busy ? <Spinner /> : 'Verify code'}</button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => { setSms({ kind: 'phone' }); setError(null); }} className="font-semibold text-slate-600">← Change number</button>
            <button type="button" onClick={() => requestCode()} disabled={resendIn > 0 || busy} className="font-semibold text-brand-700 disabled:text-slate-400">{resendIn > 0 ? `New code in ${resendIn}s` : 'Send a new code'}</button>
          </div>
        </form>
      ) : sms.kind === 'password' ? (
        <form onSubmit={savePassword} className="space-y-4">
          <p className="text-sm text-slate-600">Code confirmed. Choose a new password within 10 minutes.</p>
          <PasswordField id="fp-new" label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint="At least 8 characters, with letters and numbers." />
          <PasswordField id="fp-new2" label="Confirm new password" value={pw2} onChange={setPw2} autoComplete="new-password" />
          {error && <p className="text-sm text-crimson-700" role="alert">{error}</p>}
          <button type="submit" className={authButton} disabled={busy}>{busy ? <Spinner /> : 'Save new password'}</button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3" role="status"><CheckCircle2 className="w-5 h-5 shrink-0" /> Your password has been changed. For safety you have been signed out on all devices.</p>
          <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-brand-900 text-white font-semibold text-sm">Sign in</Link>
        </div>
      )}
    </AuthCard>
  );
}
