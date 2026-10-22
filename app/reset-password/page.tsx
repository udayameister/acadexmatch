'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import AuthCard, { authButton, authInput, postJson } from '@/components/AuthCard';

function Reset() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const r = await postJson('/api/auth/reset', { token, password });
    setBusy(false);
    if (r.ok) setDone(true); else setError(r.error || 'Something went wrong.');
  };

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><CheckCircle2 className="w-5 h-5 shrink-0" /> Your password has been changed. For safety you have been signed out on all devices.</p>
          <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-brand-900 text-white font-semibold text-sm">Sign in</Link>
        </div>
      ) : !token ? (
        <p className="text-sm text-slate-600">This page needs the link from your reset email. <Link href="/forgot-password" className="font-semibold text-brand-800 underline">Ask for a new link</Link>.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">New password</span><input required minLength={8} type="password" autoComplete="new-password" className={authInput} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Confirm new password</span><input required minLength={8} type="password" autoComplete="new-password" className={authInput} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          {error && <p className="text-sm text-crimson-700" role="alert">{error} {error.includes('expired') && <Link href="/forgot-password" className="underline font-semibold">Ask for a new link</Link>}</p>}
          <button type="submit" className={authButton} disabled={busy}>Save new password</button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><Reset /></Suspense>;
}
