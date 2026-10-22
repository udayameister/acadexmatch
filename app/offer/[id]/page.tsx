'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { DEFAULT_OFFER_TEMPLATE, OFFER_PLACEHOLDERS, longDate, renderOfferText } from '@/lib/offerLetter';
import type { Application } from '@/types';
import { Printer, Pencil, Check, X } from 'lucide-react';

export default function OfferLetterPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useCurrentUser();
  const app = useStorageValue<Application | undefined>(() => StorageService.getApplicationById(id), undefined);
  const inst = useStorageValue(() => (app ? StorageService.getInstituteById(app.instituteId) : undefined), undefined);
  const job = app ? StorageService.getJobById(app.jobId) : undefined;
  const [editing, setEditing] = useState(false);
  const [tpl, setTpl] = useState('');
  const [sig, setSig] = useState({ name: '', title: '' });
  const [msg, setMsg] = useState<string | null>(null);

  if (!ready) return null;
  if (!user) return <div className="max-w-xl mx-auto px-4 py-20 text-center"><p className="text-slate-600">Please <Link href={`/login?next=/offer/${id}`} className="text-brand-800 underline font-semibold">sign in</Link> to see this letter.</p></div>;
  if (!app || !app.offerDetails?.offerLetterGenerated) return <div className="max-w-xl mx-auto px-4 py-20 text-center text-slate-600">This offer letter is not available.</div>;

  const o = app.offerDetails;
  const isCandidate = user.id === app.candidateId;
  const canEditTemplate = user.role === 'institute_admin' && user.instituteId === app.instituteId;
  const text = renderOfferText(app, job, inst);

  const respond = (r: 'accepted' | 'declined') => {
    if (!confirm(r === 'accepted' ? 'Accept this offer of appointment?' : 'Decline this offer?')) return;
    const res = StorageService.respondToOffer(app.id, r);
    setMsg(res.success ? (r === 'accepted' ? 'Thank you. Your acceptance has been recorded.' : 'Your response has been recorded.') : res.error || 'Failed.');
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={isCandidate ? '/candidate/applications' : '/institute/selection'} className="text-xs text-slate-500 hover:text-brand-700">← Back</Link>
        <div className="flex flex-wrap gap-2">
          {canEditTemplate && <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => { setTpl(inst?.offerTemplate || DEFAULT_OFFER_TEMPLATE); setSig({ name: inst?.offerSignatory || '', title: inst?.offerSignatoryTitle || '' }); setEditing(true); }}><Pencil className="w-3.5 h-3.5" /> Edit template</button>}
          <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print / save as PDF</button>
        </div>
      </div>

      {msg && <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 print:hidden" role="status">{msg}</p>}

      {isCandidate && !o.response && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <p className="text-sm text-slate-800">Please respond{o.acceptBy ? ` by ${longDate(o.acceptBy)}` : ''}.</p>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold" onClick={() => respond('accepted')}><Check className="w-4 h-4" /> Accept offer</button>
            <button className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-white border border-crimson-100 text-crimson-700 text-sm font-semibold" onClick={() => respond('declined')}><X className="w-4 h-4" /> Decline</button>
          </div>
        </div>
      )}

      {editing && (
        <form className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 print:hidden" onSubmit={e => {
          e.preventDefault();
          StorageService.updateInstitute(app.instituteId, { offerTemplate: tpl.trim() === DEFAULT_OFFER_TEMPLATE.trim() ? '' : tpl, offerSignatory: sig.name.trim(), offerSignatoryTitle: sig.title.trim() });
          setEditing(false); setMsg('Template saved. It is used for every new offer letter.');
        }}>
          <h2 className="font-bold text-slate-900">Offer letter template</h2>
          <p className="text-xs text-slate-600">Placeholders: {OFFER_PLACEHOLDERS.map(p => `{${p}}`).join(' ')}</p>
          <textarea rows={14} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono" value={tpl} onChange={e => setTpl(e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold text-slate-700">Default signatory</span><input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" value={sig.name} onChange={e => setSig({ ...sig, name: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-semibold text-slate-700">Title</span><input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" value={sig.title} onChange={e => setSig({ ...sig, title: e.target.value })} placeholder="Registrar" /></label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm" onClick={() => setEditing(false)}>Cancel</button><button className="px-4 py-2 rounded-lg bg-brand-900 text-white text-sm font-semibold">Save template</button></div>
        </form>
      )}

      <article className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 sm:p-12 print:border-0 print:shadow-none print:p-0 text-[15px] leading-relaxed text-slate-900">
        <header className="text-center border-b-2 border-brand-900 pb-4 mb-6">
          <div className="text-2xl font-bold text-brand-900">{inst?.name || app.instituteName}</div>
          <div className="text-sm text-slate-600">{[inst?.location.city, inst?.location.state].filter(Boolean).join(', ')}{inst?.website ? ` · ${inst.website.replace(/^https?:\/\//, '')}` : ''}</div>
        </header>
        <div className="flex justify-between text-sm mb-6">
          <span>No. {o.letterNumber}</span>
          <span>Date: {longDate(o.issuedAt)}</span>
        </div>
        <p className="mb-1">To,</p>
        <p className="font-semibold">{app.candidateName}</p>
        {app.candidateLocation && <p className="mb-4">{app.candidateLocation}</p>}
        <p className="font-semibold my-4">Subject: Offer of appointment to the post of {o.designation}</p>
        <div className="whitespace-pre-line">{text}</div>
        <div className="mt-12">
          <p>Yours sincerely,</p>
          <div className="h-12" />
          <p className="font-semibold">{o.signatory || '______________________'}</p>
          <p>{o.signatoryTitle || 'Authorised signatory'}, {inst?.shortName || app.instituteName}</p>
        </div>
        {o.response && (
          <div className="mt-10 pt-4 border-t border-slate-200 text-sm text-slate-700">
            Candidate response: <strong>{o.response === 'accepted' ? 'Accepted' : 'Declined'}</strong> on {o.respondedAt} (recorded online on AcadeXMatch).
          </div>
        )}
      </article>
    </div>
  );
}
