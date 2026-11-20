'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Eye, FileText, Gift, MousePointerClick, Pencil, Plus, Star, Trash2, TrendingUp, X } from 'lucide-react';
import { EMPTY_EVENT_VIEWS, useEventViews } from '@/components/EventViews';
import EventForm from '@/components/EventForm';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { hydrate } from '@/lib/clientSync';
import { EVENT_KIND_LABEL, EVENT_KIND_SHORT, EVENT_KINDS, EVENT_MODE_LABEL, EVENT_STATUS_LABEL, eventPrices, formatEventDates, isEventLive, posterUrl, todayIstIso } from '@/lib/events';
import type { AcademicEvent, PlanSettings, User } from '@/types';

const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-50';
const input = 'px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: d.error || 'The server could not complete that.' };
}

type View = 'review' | 'unpaid' | 'live' | 'highlighted' | 'other';

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
  const [editor, setEditor] = useState<{ event: AcademicEvent | null } | null>(null);
  const me = useStorageValue<User | null>(() => StorageService.getCurrentUser(), null);
  const [p, setP] = useState({ ev: String(prices.eventPriceInr), conf: String(prices.conferencePriceInr) });
  const { counts: views, since: viewsSince } = useEventViews();
  const [sortBy, setSortBy] = useState<'date' | 'views'>('date');
  const vOf = (id: string) => views?.[id] || EMPTY_EVENT_VIEWS;

  const today = todayIstIso();
  const groups = useMemo(() => ({
    review: events.filter(e => e.status === 'under_review'),
    unpaid: events.filter(e => e.status === 'awaiting_payment'),
    live: events.filter(e => isEventLive(e, today)),
    highlighted: events.filter(e => e.highlighted && isEventLive(e, today)),
    other: events.filter(e => e.status === 'rejected' || (e.status === 'published' && e.endDate < today)),
  }), [events, today]);
  const list = [...groups[view]].sort((a, b) => sortBy === 'views' ? vOf(b.id).total - vOf(a.id).total || a.startDate.localeCompare(b.startDate) : a.startDate.localeCompare(b.startDate));
  // Visits across all events (admin only): totals, by type and the most viewed.
  const visitStats = useMemo(() => {
    if (!views) return null;
    const sum = (k: keyof typeof EMPTY_EVENT_VIEWS, list: AcademicEvent[]) => list.reduce((n, e) => n + ((views[e.id] || EMPTY_EVENT_VIEWS)[k] as number), 0);
    const byKind = EVENT_KINDS.map(k => { const l = events.filter(e => e.kind === k); return { kind: k, events: l.length, views: sum('total', l), last7: sum('last7', l) }; });
    const top = [...events].filter(e => (views[e.id]?.total || 0) > 0).sort((a, b) => views[b.id].total - views[a.id].total).slice(0, 5);
    return { total: sum('total', events), last7: sum('last7', events), today: sum('today', events), register: sum('register', events), brochure: sum('brochure', events), byKind, top };
  }, [views, events]);
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

      {visitStats && (
        <section aria-label="Event visits (admin only)" className="p-5 sm:p-6 rounded-3xl bg-sky-50/60 border border-sky-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2"><Eye className="w-5 h-5 text-sky-700" /> Visits to events</h2>
            <span className="text-[11px] text-sky-800 font-semibold uppercase tracking-wide">Admin only{viewsSince ? ` · counting since ${viewsSince}` : ''}</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {([['Total views', visitStats.total, Eye], ['Last 7 days', visitStats.last7, TrendingUp], ['Today', visitStats.today, Eye], ['Register clicks', visitStats.register, MousePointerClick], ['Brochure clicks', visitStats.brochure, FileText]] as const).map(([label, n, Icon]) => (
              <div key={label} className="p-3 rounded-xl bg-white border border-sky-100">
                <dd className="text-2xl font-bold text-slate-900 tabular-nums">{n.toLocaleString('en-IN')}</dd>
                <dt className="text-xs text-slate-500 flex items-center gap-1"><Icon className="w-3.5 h-3.5 text-sky-700" />{label}</dt>
              </div>
            ))}
          </dl>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-sky-100">
              <p className="text-sm font-semibold text-slate-900 mb-2">By type</p>
              <ul className="space-y-2">
                {visitStats.byKind.map(k => {
                  const max = Math.max(1, ...visitStats.byKind.map(x => x.views));
                  return (
                    <li key={k.kind} className="text-sm">
                      <div className="flex justify-between gap-2"><span className="text-slate-700">{EVENT_KIND_SHORT[k.kind]} <span className="text-slate-400">({k.events} listing{k.events === 1 ? '' : 's'})</span></span><span className="font-semibold text-slate-900 tabular-nums">{k.views.toLocaleString('en-IN')} <span className="font-normal text-slate-400">· {k.last7} this week</span></span></div>
                      <div className="h-1.5 rounded-full bg-sky-100 mt-1 overflow-hidden"><div className="h-full rounded-full bg-sky-600" style={{ width: `${(k.views / max) * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-sky-100">
              <p className="text-sm font-semibold text-slate-900 mb-2">Most viewed</p>
              {visitStats.top.length ? (
                <ol className="space-y-1.5 text-sm list-decimal pl-5 marker:text-slate-400">
                  {visitStats.top.map(e => (
                    <li key={e.id}><div className="flex justify-between gap-3"><Link href={`/events/${e.id}`} target="_blank" className="text-slate-800 hover:text-brand-800 hover:underline line-clamp-1">{e.title}</Link><span className="shrink-0 font-semibold tabular-nums text-slate-900">{vOf(e.id).total.toLocaleString('en-IN')}</span></div></li>
                  ))}
                </ol>
              ) : <p className="text-sm text-slate-500">No visits counted yet.</p>}
            </div>
          </div>
        </section>
      )}

      {editor ? (
        <EventForm
          key={editor.event?.id || 'new'}
          event={editor.event}
          defaults={{ kind: 'fdp', organizer: '', email: me?.email || '' }}
          settings={settings}
          adminPublish={!editor.event}
          isAdmin
          onSaved={() => { setEditor(null); setView(editor.event ? view : 'live'); flash(true, editor.event ? 'Listing saved.' : 'Event published.'); }}
          onCancel={() => setEditor(null)}
        />
      ) : (
        <button type="button" className={btnPrimary} onClick={() => setEditor({ event: null })}><Plus className="w-4 h-4" />Add an event (free)</button>
      )}

      <div className="flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label="Event listings">
        {([['review', 'To review'], ['unpaid', 'Waiting for payment'], ['live', 'Live'], ['highlighted', 'Highlighted'], ['other', 'Rejected or ended']] as [View, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3.5 py-2 rounded-lg font-semibold ${view === k ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l} ({groups[k].length})</button>
        ))}
      </div>

      {views && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">Sort by
          <select value={sortBy} onChange={ev => setSortBy(ev.target.value as 'date' | 'views')} className={`${input} py-1.5`}>
            <option value="date">Start date</option>
            <option value="views">Most viewed</option>
          </select>
        </label>
      )}

      {list.length === 0 && <p className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500">Nothing here.</p>}

      <ul className="space-y-3">
        {list.map(e => {
          const u = poster(e.createdBy);
          return (
            <li key={e.id} className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="min-w-0 flex gap-3">
                  {posterUrl(e) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={posterUrl(e)!} alt="" className="w-16 aspect-[4/5] object-cover rounded-lg border border-slate-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-100">{EVENT_KIND_LABEL[e.kind]}</span>
                    {e.highlighted && <span className="font-bold px-2 py-0.5 rounded bg-gold-400 text-brand-950 inline-flex items-center gap-1"><Star className="w-3 h-3" />Highlighted</span>}
                    {e.addedByAdmin && <span className="text-slate-500">Added by admin</span>}
                    <span className="text-slate-500">{EVENT_STATUS_LABEL[e.status]}{e.feeWaived ? ' · fee waived' : e.paidAt ? ` · paid ₹${e.kind === 'conference' ? prices.conferencePriceInr : prices.eventPriceInr}` : ''}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mt-1 break-words">{e.title}</h3>
                  <p className="text-sm text-slate-600 break-words">{e.organizer}{e.department ? ` · ${e.department}` : ''}</p>
                  {views && (() => { const v = vOf(e.id); return (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sky-900" title="Admin only">
                      <span className="inline-flex items-center gap-1 font-semibold"><Eye className="w-3.5 h-3.5 text-sky-700" />{v.total.toLocaleString('en-IN')} views</span>
                      <span>{v.last7} this week</span><span>{v.today} today</span>
                      <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5 text-sky-700" />{v.register} register</span>
                      <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-sky-700" />{v.brochure} brochure</span>
                    </p>
                  ); })()}
                  </div>
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
                  <button className={btnGhost} disabled={busy} onClick={() => { setEditor({ event: e }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-4 h-4" />Edit</button>
                  {e.status === 'published' && (
                    <button className={`${btnGhost} ${e.highlighted ? 'border-gold-400 bg-gold-50 text-gold-900' : ''}`} disabled={busy} aria-pressed={!!e.highlighted}
                      onClick={() => run('/api/admin/events', { action: 'highlight', id: e.id, on: !e.highlighted }, e.highlighted ? 'Highlight removed.' : 'Highlighted: shown as a poster on the home page.')}>
                      <Star className={`w-4 h-4 ${e.highlighted ? 'fill-gold-500 text-gold-600' : ''}`} />{e.highlighted ? 'Highlighted' : 'Highlight on home page'}
                    </button>
                  )}
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
