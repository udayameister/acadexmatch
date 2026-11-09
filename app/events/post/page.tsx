'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, CheckCircle2, Eye, Gift, Loader2, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import PayButton, { useOnlinePayment } from '@/components/PayButton';
import { hydrate } from '@/lib/clientSync';
import { StorageService, eventsFreeActive } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { CONTACT_EMAIL } from '@/lib/contact';
import EventForm from '@/components/EventForm';
import {
  EVENT_KIND_LABEL, EVENT_KINDS, EVENT_STATUS_LABEL, eventPriceFor, eventPrices, formatEventDates, productForKind,
} from '@/lib/events';
import type { AcademicEvent, EventKind, PlanSettings } from '@/types';

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
  const free = eventsFreeActive(settings);
  const freeUntil = settings.eventsFreeUntil ? new Date(`${settings.eventsFreeUntil}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const instName = user?.instituteId ? StorageService.getInstitutes().find(i => i.id === user.instituteId)?.name || '' : '';
  const startKind = (EVENT_KINDS as string[]).includes(params.get('type') || '') ? (params.get('type') as EventKind) : 'fdp';

  // null = no form open; { event: null } = new listing; { event } = editing.
  const [form, setForm] = useState<{ event: AcademicEvent | null } | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user || form) return;
    const edit = params.get('edit');
    const ev = edit ? events.find(e => e.id === edit && e.createdBy === user.id) : undefined;
    if (ev) setForm({ event: ev });
    else if (!mine.length || params.get('type')) setForm({ event: null });
  }, [ready, user, events, mine.length, params, form]);

  if (!ready) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const claimFree = async (e: AcademicEvent) => {
    const r = await fetch('/api/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claimFree', id: e.id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) alert(d.error || 'Could not send the listing for review.');
    await hydrate();
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
        {free && (
          <p className="max-w-3xl p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex gap-2" role="status">
            <Gift className="w-5 h-5 shrink-0" /><span><strong>Launch offer: listing is free until {freeUntil}.</strong> No payment needed; our team checks each listing before it is shown.</span>
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3 max-w-3xl pt-1">
          <div className="p-4 rounded-2xl bg-white border border-slate-200">
            <div className="text-sm font-semibold text-slate-700">FDP, workshop or seminar</div>
            <div className="text-2xl font-bold text-brand-900 mt-1">{free ? <>Free <s className="text-base font-medium text-slate-400">₹{prices.eventPriceInr.toLocaleString('en-IN')}</s></> : <>₹{prices.eventPriceInr.toLocaleString('en-IN')} <span className="text-sm font-medium text-slate-500">per listing</span></>}</div>
          </div>
          <div className="p-4 rounded-2xl bg-brand-950 text-white border border-brand-900">
            <div className="text-sm font-semibold text-gold-200">Conference <span className="font-normal text-gold-100/80">(own section)</span></div>
            <div className="text-2xl font-bold text-gold-300 mt-1">{free ? <>Free <s className="text-base font-medium text-white/50">₹{prices.conferencePriceInr.toLocaleString('en-IN')}</s></> : <>₹{prices.conferencePriceInr.toLocaleString('en-IN')} <span className="text-sm font-medium text-white/70">per listing</span></>}</div>
          </div>
        </div>
        <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 pt-1">
          <li><strong className="text-slate-900">1.</strong> Fill in the details</li>
          <li><strong className="text-slate-900">2.</strong> {free ? 'No payment during the launch offer' : 'Pay online (UPI, card, net banking)'}</li>
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
            if (e?.status === 'under_review' && e.freeOffer) return <p className="p-4 rounded-3xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />Saved and sent for review, free of charge. We will publish “{e.title}” after a quick check.</p>;
            if (!e || e.status !== 'awaiting_payment') return null;
            return (
              <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 space-y-3">
                <p className="text-sm text-emerald-900 flex items-start gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" />Saved. Pay ₹{eventPriceFor(settings, e.kind).toLocaleString('en-IN')} to send “{e.title}” for review.</p>
                <div className="max-w-sm"><PayFor e={e} settings={settings} online={online} /></div>
              </div>
            );
          })()}

          {form ? (
            <EventForm
              key={form.event?.id || 'new'}
              event={form.event}
              defaults={{ kind: startKind, organizer: instName, email: user.email }}
              settings={settings}
              isAdmin={user.role === 'super_admin'}
              onSaved={e => { setJustSaved(e.id); setForm(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onCancel={mine.length ? () => setForm(null) : undefined}
            />
          ) : (
            <button type="button" onClick={() => { setForm({ event: null }); setJustSaved(null); }} className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><Plus className="w-4 h-4" />Advertise another event</button>
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
                      {e.status === 'under_review' && <p className="text-xs text-slate-500">{e.freeOffer ? 'Free launch-offer listing.' : 'Paid.'} Our team will publish it after a quick check.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end shrink-0 items-center">
                      <Link href={`/events/${e.id}`} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Eye className="w-4 h-4" />View</Link>
                      <button type="button" onClick={() => { setForm({ event: e }); setJustSaved(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"><Pencil className="w-4 h-4" />Edit</button>
                      {!e.paidAt && (!e.feeWaived || e.freeOffer) && <button type="button" onClick={() => remove(e)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-crimson-700 hover:bg-crimson-50"><Trash2 className="w-4 h-4" />Delete</button>}
                      {e.status === 'awaiting_payment' && (free
                        ? <button type="button" onClick={() => claimFree(e)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold"><Gift className="w-4 h-4" />Send for review free</button>
                        : <div className="w-full md:w-60"><PayFor e={e} settings={settings} online={online} /></div>)}
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
