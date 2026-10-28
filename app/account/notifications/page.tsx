'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import RequireRole from '@/components/RequireRole';
import { postJson } from '@/components/AuthCard';
import { Spinner } from '@/components/AuthWidgets';
import { Bell, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

type Prefs = Record<string, boolean>;
interface Row { id: string; categoryLabel: string; subject: string; createdAt: string; sentAt?: string; status: string; note?: string; ref?: { jobId?: string; applicationId?: string; label?: string } }

const OPTIONS: { key: string; label: string; desc: string; roles?: string[] }[] = [
  { key: 'applications', label: 'Application confirmations', desc: 'When you submit an application.', roles: ['candidate'] },
  { key: 'statusUpdates', label: 'Application status changes', desc: 'Shortlisted, not selected, offer and other updates.', roles: ['candidate'] },
  { key: 'interviews', label: 'Interviews', desc: 'Invitations, scheduled interviews and reminders before them.', roles: ['candidate'] },
  { key: 'jobAlerts', label: 'Job alerts', desc: 'New vacancies matching your saved alerts.', roles: ['candidate'] },
  { key: 'deadlineReminders', label: 'Deadline reminders', desc: 'Before the closing date of vacancies you saved.', roles: ['candidate'] },
  { key: 'recruiter', label: 'Recruiter updates', desc: 'New applications, interview bookings, vacancy approvals and expiry reminders.', roles: ['institute_admin', 'recruiter', 'super_admin'] },
  { key: 'announcements', label: 'Service announcements', desc: 'Important news about AcadeXMatch.' },
  { key: 'loginAlerts', label: 'New sign-in alerts', desc: 'An email when your account is signed in on a new device.' },
  { key: 'marketing', label: 'News and offers', desc: 'Occasional product news and offers (optional).' },
];

const STATUS: Record<string, string> = { sent: 'Sent', delivered: 'Delivered', queued: 'Waiting to send', sending: 'Sending', failed: 'Not delivered', skipped: 'Not sent', bounced: 'Bounced', complained: 'Marked as spam', logged: 'Recorded' };

function Inner() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [role, setRole] = useState('candidate');
  const [verified, setVerified] = useState(true);
  const [history, setHistory] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/account/notifications', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.json()).then(d => {
      if (d.ok) { setPrefs(d.prefs); setHistory(d.history || []); setRole(d.role); setVerified(d.emailVerified); }
      else setMsg({ ok: false, text: d.error || 'Could not load your settings.' });
    }).catch(() => setMsg({ ok: false, text: 'Could not load your settings.' }));
  }, []);

  const save = async () => {
    if (!prefs) return;
    setBusy(true);
    const r = await postJson('/api/account/notifications', { prefs });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error || 'Could not save.' });
  };

  const shown = OPTIONS.filter(o => !o.roles || o.roles.includes(role));

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-6">
      <div>
        <Link href="/account" className="text-sm font-semibold text-brand-700 hover:underline">← My account</Link>
        <h1 className="text-3xl font-bold text-brand-800 mt-2">Notifications</h1>
        <p className="text-sm text-slate-600 mt-1">Choose which emails you receive. Every optional email also has an unsubscribe link.</p>
      </div>

      {!verified && <p className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900">Your email address is not confirmed yet, so only account and security emails are sent. <Link href="/account" className="underline font-semibold">Confirm it on your account page</Link>.</p>}

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-brand-700" /> Email preferences</h2>
        {!prefs ? <p className="text-sm text-slate-500">Loading…</p> : (
          <>
            <ul className="divide-y divide-slate-100">
              {shown.map(o => (
                <li key={o.key} className="py-3">
                  <label className="flex items-start justify-between gap-4 cursor-pointer">
                    <span><span className="block text-sm font-semibold text-slate-900">{o.label}</span><span className="block text-sm text-slate-600">{o.desc}</span></span>
                    <input type="checkbox" role="switch" checked={!!prefs[o.key]} onChange={e => setPrefs({ ...prefs, [o.key]: e.target.checked })} className="mt-1 w-5 h-5 accent-brand-800 shrink-0" />
                  </label>
                </li>
              ))}
              <li className="py-3 flex items-start gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" /> Account and security emails (email confirmation, password reset or change, email or phone changes) are always sent, to protect your account.</li>
            </ul>
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">{busy ? <Spinner /> : null}Save preferences</button>
              {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm inline-flex items-center gap-1 ${msg.ok ? 'text-emerald-800' : 'text-crimson-700'}`}>{msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{msg.text}</span>}
            </div>
          </>
        )}
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-900">Message history</h2>
        {!history.length ? <p className="text-sm text-slate-500">No emails yet.</p> : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-600"><th className="px-2 py-2 font-semibold">Date</th><th className="px-2 py-2 font-semibold">Type</th><th className="px-2 py-2 font-semibold">Subject</th><th className="px-2 py-2 font-semibold">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map(h => (
                  <tr key={h.id} className="align-top">
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">{new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-2 py-2 text-slate-700">{h.categoryLabel}</td>
                    <td className="px-2 py-2 text-slate-900">{h.subject}{h.ref?.jobId && <> · <Link href={`/jobs/${h.ref.jobId}`} className="text-brand-800 underline">vacancy</Link></>}</td>
                    <td className="px-2 py-2"><span className="font-medium text-slate-800">{STATUS[h.status] || h.status}</span>{h.note && <span className="block text-xs text-slate-500">{h.note}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireRole roles={['candidate', 'institute_admin', 'recruiter', 'super_admin']}><Inner /></RequireRole>;
}
