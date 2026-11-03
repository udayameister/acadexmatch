'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, ExternalLink, FileText, Mail, MapPin, Megaphone, Monitor, Phone, Ticket, Users, BookOpen } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { EVENT_KIND_LABEL, EVENT_MODE_LABEL, EVENT_STATUS_LABEL, formatEventDates, isEventLive, posterUrl } from '@/lib/events';
import type { AcademicEvent } from '@/types';

const fmt = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useCurrentUser();
  const events = useStorageValue<AcademicEvent[]>(() => StorageService.getEvents(), []);
  const e = events.find(x => x.id === id);

  if (!e) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{ready ? 'Event not found' : 'Loading…'}</h1>
        {ready && <p className="text-slate-600 mt-2">It may have ended or been removed. <Link href="/events" className="underline font-semibold text-brand-800">See current events</Link></p>}
      </div>
    );
  }

  const live = isEventLive(e);
  const conf = e.kind === 'conference';
  const mine = !!user && (e.createdBy === user.id || user.role === 'super_admin');
  const facts: [React.ReactNode, string, React.ReactNode][] = [
    [<CalendarDays key="i" className="w-4 h-4" />, 'Dates', formatEventDates(e)],
    [e.mode === 'online' ? <Monitor key="i" className="w-4 h-4" /> : <MapPin key="i" className="w-4 h-4" />, 'Where', <>{EVENT_MODE_LABEL[e.mode]}{e.venue ? <><br />{e.venue}</> : null}{e.mode !== 'online' && (e.city || e.state) ? <><br />{[e.city, e.state].filter(Boolean).join(', ')}</> : null}</>],
    ...(e.registrationDeadline ? [[<Clock key="i" className="w-4 h-4" />, 'Register by', fmt(e.registrationDeadline)] as [React.ReactNode, string, React.ReactNode]] : []),
    ...(conf && e.paperDeadline ? [[<FileText key="i" className="w-4 h-4" />, 'Paper submission by', fmt(e.paperDeadline)] as [React.ReactNode, string, React.ReactNode]] : []),
    ...(e.registrationFee ? [[<Ticket key="i" className="w-4 h-4" />, 'Registration fee', e.registrationFee] as [React.ReactNode, string, React.ReactNode]] : []),
    ...(e.audience ? [[<Users key="i" className="w-4 h-4" />, 'Who can attend', e.audience] as [React.ReactNode, string, React.ReactNode]] : []),
    ...(conf && e.publication ? [[<BookOpen key="i" className="w-4 h-4" />, 'Publication', e.publication] as [React.ReactNode, string, React.ReactNode]] : []),
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-6">
      <Link href={conf ? '/conferences' : '/events'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline"><ArrowLeft className="w-4 h-4" />{conf ? 'All conferences' : 'All FDPs, workshops and seminars'}</Link>

      {!live && mine && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 text-sm text-gold-900">
          <strong>Only you can see this page.</strong> Status: {EVENT_STATUS_LABEL[e.status]}{e.status === 'published' ? ' (the event has ended)' : ''}.
          {e.reviewNote ? <> Reason: {e.reviewNote}</> : null} <Link href="/events/post" className="underline font-semibold">Manage your listings</Link>
        </div>
      )}

      <header className={`p-6 sm:p-8 rounded-3xl border ${conf ? 'bg-brand-950 border-brand-900 text-white' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-bold px-2 py-0.5 rounded ${conf ? 'bg-gold-400 text-brand-950' : 'bg-brand-50 text-brand-800 border border-brand-100'}`}>{EVENT_KIND_LABEL[e.kind]}</span>
          {conf && e.scope && <span className="font-semibold text-gold-200">{e.scope === 'international' ? 'International' : 'National'} conference</span>}
          <span className={`inline-flex items-center gap-1 ${conf ? 'text-gold-200/80' : 'text-slate-400'}`}><Megaphone className="w-3.5 h-3.5" aria-hidden="true" />{e.addedByAdmin ? 'Featured event' : 'Sponsored listing'}</span>
        </div>
        <h1 className={`font-serif text-2xl sm:text-4xl font-bold mt-3 leading-tight ${conf ? 'text-white' : 'text-slate-900'}`}>{e.title}</h1>
        <p className={`mt-2 text-base ${conf ? 'text-gold-100' : 'text-slate-600'}`}>Organised by <strong>{e.organizer}</strong>{e.department ? `, ${e.department}` : ''}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {e.registrationLink && <a href={e.registrationLink} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold ${conf ? 'bg-gold-400 text-brand-950 hover:bg-gold-300' : 'bg-brand-900 text-white hover:bg-brand-800'}`}>Register <ExternalLink className="w-4 h-4" /></a>}
          {e.brochureLink && <a href={e.brochureLink} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold border ${conf ? 'border-white/30 text-white hover:bg-white/10' : 'border-slate-300 text-slate-800 hover:bg-slate-50'}`}>Brochure <ExternalLink className="w-4 h-4" /></a>}
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_20rem] gap-6 items-start">
        <section className="p-6 rounded-3xl bg-white border border-slate-200 space-y-4">
          <h2 className="font-bold text-slate-900">About this {EVENT_KIND_LABEL[e.kind].toLowerCase().replace(/ \(fdp\)$/, '')}</h2>
          <div className="text-sm sm:text-base text-slate-700 whitespace-pre-line break-words">{e.description}</div>
          {e.topics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Topics</h3>
              <div className="flex flex-wrap gap-1.5">{e.topics.map(t => <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">{t}</span>)}</div>
            </div>
          )}
        </section>
        <div className="space-y-4">
        {posterUrl(e) && (
          <a href={posterUrl(e)!} target="_blank" rel="noopener noreferrer" className="block rounded-3xl overflow-hidden border border-slate-200 bg-white" aria-label="Open the poster full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={posterUrl(e)!} alt={`Poster: ${e.title}`} className="w-full h-auto" />
          </a>
        )}
        <aside className="p-6 rounded-3xl bg-white border border-slate-200 space-y-4 text-sm">
          <dl className="space-y-3">
            {facts.map(([icon, k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-brand-700 mt-0.5" aria-hidden="true">{icon}</span>
                <div><dt className="text-xs text-slate-500">{k}</dt><dd className="text-slate-900 font-medium break-words">{v}</dd></div>
              </div>
            ))}
          </dl>
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h2 className="text-xs font-semibold text-slate-500">Contact the organisers</h2>
            <a href={`mailto:${e.contactEmail}`} className="flex items-center gap-2 text-brand-800 hover:underline break-all"><Mail className="w-4 h-4 shrink-0" />{e.contactEmail}</a>
            {e.contactPhone && <a href={`tel:${e.contactPhone.replace(/[^+0-9]/g, '')}`} className="flex items-center gap-2 text-brand-800 hover:underline"><Phone className="w-4 h-4 shrink-0" />{e.contactPhone}</a>}
          </div>
          <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">{e.addedByAdmin ? 'Details are provided by the organisers;' : 'This is a paid advertisement. Details are provided by the organisers;'} please confirm with them before registering or paying any fee.</p>
        </aside>
        </div>
      </div>
    </div>
  );
}
