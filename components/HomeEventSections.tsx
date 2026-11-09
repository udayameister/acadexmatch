'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
import EventCard from '@/components/EventCard';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { isEventLive, listingPriceText, sortEvents } from '@/lib/events';
import type { AcademicEvent, PlanSettings } from '@/types';

/**
 * Home page: paid advertisements. One section for FDPs, workshops and seminars, and a separate one for conferences.
 * When nothing is advertised, a short band invites organisers to advertise.
 */
export default function HomeEventSections() {
  const all = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const live = useMemo(() => sortEvents(all.filter(e => isEventLive(e))), [all]);
  const programmes = live.filter(e => e.kind !== 'conference');
  const conferences = live.filter(e => e.kind === 'conference');
  const fdpPrice = listingPriceText(settings, 'fdp');
  const confPrice = listingPriceText(settings, 'conference');

  return (
    <>
      {programmes.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-24" aria-labelledby="home-events">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Professional development</p>
              <h2 id="home-events" className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">FDPs, workshops and seminars</h2>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link href="/events" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-900">View all {programmes.length} <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/events/post?type=fdp" className="inline-flex items-center gap-1.5 font-semibold text-gold-800 hover:text-gold-900"><Megaphone className="w-4 h-4" />Advertise yours · {fdpPrice}</Link>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {programmes.slice(0, 6).map(e => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {conferences.length > 0 && (
        <section className="bg-brand-950 border-y border-brand-900" aria-labelledby="home-conferences">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 sm:py-20">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gold-300 flex items-center gap-3"><span className="gold-rule" />Call for papers</p>
                <h2 id="home-conferences" className="font-serif text-3xl sm:text-4xl font-bold text-white mt-2">Upcoming conferences</h2>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <Link href="/conferences" className="inline-flex items-center gap-1.5 font-semibold text-gold-200 hover:text-white">View all {conferences.length} <ArrowRight className="w-4 h-4" /></Link>
                <Link href="/events/post?type=conference" className="inline-flex items-center gap-1.5 font-semibold text-gold-300 hover:text-white"><Megaphone className="w-4 h-4" />Advertise your conference · {confPrice}</Link>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
              {conferences.slice(0, 6).map(e => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        </section>
      )}

      {(programmes.length === 0 || conferences.length === 0) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-20">
          <div className="p-6 sm:p-8 rounded-3xl bg-cream border border-gold-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-gold-800 inline-flex items-center gap-2"><Megaphone className="w-4 h-4" />Advertise on AcadeXMatch</p>
              <h2 className="font-serif text-2xl font-bold text-slate-900 mt-2">Organising an FDP, workshop, seminar or conference?</h2>
              <p className="text-slate-600 mt-2 text-sm">Show it to teachers and researchers across India on our home page until the event ends.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 lg:min-w-[30rem]">
              <Link href="/events/post?type=fdp" className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-brand-300 hover:shadow-md transition">
                <div className="text-sm font-semibold text-slate-700">FDP, workshop or seminar</div>
                <div className="text-2xl font-bold text-brand-900 mt-1">{fdpPrice}</div>
                <div className="text-xs font-semibold text-brand-700 mt-2 inline-flex items-center gap-1">Post now <ArrowRight className="w-3.5 h-3.5" /></div>
              </Link>
              <Link href="/events/post?type=conference" className="p-4 rounded-2xl bg-brand-950 text-white border border-brand-900 hover:shadow-md transition">
                <div className="text-sm font-semibold text-gold-200">Conference</div>
                <div className="text-2xl font-bold text-gold-300 mt-1">{confPrice}</div>
                <div className="text-xs font-semibold text-gold-200 mt-2 inline-flex items-center gap-1">Post now <ArrowRight className="w-3.5 h-3.5" /></div>
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
