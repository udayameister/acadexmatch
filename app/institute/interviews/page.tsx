'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import type { Application, InterviewSlot, InterviewSlotOffer, Job } from '@/types';
import { CalendarPlus, Trash2, Users, Clock, Send } from 'lucide-react';

const PLATFORMS: InterviewSlot['platform'][] = ['Google Meet', 'Microsoft Teams', 'Zoom', 'In-Person (Campus Selection Board Room)'];
const field = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default function InterviewSlotsPage() {
  const inst = useStorageValue(() => StorageService.getCurrentInstitute(), undefined);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs().filter(j => j.instituteId === StorageService.getCurrentInstitute()?.id), []);
  const apps = useStorageValue<Application[]>(() => StorageService.getApplications(), []);
  const slotsAll = useStorageValue<InterviewSlotOffer[]>(() => StorageService.getInterviewSlots(), []);
  const [jobId, setJobId] = useState('');
  const activeJobId = jobId || jobs.find(j => apps.some(a => a.jobId === j.id))?.id || jobs[0]?.id || '';
  const job = jobs.find(j => j.id === activeJobId);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [f, setF] = useState({ date: tomorrow, startTime: '10:00', count: 6, durationMin: 30, gapMin: 0, platform: PLATFORMS[0], meetingLink: '', roomVenue: '', committee: '', instructions: 'Please join five minutes early with your photo ID. Keep a 10-minute presentation of your teaching and research ready.' });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteMsg, setInviteMsg] = useState('');
  const say = (ok: boolean, text: string) => { setFlash({ ok, text }); setTimeout(() => setFlash(null), 4000); };

  const slots = useMemo(() => slotsAll.filter(s => s.jobId === activeJobId).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [slotsAll, activeJobId]);
  const jobApps = apps.filter(a => a.jobId === activeJobId && a.status !== 'rejected');
  const appById = new Map(apps.map(a => [a.id, a]));
  const invitedNotBooked = jobApps.filter(a => a.slotInvite && !a.bookedSlotId);
  const notInvited = jobApps.filter(a => !a.slotInvite && ['shortlisted', 'eligible', 'screening', 'applied'].includes(a.status));
  const free = slots.filter(s => !s.bookedByAppId).length;
  const byDate = slots.reduce<Record<string, InterviewSlotOffer[]>>((m, s) => { (m[s.date] ||= []).push(s); return m; }, {});

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.addInterviewSlots(activeJobId, {
      date: f.date, startTime: f.startTime, count: f.count, durationMin: f.durationMin, gapMin: f.gapMin, platform: f.platform,
      meetingLink: f.meetingLink, roomVenue: f.roomVenue, committeeMembers: f.committee.split(',').map(x => x.trim()).filter(Boolean), instructions: f.instructions,
    });
    say(r.success, r.success ? `Added ${r.added} slot${r.added === 1 ? '' : 's'}.` : r.error || 'Could not add slots.');
  };

  const invite = (ids: string[]) => {
    if (!ids.length) return;
    if (!free) { say(false, 'Add some free slots first.'); return; }
    const r = StorageService.inviteToBookSlots(ids, inviteMsg);
    say(r.success, r.success ? `Invited ${r.invited} applicant${r.invited === 1 ? '' : 's'}. They will get an email.` : r.error || 'Could not invite.');
  };

  if (!inst) return null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {flash && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-white text-sm shadow-xl ${flash.ok ? 'bg-brand-950' : 'bg-crimson-700'}`} role="status">{flash.text}</div>}
      <div className="pb-6 border-b border-slate-200">
        <Link href="/institute/dashboard" className="text-xs text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2">Interview slots</h1>
        <p className="text-slate-600 text-sm mt-1">Offer interview times for a vacancy and let shortlisted applicants pick one. Booked candidates get a reminder the day before.</p>
      </div>

      <label className="block max-w-xl"><span className="text-xs font-semibold text-slate-700">Vacancy</span>
        <select className={field} value={activeJobId} onChange={e => setJobId(e.target.value)}>
          {jobs.length === 0 && <option value="">No vacancies yet</option>}
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title} ({apps.filter(a => a.jobId === j.id).length} applicants)</option>)}
        </select>
      </label>

      {job && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form onSubmit={add} className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><CalendarPlus className="w-4 h-4 text-brand-700" /> Add slots</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-xs font-semibold text-slate-700">Date</span><input type="date" required min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} className={field} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">First slot starts</span><input type="time" required className={field} value={f.startTime} onChange={e => setF({ ...f, startTime: e.target.value })} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Number of slots</span><input type="number" min={1} max={40} className={field} value={f.count} onChange={e => setF({ ...f, count: Number(e.target.value) || 1 })} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Minutes each</span><input type="number" min={5} max={240} className={field} value={f.durationMin} onChange={e => setF({ ...f, durationMin: Number(e.target.value) || 30 })} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Break between (min)</span><input type="number" min={0} max={120} className={field} value={f.gapMin} onChange={e => setF({ ...f, gapMin: Number(e.target.value) || 0 })} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">Mode</span><select className={field} value={f.platform} onChange={e => setF({ ...f, platform: e.target.value as InterviewSlot['platform'] })}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></label>
            </div>
            {f.platform.startsWith('In-Person')
              ? <label className="block"><span className="text-xs font-semibold text-slate-700">Venue</span><input className={field} value={f.roomVenue} onChange={e => setF({ ...f, roomVenue: e.target.value })} placeholder="Board room, Admin block, 2nd floor" /></label>
              : <label className="block"><span className="text-xs font-semibold text-slate-700">Meeting link</span><input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} className={field} value={f.meetingLink} onChange={e => setF({ ...f, meetingLink: e.target.value })} placeholder="https://meet.google.com/…" /></label>}
            <label className="block"><span className="text-xs font-semibold text-slate-700">Committee members (comma separated, not shown to candidates)</span><input className={field} value={f.committee} onChange={e => setF({ ...f, committee: e.target.value })} /></label>
            <label className="block"><span className="text-xs font-semibold text-slate-700">Instructions for candidates</span><textarea rows={3} className={field} value={f.instructions} onChange={e => setF({ ...f, instructions: e.target.value })} /></label>
            <p className="text-xs text-slate-500">This creates {f.count} slot{f.count === 1 ? '' : 's'} from {f.startTime} to {addMinutes(f.startTime, f.count * f.durationMin + (f.count - 1) * f.gapMin)} IST.</p>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">Add slots</button>
          </form>

          <div className="lg:col-span-7 space-y-6">
            <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-brand-700" /> Invite applicants to book</h2>
              <p className="text-xs text-slate-600">{free} free slot{free === 1 ? '' : 's'} · {invitedNotBooked.length} invited and not booked yet. You can also invite from the applicant list.</p>
              <textarea rows={2} className={field} value={inviteMsg} onChange={e => setInviteMsg(e.target.value)} placeholder="Optional message, e.g. what to prepare" />
              {notInvited.length === 0 ? <p className="text-sm text-slate-500">Everyone active for this vacancy has been invited.</p> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {notInvited.map(a => (
                    <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <span><span className="font-medium text-slate-900">{a.candidateName}</span> <span className="text-xs text-slate-500">· {a.matchScore}% match · {a.status.replace(/_/g, ' ')}</span></span>
                      <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-900 text-xs font-semibold hover:bg-brand-100" onClick={() => invite([a.id])}><Send className="w-3 h-3" /> Invite</button>
                    </li>
                  ))}
                </ul>
              )}
              {notInvited.length > 1 && <button className="px-4 py-2 rounded-lg bg-brand-900 text-white text-xs font-semibold" onClick={() => invite(notInvited.map(a => a.id))}>Invite all {notInvited.length}</button>}
            </section>

            <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Clock className="w-4 h-4 text-brand-700" /> Slots ({slots.length})</h2>
              {slots.length === 0 && <p className="text-sm text-slate-500">No slots yet for this vacancy.</p>}
              {Object.entries(byDate).map(([date, list]) => (
                <div key={date}>
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">{new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {list.map(s => {
                      const a = s.bookedByAppId ? appById.get(s.bookedByAppId) : undefined;
                      return (
                        <li key={s.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                          <span className="tabular-nums font-semibold text-slate-900 w-28">{s.time}–{addMinutes(s.time, s.durationMin)}</span>
                          <span className="flex-1 min-w-0 truncate text-slate-600">{a ? <span className="text-emerald-700 font-medium">Booked: {a.candidateName}</span> : 'Free'} <span className="text-xs text-slate-400">· {s.platform.startsWith('In-Person') ? 'On campus' : s.platform}</span></span>
                          {a ? (
                            <button className="text-xs text-crimson-700 hover:underline" onClick={() => { if (confirm(`Cancel ${a.candidateName}'s booking? They can book again.`)) { const r = StorageService.cancelInterviewBooking(a.id); say(r.success, r.success ? 'Booking cancelled.' : r.error || 'Failed.'); } }}>Cancel booking</button>
                          ) : (
                            <button className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" aria-label={`Delete ${s.date} ${s.time} slot`} onClick={() => { const r = StorageService.deleteInterviewSlot(s.id); if (!r.success) say(false, r.error || 'Failed.'); }}><Trash2 className="w-4 h-4" /></button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
