'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Send } from 'lucide-react';

interface Run { id: string; at: string; jobs: number; events: number; queued: number; skipped: number; trigger: 'auto' | 'manual' }
interface Status {
  settings: { enabled: boolean; quietMinutes: number; minGapHours: number };
  pending: { type: 'job' | 'event'; id: string; at: number }[];
  lastSentAt?: number; history: Run[]; candidates: number; nextAfter: number | null; message?: string;
}

const btn = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';
const input = 'px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 w-24';
const when = (t?: number | string) => (t ? new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

/** Admin: the email every candidate gets when new vacancies or events are approved. */
export default function NewPostEmailCard() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ quiet: '', gap: '' });

  const apply = (d: Status) => { setS(d); setF({ quiet: String(d.settings.quietMinutes), gap: String(d.settings.minGapHours) }); };
  const load = useCallback(() => fetch('/api/admin/new-post-email', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.json()).then(apply).catch(() => undefined), []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const act = async (body: unknown, ok: string) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/new-post-email', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { apply(d); setMsg(d.message || ok); } else setMsg(d.error || 'Could not complete that.');
    setBusy(false);
  };

  if (!s) return <div className="p-5 rounded-3xl bg-white border border-slate-200"><Loader2 className="w-5 h-5 animate-spin text-brand-700" aria-label="Loading" /></div>;
  const jobs = s.pending.filter(p => p.type === 'job').length, events = s.pending.length - jobs;
  const last = s.history[0];

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-serif text-lg font-bold text-slate-900 inline-flex items-center gap-2"><BellRing className="w-5 h-5 text-gold-600" />New-post email to candidates</h2>
          <p className="text-sm text-slate-600 mt-1">
            When you approve vacancies (FacultyTick, Job scraping, or added by you) or event listings, all {s.candidates.toLocaleString('en-IN')} candidates get one email listing them.
            Approvals made close together go in the same email. Candidates can turn it off in their notification settings or with the link in the email; unconfirmed and bounced addresses are skipped.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 shrink-0">
          <input type="checkbox" className="accent-brand-900 w-4 h-4" checked={s.settings.enabled} disabled={busy} onChange={e => act({ action: 'settings', enabled: e.target.checked }, e.target.checked ? 'Automatic emails on.' : 'Automatic emails off. Waiting posts stay until you send or clear them.')} />
          Send automatically
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="p-3 rounded-xl bg-ivory border border-slate-200">
          <div className="text-xs text-slate-500">Waiting for the next email</div>
          <div className="font-bold text-slate-900 mt-0.5">{jobs} {jobs === 1 ? 'vacancy' : 'vacancies'}{events ? `, ${events} ${events === 1 ? 'event' : 'events'}` : ''}</div>
          {s.nextAfter && <div className="text-xs text-slate-500 mt-0.5">{s.settings.enabled ? `Goes out after ${when(s.nextAfter)}` : 'Automatic sending is off'}</div>}
        </div>
        <div className="p-3 rounded-xl bg-ivory border border-slate-200">
          <div className="text-xs text-slate-500">Last email</div>
          <div className="font-bold text-slate-900 mt-0.5">{last ? when(last.at) : 'Not sent yet'}</div>
          {last && <div className="text-xs text-slate-500 mt-0.5">{last.jobs} vacancies, {last.events} events · {last.queued} candidates emailed, {last.skipped} skipped</div>}
        </div>
        <form className="p-3 rounded-xl bg-ivory border border-slate-200 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); act({ action: 'settings', quietMinutes: Number(f.quiet), minGapHours: Number(f.gap) }, 'Timing saved.'); }}>
          <label className="text-xs text-slate-600 flex flex-col gap-1">Wait after last approval (min)<input type="number" min={5} max={240} value={f.quiet} onChange={e => setF({ ...f, quiet: e.target.value })} className={input} /></label>
          <label className="text-xs text-slate-600 flex flex-col gap-1">At most one email every (h)<input type="number" min={1} max={168} value={f.gap} onChange={e => setF({ ...f, gap: e.target.value })} className={input} /></label>
          <button className={`${btn} bg-white border border-slate-300 text-slate-700`} disabled={busy}>Save</button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={`${btn} bg-brand-900 hover:bg-brand-800 text-white`} disabled={busy || !s.pending.length} onClick={() => { if (confirm(`Email ${jobs ? `${jobs} vacancies` : ''}${jobs && events ? ' and ' : ''}${events ? `${events} events` : ''} to all candidates now?`)) act({ action: 'send' }, 'Email queued for all candidates.'); }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send now
        </button>
        <button className={`${btn} bg-white border border-slate-300 text-slate-700`} disabled={busy || !s.pending.length} onClick={() => { if (confirm('Remove the waiting posts from the next email? They stay published.')) act({ action: 'discard' }, 'Cleared. These posts will not be emailed.'); }}>Don&apos;t email these</button>
        {msg && <span className="text-sm text-slate-600" role="status">{msg}</span>}
      </div>

      {s.history.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Earlier emails ({s.history.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {s.history.map(r => <li key={r.id}>{when(r.at)} · {r.trigger === 'manual' ? 'sent by you' : 'automatic'} · {r.jobs} vacancies, {r.events} events · {r.queued} emailed, {r.skipped} skipped</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
