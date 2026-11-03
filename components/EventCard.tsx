import React from 'react';
import Link from 'next/link';
import { CalendarDays, MapPin, Monitor, Megaphone } from 'lucide-react';
import { EVENT_KIND_SHORT, formatEventDates } from '@/lib/events';
import type { AcademicEvent } from '@/types';

/** One advertised event (FDP, workshop, seminar or conference). Works in server and client components. */
export default function EventCard({ event: e, compact = false }: { event: AcademicEvent; compact?: boolean }) {
  const conf = e.kind === 'conference';
  const place = e.mode === 'online' ? 'Online' : [e.city, e.state].filter(Boolean).join(', ');
  return (
    <Link
      href={`/events/${encodeURIComponent(e.id)}`}
      className={`group flex flex-col h-full p-5 sm:p-6 rounded-3xl border transition hover:-translate-y-0.5 hover:shadow-lg ${conf ? 'bg-brand-950 border-brand-900 text-white hover:shadow-brand-950/30' : 'bg-white border-slate-200 hover:border-brand-200 hover:shadow-brand-900/5'}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-bold px-2 py-0.5 rounded ${conf ? 'bg-gold-400 text-brand-950' : 'bg-brand-50 text-brand-800 border border-brand-100'}`}>
          {EVENT_KIND_SHORT[e.kind]}{conf && e.scope ? ` · ${e.scope === 'international' ? 'International' : 'National'}` : ''}
        </span>
        <span className={`inline-flex items-center gap-1 ${conf ? 'text-gold-200/80' : 'text-slate-400'}`}><Megaphone className="w-3.5 h-3.5" aria-hidden="true" />Sponsored</span>
      </div>
      <h3 className={`font-serif text-lg font-bold mt-3 leading-snug line-clamp-2 ${conf ? 'text-white' : 'text-slate-900 group-hover:text-brand-800'}`}>{e.title}</h3>
      <p className={`text-sm mt-1 line-clamp-1 ${conf ? 'text-gold-100/90' : 'text-slate-600'}`}>{e.organizer}{e.department ? ` · ${e.department}` : ''}</p>
      {!compact && <p className={`text-sm mt-3 line-clamp-2 ${conf ? 'text-white/75' : 'text-slate-500'}`}>{e.description}</p>}
      <div className={`mt-auto pt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs border-t ${conf ? 'border-white/15 text-white/85' : 'border-slate-100 text-slate-600'} ${compact ? 'mt-4' : 'mt-5'}`}>
        <span className="inline-flex items-center gap-1"><CalendarDays className={`w-3.5 h-3.5 ${conf ? 'text-gold-300' : 'text-slate-400'}`} aria-hidden="true" />{formatEventDates(e)}</span>
        <span className="inline-flex items-center gap-1">{e.mode === 'online' ? <Monitor className={`w-3.5 h-3.5 ${conf ? 'text-gold-300' : 'text-slate-400'}`} aria-hidden="true" /> : <MapPin className={`w-3.5 h-3.5 ${conf ? 'text-gold-300' : 'text-slate-400'}`} aria-hidden="true" />}{place || 'Venue in the details'}</span>
      </div>
    </Link>
  );
}
