'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Gift, Trash2, X } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { hydrate } from '@/lib/clientSync';
import { EVENT_KIND_LABEL, EVENT_MODE_LABEL, EVENT_STATUS_LABEL, eventPrices, formatEventDates, isEventLive, todayIstIso } from '@/lib/events';
import type { AcademicEvent, PlanSettings, User } from '@/types';

const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-50';
const input = 'px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: d.error || 'The server could not complete that.' };
}

type View = 'review' | 'unpaid' | 'live' | 'other';

/** Admin console: review FDP / workshop / seminar / conference advertisements and set their prices. */
export default function EventsAdminPanel() {
  const events = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const prices = eventPrices(settings);
  const [view, setView] = useState<View>('review');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [p, setP] = useState({ ev: String(prices.eventPriceInr), conf: String(prices.conferencePriceInr) });

  const today = todayIstIso();
  const groups = useMemo(() => ({
    review: events.filter(e => e.status === 'under_review'),
    unpaid: events.filter(e => e.status === 'awaiting_payment'),
    live: events.filter(e => isEventLive(e, today)),
    other: events.filter(e => e.status === 'rejected' || (e.status === 'published' && e.endDate < today)),
  }), [events, today]);
  const list = [...groups[view]].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const poster = (id: string) => users.find(u => u.id === id);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };
  const run = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    const r = await post(url, body);
    if (r.ok) { await hydrate(); flash(true, ok); } else flash(false, r.error!);
    setBusy(false);
    return r.ok;
  };

  return (
    <div className="space-y-5">
      {msg && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm shadow-xl text-white ${msg.ok ? 'bg-brand-950' : 'bg-crimson-700'}`} role="status">{msg.text}</div>}

      <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-serif text-lg font-bold text-slate-900">Events and conferences</h2>
          <p className="text-sm text-slate-600 mt-1">Paid advertisements shown on the home page and on /events and /conferences until the event ends. Paid listings wait here for your approval; you can also publish one without payment.</p>
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run('/api/admin/events', { action: 'prices', eventPriceInr: Number(p.ev), conferencePriceInr: Number(p.conf) }, 'Prices saved.'); }}>
          <label className="text-sm text-slate-700 flex flex-col gap-1">FDP / workshop / seminar (₹)<input type="number" min={1} value={p.ev} onChange={e => setP({ ...p, ev: e.target.value })} className={`${input} w-36`} /></label>
          <label className="text-sm text-slate-700 flex flex-col gap-1">Conference (₹)<input type="number" min={1} value={p.conf} onChange={e => setP({ ...p, conf: e.target.value })} className={`${input} w-36`} /></label>
          <button className={btnPrimary} disabled={busy}>Save prices</button>
        </form>
      </section>

      <div className="flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label="Event listings">
        {([['review', 'To review'], ['unpaid', 'Waiting for payment'], ['live', 'Live'], ['other', 'Rejected or ended']] as [View, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3.5 py-2 rounded-lg font-semibold ${view === k ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l} ({groups[k].length})</button>
        ))}
      </div>

      {list.length === 0 && <p className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500">Nothing here.</p>}

      <ul className="space-y-3">
        {list.map(e => {
          const u = poster(e.createdBy);
          return (
            <li key={e.id} className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-100">{EVENT_KIND_LABEL[e.kind]}</span>
                    <span className="text-slate-500">{EVENT_STATUS_LABEL[e.status]}{e.feeWaived ? ' · fee waived' : e.paidAt ? ` · paid ₹${e.kind === 'conference' ? prices.conferencePriceInr : prices.eventPriceInr}` : ''}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mt-1 break-words">{e.title}</h3>
                  <p className="text-sm text-slate-600 break-words">{e.organizer}{e.department ? ` · ${e.department}` : ''}</p>
                </div>
                <Link href={`/events/${e.id}`} target="_blank" className="text-xs inline-flex items-center gap-1 text-brand-800 hover:underline shrink-0">Preview <ExternalLink className="w-3 h-3" /></Link>
              </div>
              <dl className="grid sm:grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Dates</dt><dd className="text-slate-800">{formatEventDates(e)}{e.registrationDeadline ? ` · register by ${e.registrationDeadline}` : ''}</dd>
                <dt className="text-slate-500">Where</dt><dd className="text-slate-800">{EVENT_MODE_LABEL[e.mode]}{e.venue ? ` · ${e.venue}` : ''}{e.city ? `, ${e.city}` : ''}, {e.state}</dd>
                <dt className="text-slate-500">Description</dt><dd className="text-slate-800 line-clamp-3 whitespace-pre-line">{e.description}</dd>
                <dt className="text-slate-500">Links</dt><dd className="text-slate-800 break-all">{[e.registrationLink, e.brochureLink].filter(Boolean).join(' · ') || '—'}</dd>
                <dt className="text-slate-500">Contact</dt><dd className="text-slate-800 break-all">{e.contactEmail}{e.contactPhone ? ` · ${e.contactPhone}` : ''}</dd>
                <dt className="text-slate-500">Posted by</dt><dd className="text-slate-800 break-all">{u ? `${u.name} (${u.email})` : '—'} · {new Date(e.createdAt).toLocaleDateString('en-IN')}</dd>
                {e.reviewNote && <><dt className="text-slate-500">Reason</dt><dd className="text-crimson-700">{e.reviewNote}</dd></>}
              </dl>

              {rejecting === e.id ? (
                <form className="flex flex-col sm:flex-row gap-2" onSubmit={async ev => { ev.preventDefault(); if (await run('/api/admin/events', { action: 'review', id: e.id, decision: 'reject', note: reason }, 'Listing rejected.')) { setRejecting(null); setReason(''); } }}>
                  <label htmlFor={`r-${e.id}`} className="sr-only">Reason</label>
                  <input id={`r-${e.id}`} value={reason} onChange={ev => setReason(ev.target.value)} placeholder="Reason shown to the organiser" className={`${input} flex-1`} autoFocus />
                  <button className={btnPrimary} disabled={busy || !reason.trim()}>Reject</button>
                  <button type="button" className={btnGhost} onClick={() => setRejecting(null)}>Cancel</button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2 justify-end">
                  <button className={`${btnGhost} text-crimson-700`} disabled={busy} onClick={() => { if (confirm(`Delete “${e.title}”? This cannot be undone.`)) run('/api/events', { action: 'delete', id: e.id }, 'Listing deleted.'); }}><Trash2 className="w-4 h-4" />Delete</button>
                  {e.status !== 'rejected' && <button className={btnGhost} disabled={busy} onClick={() => { setRejecting(e.id); setReason(''); }}><X className="w-4 h-4" />Reject</button>}
                  {e.status === 'awaiting_payment' && <button className={btnGhost} disabled={busy} onClick={() => run('/api/admin/events', { action: 'review', id: e.id, decision: 'waive' }, 'Published without payment.')}><Gift className="w-4 h-4" />Publish without payment</button>}
                  {(e.status === 'under_review' || (e.status === 'rejected' && (e.paidAt || e.feeWaived))) && <button className={btnPrimary} disabled={busy} onClick={() => run('/api/admin/events', { action: 'review', id: e.id, decision: 'approve' }, 'Published on the site.')}><Check className="w-4 h-4" />Approve &amp; publish</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
