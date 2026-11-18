'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { postJson } from '@/components/AuthCard';
import { Spinner } from '@/components/AuthWidgets';
import { AlertCircle, CheckCircle2, CircleDashed, ExternalLink, RefreshCw, Search, Send } from 'lucide-react';

/*
 * Admin console → Search engines. IndexNow status (Bing, Yahoo, DuckDuckGo, Yandex, Seznam, Naver, Yep), submit
 * buttons, and the one-time webmaster set-up for Google, Bing and Yandex.
 */

interface Log { at: string; count: number; status: number; ok: boolean; note: string; reason: string }
interface Status {
  enabled: { on: boolean; why?: string };
  keyLocation: string;
  totalPages: number;
  submittedPages: number;
  waiting: number;
  lastRun: string | null;
  log: Log[];
  verification: { google: boolean; bing: boolean; yandex: boolean };
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'never');

const ENGINES = [
  { name: 'Bing', via: 'IndexNow + Bing Webmaster Tools' },
  { name: 'Yahoo', via: 'uses Bing’s index' },
  { name: 'DuckDuckGo', via: 'uses Bing’s index' },
  { name: 'Ecosia', via: 'uses Bing’s index' },
  { name: 'Yandex', via: 'IndexNow + Yandex Webmaster' },
  { name: 'Seznam, Naver, Yep', via: 'IndexNow' },
  { name: 'Google', via: 'sitemap + Search Console (no IndexNow)' },
];

export default function SearchEnginesPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/search-engines', { cache: 'no-store', credentials: 'same-origin' });
      if (r.ok) setS(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (action: 'changed' | 'all') => {
    setBusy(action); setMsg(null);
    const r = await postJson('/api/admin/search-engines', { action });
    setBusy(null);
    if (r.status) setS(r.status as Status);
    if (r.error) { setMsg({ ok: false, text: r.error }); return; }
    if (r.skipped) { setMsg({ ok: false, text: `Not submitted: ${r.skipped}.` }); return; }
    const failed = ((r.results as Log[]) || []).find(x => !x.ok);
    if (failed) setMsg({ ok: false, text: `IndexNow answered ${failed.status || 'no response'}: ${failed.note}` });
    else setMsg({ ok: true, text: r.submitted ? `Submitted ${r.submitted} page${r.submitted === 1 ? '' : 's'}.${r.pending ? ` ${r.pending} more go out tomorrow (daily limit).` : ''}` : 'Nothing new to submit. Every public page is already submitted.' });
  };

  const sitemap = s ? new URL('/sitemap.xml', s.keyLocation).toString() : 'https://acadexmatch.com/sitemap.xml';
  const site = s ? new URL('/', s.keyLocation).toString() : 'https://acadexmatch.com/';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Search className="w-5 h-5 text-brand-800" /> Search engines</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">New and changed public pages (vacancies, institutions, events, blog posts and white papers) are sent to search engines automatically every hour and right after you publish a blog post.</p>
        </div>
        <button type="button" onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* ---------------- IndexNow */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900">Automatic submission (IndexNow)</p>
            <p className="text-xs text-slate-500">Bing, Yahoo, DuckDuckGo, Ecosia, Yandex, Seznam, Naver and Yep. No account needed.</p>
          </div>
          {s && (s.enabled.on
            ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> On</span>
            : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold" title={s.enabled.why}><CircleDashed className="w-3.5 h-3.5" /> Off here: {s.enabled.why}</span>)}
        </div>
        {!s ? <p className="text-sm text-slate-500 flex items-center gap-2"><Spinner /> Loading…</p> : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-2xl font-bold text-slate-900">{s.totalPages.toLocaleString('en-IN')}</p><p className="text-xs text-slate-500">public pages in the sitemap</p></div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-2xl font-bold text-slate-900">{s.submittedPages.toLocaleString('en-IN')}</p><p className="text-xs text-slate-500">submitted and up to date</p></div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-2xl font-bold text-slate-900">{s.waiting.toLocaleString('en-IN')}</p><p className="text-xs text-slate-500">new or changed, waiting · last run {when(s.lastRun)}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy || !s.enabled.on} onClick={() => submit('changed')} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50">
                {busy === 'changed' ? <Spinner /> : <Send className="w-4 h-4" />} Submit new &amp; changed now
              </button>
              <button type="button" disabled={!!busy || !s.enabled.on} onClick={() => { if (window.confirm(`Re-submit all ${s.totalPages} public pages to the search engines?`)) submit('all'); }} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                {busy === 'all' ? <Spinner /> : <RefreshCw className="w-4 h-4" />} Re-submit everything
              </button>
            </div>
            {msg && <p role="status" className={`p-3 rounded-xl text-sm flex items-center gap-2 ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-crimson-50 border border-crimson-100 text-crimson-700'}`}>{msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{msg.text}</p>}
            <p className="text-xs text-slate-500 break-all">Ownership key file: <a href={s.keyLocation} target="_blank" className="underline">{s.keyLocation}</a></p>
            {s.log.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="py-2 pr-3 font-semibold">When</th><th className="py-2 pr-3 font-semibold">Why</th><th className="py-2 pr-3 font-semibold">Pages</th><th className="py-2 font-semibold">Result</th></tr></thead>
                  <tbody>
                    {s.log.map((l, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{when(l.at)}</td>
                        <td className="py-2 pr-3 text-slate-600">{l.reason}</td>
                        <td className="py-2 pr-3 text-slate-900 font-semibold">{l.count}</td>
                        <td className={`py-2 ${l.ok ? 'text-emerald-700' : 'text-crimson-700'}`}>{l.status || '—'} {l.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------------- one-time webmaster set-up */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
        <div>
          <p className="font-bold text-slate-900">Webmaster accounts (one-time set-up)</p>
          <p className="text-xs text-slate-500">Gives you search reports and lets each engine read the sitemap: <a href={sitemap} target="_blank" className="underline break-all">{sitemap}</a></p>
        </div>
        <ol className="space-y-4 text-sm">
          <Step done={s?.verification.google} title="Google Search Console" href="https://search.google.com/search-console">
            Add the property <strong>{site}</strong>, verify, then open <em>Sitemaps</em> and submit <code>sitemap.xml</code>. Verification code secret: <code>GOOGLE_SITE_VERIFICATION</code>.
          </Step>
          <Step done={s?.verification.bing} title="Bing Webmaster Tools (also feeds Yahoo and DuckDuckGo)" href="https://www.bing.com/webmasters">
            Easiest: sign in and choose <em>Import from Google Search Console</em>; your site and sitemap come across verified. Otherwise add the site, choose the <em>HTML meta tag</em> method, and put the code from <code>content=&quot;…&quot;</code> in the secret <code>BING_SITE_VERIFICATION</code>, then publish and press Verify. Then submit <code>sitemap.xml</code> under <em>Sitemaps</em>.
          </Step>
          <Step done={s?.verification.yandex} title="Yandex Webmaster" href="https://webmaster.yandex.com">
            Add <strong>{site}</strong>, choose <em>Meta tag</em>, put the code in the secret <code>YANDEX_SITE_VERIFICATION</code>, publish and press Check. Then add <code>sitemap.xml</code> under <em>Indexing → Sitemap files</em>.
          </Step>
        </ol>
      </section>

      <section className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
        <p className="font-bold text-slate-900 mb-3">Where each search engine gets the site from</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {ENGINES.map(e => <li key={e.name} className="flex justify-between gap-3 border-b border-slate-200/70 py-1"><span className="font-semibold text-slate-800">{e.name}</span><span className="text-slate-500 text-right">{e.via}</span></li>)}
        </ul>
        <p className="text-xs text-slate-500 mt-3">Indexing is decided by each search engine; submission makes them crawl sooner, usually within hours to a few days, but cannot guarantee a ranking.</p>
      </section>
    </div>
  );
}

function Step({ done, title, href, children }: { done?: boolean; title: string; href: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 w-6 h-6 rounded-full grid place-items-center shrink-0 ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{done ? <CheckCircle2 className="w-4 h-4" /> : <CircleDashed className="w-4 h-4" />}</span>
      <div className="min-w-0">
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-900 hover:text-brand-800 inline-flex items-center gap-1">{title} <ExternalLink className="w-3.5 h-3.5" /></a>
        <span className={`ml-2 text-[11px] font-bold uppercase tracking-wide ${done ? 'text-emerald-700' : 'text-slate-500'}`}>{done ? 'Verification code set' : 'Not set up'}</span>
        <p className="text-slate-600 mt-1 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[0.85em]">{children}</p>
      </div>
    </li>
  );
}
