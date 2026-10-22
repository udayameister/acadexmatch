'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import AuthCard, { authButton, authInput, postJson } from '@/components/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await postJson('/api/auth/forgot', { email });
    setBusy(false);
    if (r.ok) setSent(true); else setError(r.error || 'Something went wrong.');
  };

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your account email and we'll send you a link to choose a new password.">
      {sent ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><Mail className="w-5 h-5 shrink-0" /> If an account exists for {email}, a reset link is on its way. It is valid for 1 hour; check your spam folder too.</p>
          <Link href="/login" className="block text-center text-sm font-semibold text-brand-800 hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Email</span><input required type="email" autoComplete="email" className={authInput} value={email} onChange={e => setEmail(e.target.value)} /></label>
          {error && <p className="text-sm text-crimson-700" role="alert">{error}</p>}
          <button type="submit" className={authButton} disabled={busy}>Send reset link</button>
          <p className="text-center text-sm"><Link href="/login" className="font-semibold text-brand-800 hover:underline">Back to sign in</Link></p>
        </form>
      )}
    </AuthCard>
  );
}
