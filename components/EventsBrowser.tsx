'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import EventCard from '@/components/EventCard';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { EVENT_KIND_SHORT, PROGRAMME_KINDS, isEventLive, listingIsFree, listingPriceText, sortEvents } from '@/lib/events';
import type { AcademicEvent, EventKind, PlanSettings } from '@/types';

/** Public list of advertised events: FDPs/workshops/seminars, or conferences. */
export default function EventsBrowser({ section }: { section: 'programmes' | 'conferences' }) {
  const all = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const [kind, setKind] = useState<EventKind | 'all'>('all');
  const [state, setState] = useState('');
  const conf = section === 'conferences';

  const live = useMemo(() => sortEvents(all.filter(e => isEventLive(e) && (conf ? e.kind === 'conference' : e.kind !== 'conference'))), [all, conf]);
  const states = useMemo(() => [...new Set(live.map(e => (e.mode === 'online' ? 'Online' : e.state)).filter(Boolean))].sort(), [live]);
  const shown = live.filter(e => (kind === 'all' || e.kind === kind) && (!state || (state === 'Online' ? e.mode === 'online' : e.state === state)));
  const price = listingPriceText(settings, conf ? 'conference' : 'fdp');
  const free = listingIsFree(settings);

  return (
    <div className="w-full">
      <section className="hero-backdrop border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-16 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />{conf ? 'Academic conferences' : 'Professional development'}</p>
            <h1 className="text-3xl sm:text-5xl font-bold text-brand-800 mt-3 tracking-[-0.02em]">{conf ? 'Upcoming conferences' : 'FDPs, workshops and seminars'}</h1>
            <p className="text-slate-600 mt-4 text-lg">
              {conf
                ? 'National and international conferences from Indian institutions: dates, paper deadlines and how to register.'
                : 'Faculty development programmes, workshops and seminars for teachers and researchers across India.'}
            </p>
            <p className="text-sm mt-3"><Link href={conf ? '/events' : '/conferences'} className="font-semibold text-brand-800 hover:underline">{conf ? 'See FDPs, workshops and seminars →' : 'See upcoming conferences →'}</Link></p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-gold-300 shadow-sm max-w-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Megaphone className="w-4 h-4 text-gold-600" aria-hidden="true" />Organising {conf ? 'a conference' : 'an FDP, workshop or seminar'}?</div>
            <p className="text-sm text-slate-600 mt-1">Advertise it here and on the AcadeXMatch home page until the event ends, {free ? <><strong className="text-slate-900">free</strong> during our launch offer</> : <>for <strong className="text-slate-900">{price}</strong></>}.</p>
            <Link href={`/events/post?type=${conf ? 'conference' : 'fdp'}`} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><Plus className="w-4 h-4" aria-hidden="true" />Advertise your {conf ? 'conference' : 'event'}</Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {!conf ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type of event">
              {(['all', ...PROGRAMME_KINDS] as (EventKind | 'all')[]).map(k => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-semibold ${kind === k ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'}`}>
                  {k === 'all' ? 'All' : EVENT_KIND_SHORT[k]}
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-slate-600">{live.length} upcoming conference{live.length === 1 ? '' : 's'}</p>}
          <label className="text-sm text-slate-600 flex items-center gap-2">State
            <select value={state} onChange={e => setState(e.target.value)} className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900">
              <option value="">All</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        {shown.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{shown.map(e => <EventCard key={e.id} event={e} />)}</div>
        ) : (
          <div className="p-10 rounded-3xl bg-white border border-slate-200 text-center">
            <p className="text-slate-600">{live.length ? 'Nothing matches these filters.' : `No ${conf ? 'conferences' : 'events'} are advertised right now.`}</p>
            <Link href={`/events/post?type=${conf ? 'conference' : 'fdp'}`} className="mt-3 inline-block text-sm font-semibold text-brand-800 hover:underline">Be the first to advertise yours →</Link>
          </div>
        )}
      </section>
    </div>
  );
}
