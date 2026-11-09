'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';

interface Status { configured: boolean; serviceAccount: string | null; dailyLimit: number; today: number; pendingUpdates: number; pendingDeletes: number; announced: number; totals: { updated: number; deleted: number; failed: number }; lastRunAt: string | null; lastError: string | null; lastErrorAt: string | null; indexNow: boolean }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

/** Administrator: Google Indexing API for vacancy pages. */
export default function SeoIndexingCard() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/seo-indexing', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null)); }, []);
  const now = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/seo-indexing', { method: 'POST', credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || 'Failed.'); return; }
    setS(d.status);
    setMsg(d.result.error ? `Google refused: ${d.result.error}` : `Sent ${d.result.sent} vacancy page${d.result.sent === 1 ? '' : 's'} to Google. ${d.result.pending} waiting (daily limit).`);
  };
  return (
    <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Search className="w-5 h-5 text-brand-700" /> Google indexing of vacancies</h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s?.configured ? (s.lastError ? 'bg-crimson-50 text-crimson-800 border-crimson-100' : 'bg-emerald-50 text-emerald-800 border-emerald-200') : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{!s ? 'Checking…' : !s.configured ? 'Not connected' : s.lastError ? 'Needs attention' : 'Connected'}</span>
      </div>
      <p className="text-sm text-slate-600">Every 10 minutes, new and changed vacancies are sent to Google&apos;s Indexing API (the fast lane Google offers for job pages), and closed ones are withdrawn. The sitemap at <a className="text-brand-800 underline" href="/sitemap.xml" target="_blank" rel="noreferrer">/sitemap.xml</a> lists every open vacancy as well.</p>
      {s && !s.configured && (
        <div className="text-sm p-3 rounded-xl bg-gold-50 border border-gold-200 text-gold-900 space-y-1">
          <p className="font-semibold">To connect (one time):</p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>Google Cloud console → create a project → enable the <strong>Web Search Indexing API</strong>.</li>
            <li>Create a <strong>service account</strong> and a <strong>JSON key</strong> for it.</li>
            <li>Search Console → Settings → Users and permissions → add the service account email as an <strong>Owner</strong>.</li>
            <li>GoDaddy secrets (Preview and Publish): <code>GOOGLE_INDEXING_CREDENTIALS</code> = the whole JSON key. Publish.</li>
          </ol>
        </div>
      )}
      {s && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700">
          {s.serviceAccount && <p className="sm:col-span-2 text-xs break-all">Service account: <code>{s.serviceAccount}</code> (must be an Owner in Search Console)</p>}
          <p>Waiting to send: <strong>{s.pendingUpdates}</strong> new/changed · <strong>{s.pendingDeletes}</strong> closed</p>
          <p>Sent today: <strong>{s.today}</strong> of {s.dailyLimit}</p>
          <p>Vacancies announced to Google: <strong>{s.announced}</strong></p>
          <p>Last run: {when(s.lastRunAt)}</p>
          <p className="text-xs text-slate-500 sm:col-span-2">Totals: {s.totals.updated} updates · {s.totals.deleted} removals · {s.totals.failed} failures · IndexNow (Bing): {s.indexNow ? 'on' : 'off'}</p>
          {s.lastError && <p role="alert" className="sm:col-span-2 text-xs text-crimson-700">Last error ({when(s.lastErrorAt)}): {s.lastError}</p>}
        </div>
      )}
      {s?.configured && <button onClick={now} disabled={busy} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit now</button>}
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
    </section>
  );
}
