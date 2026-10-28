'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { StorageService, isPremiumUser } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import type { Announcement, User } from '@/types';
import { Megaphone, X, Pencil, Trash2, Eye, EyeOff, Send } from 'lucide-react';

const DISMISS_KEY = 'acad_dismissed_announcements';
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const AUDIENCES: { key: Announcement['audience']; label: string }[] = [
  { key: 'everyone', label: 'Everyone (including visitors)' },
  { key: 'candidates', label: 'All candidates' },
  { key: 'premium', label: 'Premium candidates' },
  { key: 'free', label: 'Free candidates' },
  { key: 'institutions', label: 'Institution staff' },
];

export function announcementFor(a: Announcement, user: User | null): boolean {
  if (!a.active || (a.expiresAt && a.expiresAt < istToday())) return false;
  if (a.audience === 'everyone') return true;
  if (!user) return false;
  if (a.audience === 'institutions') return user.role === 'institute_admin' || user.role === 'recruiter';
  if (user.role !== 'candidate') return false;
  if (a.audience === 'premium') return isPremiumUser(user);
  if (a.audience === 'free') return !isPremiumUser(user);
  return true;
}

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; }
}

/** Site-wide strip with the latest announcements for this visitor; each can be dismissed. */
export function AnnouncementBanner() {
  const { user } = useCurrentUser();
  const all = useStorageValue<Announcement[]>(() => StorageService.getAnnouncements(), []);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);
  const shown = all.filter(a => announcementFor(a, user) && !dismissed.includes(a.id)).slice(0, 2);
  if (!shown.length) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-100);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <div className="bg-brand-900 text-white text-sm print:hidden" role="region" aria-label="Announcements">
      {shown.map(a => (
        <div key={a.id} className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-start gap-3 border-b border-white/10 last:border-b-0">
          <Megaphone className="w-4 h-4 mt-0.5 shrink-0 text-gold-300" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold">{a.title}</span>
            <span className="text-brand-100"> — {a.body.length > 220 ? `${a.body.slice(0, 220)}…` : a.body}</span>
            {a.link && (a.link.startsWith('/')
              ? <Link href={a.link} className="ml-2 font-semibold text-gold-300 underline">Read more</Link>
              : <a href={a.link} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-gold-300 underline">Read more</a>)}
          </div>
          <button onClick={() => dismiss(a.id)} aria-label={`Dismiss ${a.title}`} className="p-0.5 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}

const EMPTY = { id: '', title: '', body: '', audience: 'everyone' as Announcement['audience'], link: '', expiresAt: '', email: false };

/** Admin: write, edit, pause and delete announcements; optionally e-mail them. */
export function AnnouncementsPanel() {
  const all = useStorageValue<Announcement[]>(() => StorageService.getAnnouncements(), []);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = istToday();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.email && !confirm(`E-mail this announcement to ${AUDIENCES.find(a => a.key === form.audience)?.label.toLowerCase()}? This cannot be undone.`)) return;
    const r = StorageService.saveAnnouncement({ id: form.id || undefined, title: form.title, body: form.body, audience: form.audience, link: form.link, expiresAt: form.expiresAt || null, email: form.email });
    setMsg(r.success ? { ok: true, text: form.id ? 'Announcement updated.' : `Announcement published${form.email ? ' and queued for e-mail' : ''}.` } : { ok: false, text: r.error || 'Failed.' });
    if (r.success) setForm(EMPTY);
  };
  const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-brand-700" /><h3 className="font-bold text-slate-900">Announcements</h3></div>
      <p className="text-xs text-slate-500">Announcements appear as a strip at the top of every page for the chosen audience until they expire or you pause them. Visitors can dismiss them.</p>
      {msg && <p className={`p-3 rounded-xl text-sm border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-crimson-50 border-crimson-100 text-crimson-700'}`} role="status">{msg.text}</p>}

      <form onSubmit={submit} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h4 className="font-semibold text-slate-900">{form.id ? 'Edit announcement' : 'New announcement'}</h4>
        <label className="block"><span className="text-xs font-semibold text-slate-700">Title</span><input className={input} maxLength={140} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="UGC-NET December results are out" /></label>
        <label className="block"><span className="text-xs font-semibold text-slate-700">Message</span><textarea className={input} rows={3} maxLength={2000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required /></label>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><span className="text-xs font-semibold text-slate-700">Audience</span>
            <select className={input} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value as Announcement['audience'] })}>{AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Link (optional)</span><input className={input} value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="/jobs or https://…" /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Show until (optional)</span><input type="date" className={input} min={today} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} /></label>
        </div>
        {(!form.id || !all.find(a => a.id === form.id)?.emailed) && (
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 accent-brand-900" checked={form.email} onChange={e => setForm({ ...form, email: e.target.checked })} /> Also e-mail it to this audience (verified e-mail addresses, once)</label>
        )}
        <div className="flex justify-end gap-2">
          {form.id && <button type="button" className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm" onClick={() => setForm(EMPTY)}>Cancel</button>}
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><Send className="w-4 h-4" /> {form.id ? 'Save changes' : 'Publish'}</button>
        </div>
      </form>

      {all.length === 0 ? <p className="text-sm text-slate-500">No announcements yet.</p> : (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
          {all.map(a => {
            const expired = !!a.expiresAt && a.expiresAt < today;
            const state = !a.active ? 'Paused' : expired ? 'Expired' : 'Live';
            return (
              <div key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{a.title}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${state === 'Live' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{state}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{a.body}</p>
                  <p className="text-xs text-slate-500 mt-1">{AUDIENCES.find(x => x.key === a.audience)?.label} · {a.createdAt} by {a.createdBy}{a.expiresAt ? ` · until ${a.expiresAt}` : ''}{a.emailed ? ` · e-mailed to ${a.emailed}` : ''}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label={`Edit ${a.title}`} onClick={() => setForm({ id: a.id, title: a.title, body: a.body, audience: a.audience, link: a.link || '', expiresAt: a.expiresAt || '', email: false })}><Pencil className="w-4 h-4" /></button>
                  <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label={a.active ? `Pause ${a.title}` : `Show ${a.title}`} onClick={() => StorageService.setAnnouncementActive(a.id, !a.active)}>{a.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  <button className="p-2 rounded-lg border border-crimson-100 text-crimson-700 hover:bg-crimson-50" aria-label={`Delete ${a.title}`} onClick={() => { if (confirm('Delete this announcement?')) StorageService.deleteAnnouncement(a.id); }}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
