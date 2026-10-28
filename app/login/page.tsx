'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/Navbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { homePathForRole } from '@/lib/useAuth';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { hydrate } from '@/lib/clientSync';
import { authButton, postJson } from '@/components/AuthCard';
import { OAUTH_ERRORS, OtpInput, PasswordField, PhoneField, SocialButtons, Spinner, useAuthMethods, useCountdown } from '@/components/AuthWidgets';
import type { CountryCode } from 'libphonenumber-js/min';

type Mode = 'password' | 'sms';
type Step = { kind: 'form' } | { kind: 'code'; channel: 'sms' | 'email'; challengeId: string; purpose: 'login' | 'admin-mfa'; sentTo?: string };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const oauthError = searchParams.get('oauth_error');
  const methods = useAuthMethods();
  const [mode, setMode] = useState<Mode>('password');
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState<CountryCode>('IN');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ? OAUTH_ERRORS[oauthError] || OAUTH_ERRORS.provider : null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useCountdown();

  const goHome = (role?: string) => router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : homePathForRole((role || 'candidate') as Parameters<typeof homePathForRole>[0]));

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (user) goHome(user.role);
    // Back from Google/Microsoft: the session cookie is set; load the account.
    if (searchParams.get('oauth') === 'ok') hydrate().then(() => { const u = StorageService.getCurrentUser(); if (u) goHome(u.role); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = async (r: Record<string, unknown>) => {
    await hydrate();
    goHome((r.user as { role?: string } | undefined)?.role);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true); setError(null); setInfo(null);
    const r = await postJson('/api/auth/login', { email, password, remember });
    setIsSubmitting(false);
    const mfa = r.mfa as { challengeId: string; resendIn?: number } | undefined;
    if (mfa) { setStep({ kind: 'code', channel: 'email', challengeId: mfa.challengeId, purpose: 'admin-mfa', sentTo: email }); setResendIn(mfa.resendIn || 60); setCode(''); return; }
    if (!r.ok || r.success === false) { setError(r.error || 'Incorrect email or password.'); return; }
    await signedIn(r);
  };

  const requestSms = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitting(true); setError(null); setInfo(null);
    const r = await postJson('/api/auth/otp/request', { purpose: 'login', phone, country, remember });
    setIsSubmitting(false);
    if (typeof r.resendIn === 'number') setResendIn(r.resendIn as number);
    if (!r.ok) { setError(r.error || 'Could not send the code.'); return; }
    setStep({ kind: 'code', channel: 'sms', challengeId: String(r.challengeId), purpose: 'login', sentTo: String(r.sentTo || '') });
    setInfo(String(r.note || ''));
    setCode('');
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'code') return;
    setIsSubmitting(true); setError(null);
    const r = await postJson('/api/auth/otp/verify', { purpose: step.purpose, challengeId: step.challengeId, code });
    setIsSubmitting(false);
    if (!r.ok || r.success === false) { setError(r.error || 'That code is not correct.'); return; }
    await signedIn(r);
  };

  const resend = () => {
    if (step.kind !== 'code' || resendIn > 0) return;
    if (step.purpose === 'login') requestSms();
    else { setStep({ kind: 'form' }); setError(null); setInfo('Enter your password again to get a new code.'); }
  };

  const tab = (m: Mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setStep({ kind: 'form' }); setError(null); setInfo(null); }}
      className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${mode === m ? 'bg-white shadow-sm text-brand-900' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
  );

  return (
    <div className="w-full min-h-[80vh] grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-brand-950 text-white p-12 xl:p-16 flex-col justify-between">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-600/30 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandLogo inverted />
        </Link>
        <div className="relative space-y-6 max-w-md">
          <h1 className="font-serif text-4xl font-bold leading-tight">Welcome back to India&apos;s academic hiring platform.</h1>
          <p className="text-brand-100/80 leading-relaxed">
            Track your faculty applications, manage selection committees and publish UGC-compliant vacancies — all in one place.
          </p>
          <ul className="space-y-3 text-sm text-brand-100/90">
            {['Transparent, explainable candidate matching', 'UGC Table 3A academic score, computed for you', 'End-to-end selection workflow for institutes'].map(t => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gold-400" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-100/60">Your data is stored under the DPDP Act, 2023 principles of purpose limitation and consent.</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-14">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h2 className="font-serif text-3xl font-bold text-slate-900">Sign in</h2>
            <p className="text-sm text-slate-500">
              New here?{' '}
              <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-900">
                Create an account
              </Link>
            </p>
          </div>

          {error && <div role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-700 text-sm">{error}</div>}
          {info && !error && <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm">{info}</div>}

          {step.kind === 'code' ? (
            <form onSubmit={verifyCode} className="space-y-5">
              <p className="text-sm text-slate-600">
                {step.channel === 'sms' ? <>Enter the 6-digit code sent by SMS{step.sentTo ? <> to <strong>{step.sentTo}</strong></> : null}.</> : <>For administrator sign-in, enter the 6-digit code we emailed to <strong>{step.sentTo}</strong>.</>}
              </p>
              <OtpInput value={code} onChange={setCode} />
              <button type="submit" disabled={isSubmitting || code.length < 6} className={authButton}>
                {isSubmitting ? <Spinner /> : <>Verify and sign in <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep({ kind: 'form' }); setError(null); }} className="font-semibold text-slate-600 hover:text-slate-900">← Back</button>
                <button type="button" onClick={resend} disabled={resendIn > 0 || isSubmitting} className="font-semibold text-brand-700 hover:text-brand-900 disabled:text-slate-400">
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <SocialButtons methods={methods} next={next} />
              {methods?.sms && (
                <div role="tablist" aria-label="Sign-in method" className="flex gap-1 p-1 rounded-xl bg-slate-100">
                  {tab('password', 'Email and password')}
                  {tab('sms', 'Mobile number (SMS code)')}
                </div>
              )}
              {mode === 'sms' && methods?.sms ? (
                <form onSubmit={requestSms} className="space-y-5">
                  <PhoneField id="phone" label="Mobile number" country={country} onCountry={setCountry} value={phone} onChange={setPhone} hint="Use the number you confirmed on your AcadeXMatch account." />
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 accent-brand-800" /> Keep me signed in on this device</label>
                  <button type="submit" disabled={isSubmitting || resendIn > 0} className={authButton}>
                    {isSubmitting ? <Spinner /> : resendIn > 0 ? `Send code (wait ${resendIn}s)` : <>Send code <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={submitPassword} className="space-y-5">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.ac.in"
                        className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-3.5 py-3 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                  </div>
                  <PasswordField id="password" label="Password" value={password} onChange={setPassword}
                    right={<Link href="/forgot-password" className="text-xs font-semibold text-brand-700 hover:text-brand-900">Forgot password?</Link>} />
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 accent-brand-800" /> Keep me signed in on this device</label>
                  <button type="submit" disabled={isSubmitting} className={authButton}>
                    {isSubmitting ? <Spinner /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              )}
            </>
          )}

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            Passwords are stored only as salted scrypt hashes. We never ask for your password by email or SMS.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
