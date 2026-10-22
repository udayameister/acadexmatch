'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { isHydrated, HYDRATED_EVENT, SYNC_ERROR_EVENT } from '@/lib/clientSync';
import { useCurrentUser } from '@/lib/useAuth';
import { AlertCircle, X, Mail } from 'lucide-react';
import { AnnouncementBanner } from '@/components/Announcements';

/** Waits for the first load from the server before showing pages, and shows server errors. */
export default function AppBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<{ id: number; text: string }[]>([]);
  const { user } = useCurrentUser();

  useEffect(() => {
    const onReady = () => setReady(isHydrated());
    onReady();
    window.addEventListener(HYDRATED_EVENT, onReady);
    const onError = (e: Event) => {
      const text = String((e as CustomEvent).detail || 'Something went wrong.');
      const id = Date.now() + Math.random();
      setErrors(prev => (prev.some(x => x.text === text) ? prev : [...prev.slice(-2), { id, text }]));
      setTimeout(() => setErrors(prev => prev.filter(x => x.id !== id)), 7000);
    };
    window.addEventListener(SYNC_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(HYDRATED_EVENT, onReady);
      window.removeEventListener(SYNC_ERROR_EVENT, onError);
    };
  }, []);

  return (
    <>
      {ready && user && user.emailVerified === false && (
        <div className="bg-gold-50 border-b border-gold-200 text-sm text-gold-900 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex flex-wrap items-center gap-2">
            <Mail className="w-4 h-4 shrink-0" />
            <span>Please confirm your email address — we sent a link to <strong>{user.email}</strong>.</span>
            <Link href="/account" className="font-semibold underline">Resend or change settings</Link>
          </div>
        </div>
      )}
      {ready && <AnnouncementBanner />}
      {ready ? children : (
        <div className="w-full py-32 flex justify-center" aria-busy="true" aria-label="Loading">
          <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
        </div>
      )}
      <div className="fixed bottom-4 left-4 z-[70] space-y-2 max-w-sm" role="alert" aria-live="assertive">
        {errors.map(e => (
          <div key={e.id} className="flex items-start gap-2 px-4 py-3 rounded-xl bg-crimson-700 text-white text-sm shadow-xl">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{e.text}</span>
            <button onClick={() => setErrors(prev => prev.filter(x => x.id !== e.id))} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </>
  );
}
