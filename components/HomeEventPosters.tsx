'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, MapPin, Star } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { EVENT_KIND_SHORT, formatEventDates, isEventLive, posterUrl, sortEvents } from '@/lib/events';
import type { AcademicEvent } from '@/types';

/** A poster for an event: the uploaded image, or a designed one from the listing's details. */
export function EventPoster({ event: e, className = '' }: { event: AcademicEvent; className?: string }) {
  const src = posterUrl(e);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Poster: ${e.title}`} loading="lazy" className={`w-full h-full object-cover ${className}`} />;
  }
  const conf = e.kind === 'conference';
  return (
    <div className={`w-full h-full flex flex-col justify-between p-5 ${conf ? 'bg-brand-950' : 'bg-brand-900'} text-white ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between text-[11px] font-bold tracking-[0.12em] uppercase">
        <span className="text-gold-300">{EVENT_KIND_SHORT[e.kind]}{conf && e.scope ? ` · ${e.scope === 'international' ? 'International' : 'National'}` : ''}</span>
        <span className="w-8 h-px bg-gold-400" />
      </div>
      <div>
        <div className="font-serif text-xl sm:text-2xl font-bold leading-tight line-clamp-5">{e.title}</div>
        <div className="mt-3 h-px w-12 bg-gold-400" />
        <div className="mt-3 text-sm text-gold-100 line-clamp-2">{e.organizer}</div>
      </div>
      <div className="space-y-1 text-xs text-white/85">
        <div className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-gold-300" />{formatEventDates(e)}</div>
        <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gold-300" />{e.mode === 'online' ? 'Online' : [e.city, e.state].filter(Boolean).join(', ')}</div>
      </div>
    </div>
  );
}

/** Home page: events the administrator highlighted, shown as posters near the top. */
export default function HomeEventPosters() {
  const all = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const posters = useMemo(() => sortEvents(all.filter(e => e.highlighted && isEventLive(e))), [all]);
  if (!posters.length) return null;

  return (
    <section className="border-b border-slate-200 bg-white" aria-labelledby="home-posters">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gold-800 flex items-center gap-2"><Star className="w-4 h-4 fill-gold-500 text-gold-600" />Featured events</p>
            <h2 id="home-posters" className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1">Don&apos;t miss these</h2>
          </div>
          <div className="flex gap-x-5 text-sm">
            <Link href="/events" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-900">FDPs and workshops <ArrowRight className="w-4 h-4" /></Link>
            <Link href="/conferences" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-900">Conferences <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
        <ul className="mt-6 flex gap-4 sm:gap-5 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Featured events">
          {posters.map(e => (
            <li key={e.id} className="snap-start shrink-0 w-[68%] sm:w-64 lg:w-[17.5rem]">
              <Link href={`/events/${encodeURIComponent(e.id)}`} className="group block">
                <div className="aspect-[4/5] rounded-2xl overflow-hidden border border-gold-300 shadow-md group-hover:shadow-xl group-hover:-translate-y-0.5 transition bg-white">
                  <EventPoster event={e} />
                </div>
                <div className="mt-3">
                  <div className="text-xs font-semibold text-brand-700">{EVENT_KIND_SHORT[e.kind]} · {formatEventDates(e)}</div>
                  <div className="font-semibold text-slate-900 leading-snug mt-0.5 line-clamp-2 group-hover:text-brand-800">{e.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{e.organizer}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
