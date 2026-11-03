'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StorageService } from '@/lib/storage';
import type { Job } from '@/types';
import {
  AlertTriangle, Check, CheckCircle2, Clock, ExternalLink, Link2, Loader2, Pencil, Play, RefreshCw, RotateCcw, Settings2, X,
} from 'lucide-react';

interface FtCategory { id: number; name: string; count: number }
interface FtItem {
  id: string; postId: number; link: string; postDate: string; foundAt: string; categories: string[];
  status: 'pending' | 'approved' | 'rejected'; decidedAt?: string; issues: string[]; layout: 'template' | 'freeform'; job: Job;
}
interface FtRun { id: string; trigger: string; startedAt: string; finishedAt?: string; requests: number; read: number; added: number; skippedSeen: number; skippedExpired: number; error?: string }
interface FtData {
  settings: { dailyEnabled: boolean; dailyTime: string; lastDailyRunDate?: string; categories: number[]; lookbackDays: number; maxPosts: number };
  categories: FtCategory[]; queue: FtItem[]; runs: FtRun[]; seenCount: number; newestPostDate?: string; running: boolean; today: string;
}

const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition disabled:opacity-50';
const inputCls = 'px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

async function api(body?: unknown): Promise<FtData> {
  const r = await fetch('/api/admin/facultytick', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The server could not complete that.');
  return d as FtData;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const jobKey = (j: Pick<Job, 'title' | 'instituteName'>) => `${j.title.toLowerCase().trim()}_${j.instituteName.toLowerCase().trim()}`;

/** Admin console: FacultyTick scraping, separate from the college-website scraper. */
export default function FacultyTickPanel() {
  const [data, setData] = useState<FtData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyClean, setOnlyClean] = useState(false);
  const [link, setLink] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const load = useCallback(async () => {
    try { setData(await api()); setLoadError(''); } catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data?.running, load]);

  const act = async (body: unknown, ok?: string): Promise<boolean> => {
    setBusy(true);
    try { setData(await api(body)); if (ok) flash(true, ok); return true; } catch (e) { flash(false, (e as Error).message); return false; } finally { setBusy(false); }
  };

  const onBoard = useMemo(() => new Set(StorageService.getJobs().map(jobKey)), [data]);
  const pending = useMemo(() => (data?.queue || []).filter(q => q.status === 'pending' && (!onlyClean || !q.issues.length)), [data, onlyClean]);
  const list = view === 'pending' ? pending : (data?.queue || []).filter(q => q.status === view);
  const counts = useMemo(() => {
    const q = data?.queue || [];
    return { pending: q.filter(x => x.status === 'pending').length, approved: q.filter(x => x.status === 'approved').length, rejected: q.filter(x => x.status === 'rejected').length };
  }, [data]);

  /** Approve = publish to the job board for every candidate (Free and Premium), then record the decision. */
  const approve = async (items: FtItem[]) => {
    if (!items.length) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const jobs: Job[] = items.map(q => ({ ...q.job, isPremium: false, isClaimedByInstitute: false, status: 'published', postedAt: today }));
    const added = StorageService.addJobs(jobs);
    const ok = await act({ action: 'decide', ids: items.map(q => q.id), status: 'approved' });
    if (ok) flash(true, `Published ${added} vacanc${added === 1 ? 'y' : 'ies'} to all candidates${added < items.length ? ` (${items.length - added} were already on the job board)` : ''}.`);
    setSelected(new Set());
  };
  const reject = async (ids: string[]) => { await act({ action: 'decide', ids, status: 'rejected' }, `Rejected ${ids.length}.`); setSelected(new Set()); };

  if (loadError) return <div className="p-6 rounded-2xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700">Could not load FacultyTick scraping: {loadError}</div>;
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const lastRun = data.runs[0];
  const allSel = pending.length > 0 && pending.every(q => selected.has(q.id));
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selItems = pending.filter(q => selected.has(q.id));

  return (
    <div className="space-y-5">
      {msg && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm shadow-xl text-white max-w-sm ${msg.ok ? 'bg-brand-950' : 'bg-crimson-700'}`} role="status">{msg.text}</div>}

      {/* Source */}
      <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-bold text-slate-900">FacultyTick scraping</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Reads new vacancies from <a href="https://facultytick.com" target="_blank" rel="noopener noreferrer" className="underline">facultytick.com</a> and
              waits for your approval. Approved vacancies are published to all candidates. Candidates apply through the institution&apos;s
              official notification. FacultyTick&apos;s own descriptions and images are not copied.
            </p>
            <p className="text-xs text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{data.settings.dailyEnabled ? `Daily after ${data.settings.dailyTime} IST` : 'Daily run off'}</span>
              <span>Last run: {lastRun ? `${lastRun.startedAt}, ${lastRun.read} read, ${lastRun.added} new${lastRun.skippedExpired ? `, ${lastRun.skippedExpired} past their last date` : ''}` : 'never'}</span>
              {lastRun?.error && <span className="text-crimson-700">Error: {lastRun.error}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button className={btnGhost} onClick={() => setShowSettings(s => !s)} aria-expanded={showSettings}><Settings2 className="w-4 h-4" /> Settings</button>
            <button className={btnPrimary} disabled={busy || data.running} onClick={() => act({ action: 'run' }, 'Reading FacultyTick… new vacancies will appear below.')}>
              {data.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}{data.running ? 'Reading…' : 'Run now'}
            </button>
          </div>
        </div>

        <form className="flex flex-col sm:flex-row gap-2" onSubmit={async e => { e.preventDefault(); if (await act({ action: 'addLink', url: link }, 'Post added for approval.')) { setLink(''); setView('pending'); } }}>
          <label htmlFor="ft-link" className="sr-only">FacultyTick post address</label>
          <input id="ft-link" value={link} onChange={e => setLink(e.target.value)} placeholder="Add one post: paste a facultytick.com post address" className={`${inputCls} flex-1 min-w-0`} />
          <button className={btnGhost} disabled={busy || !link.trim()}><Link2 className="w-4 h-4" /> Add post</button>
        </form>

        {showSettings && <SettingsBox data={data} busy={busy} onSave={b => act({ action: 'settings', ...b }, 'Settings saved.')} onRefresh={() => act({ action: 'refreshCategories' }, 'Categories updated from FacultyTick.')} />}
      </section>

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label="FacultyTick vacancies">
            {([['pending', `To approve (${counts.pending})`], ['approved', `Published (${counts.approved})`], ['rejected', `Rejected (${counts.rejected})`]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setSelected(new Set()); }}
                className={`px-3.5 py-2 rounded-lg font-semibold ${view === k ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          {view === 'pending' && counts.pending > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={onlyClean} onChange={e => setOnlyClean(e.target.checked)} /> Only ones without warnings</label>
          )}
          {view !== 'pending' && list.length > 0 && <button className={btnGhost} disabled={busy} onClick={() => act({ action: 'clearDecided' }, 'Cleared.')}>Clear decided</button>}
        </div>

        {view === 'pending' && pending.length > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <label className="flex items-center gap-2 text-sm text-slate-700 px-1.5"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(pending.map(q => q.id)))} /> Select all</label>
            <span className="text-xs text-slate-500">{selected.size} selected</span>
            <div className="flex gap-2 ml-auto">
              <button className={btnGhost} disabled={busy || !selItems.length} onClick={() => reject(selItems.map(q => q.id))}><X className="w-4 h-4" /> Reject</button>
              <button className={btnPrimary} disabled={busy || !selItems.length} onClick={() => approve(selItems)}><Check className="w-4 h-4" /> Approve &amp; publish to all</button>
            </div>
          </div>
        )}

        {list.length === 0 && (
          <p className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500">
            {view === 'pending' ? (data.running ? 'Reading FacultyTick…' : 'Nothing waiting. Use “Run now” or add a post by its address.') : 'Nothing here yet.'}
          </p>
        )}

        <ul className="space-y-3">
          {list.map(q => {
            const j = q.job;
            const d = j.details || {};
            const dup = q.status === 'pending' && onBoard.has(jobKey(j));
            return (
              <li key={q.id} className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex gap-3">
                  {q.status === 'pending' && <input type="checkbox" className="accent-brand-900 w-4 h-4 mt-1 shrink-0" aria-label={`Select ${j.title}`} checked={selected.has(q.id)} onChange={() => toggle(q.id)} />}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="min-w-0">
                        {editing === q.id ? (
                          <form className="flex gap-2" onSubmit={async e => { e.preventDefault(); if (await act({ action: 'edit', id: q.id, title: titleDraft }, 'Post name saved.')) setEditing(null); }}>
                            <label htmlFor={`t-${q.id}`} className="sr-only">Post name</label>
                            <input id={`t-${q.id}`} value={titleDraft} onChange={e => setTitleDraft(e.target.value)} className={`${inputCls} flex-1 min-w-0`} autoFocus />
                            <button className={btnPrimary} disabled={busy}>Save</button>
                            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                          </form>
                        ) : (
                          <h3 className="font-bold text-slate-900 break-words">
                            {j.title}
                            {q.status === 'pending' && <button className="ml-1.5 p-1 rounded text-slate-400 hover:text-brand-800 align-middle" aria-label={`Edit post name ${j.title}`} onClick={() => { setEditing(q.id); setTitleDraft(j.title); }}><Pencil className="w-3.5 h-3.5" /></button>}
                          </h3>
                        )}
                        <div className="text-sm text-slate-700 break-words">{j.instituteName}{(j.location.city || j.location.state) ? <span className="text-slate-500"> · {[j.location.city, j.location.state].filter(Boolean).join(', ')}</span> : null}</div>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:justify-end shrink-0">
                        {q.categories.map(c => <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{c}</span>)}
                        {q.status === 'approved' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">Published to all · {q.decidedAt}</span>}
                        {q.status === 'rejected' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-crimson-50 text-crimson-700 border border-crimson-100 font-semibold">Rejected · {q.decidedAt}</span>}
                      </div>
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-slate-500">Last date</dt>
                      <dd className="text-slate-800">
                        {q.status === 'pending' ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <label htmlFor={`d-${q.id}`} className="sr-only">Last date for {j.title}</label>
                            <input id={`d-${q.id}`} type="date" defaultValue={j.applicationDeadline || ''} className={`${inputCls} py-1`}
                              onBlur={e => { const v = e.target.value || null; if (v !== (j.applicationDeadline || null)) act({ action: 'edit', id: q.id, applicationDeadline: v }, 'Last date saved.'); }} />
                            {d.deadlineEstimated && <span className="text-xs text-gold-800">estimated</span>}
                          </span>
                        ) : (fmtDate(j.applicationDeadline) || '—')}
                        {d.lastDateText && <div className="text-xs text-slate-500 mt-0.5 break-words">“{d.lastDateText}”</div>}
                      </dd>
                      <dt className="text-slate-500">Salary</dt><dd className="text-slate-800 break-words">{j.payScale.cpcBand || <span className="text-slate-400">Not stated</span>}</dd>
                      <dt className="text-slate-500">Qualification</dt><dd className="text-slate-800 break-words line-clamp-3">{j.requiredQualifications.minDegree || <span className="text-slate-400">Not stated</span>}</dd>
                      {d.howToApply && <><dt className="text-slate-500">How to apply</dt><dd className="text-slate-800 break-words line-clamp-2">{d.howToApply}</dd></>}
                      {!!d.applyEmails?.length && <><dt className="text-slate-500">Email</dt><dd className="text-slate-800 break-all">{d.applyEmails.map(e => e.email).join(', ')}</dd></>}
                    </dl>

                    {(q.issues.length > 0 || dup) && (
                      <ul className="flex flex-wrap gap-1.5">
                        {dup && <li className="text-xs px-2 py-1 rounded-lg bg-gold-50 border border-gold-200 text-gold-900 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Already on the job board</li>}
                        {q.issues.map(i => <li key={i} className="text-xs px-2 py-1 rounded-lg bg-gold-50 border border-gold-200 text-gold-900 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{i}</li>)}
                      </ul>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {d.notificationLink && <a href={d.notificationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-800 hover:underline">Official notification <ExternalLink className="w-3 h-3" /></a>}
                        {d.officialWebsite && <a href={d.officialWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-800 hover:underline">Institution website <ExternalLink className="w-3 h-3" /></a>}
                        <a href={q.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline">FacultyTick post <ExternalLink className="w-3 h-3" /></a>
                      </div>
                      {q.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button className={btnGhost} disabled={busy} onClick={() => reject([q.id])}><X className="w-4 h-4" /> Reject</button>
                          <button className={btnPrimary} disabled={busy} onClick={() => approve([q])}><Check className="w-4 h-4" /> Approve &amp; publish</button>
                        </div>
                      ) : q.status === 'rejected' ? (
                        <button className={btnGhost} disabled={busy} onClick={() => act({ action: 'reopen', ids: [q.id] }, 'Moved back to approval.')}><RotateCcw className="w-4 h-4" /> Reconsider</button>
                      ) : (
                        <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> On the job board</span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {data.runs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Run history ({data.runs.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {data.runs.slice(0, 25).map(r => (
              <li key={r.id}>
                {r.startedAt} · {r.trigger === 'schedule' ? 'daily' : r.trigger === 'link' ? 'added by link' : 'manual'} · {r.read} read · <strong>{r.added} new</strong>
                {r.skippedExpired ? ` · ${r.skippedExpired} past last date` : ''}{r.skippedSeen ? ` · ${r.skippedSeen} already seen` : ''} · {r.requests} request{r.requests === 1 ? '' : 's'}
                {r.error && <span className="text-crimson-700"> · {r.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SettingsBox({ data, busy, onSave, onRefresh }: {
  data: FtData; busy: boolean;
  onSave: (b: { dailyEnabled: boolean; dailyTime: string; categories: number[]; lookbackDays: number; maxPosts: number }) => void;
  onRefresh: () => void;
}) {
  const [f, setF] = useState({ ...data.settings });
  const cats = new Set(f.categories);
  return (
    <form className="p-4 rounded-2xl bg-ivory border border-slate-200 space-y-4" onSubmit={e => { e.preventDefault(); onSave(f); }}>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={f.dailyEnabled} onChange={e => setF({ ...f, dailyEnabled: e.target.checked })} /> Run every day</label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">Time (IST)<input type="time" className={inputCls} value={f.dailyTime} onChange={e => setF({ ...f, dailyTime: e.target.value })} /></label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">First run looks back (days)<input type="number" min={1} max={30} className={`${inputCls} w-28`} value={f.lookbackDays} onChange={e => setF({ ...f, lookbackDays: Number(e.target.value) })} /></label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">Most posts per run<input type="number" min={10} max={500} step={10} className={`${inputCls} w-28`} value={f.maxPosts} onChange={e => setF({ ...f, maxPosts: Number(e.target.value) })} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-800 mb-2">FacultyTick categories to read</legend>
        <div className="flex flex-wrap gap-2">
          {data.categories.map(c => (
            <label key={c.id} className={`text-sm px-3 py-1.5 rounded-lg border cursor-pointer ${cats.has(c.id) ? 'bg-brand-50 border-brand-200 text-brand-900' : 'bg-white border-slate-200 text-slate-600'}`}>
              <input type="checkbox" className="accent-brand-900 w-4 h-4 mr-1.5 align-[-2px]" checked={cats.has(c.id)}
                onChange={e => setF({ ...f, categories: e.target.checked ? [...f.categories, c.id] : f.categories.filter(x => x !== c.id) })} />
              {c.name}{c.count ? <span className="text-slate-400"> ({c.count.toLocaleString('en-IN')})</span> : null}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy}>Save settings</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={onRefresh}><RefreshCw className="w-4 h-4" /> Update categories from FacultyTick</button>
      </div>
    </form>
  );
}
