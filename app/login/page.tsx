'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/Navbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { homePathForRole } from '@/lib/useAuth';
import { GraduationCap, Mail, Lock, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (user) router.replace(next && next.startsWith('/') ? next : homePathForRole(user.role));
  }, [router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const res = await StorageService.login(email, password);
    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.push(next && next.startsWith('/') ? next : homePathForRole(res.user.role));
  };

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

          {error && <div className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-700 text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.ac.in"
                  className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-3.5 py-3 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-brand-700 hover:text-brand-900">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-60"
            >
              {isSubmitting ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <>Sign in <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            Passwords are hashed with PBKDF2-SHA256 and never stored in plain text.
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
