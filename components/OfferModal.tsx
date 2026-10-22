'use client';

import React, { useState } from 'react';
import { StorageService } from '@/lib/storage';
import type { Application } from '@/types';
import { X } from 'lucide-react';

const field = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

/** Issue (or revise) an offer of appointment for one applicant. */
export default function OfferModal({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone?: (msg: string) => void }) {
  const job = StorageService.getJobById(app.jobId);
  const inst = StorageService.getInstituteById(app.instituteId);
  const o = app.offerDetails;
  const inMonth = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const inWeek = new Date(Date.now() + 10 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [f, setF] = useState({
    designation: o?.designation || job?.designation || job?.title || '',
    grossPay: o?.grossPay || job?.payScale.cpcBand || '',
    joiningDate: o?.joiningDate || inMonth,
    acceptBy: o?.acceptBy || inWeek,
    reportTo: o?.reportTo || (job?.department ? `Head, ${job.department}` : ''),
    signatory: o?.signatory || inst?.offerSignatory || '',
    signatoryTitle: o?.signatoryTitle || inst?.offerSignatoryTitle || 'Registrar',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.makeOffer(app.id, f);
    if (!r.success) { setErr(r.error || 'Could not issue the offer.'); return; }
    onDone?.(`Offer issued to ${app.candidateName}. They have been emailed.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Issue offer">
      <form onSubmit={submit} className="w-full max-w-xl my-8 rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">{o ? 'Revise offer' : 'Issue offer'} · {app.candidateName}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Designation</span><input required className={field} value={f.designation} onChange={set('designation')} /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Pay (as it should appear in the letter)</span><input className={field} value={f.grossPay} onChange={set('grossPay')} placeholder="Academic Level 10 of the 7th CPC pay matrix (₹57,700) plus allowances" /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Joining date</span><input type="date" required className={field} value={f.joiningDate} onChange={set('joiningDate')} /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Respond by</span><input type="date" className={field} value={f.acceptBy} onChange={set('acceptBy')} /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-semibold text-slate-700">Report to</span><input className={field} value={f.reportTo} onChange={set('reportTo')} /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Signed by</span><input className={field} value={f.signatory} onChange={set('signatory')} placeholder="Name" /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Title</span><input className={field} value={f.signatoryTitle} onChange={set('signatoryTitle')} /></label>
          {err && <p className="sm:col-span-2 text-sm text-crimson-700" role="alert">{err}</p>}
          <p className="sm:col-span-2 text-xs text-slate-500">The candidate is emailed a link to the letter and can accept or decline it online. The wording comes from your institute&apos;s offer template.</p>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">{o ? 'Save and re-send' : 'Issue offer'}</button>
        </div>
      </form>
    </div>
  );
}
