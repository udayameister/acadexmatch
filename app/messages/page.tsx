'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import RequireRole from '@/components/RequireRole';
import MessageCenter from '@/components/MessageCenter';
import { useCurrentUser } from '@/lib/useAuth';

function Inner() {
  const params = useSearchParams();
  const { user } = useCurrentUser();
  if (user?.role === 'super_admin') {
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-slate-700">As the administrator you read and answer messages in the admin console.</p>
        <Link href="/admin?tab=messages" className="inline-flex px-5 py-2.5 rounded-xl bg-brand-900 text-white text-sm font-semibold">Open admin messages</Link>
      </div>
    );
  }
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-5">
      <div>
        <Link href="/account" className="text-sm font-semibold text-brand-700 hover:underline">← My account</Link>
        <h1 className="text-3xl font-bold text-brand-800 mt-2">Messages</h1>
        <p className="text-sm text-slate-600 mt-1">Your private conversations with the AcadeXMatch team. Only you and the team can read them.</p>
      </div>
      <MessageCenter mode="user" initialThreadId={params.get('thread')} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <RequireRole roles={['candidate', 'institute_admin', 'recruiter', 'super_admin']}>
      <Suspense fallback={null}><Inner /></Suspense>
    </RequireRole>
  );
}
