'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { UserRole } from '@/types';
import { useCurrentUser, homePathForRole } from '@/lib/useAuth';

interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
}

/** Client-side route guard: redirects anonymous visitors to /login and blocks other roles. */
export default function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, ready } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
    }
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="w-full px-4 py-24">
        <div className="max-w-md mx-auto text-center space-y-4 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-crimson-50 text-crimson-600 border border-crimson-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-xl font-bold text-slate-900">Access restricted</h2>
          <p className="text-sm text-slate-600">
            This area is not available for your account type.
          </p>
          <Link
            href={homePathForRole(user.role)}
            className="inline-flex px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition"
          >
            Go to my dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
