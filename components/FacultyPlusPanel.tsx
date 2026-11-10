'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { duplicateGroups, findDuplicate } from '@/lib/jobDuplicates';
import { deadlineCounts, deadlineState, matchesDeadline, sortJobs, DEADLINE_BADGE, JOB_SORTS, istToday, type DeadlineFilter, type JobSort } from '@/lib/deadline';
import JobReviewDrawer from '@/components/JobReviewDrawer';
import type { Job } from '@/types';
import {
  AlertTriangle, Check, CheckCircle2, Clock, Copy, ExternalLink, Eye, Link2, Loader2, Pencil, Play, RefreshCw, RotateCcw, Settings2, Trash2, X,
} from 'lucide-react';

interface FpCategory { id: number; name: string; count: number }
interface FpItem {
  id: string; postId: number; link: string; postDate: string; foundAt: string; categories: string[];
  status: 'pending' | 'approved' | 'rejected'; decidedAt?: string; reason?: string; issues: string[]; job: Job;
}
interface FpRun { id: string; trigger: string; startedAt: string; finishedAt?: string; requests: number; read: number; added: number; skippedSeen: number; skippedExpired: number; skippedNotVacancy: number; error?: string }
interface DuplicateOf { where: 'board' | 'facultytick' | 'facultyplus'; id: string; title: string; instituteName: string; applicationDeadline: string | null }
interface FpSettings { dailyEnabled: boolean; dailyTime: string; lastDailyRunDate?: string; includeCategories: number[]; excludeCategories: number[]; lookbackDays: number; maxPosts: number }
interface FpData {
  settings: FpSettings; categories: FpCategory[]; queue: FpItem[]; runs: FpRun[]; duplicates: Record<string, DuplicateOf>;
  seenCount: number; newestPostDate?: string; running: boolean; today: string;
}

const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition disabled:opacity-50';
const btnWarn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold-100 hover:bg-gold-200 border border-gold-300 text-gold-900 text-sm font-semibold transition disabled:opacity-50';
const inputCls = 'px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

async function api(body?: unknown): Promise<FpData> {
  const r = await fetch('/api/admin/facultyplus', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The server could not complete that.');
  return d as FpData;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const WHERE: Record<DuplicateOf['where'], string> = { board: 'Already on the job board', facultytick: 'Also waiting in the FacultyTick queue', facultyplus: 'Repeated in this queue' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Admin console: FacultyPlus scraping with approval, duplicate checks and job-board clean-up. */
export default function FacultyPlusPanel() {
  const [data, setData] = useState<FpData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'new' | 'duplicates' | 'clean'>('all');
  const [link, setLink] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [sort, setSort] = useState<JobSort | 'found'>('deadline-asc');
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const today = istToday();

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };
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

  const allPending = useMemo(() => (data?.queue || []).filter(q => q.status === 'pending'), [data]);
  // The server checks the job board too; this also catches a vacancy published a moment ago from this page.
  const boardJobs = useStorageValue<Job[]>(() => StorageService.getJobs().filter(j => j.status === 'published'), []);
  const dups = useMemo(() => {
    const out: Record<string, DuplicateOf> = { ...(data?.duplicates || {}) };
    const board = boardJobs.map(j => ({ ...j, officialWebsite: j.details?.officialWebsite || null }));
    for (const q of allPending) {
      if (out[q.id]?.where === 'board') continue;
      const hit = findDuplicate({ ...q.job, officialWebsite: q.job.details?.officialWebsite || null }, board);
      if (hit) out[q.id] = { where: 'board', id: hit.id, title: hit.title, instituteName: hit.instituteName, applicationDeadline: hit.applicationDeadline };
    }
    return out;
  }, [data, allPending, boardJobs]);
  const pending = useMemo(() => allPending.filter(q => (
    filter === 'all' ? true : filter === 'new' ? !dups[q.id] : filter === 'duplicates' ? !!dups[q.id] : !dups[q.id] && !q.issues.length
  )), [allPending, filter, dups]);
  const inView = view === 'pending' ? pending : (data?.queue || []).filter(q => q.status === view);
  const dCounts = deadlineCounts(inView.map(q => q.job), today);
  const filtered = inView.filter(q => matchesDeadline(q.job, deadlineFilter, today));
  const list = sort === 'found' ? filtered : (() => {
    const order = sortJobs(filtered.map(q => ({ ...q.job, _id: q.id })), sort, today).map(j => j._id);
    const byId = new Map(filtered.map(q => [q.id, q]));
    return order.map(id => byId.get(id)!);
  })();
  const counts = useMemo(() => {
    const q = data?.queue || [];
    return { pending: allPending.length, approved: q.filter(x => x.status === 'approved').length, rejected: q.filter(x => x.status === 'rejected').length };
  }, [data, allPending]);
  const dupIds = allPending.filter(q => dups[q.id]).map(q => q.id);

  /** Approve = publish to the job board for every candidate, then record the decision. Asks first when duplicates are included. */
  const approve = async (items: FpItem[]) => {
    if (!items.length) return;
    const withDup = items.filter(q => dups[q.id]);
    if (withDup.length && !confirm(`${plural(withDup.length, 'of these looks', 'of these look')} like a duplicate of a vacancy already listed. Publish ${items.length === 1 ? 'it' : 'them all'} anyway?`)) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const jobs: Job[] = items.map(q => ({ ...q.job, isPremium: false, isClaimedByInstitute: false, status: 'published', postedAt: today }));
    const added = StorageService.addJobs(jobs);
    const ok = await act({ action: 'decide', ids: items.map(q => q.id), status: 'approved' });
    if (ok) flash(true, `Published ${plural(added, 'vacancy', 'vacancies')} to all candidates${added < items.length ? ` (${items.length - added} already on the job board with the same title)` : ''}.`);
    setSelected(new Set());
  };
  const reject = async (ids: string[], reason?: string) => {
    if (!ids.length) return;
    await act({ action: 'decide', ids, status: 'rejected', reason }, reason === 'duplicate' ? `Removed ${plural(ids.length, 'duplicate')}.` : `Rejected ${ids.length}.`);
    setSelected(new Set());
  };
  const removeAllDuplicates = () => {
    if (!dupIds.length) return;
    if (!confirm(`Remove ${plural(dupIds.length, 'possible duplicate')} from the approval list? They will not be published. You can bring any of them back from “Rejected”.`)) return;
    reject(dupIds, 'duplicate');
  };

  if (loadError) return <div className="p-6 rounded-2xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700">Could not load FacultyPlus scraping: {loadError}</div>;
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;

  const lastRun = data.runs[0];
  const shownPending = view === 'pending' ? list : [];
  const allSel = shownPending.length > 0 && shownPending.every(q => selected.has(q.id));
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selItems = shownPending.filter(q => selected.has(q.id));

  return (
    <div className="space-y-5">
      {msg && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm shadow-xl text-white max-w-sm ${msg.ok ? 'bg-brand-950' : 'bg-crimson-700'}`} role="status">{msg.text}</div>}

      {/* Source */}
      <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-bold text-slate-900">FacultyPlus scraping</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Reads the latest vacancies from facultyplus.com and waits for your approval. Only the institution&apos;s facts are kept:
              name, posts, departments, qualifications, pay, place, dates, official website, application link, e-mail and address.
              FacultyPlus&apos;s write-ups, images, links and files are never published; its post address is shown here, to you only, for checking.
            </p>
            <p className="text-xs text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{data.settings.dailyEnabled ? `Daily after ${data.settings.dailyTime} IST` : 'Daily run off'}</span>
              <span>Last run: {lastRun ? `${lastRun.startedAt}, ${lastRun.read} read, ${lastRun.added} new${lastRun.skippedExpired ? `, ${lastRun.skippedExpired} past their last date` : ''}${lastRun.skippedNotVacancy ? `, ${lastRun.skippedNotVacancy} not vacancies` : ''}` : 'never'}</span>
              {lastRun?.error && <span className="text-crimson-700">Error: {lastRun.error}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button className={btnGhost} onClick={() => setShowSettings(s => !s)} aria-expanded={showSettings}><Settings2 className="w-4 h-4" /> Settings</button>
            <button className={btnPrimary} disabled={busy || data.running} onClick={() => act({ action: 'run' }, 'Reading FacultyPlus… new vacancies will appear below.')}>
              {data.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}{data.running ? 'Reading…' : 'Get latest now'}
            </button>
          </div>
        </div>

        <form className="flex flex-col sm:flex-row gap-2" onSubmit={async e => { e.preventDefault(); if (await act({ action: 'addLink', url: link }, 'Post added for approval.')) { setLink(''); setView('pending'); } }}>
          <label htmlFor="fp-link" className="sr-only">FacultyPlus post address</label>
          <input id="fp-link" value={link} onChange={e => setLink(e.target.value)} placeholder="Add one post: paste a facultyplus.com post address" className={`${inputCls} flex-1 min-w-0`} />
          <button className={btnGhost} disabled={busy || !link.trim()}><Link2 className="w-4 h-4" /> Add post</button>
        </form>

        {showSettings && <SettingsBox data={data} busy={busy} onSave={b => act({ action: 'settings', ...b }, 'Settings saved.')} onRefresh={() => act({ action: 'refreshCategories' }, 'Categories updated from FacultyPlus.')} />}
      </section>

      {/* Duplicates waiting for a decision */}
      {view === 'pending' && dupIds.length > 0 && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-gold-900 flex items-start gap-2">
            <Copy className="w-4 h-4 mt-0.5 shrink-0" />
            <span><strong>{plural(dupIds.length, 'vacancy looks', 'vacancies look')} like a duplicate</strong> of one already on the job board or in a queue. Remove them, or check each one below.</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button className={btnGhost} onClick={() => setFilter('duplicates')}>Show them</button>
            <button className={btnWarn} disabled={busy} onClick={removeAllDuplicates}><Trash2 className="w-4 h-4" /> Remove all duplicates</button>
          </div>
        </div>
      )}

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label="FacultyPlus vacancies">
            {([['pending', `To approve (${counts.pending})`], ['approved', `Published (${counts.approved})`], ['rejected', `Rejected (${counts.rejected})`]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setSelected(new Set()); }}
                className={`px-3.5 py-2 rounded-lg font-semibold ${view === k ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          {view === 'pending' && counts.pending > 0 && (
            <label className="text-xs text-slate-600 flex items-center gap-2">Show
              <select className={`${inputCls} py-1.5`} value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setSelected(new Set()); }}>
                <option value="all">All ({counts.pending})</option>
                <option value="new">Not duplicates ({counts.pending - dupIds.length})</option>
                <option value="duplicates">Possible duplicates ({dupIds.length})</option>
                <option value="clean">No duplicates or warnings</option>
              </select>
            </label>
          )}
          {view !== 'pending' && list.length > 0 && <button className={btnGhost} disabled={busy} onClick={() => act({ action: 'clearDecided' }, 'Cleared.')}>Clear decided</button>}
        </div>

        {inView.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', `All (${dCounts.all})`, 'bg-white border-slate-200 text-slate-700'],
              ['live', `Live (${dCounts.live})`, DEADLINE_BADGE.live],
              ['closing', `Closing within 7 days (${dCounts.closing})`, DEADLINE_BADGE.closing],
              ['completed', `Deadline completed (${dCounts.completed})`, DEADLINE_BADGE.completed],
              ['none', `No last date (${dCounts.none})`, DEADLINE_BADGE.none],
            ] as [DeadlineFilter, string, string][]).map(([k, label, cls]) => (
              <button key={k} onClick={() => { setDeadlineFilter(k); setSelected(new Set()); }} aria-pressed={deadlineFilter === k}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition ${cls} ${deadlineFilter === k ? 'ring-2 ring-brand-700 ring-offset-1' : 'opacity-80 hover:opacity-100'}`}>{label}</button>
            ))}
            <label className="ml-auto text-xs text-slate-600 flex items-center gap-2">Sort
              <select className={`${inputCls} py-1.5`} value={sort} onChange={e => setSort(e.target.value as JobSort | 'found')}>
                {JOB_SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value="found">Order found</option>
              </select>
            </label>
          </div>
        )}

        {view === 'pending' && shownPending.length > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <label className="flex items-center gap-2 text-sm text-slate-700 px-1.5"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(shownPending.map(q => q.id)))} /> Select all shown</label>
            <span className="text-xs text-slate-500">{selected.size} selected</span>
            <div className="flex gap-2 ml-auto">
              <button className={btnGhost} disabled={busy || !selItems.length} onClick={() => reject(selItems.map(q => q.id))}><X className="w-4 h-4" /> Reject</button>
              <button className={btnPrimary} disabled={busy || !selItems.length} onClick={() => approve(selItems)}><Check className="w-4 h-4" /> Approve &amp; publish to all</button>
            </div>
          </div>
        )}

        {list.length === 0 && (
          <p className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500">
            {view === 'pending' ? (data.running ? 'Reading FacultyPlus…' : counts.pending ? 'Nothing matches this filter.' : 'Nothing waiting. Use “Get latest now” or add a post by its address.') : inView.length ? 'Nothing matches this filter.' : 'Nothing here yet.'}
          </p>
        )}

        <ul className="space-y-3">
          {list.map(q => {
            const j = q.job;
            const d = j.details || {};
            const dup = q.status === 'pending' ? dups[q.id] : undefined;
            const posts = d.postGroups?.[0]?.items || [];
            const departments = d.departmentGroups?.flatMap(g => g.items) || [];
            return (
              <li key={q.id} className={`p-4 sm:p-5 rounded-2xl bg-white border shadow-sm ${dup ? 'border-gold-300' : 'border-slate-200'}`}>
                <div className="flex gap-3">
                  {q.status === 'pending' && <input type="checkbox" className="accent-brand-900 w-4 h-4 mt-1 shrink-0" aria-label={`Select ${j.title}`} checked={selected.has(q.id)} onChange={() => toggle(q.id)} />}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="min-w-0">
                        {editing === q.id ? (
                          <form className="flex gap-2" onSubmit={async e => { e.preventDefault(); if (await act({ action: 'edit', id: q.id, title: titleDraft }, 'Post name saved.')) setEditing(null); }}>
                            <label htmlFor={`fpt-${q.id}`} className="sr-only">Post name</label>
                            <input id={`fpt-${q.id}`} value={titleDraft} onChange={e => setTitleDraft(e.target.value)} className={`${inputCls} flex-1 min-w-0`} autoFocus />
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
                        {(() => { const st = deadlineState(j, today); return <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${DEADLINE_BADGE[st.kind]}`}>{st.label}</span>; })()}
                        {q.categories.slice(0, 4).map(c => <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{c}</span>)}
                        {q.status === 'approved' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">Published · {q.decidedAt}</span>}
                        {q.status === 'rejected' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-crimson-50 text-crimson-700 border border-crimson-100 font-semibold">{q.reason === 'duplicate' ? 'Removed as duplicate' : 'Rejected'} · {q.decidedAt}</span>}
                      </div>
                    </div>

                    {dup && (
                      <div className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold flex items-center gap-1.5"><Copy className="w-4 h-4 shrink-0" />Possible duplicate: {WHERE[dup.where]}</div>
                          <div className="text-xs mt-0.5 break-words">
                            {dup.where === 'board' ? <Link href={`/jobs/${encodeURIComponent(dup.id)}`} target="_blank" className="underline">{dup.title}</Link> : dup.title}
                            {' · '}{dup.instituteName}{dup.applicationDeadline ? ` · last date ${fmtDate(dup.applicationDeadline)}` : ''}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button className={btnWarn} disabled={busy} onClick={() => reject([q.id], 'duplicate')}><Trash2 className="w-4 h-4" /> Remove duplicate</button>
                        </div>
                      </div>
                    )}

                    <dl className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-slate-500">Last date</dt>
                      <dd className="text-slate-800">
                        {q.status === 'pending' ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <label htmlFor={`fpd-${q.id}`} className="sr-only">Last date for {j.title}</label>
                            <input id={`fpd-${q.id}`} type="date" defaultValue={j.applicationDeadline || ''} className={`${inputCls} py-1`}
                              onBlur={e => { const v = e.target.value || null; if (v !== (j.applicationDeadline || null)) act({ action: 'edit', id: q.id, applicationDeadline: v }, 'Last date saved.'); }} />
                          </span>
                        ) : (fmtDate(j.applicationDeadline) || j.deadlineText || '—')}
                        {d.lastDateText && <div className="text-xs text-slate-500 mt-0.5 break-words">“{d.lastDateText}”</div>}
                        {d.interviewText && <div className="text-xs text-slate-500 break-words">Walk-in / interview: {d.interviewText}</div>}
                      </dd>
                      {posts.length > 1 && <><dt className="text-slate-500">Posts</dt><dd className="text-slate-800 break-words">{posts.join(' · ')}{d.numberOfPosts ? ` (${d.numberOfPosts} in all)` : ''}</dd></>}
                      {departments.length > 0 && <><dt className="text-slate-500">Departments</dt><dd className="text-slate-800 break-words line-clamp-2">{departments.join(' · ')}</dd></>}
                      <dt className="text-slate-500">Salary</dt><dd className="text-slate-800 break-words">{j.payScale.cpcBand || <span className="text-slate-400">Not stated</span>}</dd>
                      <dt className="text-slate-500">Qualification</dt><dd className="text-slate-800 break-words line-clamp-3">{j.requiredQualifications.minDegree || <span className="text-slate-400">Not stated</span>}</dd>
                      {!!d.applyEmails?.length && <><dt className="text-slate-500">Apply by e-mail</dt><dd className="text-slate-800 break-all">{d.applyEmails.map(e => e.email).join(', ')}</dd></>}
                      {d.organizationAddress && <><dt className="text-slate-500">Address</dt><dd className="text-slate-800 break-words">{d.organizationAddress}</dd></>}
                    </dl>

                    {q.issues.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {q.issues.map(i => <li key={i} className="text-xs px-2 py-1 rounded-lg bg-gold-50 border border-gold-200 text-gold-900 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{i}</li>)}
                      </ul>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {d.officialWebsite && <a href={d.officialWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-800 hover:underline">Institution website <ExternalLink className="w-3 h-3" /></a>}
                        {d.notificationLink && <a href={d.notificationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-800 hover:underline">Official notification <ExternalLink className="w-3 h-3" /></a>}
                        {d.applicationLink && <a href={d.applicationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-800 hover:underline">Application form <ExternalLink className="w-3 h-3" /></a>}
                        <a href={q.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-slate-500 hover:underline" title="Shown to administrators only; not published">Check on FacultyPlus (admin only) <ExternalLink className="w-3 h-3" /></a>
                      </div>
                      {q.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button className={btnGhost} onClick={() => setReviewing(q.id)}><Eye className="w-4 h-4" /> All details</button>
                          <button className={btnGhost} disabled={busy} onClick={() => reject([q.id])}><X className="w-4 h-4" /> Reject</button>
                          <button className={btnPrimary} disabled={busy} onClick={() => approve([q])}><Check className="w-4 h-4" /> Approve &amp; publish</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button className={btnGhost} onClick={() => setReviewing(q.id)}><Eye className="w-4 h-4" /> All details</button>
                          {q.status === 'rejected'
                            ? <button className={btnGhost} disabled={busy} onClick={() => act({ action: 'reopen', ids: [q.id] }, 'Moved back to approval.')}><RotateCcw className="w-4 h-4" /> Reconsider</button>
                            : <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> On the job board</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {(() => {
        const q = reviewing ? data.queue.find(x => x.id === reviewing) : null;
        if (!q) return null;
        const dup = q.status === 'pending' ? dups[q.id] : undefined;
        return (
          <JobReviewDrawer job={q.job} onClose={() => setReviewing(null)}
            statusText={q.status === 'pending' ? 'Waiting for your approval' : q.status === 'approved' ? `Approved ${q.decidedAt || ''}`.trim() : q.reason === 'duplicate' ? 'Removed as duplicate' : 'Rejected'}
            note={<div className="space-y-2">
              {dup && <p className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900"><strong>Possible duplicate:</strong> {WHERE[dup.where]} — {dup.title}, {dup.instituteName}{dup.applicationDeadline ? `, last date ${fmtDate(dup.applicationDeadline)}` : ''}</p>}
              {q.issues.length > 0 && <ul className="flex flex-wrap gap-1.5">{q.issues.map(i => <li key={i} className="text-xs px-2 py-1 rounded-lg bg-gold-50 border border-gold-200 text-gold-900">{i}</li>)}</ul>}
              <p className="text-xs text-slate-500">Found {q.foundAt} · categories: {q.categories.join(', ') || '—'} · <a href={q.link} target="_blank" rel="noopener noreferrer nofollow" className="underline">check on FacultyPlus (admin only)</a></p>
            </div>}
            actions={q.status === 'pending' ? <>
              {dup && <button className={btnWarn} disabled={busy} onClick={async () => { await reject([q.id], 'duplicate'); setReviewing(null); }}><Trash2 className="w-4 h-4" /> Remove duplicate</button>}
              <button className={btnGhost} disabled={busy} onClick={async () => { await reject([q.id]); setReviewing(null); }}><X className="w-4 h-4" /> Reject</button>
              <button className={btnPrimary} disabled={busy} onClick={async () => { await approve([q]); setReviewing(null); }}><Check className="w-4 h-4" /> Approve &amp; publish</button>
            </> : q.status === 'rejected'
              ? <button className={btnGhost} disabled={busy} onClick={() => act({ action: 'reopen', ids: [q.id] }, 'Moved back to approval.')}><RotateCcw className="w-4 h-4" /> Reconsider</button>
              : undefined} />
        );
      })()}

      <BoardDuplicates onDone={t => flash(true, t)} />

      {data.runs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Run history ({data.runs.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {data.runs.slice(0, 25).map(r => (
              <li key={r.id}>
                {r.startedAt} · {r.trigger === 'schedule' ? 'daily' : r.trigger === 'link' ? 'added by link' : 'manual'} · {r.read} read · <strong>{r.added} new</strong>
                {r.skippedExpired ? ` · ${r.skippedExpired} past last date` : ''}{r.skippedNotVacancy ? ` · ${r.skippedNotVacancy} not vacancies` : ''}{r.skippedSeen ? ` · ${r.skippedSeen} already seen` : ''} · {plural(r.requests, 'request')}
                {r.error && <span className="text-crimson-700"> · {r.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Duplicate vacancies already published on the job board (from any source), with a confirm before each removal. */
function BoardDuplicates({ onDone }: { onDone: (text: string) => void }) {
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => duplicateGroups(jobs.filter(j => j.status === 'published').map(j => ({ ...j, officialWebsite: j.details?.officialWebsite || null }))), [jobs]);
  const extra = groups.reduce((n, g) => n + g.length - 1, 0);

  const remove = (ids: string[], label: string) => {
    const apps = jobs.filter(j => ids.includes(j.id)).reduce((n, j) => n + (j.applicantCount || 0), 0);
    if (!confirm(`Remove ${label} from the job board?${apps ? ` ${plural(apps, 'application')} to ${ids.length === 1 ? 'it' : 'them'} will be removed too.` : ''} This cannot be undone.`)) return;
    ids.forEach(id => StorageService.deleteJob(id));
    onDone(`Removed ${plural(ids.length, 'duplicate vacancy', 'duplicate vacancies')}.`);
  };

  return (
    <section className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Copy className="w-4 h-4 text-brand-700" />Duplicate vacancies on the job board</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {groups.length ? `${plural(groups.length, 'advertisement')} ${groups.length === 1 ? 'is' : 'are'} listed more than once (${plural(extra, 'extra copy', 'extra copies')}), from any source.` : 'No duplicates found among published vacancies.'}
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Review'}</button>
            <button className={btnWarn} onClick={() => remove(groups.flatMap(g => g.slice(1).map(j => j.id)), plural(extra, 'extra copy', 'extra copies'))}><Trash2 className="w-4 h-4" /> Remove all extra copies</button>
          </div>
        )}
      </div>
      {open && groups.length > 0 && (
        <ul className="mt-4 space-y-3">
          {groups.map(g => (
            <li key={g[0].id} className="p-3 rounded-xl bg-ivory border border-slate-200">
              <ul className="space-y-1.5">
                {g.map((j, i) => (
                  <li key={j.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/jobs/${encodeURIComponent(j.id)}`} target="_blank" className="font-medium text-slate-900 hover:underline break-words">{j.title}</Link>
                      <span className="text-xs text-slate-500"> · {j.instituteName} · posted {fmtDate(j.postedAt) || '—'}{j.applicationDeadline ? ` · last date ${fmtDate(j.applicationDeadline)}` : ''} · {plural(j.applicantCount || 0, 'application')}</span>
                    </div>
                    {i === 0
                      ? <span className="text-xs font-semibold text-emerald-700 shrink-0">Keep</span>
                      : <button className={`${btnGhost} py-1 shrink-0`} onClick={() => remove([j.id], `“${j.title}”`)}><Trash2 className="w-3.5 h-3.5" /> Remove this copy</button>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsBox({ data, busy, onSave, onRefresh }: {
  data: FpData; busy: boolean;
  onSave: (b: Omit<FpSettings, 'lastDailyRunDate'>) => void;
  onRefresh: () => void;
}) {
  const [f, setF] = useState({ ...data.settings });
  const inc = new Set(f.includeCategories);
  const exc = new Set(f.excludeCategories);
  const cycle = (id: number) => {
    // Off → read → skip → off
    if (inc.has(id)) setF({ ...f, includeCategories: f.includeCategories.filter(x => x !== id), excludeCategories: [...f.excludeCategories, id] });
    else if (exc.has(id)) setF({ ...f, excludeCategories: f.excludeCategories.filter(x => x !== id) });
    else setF({ ...f, includeCategories: [...f.includeCategories, id] });
  };
  return (
    <form className="p-4 rounded-2xl bg-ivory border border-slate-200 space-y-4" onSubmit={e => { e.preventDefault(); const { lastDailyRunDate: _ignored, ...rest } = f; void _ignored; onSave(rest); }}>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={f.dailyEnabled} onChange={e => setF({ ...f, dailyEnabled: e.target.checked })} /> Get the latest every day</label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">Time (IST)<input type="time" className={inputCls} value={f.dailyTime} onChange={e => setF({ ...f, dailyTime: e.target.value })} /></label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">First run looks back (days)<input type="number" min={1} max={30} className={`${inputCls} w-28`} value={f.lookbackDays} onChange={e => setF({ ...f, lookbackDays: Number(e.target.value) })} /></label>
        <label className="text-sm text-slate-700 flex flex-col gap-1">Most posts per run<input type="number" min={10} max={500} step={10} className={`${inputCls} w-28`} value={f.maxPosts} onChange={e => setF({ ...f, maxPosts: Number(e.target.value) })} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-800 mb-1">FacultyPlus categories</legend>
        <p className="text-xs text-slate-500 mb-2">Click to switch: <span className="text-brand-800 font-semibold">Read</span> → <span className="text-crimson-700 font-semibold">Skip</span> → off. Posts in any “Skip” category are left out even if they are also in a “Read” one.</p>
        <div className="flex flex-wrap gap-2">
          {data.categories.map(c => {
            const state = inc.has(c.id) ? 'read' : exc.has(c.id) ? 'skip' : 'off';
            return (
              <button type="button" key={c.id} onClick={() => cycle(c.id)} aria-pressed={state !== 'off'}
                className={`text-sm px-3 py-1.5 rounded-lg border ${state === 'read' ? 'bg-brand-50 border-brand-300 text-brand-900' : state === 'skip' ? 'bg-crimson-50 border-crimson-200 text-crimson-700 line-through' : 'bg-white border-slate-200 text-slate-600'}`}>
                {state === 'read' ? '✓ ' : state === 'skip' ? '✕ ' : ''}{c.name}{c.count ? <span className="text-slate-400"> ({c.count.toLocaleString('en-IN')})</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy}>Save settings</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={onRefresh}><RefreshCw className="w-4 h-4" /> Update categories from FacultyPlus</button>
      </div>
    </form>
  );
}
