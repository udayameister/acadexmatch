'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Mail, Send, Trash2, RefreshCw, Loader2, Bell } from 'lucide-react';

interface Item { id: string; to: string; subject: string; text: string; createdAt: string; status: 'sent' | 'logged' | 'failed'; error?: string; kind?: string }
interface Data { settings: { configured: boolean; host: string | null; user: string | null; from: string | null; appUrl: string | null }; items: Item[] }

const STATUS: Record<Item['status'], { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
  logged: { label: 'Outbox only', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  failed: { label: 'Failed', cls: 'bg-crimson-50 text-crimson-700 border-crimson-100' },
};

/** Admin view of outgoing email: SMTP status, test send, and the Outbox. */
export default function EmailsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/outbox', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) { setData(await r.json()); setError(null); } else setError('Could not load the Outbox.');
  }, []);
  useEffect(() => { load(); }, [load]);
  const [alerts, setAlerts] = useState<{ total: number; active: number; users: number } | null>(null);
  const [alertNote, setAlertNote] = useState<string | null>(null);
  const loadAlerts = useCallback(async () => {
    const r = await fetch('/api/admin/alerts', { cache: 'no-store', credentials: 'same-origin' });
    if (r.ok) setAlerts(await r.json());
  }, []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  const runAlerts = async () => {
    setBusy(true);
    const r = await fetch('/api/admin/alerts', { method: 'POST', credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setAlertNote(r.ok ? `Checked ${d.checked} alert(s): ${d.emails} email(s) with ${d.vacancies} new vacancies${d.skippedUnverified ? `; ${d.skippedUnverified} skipped (email not confirmed)` : ''}; ${d.reminders} deadline reminder email(s).` : (d.error || 'Could not run the alerts.'));
    await load(); await loadAlerts();
  };

  const post = async (body: unknown) => {
    setBusy(true);
    const r = await fetch('/api/admin/outbox', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    await load();
    return { ok: r.ok && d.ok !== false, d };
  };

  if (error) return <p className="text-sm text-crimson-700">{error}</p>;
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>;
  const s = data.settings;

  return (
    <div className="space-y-6">
      <section className={`p-5 rounded-2xl border ${s.configured ? 'bg-emerald-50 border-emerald-100' : 'bg-gold-50 border-gold-200'}`}>
        <div className="flex items-start gap-3">
          {s.configured ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-gold-700 shrink-0 mt-0.5" />}
          <div className="text-sm text-slate-700 space-y-1">
            <div className="font-semibold text-slate-900">{s.configured ? `Email sending is on (${s.host}, from ${s.from})` : 'Email sending is not set up yet'}</div>
            {s.configured ? (
              <p>Messages are sent through your SMTP account and also recorded below.</p>
            ) : (
              <p>Emails (sign-up confirmations, password resets, alerts) are only recorded in the Outbox below. To send them for real, add your Gmail or SMTP settings to <code>.env.local</code> in the project folder (see <code>env-settings-example.txt</code>) and restart the app.</p>
            )}
            {!s.appUrl && <p className="text-xs text-slate-500">Tip: set <code>APP_URL</code> (e.g. https://acadexmatch.in) so links in emails point to your public address.</p>}
          </div>
        </div>
        <form className="mt-4 flex flex-col sm:flex-row gap-2" onSubmit={async e => { e.preventDefault(); const r = await post({ to }); setNote(r.ok ? (r.d.item?.status === 'sent' ? `Test email sent to ${to}.` : `Test email recorded in the Outbox${s.configured ? '' : ' (SMTP not set up)'}.`) : (r.d.error || r.d.item?.error || 'Sending failed.')); }}>
          <input type="email" required value={to} onChange={e => setTo(e.target.value)} placeholder="Send a test email to…" className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm" />
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50" disabled={busy}><Send className="w-4 h-4" /> Send test</button>
        </form>
        {note && <p className="mt-2 text-sm text-slate-800" role="status">{note}</p>}
      </section>

      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Bell className="w-4 h-4 text-brand-700" /> Job alerts</h3>
            <p className="text-sm text-slate-600 mt-1">{alerts ? `${alerts.active} active of ${alerts.total} alerts, from ${alerts.users} candidate(s).` : '…'} Due job alerts and deadline reminders are emailed automatically every morning after 8 AM (India time).</p>
          </div>
          <button onClick={runAlerts} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50 shrink-0"><Send className="w-4 h-4" /> Send due emails now</button>
        </div>
        {alertNote && <p className="mt-2 text-sm text-slate-800" role="status">{alertNote}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-700" /> Outbox ({data.items.length})</h3>
          <div className="flex gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm"><RefreshCw className="w-4 h-4" /> Refresh</button>
            {data.items.length > 0 && <button onClick={() => { if (confirm('Clear the Outbox?')) post({ clear: true }); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-crimson-100 text-crimson-700 text-sm"><Trash2 className="w-4 h-4" /> Clear</button>}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
          {data.items.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No emails yet.</p>}
          {data.items.map(m => (
            <div key={m.id} className="p-4 text-sm">
              <button className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span>
                <span className="font-medium text-slate-900">{m.subject}</span>
                <span className="text-slate-500">to {m.to}</span>
                <span className="ml-auto text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('en-IN')}</span>
              </button>
              {m.error && <p className="mt-1 text-xs text-crimson-700">{m.error}</p>}
              {open === m.id && <pre className="mt-3 p-3 rounded-lg bg-cream text-xs text-slate-700 whitespace-pre-wrap break-words font-sans">{m.text}</pre>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
