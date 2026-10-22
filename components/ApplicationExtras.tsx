'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { downloadEventIcs } from '@/lib/ics';
import type { Application, InterviewSlotOffer, TalentInvite } from '@/types';
import { CalendarCheck, CalendarPlus, FileSignature, Mail, Check, X } from 'lucide-react';

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Candidate side: choose / change an interview slot, add it to the calendar, and respond to an offer. */
export function ApplicationExtras({ app }: { app: Application }) {
  const slots = useStorageValue<InterviewSlotOffer[]>(() => StorageService.getSlotsForJob(app.jobId), []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const free = slots.filter(s => s.date >= today && !(s.bookedByAppId ? s.bookedByAppId !== app.id : s.booked) && s.id !== app.bookedSlotId);
  const say = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const book = (slotId: string) => {
    const r = StorageService.bookInterviewSlot(app.id, slotId);
    if (r.success) { setChoosing(false); say(true, 'Interview slot booked. The institution has been told.'); } else say(false, r.error || 'Could not book.');
  };

  const byDate = free.reduce<Record<string, InterviewSlotOffer[]>>((m, s) => { (m[s.date] ||= []).push(s); return m; }, {});
  const showPicker = app.status !== 'rejected' && app.slotInvite && (!app.bookedSlotId || choosing);

  return (
    <div className="space-y-3">
      {msg && <p className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-crimson-50 text-crimson-700'}`} role="status">{msg.text}</p>}

      {app.interviewSlot && app.status !== 'rejected' && (
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => downloadEventIcs({
            uid: app.id, title: `Interview — ${app.jobTitle} (${app.instituteName})`, date: app.interviewSlot!.date, time: app.interviewSlot!.time,
            durationMin: slots.find(s => s.id === app.bookedSlotId)?.durationMin || 30,
            location: app.interviewSlot!.roomVenue || app.interviewSlot!.platform, description: app.interviewSlot!.instructions, url: app.interviewSlot!.meetingLink,
          }, 'acadexmatch-interview.ics')}><CalendarPlus className="w-3.5 h-3.5" /> Add to calendar</button>
          <Link href="/candidate/interview-prep" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Prepare for the interview →</Link>
          {app.bookedSlotId && !choosing && app.interviewSlot.date > today && (
            <>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-brand-900 hover:bg-slate-50" onClick={() => setChoosing(true)}>Change time</button>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-crimson-100 text-xs font-semibold text-crimson-700 hover:bg-crimson-50" onClick={() => {
                if (!confirm('Cancel your interview booking? The slot will be released.')) return;
                const r = StorageService.cancelInterviewBooking(app.id);
                say(r.success, r.success ? 'Booking cancelled. Choose another slot when you are ready.' : r.error || 'Could not cancel.');
              }}>Cancel booking</button>
            </>
          )}
        </div>
      )}

      {showPicker && (
        <div className="p-5 rounded-2xl bg-blush border border-brand-100 space-y-3">
          <div className="flex items-start gap-2">
            <CalendarCheck className="w-5 h-5 text-brand-800 shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">{app.bookedSlotId ? 'Choose a new interview time' : 'Choose your interview time'}</h4>
              <p className="text-xs text-slate-600">{app.instituteName} invited you on {app.slotInvite!.invitedAt}.{app.slotInvite!.message ? ` “${app.slotInvite!.message}”` : ''}</p>
            </div>
          </div>
          {Object.keys(byDate).length === 0 ? (
            <p className="text-sm text-slate-600">No free slots right now. The institution may add more; check back soon.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byDate).map(([date, list]) => (
                <div key={date}>
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">{fmtDate(date)}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map(s => (
                      <button key={s.id} onClick={() => book(s.id)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-sm font-semibold text-slate-900" title={`${s.platform}${s.roomVenue ? ` · ${s.roomVenue}` : ''}`}>
                        {s.time} <span className="text-[11px] font-normal text-slate-500">· {s.durationMin} min · {s.platform.startsWith('In-Person') ? 'On campus' : s.platform}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {choosing && <button className="text-xs text-slate-600 underline" onClick={() => setChoosing(false)}>Keep my current time</button>}
        </div>
      )}

      {app.offerDetails?.offerLetterGenerated && (
        <div className="p-5 rounded-2xl bg-gold-50 border border-gold-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <FileSignature className="w-5 h-5 text-gold-700 shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Offer of appointment: {app.offerDetails.designation}</h4>
              <p className="text-xs text-slate-600">Joining {app.offerDetails.joiningDate}{app.offerDetails.acceptBy ? ` · respond by ${app.offerDetails.acceptBy}` : ''}{app.offerDetails.response ? ` · You ${app.offerDetails.response} on ${app.offerDetails.respondedAt}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/offer/${app.id}`} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50">View letter</Link>
            {!app.offerDetails.response && (
              <>
                <button className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" onClick={() => { if (confirm('Accept this offer?')) { const r = StorageService.respondToOffer(app.id, 'accepted'); say(r.success, r.success ? 'Offer accepted. The institution will contact you about joining.' : r.error || 'Failed.'); } }}><Check className="w-3.5 h-3.5" /> Accept</button>
                <button className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-crimson-100 text-crimson-700 text-xs font-semibold" onClick={() => { if (confirm('Decline this offer?')) { const r = StorageService.respondToOffer(app.id, 'declined'); say(r.success, r.success ? 'Offer declined.' : r.error || 'Failed.'); } }}><X className="w-3.5 h-3.5" /> Decline</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Candidate dashboard: invitations from institutions that found the candidate in talent search. */
export function TalentInvitesCard() {
  const invites = useStorageValue<TalentInvite[]>(() => StorageService.getTalentInvites(), []);
  const open = invites.filter(i => i.status === 'sent' || i.status === 'interested');
  if (!open.length) return null;
  return (
    <section className="p-5 rounded-2xl bg-white border border-gold-200 shadow-sm space-y-3" aria-labelledby="invites-title">
      <h2 id="invites-title" className="font-bold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-gold-600" /> Invitations to apply ({open.length})</h2>
      <ul className="space-y-2">
        {open.map(i => (
          <li key={i.id} className="p-3 rounded-xl bg-ivory border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">{i.instituteName} · {i.jobTitle}</div>
              {i.message && <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">“{i.message}”</p>}
              <div className="text-[11px] text-slate-500 mt-0.5">Sent {i.sentAt} by {i.sentBy}{i.status === 'interested' ? ' · you said you are interested' : ''}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href={`/jobs/${i.jobId}`} className="px-3 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold">See vacancy</Link>
              {i.status === 'sent' && <button className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => StorageService.respondTalentInvite(i.id, 'interested')}>Interested</button>}
              <button className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600" onClick={() => StorageService.respondTalentInvite(i.id, 'declined')}>Not now</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
