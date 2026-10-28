'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import AuthCard, { postJson } from '@/components/AuthCard';
import { hydrate } from '@/lib/clientSync';

function Verify() {
  const sp = useSearchParams();
  const change = sp.get('change') || '';
  const token = sp.get('token') || '';
  const [newEmail, setNewEmail] = useState('');
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [error, setError] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    (change ? postJson('/api/auth/email-change/confirm', { token: change }) : postJson('/api/auth/verify', { token })).then(r => {
      if (r.ok) { setState('ok'); if (r.email) setNewEmail(String(r.email)); hydrate(); } else { setState('error'); setError(r.error || 'This link is invalid or has expired.'); }
    });
  }, [token, change]);
  return (
    <AuthCard title="Email confirmation">
      {state === 'working' && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</p>}
      {state === 'ok' && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><CheckCircle2 className="w-5 h-5 shrink-0" /> {newEmail ? <>Your account now uses {newEmail}.</> : 'Your email address is confirmed. Thank you!'}</p>
          <Link href="/login" className="block text-center w-full py-3 rounded-xl bg-brand-900 text-white font-semibold text-sm">Continue</Link>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-xl p-3"><AlertCircle className="w-5 h-5 shrink-0" /> {error}</p>
          <Link href="/account" className="block text-center text-sm font-semibold text-brand-800 hover:underline">Send a new confirmation email</Link>
        </div>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><Verify /></Suspense>;
}
