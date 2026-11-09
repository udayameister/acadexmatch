'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Clock, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import VerifiedTick from '@/components/VerifiedTick';
import { STORAGE_EVENT } from '@/lib/storage';
import { DOCS_EVENT } from '@/lib/documents';
import { hydrate } from '@/lib/clientSync';
import type { ReadinessItem } from '@/lib/verification';

interface Status { verified: { at: string; by?: string; note?: string } | null; request: { status: 'pending' | 'rejected'; requestedAt: string; reviewedAt?: string; note?: string } | null; items: ReadinessItem[]; ready: boolean; missing: string[] }

const fmt = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const FIX: Record<string, string> = { email: '/account', photo: '/candidate/profile#documents', qualification: '/candidate/profile#documents', phd_net: '/candidate/profile#documents', experience: '/candidate/profile#documents' };

/** Candidate: get the green verified tick (checklist → request → admin review). */
export default function VerificationCard({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/verification', { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const again = () => { clearTimeout(t); t = setTimeout(load, 600); };
    window.addEventListener(DOCS_EVENT, again);
    window.addEventListener(STORAGE_EVENT, again);
    return () => { clearTimeout(t); window.removeEventListener(DOCS_EVENT, again); window.removeEventListener(STORAGE_EVENT, again); };
  }, [load]);
  const act = async (action: 'request' | 'cancel') => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/verification', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      await load(); await hydrate();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (!s) return null;

  if (s.verified) {
    return (
      <section className="p-4 sm:p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3" aria-label="Verification">
        <VerifiedTick size={compact ? 28 : 36} />
        <div>
          <h2 className="font-semibold text-emerald-900">You are a verified candidate</h2>
          <p className="text-sm text-emerald-800">AcadeXMatch checked your profile and documents on {fmt(s.verified.at)}. Institutions see the green tick next to your name when you apply and in talent search.</p>
        </div>
      </section>
    );
  }
  const pending = s.request?.status === 'pending';
  const rejected = s.request?.status === 'rejected';
  const done = s.items.filter(i => i.done).length;
  return (
    <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3" aria-labelledby="verify-h">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1">
          <h2 id="verify-h" className="font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Get the verified tick <VerifiedTick size={18} className="opacity-90" /></h2>
          <p className="text-sm text-slate-600 mt-0.5">Complete your profile and upload your documents, then ask our team to check them. Verified candidates show a green tick to institutions.</p>
        </div>
        {pending
          ? <button type="button" disabled={busy} onClick={() => act('cancel')} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 shrink-0">Withdraw request</button>
          : <button type="button" disabled={busy || !s.ready} onClick={() => act('request')} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{rejected ? 'Ask again' : 'Request verification'}</button>}
      </div>
      {pending && <p className="text-sm p-3 rounded-xl bg-gold-50 border border-gold-200 text-gold-900 flex gap-2" role="status"><Clock className="w-5 h-5 shrink-0" />Our team is checking your profile and documents (requested {fmt(s.request!.requestedAt)}). You will get an email when it is done, usually within two working days.</p>}
      {rejected && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-900 flex gap-2" role="status"><XCircle className="w-5 h-5 shrink-0" /><span><strong>Not verified yet{s.request!.reviewedAt ? ` (${fmt(s.request!.reviewedAt)})` : ''}.</strong> Our team&apos;s note: {s.request!.note}. Fix this, then ask again.</span></p>}
      {!pending && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500"><div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / s.items.length) * 100)}%` }} /></div>{done} of {s.items.length} done</div>
          <ul className={`grid ${compact ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-1.5 text-sm`}>
            {s.items.map(i => (
              <li key={i.key} className="flex items-start gap-2">
                {i.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" aria-label="Done" /> : <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" aria-label="To do" />}
                <span className={i.done ? 'text-slate-600' : 'text-slate-900'}>{i.label}{!i.done && <> · <Link href={FIX[i.key] || '/candidate/profile'} className="text-brand-800 font-semibold hover:underline">{i.group === 'documents' ? 'Upload' : i.key === 'email' ? 'Confirm' : 'Add'}</Link></>}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p role="alert" className="text-sm text-crimson-700">{err}</p>}
    </section>
  );
}
