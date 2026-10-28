'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import AuthCard, { authButton, postJson } from '@/components/AuthCard';
import { Spinner } from '@/components/AuthWidgets';

/* Confirms before unsubscribing, so link scanners in mail systems do not unsubscribe people by visiting the page. */
function Unsub() {
  const sp = useSearchParams();
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>('ask');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const go = async () => {
    setState('busy');
    const r = await postJson('/api/unsubscribe', { u: sp.get('u'), c: sp.get('c'), s: sp.get('s') });
    if (r.ok) { setLabel(String(r.category || '')); setState('done'); } else { setError(r.error || 'This link is not valid.'); setState('error'); }
  };
  return (
    <AuthCard title="Unsubscribe" subtitle="Stop this type of email from AcadeXMatch.">
      {state === 'done' ? (
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><CheckCircle2 className="w-5 h-5 shrink-0" /> You will no longer receive {label ? `“${label}”` : 'these'} emails. Account and security emails are still sent.</p>
          <Link href="/account/notifications" className="block text-center text-sm font-semibold text-brand-800 hover:underline">Manage all notification settings</Link>
        </div>
      ) : state === 'error' ? (
        <div className="space-y-4">
          <p role="alert" className="flex items-start gap-2 text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-xl p-3"><AlertCircle className="w-5 h-5 shrink-0" /> {error}</p>
          <Link href="/account/notifications" className="block text-center text-sm font-semibold text-brand-800 hover:underline">Sign in to manage notifications</Link>
        </div>
      ) : (
        <button type="button" onClick={go} disabled={state === 'busy'} className={authButton}>{state === 'busy' ? <Spinner /> : 'Unsubscribe'}</button>
      )}
    </AuthCard>
  );
}

export default function UnsubscribePage() {
  return <Suspense fallback={null}><Unsub /></Suspense>;
}
