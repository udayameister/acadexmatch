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
  const admin = user?.role === 'super_admin';
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-5">
      <div>
        <Link href={admin ? '/admin' : '/account'} className="text-sm font-semibold text-brand-700 hover:underline">{admin ? '← Admin console' : '← My account'}</Link>
        <h1 className="text-3xl font-bold text-brand-800 mt-2">Messages</h1>
        <p className="text-sm text-slate-600 mt-1">{admin ? 'Conversations with every user. Reply here or start a new one with “Message a user”.' : 'Your private conversations with the AcadeXMatch team. Only you and the team can read them.'}</p>
      </div>
      <MessageCenter key={admin ? 'admin' : 'user'} mode={admin ? 'admin' : 'user'} initialThreadId={params.get('thread')} />
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
