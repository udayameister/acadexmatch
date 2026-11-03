'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, CheckCircle2, Eye, Loader2, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import PayButton, { useOnlinePayment } from '@/components/PayButton';
import { hydrate } from '@/lib/clientSync';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { CONTACT_EMAIL } from '@/lib/contact';
import {
  EVENT_KIND_LABEL, EVENT_KINDS, EVENT_MODE_LABEL, EVENT_STATUS_LABEL, INDIAN_STATES, eventPriceFor, eventPrices,
  formatEventDates, isConference, productForKind, type EventInput,
} from '@/lib/events';
import type { AcademicEvent, EventKind, EventMode, PlanSettings } from '@/types';

const field = 'w-full mt-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const label = 'block text-sm font-semibold text-slate-800';
const hint = 'block text-xs font-normal text-slate-500 mt-0.5';

type Form = Omit<EventInput, 'topics'> & { topics: string };

function emptyForm(kind: EventKind, organizer: string, email: string): Form {
  return {
    kind, title: '', organizer, department: '', mode: 'in_person', venue: '', city: '', state: '', startDate: '', endDate: '',
    registrationDeadline: '', registrationFee: '', description: '', topics: '', audience: '', registrationLink: '', brochureLink: '',
    contactEmail: email, contactPhone: '', scope: null, paperDeadline: '', publication: '',
  };
}
const toForm = (e: AcademicEvent): Form => ({ ...e, topics: e.topics.join(', '), department: e.department || '', venue: e.venue || '', city: e.city || '',
  registrationDeadline: e.registrationDeadline || '', registrationFee: e.registrationFee || '', audience: e.audience || '', registrationLink: e.registrationLink || '',
  brochureLink: e.brochureLink || '', contactPhone: e.contactPhone || '', paperDeadline: e.paperDeadline || '', publication: e.publication || '' });

const STATUS_STYLE: Record<AcademicEvent['status'], string> = {
  awaiting_payment: 'bg-gold-50 text-gold-900 border-gold-200',
  under_review: 'bg-sky-50 text-sky-900 border-sky-200',
  published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-crimson-50 text-crimson-700 border-crimson-100',
};

export default function PostEventPageWrapper() {
  return <Suspense fallback={null}><PostEventPage /></Suspense>;
}

function PostEventPage() {
  const { user, ready } = useCurrentUser();
  const params = useSearchParams();
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const events = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const online = useOnlinePayment();
  const mine = useMemo(() => (user ? events.filter(e => e.createdBy === user.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : []), [events, user]);
  const prices = eventPrices(settings);
  const instName = user?.instituteId ? StorageService.getInstitutes().find(i => i.id === user.instituteId)?.name || '' : '';
  const startKind = (EVENT_KINDS as string[]).includes(params.get('type') || '') ? (params.get('type') as EventKind) : 'fdp';

  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user || form) return;
    const edit = params.get('edit');
    const ev = edit ? events.find(e => e.id === edit && e.createdBy === user.id) : undefined;
    if (ev) { setForm(toForm(ev)); setEditingId(ev.id); }
    else if (!mine.length || params.get('type')) setForm(emptyForm(startKind, instName, user.email));
  }, [ready, user, events, mine.length, params, form, startKind, instName]);

  if (!ready) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const set = <K extends keyof Form>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => (f ? { ...f, [k]: e.target.value } : f));

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/events', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: editingId || undefined, event: { ...form, topics: form.topics.split(',').map(t => t.trim()).filter(Boolean) } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save the listing.');
      await hydrate();
      setJustSaved(d.event.id);
      setForm(null); setEditingId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const remove = async (e: AcademicEvent) => {
    if (!confirm(`Delete “${e.title}”?`)) return;
    const r = await fetch('/api/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: e.id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) alert(d.error || 'Could not delete the listing.');
    await hydrate();
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Advertise on AcadeXMatch</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-brand-800 tracking-[-0.02em]">Advertise your FDP, workshop, seminar or conference</h1>
        <p className="text-slate-600 max-w-3xl">Reach college and university teachers, PhD scholars and researchers across India. Your listing appears on the AcadeXMatch home page and its events page until the event ends.</p>
        <div className="grid sm:grid-cols-2 gap-3 max-w-3xl pt-1">
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <div className="text-sm font-semibold text-slate-700">FDP, workshop or seminar</div>
            <div className="text-2xl font-bold text-brand-900 mt-1">₹{prices.eventPriceInr.toLocaleString('en-IN')} <span className="text-sm font-medium text-slate-500">per listing</span></div>
          </div>
          <div className="p-4 rounded-2xl bg-brand-950 text-white border border-brand-900">
            <div className="text-sm font-semibold text-gold-200">Conference <span className="font-normal text-gold-100/80">(own section)</span></div>
            <div className="text-2xl font-bold text-gold-300 mt-1">₹{prices.conferencePriceInr.toLocaleString('en-IN')} <span className="text-sm font-medium text-white/70">per listing</span></div>
          </div>
        </div>
        <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 pt-1">
          <li><strong className="text-slate-900">1.</strong> Fill in the details</li>
          <li><strong className="text-slate-900">2.</strong> Pay online (UPI, card, net banking)</li>
          <li><strong className="text-slate-900">3.</strong> Our team checks the listing</li>
          <li><strong className="text-slate-900">4.</strong> It is shown until the event ends</li>
        </ol>
      </header>

      {!user ? (
        <div className="p-6 rounded-3xl bg-white border border-slate-200 text-center space-y-3">
          <p className="text-slate-700">Sign in or create a free account to post your listing.</p>
          <div className="flex justify-center gap-2">
            <Link href="/login?next=/events/post" className="px-5 py-2.5 rounded-xl bg-brand-900 text-white text-sm font-semibold hover:bg-brand-800">Sign in</Link>
            <Link href="/register" className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50">Create an account</Link>
          </div>
        </div>
      ) : (
        <>
          {justSaved && (() => {
            const e = mine.find(x => x.id === justSaved);
            if (!e || e.status !== 'awaiting_payment') return null;
            return (
              <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 space-y-3">
                <p className="text-sm text-emerald-900 flex items-start gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />Saved. Pay ₹{eventPriceFor(settings, e.kind).toLocaleString('en-IN')} to send “{e.title}” for review.</p>
                <div className="max-w-sm"><PayFor e={e} settings={settings} online={online} /></div>
              </div>
            );
          })()}

          {form ? (
            <form onSubmit={save} className="p-5 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6" noValidate>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Edit listing' : 'New listing'}</h2>
                {mine.length > 0 && <button type="button" onClick={() => { setForm(null); setEditingId(null); setError(''); }} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><X className="w-4 h-4" />Cancel</button>}
              </div>

              <fieldset>
                <legend className={label}>Type of event *</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {EVENT_KINDS.map(k => {
                    const locked = !!editingId && (() => { const cur = mine.find(x => x.id === editingId); return !!cur && (!!cur.paidAt || !!cur.feeWaived) && isConference(cur.kind) !== isConference(k); })();
                    return (
                      <label key={k} className={`p-3 rounded-xl border text-sm cursor-pointer ${form.kind === k ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700' : 'border-slate-200 hover:border-slate-300'} ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <input type="radio" name="kind" value={k} checked={form.kind === k} disabled={locked} onChange={() => setForm({ ...form, kind: k })} className="sr-only" />
                        <span className="font-semibold text-slate-900 block">{k === 'fdp' ? 'FDP' : EVENT_KIND_LABEL[k]}</span>
                        <span className="text-xs text-slate-500">₹{eventPriceFor(settings, k).toLocaleString('en-IN')}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className={`${label} sm:col-span-2`}>Title *<input required value={form.title} onChange={set('title')} maxLength={200} placeholder={isConference(form.kind) ? 'e.g. International Conference on Sustainable Computing (ICSC 2027)' : 'e.g. One-week FDP on Generative AI in Engineering Education'} className={field} /></label>
                <label className={label}>Organising institution *<input required value={form.organizer} onChange={set('organizer')} maxLength={200} className={field} /></label>
                <label className={label}>Department / organising body<input value={form.department || ''} onChange={set('department')} maxLength={160} className={field} /></label>
                <label className={label}>Start date *<input required type="date" value={form.startDate} onChange={set('startDate')} className={field} /></label>
                <label className={label}>End date *<input required type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} className={field} /></label>
                <label className={label}>How it is held *
                  <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as EventMode })} className={field}>
                    {(Object.keys(EVENT_MODE_LABEL) as EventMode[]).map(m => <option key={m} value={m}>{EVENT_MODE_LABEL[m]}</option>)}
                  </select>
                </label>
                <label className={label}>State *
                  <select required value={form.state} onChange={set('state')} className={field}>
                    <option value="">Choose…</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                {form.mode !== 'online' && <label className={label}>Venue *<input required value={form.venue || ''} onChange={set('venue')} maxLength={200} placeholder="Hall, campus" className={field} /></label>}
                {form.mode !== 'online' && <label className={label}>City<input value={form.city || ''} onChange={set('city')} maxLength={80} className={field} /></label>}
                <label className={label}>Last date to register<input type="date" value={form.registrationDeadline || ''} max={form.endDate || undefined} onChange={set('registrationDeadline')} className={field} /></label>
                <label className={label}>Registration fee<input value={form.registrationFee || ''} onChange={set('registrationFee')} maxLength={120} placeholder="e.g. Free, or ₹500 for faculty" className={field} /></label>
                {isConference(form.kind) && <>
                  <label className={label}>National or international
                    <select value={form.scope || ''} onChange={e => setForm({ ...form, scope: (e.target.value || null) as Form['scope'] })} className={field}>
                      <option value="">Not stated</option><option value="national">National</option><option value="international">International</option>
                    </select>
                  </label>
                  <label className={label}>Paper submission deadline<input type="date" value={form.paperDeadline || ''} onChange={set('paperDeadline')} className={field} /></label>
                  <label className={`${label} sm:col-span-2`}>Publication of papers<input value={form.publication || ''} onChange={set('publication')} maxLength={300} placeholder="e.g. Proceedings published by Springer (Scopus indexed)" className={field} /></label>
                </>}
                <label className={`${label} sm:col-span-2`}>Description *<span className={hint}>Theme, sessions, resource persons, certificate, and anything else attendees should know (at least 80 characters).</span>
                  <textarea required value={form.description} onChange={set('description')} rows={7} maxLength={4000} className={field} />
                </label>
                <label className={label}>Topics<span className={hint}>Separate with commas, up to 12.</span><input value={form.topics} onChange={set('topics')} className={field} /></label>
                <label className={label}>Who can attend<span className={hint}>e.g. Faculty, research scholars and PG students</span><input value={form.audience || ''} onChange={set('audience')} maxLength={300} className={field} /></label>
                <label className={label}>Registration link<input type="url" value={form.registrationLink || ''} onChange={set('registrationLink')} placeholder="https://" className={field} /></label>
                <label className={label}>Brochure link (PDF or web page)<input type="url" value={form.brochureLink || ''} onChange={set('brochureLink')} placeholder="https://" className={field} /></label>
                <label className={label}>Contact email *<input required type="email" value={form.contactEmail} onChange={set('contactEmail')} className={field} /></label>
                <label className={label}>Contact phone<input type="tel" value={form.contactPhone || ''} onChange={set('contactPhone')} className={field} /></label>
              </div>

              {error && <p role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700">{error}</p>}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button disabled={busy} className="inline-flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}{editingId ? 'Save changes' : 'Save and continue to payment'}
                </button>
                <p className="text-xs text-slate-500">{editingId && mine.find(x => x.id === editingId)?.paidAt ? 'Changes to a paid listing are checked again before they are shown.' : `You pay ₹${eventPriceFor(settings, form.kind).toLocaleString('en-IN')} on the next step.`}</p>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => { setForm(emptyForm(startKind, instName, user.email)); setJustSaved(null); }} className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><Plus className="w-4 h-4" />Advertise another event</button>
          )}

          {mine.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">Your listings</h2>
              <ul className="space-y-3">
                {mine.map(e => (
                  <li key={e.id} className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[e.status]}`}>{EVENT_STATUS_LABEL[e.status]}</span>
                        <span className="text-xs text-slate-500">{e.kind === 'fdp' ? 'FDP' : EVENT_KIND_LABEL[e.kind]}</span>
                      </div>
                      <div className="font-semibold text-slate-900 break-words">{e.title}</div>
                      <div className="text-xs text-slate-500 inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatEventDates(e)} · {e.organizer}</div>
                      {e.status === 'rejected' && e.reviewNote && <p className="text-xs text-crimson-700">Reason: {e.reviewNote}. Edit the listing to send it for review again.</p>}
                      {e.status === 'under_review' && <p className="text-xs text-slate-500">Paid. Our team will publish it after a quick check.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end shrink-0 items-center">
                      <Link href={`/events/${e.id}`} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Eye className="w-4 h-4" />View</Link>
                      <button type="button" onClick={() => { setForm(toForm(e)); setEditingId(e.id); setJustSaved(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Pencil className="w-4 h-4" />Edit</button>
                      {!e.paidAt && !e.feeWaived && <button type="button" onClick={() => remove(e)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-crimson-700 hover:bg-crimson-50"><Trash2 className="w-4 h-4" />Delete</button>}
                      {e.status === 'awaiting_payment' && <div className="w-full md:w-60"><PayFor e={e} settings={settings} online={online} /></div>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PayFor({ e, settings, online }: { e: AcademicEvent; settings: PlanSettings; online: ReturnType<typeof useOnlinePayment> }) {
  const price = eventPriceFor(settings, e.kind);
  if (online === null) return <p className="text-xs text-slate-500">Checking payment options…</p>;
  if (!online.configured) {
    return <p className="text-xs text-slate-600 flex gap-1.5"><Megaphone className="w-4 h-4 shrink-0 text-gold-600" />Online payment is not available right now. Email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to pay ₹{price.toLocaleString('en-IN')} by bank transfer.</p>;
  }
  return <PayButton product={productForKind(e.kind)} eventId={e.id} label={`Pay ₹${price.toLocaleString('en-IN')}`} description={`${e.kind === 'conference' ? 'Conference' : 'Event'} listing: ${e.title}`.slice(0, 250)} />;
}
