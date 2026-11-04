'use client';

import React, { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { hydrate } from '@/lib/clientSync';
import {
  EVENT_KIND_LABEL, EVENT_KINDS, EVENT_MODE_LABEL, INDIAN_STATES, eventPriceFor, isConference, listingIsFree, posterUrl, type EventInput,
} from '@/lib/events';
import type { AcademicEvent, EventKind, EventMode, PlanSettings } from '@/types';

const field = 'w-full mt-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const label = 'block text-sm font-semibold text-slate-800';
const hint = 'block text-xs font-normal text-slate-500 mt-0.5';

export const POSTER_MAX_BYTES = 3 * 1024 * 1024;
const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Form = Omit<EventInput, 'topics'> & { topics: string };

function emptyForm(kind: EventKind, organizer: string, email: string): Form {
  return {
    kind, title: '', organizer, department: '', mode: 'in_person', venue: '', city: '', state: '', startDate: '', endDate: '',
    registrationDeadline: '', registrationFee: '', description: '', topics: '', audience: '', registrationLink: '', brochureLink: '',
    contactEmail: email, contactPhone: '', scope: null, paperDeadline: '', publication: '',
  };
}
const toForm = (e: AcademicEvent): Form => ({
  ...e, topics: e.topics.join(', '), department: e.department || '', venue: e.venue || '', city: e.city || '',
  registrationDeadline: e.registrationDeadline || '', registrationFee: e.registrationFee || '', audience: e.audience || '', registrationLink: e.registrationLink || '',
  brochureLink: e.brochureLink || '', contactPhone: e.contactPhone || '', paperDeadline: e.paperDeadline || '', publication: e.publication || '',
});

/** Uploads (or removes, with file = null) an event's poster image. */
export async function uploadPoster(eventId: string, file: File | null): Promise<string | null> {
  const fd = new FormData();
  fd.append('eventId', eventId);
  if (file) fd.append('file', file); else fd.append('remove', '1');
  const r = await fetch('/api/events/poster', { method: 'POST', credentials: 'same-origin', body: fd });
  const d = await r.json().catch(() => ({}));
  return r.ok ? null : d.error || 'The poster could not be uploaded.';
}

/**
 * Event listing form (organisers on /events/post, and the administrator in the admin console).
 * `adminPublish`: the administrator's "Add event" — published straight away, without payment.
 */
export default function EventForm({ event, defaults, settings, adminPublish = false, isAdmin = false, onSaved, onCancel }: {
  event?: AcademicEvent | null;
  defaults: { kind: EventKind; organizer: string; email: string };
  settings: PlanSettings;
  adminPublish?: boolean;
  isAdmin?: boolean;
  onSaved: (e: AcademicEvent) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<Form>(() => (event ? toForm(event) : emptyForm(defaults.kind, defaults.organizer, defaults.email)));
  const [poster, setPoster] = useState<File | null>(null);
  const [removePoster, setRemovePoster] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paid = !!event && (!!event.paidAt || !!event.feeWaived);

  useEffect(() => {
    if (!poster) { setPreview(null); return; }
    const u = URL.createObjectURL(poster);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [poster]);

  const set = <K extends keyof Form>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const pick = (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!POSTER_TYPES.includes(file.type)) { setError('The poster must be a JPG, PNG or WebP image.'); return; }
    if (file.size > POSTER_MAX_BYTES) { setError('The poster must be 3 MB or smaller.'); return; }
    setPoster(file); setRemovePoster(false);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/events', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: event?.id, publish: adminPublish || undefined, event: { ...form, topics: form.topics.split(',').map(t => t.trim()).filter(Boolean) } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save the listing.');
      if (poster || (removePoster && event?.posterId)) {
        const err = await uploadPoster(d.event.id, poster);
        if (err) { await hydrate(); throw new Error(`Details saved, but ${err.charAt(0).toLowerCase()}${err.slice(1)}`); }
      }
      await hydrate();
      onSaved(d.event);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const currentPoster = !removePoster && event?.posterId ? posterUrl(event) : null;

  return (
    <form onSubmit={save} className="p-5 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6" noValidate>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">{event ? 'Edit listing' : adminPublish ? 'Add an event (free, published at once)' : 'New listing'}</h2>
        {onCancel && <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><X className="w-4 h-4" />Cancel</button>}
      </div>

      <fieldset>
        <legend className={label}>Type of event *</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {EVENT_KINDS.map(k => {
            const locked = paid && !isAdmin && !!event && isConference(event.kind) !== isConference(k);
            return (
              <label key={k} className={`p-3 rounded-xl border text-sm cursor-pointer ${form.kind === k ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700' : 'border-slate-200 hover:border-slate-300'} ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <input type="radio" name="kind" value={k} checked={form.kind === k} disabled={locked} onChange={() => setForm({ ...form, kind: k })} className="sr-only" />
                <span className="font-semibold text-slate-900 block">{k === 'fdp' ? 'FDP' : EVENT_KIND_LABEL[k]}</span>
                <span className="text-xs text-slate-500">{adminPublish || isAdmin ? 'Free (admin)' : listingIsFree(settings) ? 'Free' : `₹${eventPriceFor(settings, k).toLocaleString('en-IN')}`}</span>
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

        <div className="sm:col-span-2">
          <span className={label}>Poster<span className={hint}>Optional. JPG, PNG or WebP, up to 3 MB. A portrait poster (for example 1080 × 1350) looks best. Highlighted events show it on the home page.</span></span>
          <div className="mt-2 flex flex-col sm:flex-row gap-4 items-start">
            {(preview || currentPoster) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview || currentPoster!} alt="Poster preview" className="w-36 aspect-[4/5] object-cover rounded-xl border border-slate-200 bg-slate-50" />
            )}
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
                <ImagePlus className="w-4 h-4" />{preview || currentPoster ? 'Change poster' : 'Add a poster'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => pick(e.target.files?.[0])} />
              </label>
              {(preview || currentPoster) && (
                <button type="button" onClick={() => { setPoster(null); setRemovePoster(true); }} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-crimson-700 hover:bg-crimson-50"><Trash2 className="w-4 h-4" />Remove</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700">{error}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button disabled={busy} className="inline-flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{event ? 'Save changes' : adminPublish ? 'Publish now (free)' : listingIsFree(settings) && !isAdmin ? 'Save and send for review (free)' : 'Save and continue to payment'}
        </button>
        <p className="text-xs text-slate-500">
          {adminPublish ? 'Shown on the site straight away, without payment.'
            : event && paid && !isAdmin ? 'Changes to a paid listing are checked again before they are shown.'
              : event ? '' : listingIsFree(settings) ? 'No payment during the launch offer. Our team checks the listing before it is shown.' : `You pay ₹${eventPriceFor(settings, form.kind).toLocaleString('en-IN')} on the next step.`}
        </p>
      </div>
    </form>
  );
}
