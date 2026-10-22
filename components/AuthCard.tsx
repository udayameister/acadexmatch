import React from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/Navbar';

/** Centered card used by the sign-in helper pages (verify email, forgot / reset password). */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full px-4 py-16 hero-backdrop min-h-[70vh] flex items-start justify-center">
      <div className="w-full max-w-md p-7 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-lg space-y-6">
        <Link href="/" className="inline-flex" aria-label="AcadeXMatch home"><BrandMark className="w-10 h-10" /></Link>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-brand-800">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export const authInput = 'w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
export const authButton = 'w-full py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-60';

export async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ...d, ok: r.ok && d.ok !== false };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
