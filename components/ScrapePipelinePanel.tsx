'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StorageService } from '@/lib/storage';
import { orNS } from '@/lib/display';
import { useSelection, BulkBar } from '@/components/Selection';
import { Job } from '@/types';
import {
  Globe, Plus, Play, Trash2, Check, X, Crown, Users, RefreshCw, Clock, ExternalLink, Pencil, AlertCircle, CheckCircle2, Loader2, RotateCcw,
} from 'lucide-react';

type Audience = 'all' | 'premium';
interface Source { id: string; name: string; url: string; enabled: boolean; addedAt: string; lastRunAt?: string; lastStatus?: 'ok' | 'error'; lastMessage?: string; lastFound?: number }
interface QueueItem { id: string; sourceId: string; sourceName: string; sourceUrl: string; foundAt: string; status: 'pending' | 'approved' | 'rejected'; decidedAt?: string; audience?: Audience; job: Job }
interface Run { id: string; startedAt: string; finishedAt?: string; trigger: string; sources: number; newItems: number; errors: number }
interface Pipeline { added?: number; errors?: string[]; settings: { dailyEnabled: boolean; dailyTime: string; lastDailyRunDate?: string }; sources: Source[]; queue: QueueItem[]; runs: Run[]; running: boolean; today: string }

const inputCls = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition disabled:opacity-50';
const iconBtn = 'p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50 transition';

async function api(body?: unknown): Promise<Pipeline> {
  const r = await fetch('/api/scrape-pipeline', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-acad-admin': '1' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The server could not complete that.');
  return d as Pipeline;
}

export default function ScrapePipelinePanel() {
  const [data, setData] = useState<Pipeline | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newSrc, setNewSrc] = useState({ name: '', url: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<Record<string, Audience>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Job>>>({});
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const [view, setView] = useState<'pending' | 'decided'>('pending');
  const [busy, setBusy] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const srcSel = useSelection((data?.sources || []).map(x => x.id));

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    try { setData(await api()); setLoadError(null); } catch (e) { setLoadError((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Poll while a scrape is running.
  useEffect(() => {
    if (!data?.running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data?.running, load]);

  const act = async (body: unknown, ok?: string) => {
    setBusy(true);
    try { setData(await api(body)); if (ok) flash(true, ok); } catch (e) { flash(false, (e as Error).message); }
    setBusy(false);
  };

  const pending = useMemo(() => data?.queue.filter(q => q.status === 'pending') || [], [data]);
  const decided = useMemo(() => data?.queue.filter(q => q.status !== 'pending') || [], [data]);

  const publish = async (items: QueueItem[]) => {
    if (!items.length) return;
    const jobs = items.map(q => ({
      ...q.job,
      ...(edits[q.id] || {}),
      isPremium: (audience[q.id] || 'all') === 'premium',
      isClaimedByInstitute: false,
      status: 'published' as const,
      postedAt: new Date().toISOString().slice(0, 10),
    }));
    const added = StorageService.addJobs(jobs);
    // Record the decision per audience so the server log matches what was published.
    const byAud: Record<Audience, string[]> = { all: [], premium: [] };
    items.forEach(q => byAud[audience[q.id] || 'all'].push(q.id));
    setBusy(true);
    try {
      let d: Pipeline | null = null;
      for (const a of ['all', 'premium'] as Audience[]) if (byAud[a].length) d = await api({ action: 'decide', ids: byAud[a], status: 'approved', audience: a });
      if (d) setData(d);
      flash(true, `Published ${added} vacanc${added === 1 ? 'y' : 'ies'}${added < items.length ? ` (${items.length - added} already on the job board)` : ''}.`);
    } catch (e) { flash(false, (e as Error).message); }
    setBusy(false);
    setSelected(new Set());
  };

  const reject = (ids: string[]) => { act({ action: 'decide', ids, status: 'rejected' }, `Rejected ${ids.length}.`); setSelected(new Set()); };

  if (loadError) return <div className="p-6 rounded-2xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700">Could not reach the scraping service: {loadError}. It needs the app running with <code>npm run dev</code> or <code>npm start</code>.</div>;
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>;

  const allSelected = pending.length > 0 && pending.every(q => selected.has(q.id));
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-6">
      {msg && <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm shadow-xl text-white ${msg.ok ? 'bg-brand-950' : 'bg-crimson-700'}`} role="status">{msg.text}</div>}

      {/* Schedule + run */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-800 grid place-items-center shrink-0"><Clock className="w-5 h-5" /></span>
          <div>
            <h3 className="font-bold text-slate-900">Daily scrape</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {data.settings.dailyEnabled ? `Runs every day after ${data.settings.dailyTime} IST while the app is running.` : 'Daily scraping is switched off.'}
              {' '}Last daily run: {data.settings.lastDailyRunDate || 'not yet'}. New vacancies wait here for your approval.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="accent-brand-900 w-4 h-4" checked={data.settings.dailyEnabled} onChange={e => act({ action: 'settings', dailyEnabled: e.target.checked }, e.target.checked ? 'Daily scrape on.' : 'Daily scrape off.')} /> Daily
          </label>
          <input type="time" aria-label="Daily run time (IST)" className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm" value={data.settings.dailyTime} onChange={e => act({ action: 'settings', dailyTime: e.target.value }, `Daily time set to ${e.target.value} IST.`)} />
          <button className={btnPrimary} disabled={data.running || busy || !data.sources.some(s => s.enabled)} onClick={() => act({ action: 'run' }, 'Scrape started. This can take a minute per college.')}>
            {data.running ? <><Loader2 className="w-4 h-4 animate-spin" /> Scraping…</> : <><Play className="w-4 h-4" /> Run now</>}
          </button>
          <button className={btnGhost} onClick={load} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </section>

      {/* Sources */}
      <section className="space-y-3">
        <h3 className="font-bold text-slate-900 flex items-center gap-2"><Globe className="w-4 h-4 text-brand-700" /> College sources ({data.sources.length})</h3>
        <form onSubmit={e => { e.preventDefault(); act({ action: 'addSource', ...newSrc }, 'Source added.').then(() => setNewSrc({ name: '', url: '' })); }} className="flex flex-col sm:flex-row gap-2">
          <input className={`${inputCls} sm:max-w-xs`} placeholder="College name (optional)" value={newSrc.name} onChange={e => setNewSrc({ ...newSrc, name: e.target.value })} />
          <input required className={inputCls} placeholder="Careers / recruitment page, e.g. https://www.college.ac.in/careers" value={newSrc.url} onChange={e => setNewSrc({ ...newSrc, url: e.target.value })} />
          <button type="submit" className={`${btnPrimary} shrink-0`} disabled={busy}><Plus className="w-4 h-4" /> Add source</button>
        </form>
        <div>
          <button type="button" className="text-sm font-semibold text-brand-800 hover:underline" onClick={() => setShowBulkAdd(v => !v)}>{showBulkAdd ? 'Hide' : 'Add several sources at once'}</button>
          {showBulkAdd && (
            <form
              className="mt-2 space-y-2"
              onSubmit={async e => {
                e.preventDefault();
                setBusy(true);
                try {
                  const d = await api({ action: 'addSources', lines: bulkText });
                  setData(d);
                  flash(!(d.errors || []).length, `Added ${d.added || 0} source${d.added === 1 ? '' : 's'}.${(d.errors || []).length ? ` Skipped ${d.errors!.length}: ${d.errors!.join('; ')}` : ''}`);
                  if (d.added) setBulkText('');
                } catch (err) { flash(false, (err as Error).message); }
                setBusy(false);
              }}
            >
              <textarea rows={5} className={inputCls} value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={'One per line — a careers page address, optionally with a name:\nIIT Tirupati | https://www.iittp.ac.in/careers\nhttps://www.svuniversity.edu.in/recruitment'} />
              <button type="submit" className={btnPrimary} disabled={busy || !bulkText.trim()}><Plus className="w-4 h-4" /> Add all</button>
            </form>
          )}
        </div>
        <BulkBar sel={srcSel} noun="source">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold" onClick={() => { act({ action: 'updateSources', ids: srcSel.ids, enabled: true }, `Daily scraping on for ${srcSel.count}.`); srcSel.clear(); }}>Enable daily</button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold" onClick={() => { act({ action: 'updateSources', ids: srcSel.ids, enabled: false }, `Daily scraping off for ${srcSel.count}.`); srcSel.clear(); }}>Pause daily</button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white text-xs font-semibold" onClick={() => { if (confirm(`Remove ${srcSel.count} source${srcSel.count === 1 ? '' : 's'}? Their pending vacancies are removed from the queue.`)) { act({ action: 'removeSources', ids: srcSel.ids }, `Removed ${srcSel.count} source${srcSel.count === 1 ? '' : 's'}.`); srcSel.clear(); } }}><Trash2 className="w-3.5 h-3.5" /> Remove</button>
        </BulkBar>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs text-slate-600"><tr><th className="pl-4 pr-1 py-3 w-8"><input type="checkbox" className="w-4 h-4 accent-brand-900" aria-label="Select all sources" checked={srcSel.allOn} onChange={srcSel.toggleAll} /></th><th className="px-4 py-3">Daily</th><th className="px-4 py-3">College</th><th className="px-4 py-3">Last run</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.sources.map(s => (
                <tr key={s.id} className={srcSel.has(s.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
                  <td className="pl-4 pr-1 py-3"><input type="checkbox" className="w-4 h-4 accent-brand-900" aria-label={`Select ${s.name}`} checked={srcSel.has(s.id)} onChange={() => srcSel.toggle(s.id)} /></td>
                  <td className="px-4 py-3"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={s.enabled} aria-label={`Scrape ${s.name} daily`} onChange={e => act({ action: 'updateSource', id: s.id, enabled: e.target.checked })} /></td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{s.name}</div><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-brand-800 break-all">{s.url}</a></td>
                  <td className="px-4 py-3 text-xs">
                    {s.lastRunAt ? (
                      <div className={s.lastStatus === 'ok' ? 'text-slate-600' : 'text-crimson-700'}>
                        <div className="flex items-center gap-1">{s.lastStatus === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5" />}{s.lastRunAt}</div>
                        <div className="mt-0.5 max-w-md">{s.lastMessage}</div>
                      </div>
                    ) : <span className="text-slate-400">Not run yet</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className={iconBtn} title="Scrape now" aria-label={`Scrape ${s.name} now`} disabled={data.running} onClick={() => act({ action: 'run', sourceId: s.id }, `Scraping ${s.name}…`)}><Play className="w-4 h-4" /></button>
                      <button className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" title="Remove" aria-label={`Remove ${s.name}`} onClick={() => { if (confirm(`Remove ${s.name}? Its pending vacancies are removed from the queue.`)) act({ action: 'removeSource', id: s.id }, 'Source removed.'); }}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sources.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Add the careers pages of the colleges you want to follow.</p>}
        </div>
      </section>

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-2 text-sm">
            <button className={view === 'pending' ? btnPrimary : btnGhost} onClick={() => setView('pending')}>Awaiting approval ({pending.length})</button>
            <button className={view === 'decided' ? btnPrimary : btnGhost} onClick={() => setView('decided')}>Decided ({decided.length})</button>
          </div>
          {view === 'pending' && pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} disabled={!selected.size || busy} onClick={() => reject([...selected])}><X className="w-4 h-4" /> Reject selected</button>
              <button className={btnPrimary} disabled={!selected.size || busy} onClick={() => publish(pending.filter(q => selected.has(q.id)))}><Check className="w-4 h-4" /> Publish selected ({selected.size})</button>
            </div>
          )}
          {view === 'decided' && decided.length > 0 && (
            <button className={btnGhost} onClick={() => { if (confirm('Clear the decided list? Rejected vacancies may be found again by future scrapes.')) act({ action: 'clearDecided' }, 'Cleared.'); }}><Trash2 className="w-4 h-4" /> Clear list</button>
          )}
        </div>

        {view === 'pending' ? (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" className="accent-brand-900 w-4 h-4" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map(q => q.id)))} /></th>
                  <th className="px-4 py-3">Vacancy</th><th className="px-4 py-3">Found</th><th className="px-4 py-3">Publish to</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map(q => {
                  const j = { ...q.job, ...(edits[q.id] || {}) };
                  const aud = audience[q.id] || 'all';
                  return (
                    <tr key={q.id} className="hover:bg-ivory align-top">
                      <td className="px-4 py-3"><input type="checkbox" className="accent-brand-900 w-4 h-4" aria-label={`Select ${j.title}`} checked={selected.has(q.id)} onChange={() => toggle(q.id)} /></td>
                      <td className="px-4 py-3 max-w-md">
                        <div className="font-medium text-slate-900">{j.title}{edits[q.id] && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gold-100 text-gold-800">edited</span>}</div>
                        <div className="text-xs text-slate-600">{j.instituteName} · {orNS(j.department)}</div>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                          {([
                            ['Qualification', j.requiredQualifications.minDegree],
                            ['Experience', j.requiredQualifications.experienceText ?? null],
                            ['Pay', j.payScale.cpcBand],
                            ['Deadline', j.applicationDeadline || j.deadlineText || null],
                            ['Posts', j.source?.numberOfPosts ?? null],
                            ['Advt. no.', j.advertisementNumber],
                          ] as [string, string | null][]).map(([k, v]) => (
                            <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className={v ? 'text-slate-800' : 'text-slate-400 italic'}>{orNS(v)}</dd></React.Fragment>
                          ))}
                        </dl>
                        {(j.source?.fromPdf || j.source?.pdfNote) && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
                            {j.source?.fromPdf && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">Details read from PDF notice</span>}
                            {j.source?.pdfNote && <span className="px-2 py-0.5 rounded-full bg-gold-50 text-gold-900 border border-gold-200">PDF: {j.source.pdfNote}</span>}
                          </div>
                        )}
                        <a href={j.externalApplyUrl || q.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-800 hover:underline mt-1">Original notice <ExternalLink className="w-3 h-3" /></a>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap"><div>{q.sourceName}</div><div>{q.foundAt}</div></td>
                      <td className="px-4 py-3">
                        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs" role="radiogroup" aria-label={`Audience for ${j.title}`}>
                          <button type="button" role="radio" aria-checked={aud === 'all'} className={`px-2.5 py-1.5 inline-flex items-center gap-1 ${aud === 'all' ? 'bg-brand-900 text-white' : 'bg-white text-slate-600'}`} onClick={() => setAudience({ ...audience, [q.id]: 'all' })}><Users className="w-3.5 h-3.5" /> Free &amp; Premium</button>
                          <button type="button" role="radio" aria-checked={aud === 'premium'} className={`px-2.5 py-1.5 inline-flex items-center gap-1 ${aud === 'premium' ? 'bg-gold-500 text-white' : 'bg-white text-slate-600'}`} onClick={() => setAudience({ ...audience, [q.id]: 'premium' })}><Crown className="w-3.5 h-3.5" /> Premium only</button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 whitespace-nowrap">
                          <button className={iconBtn} title="Edit before publishing" aria-label={`Edit ${j.title}`} onClick={() => setEditing(q)}><Pencil className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" title="Reject" aria-label={`Reject ${j.title}`} onClick={() => reject([q.id])}><X className="w-4 h-4" /></button>
                          <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold" disabled={busy} onClick={() => publish([q])}><Check className="w-3.5 h-3.5" /> Publish</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pending.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{data.running ? 'Scraping in progress…' : 'No vacancies waiting. New ones appear here after each daily scrape.'}</p>}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs text-slate-600"><tr><th className="px-4 py-3">Vacancy</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {decided.map(q => (
                  <tr key={q.id}>
                    <td className="px-4 py-3"><div className="font-medium text-slate-900">{q.job.title}</div><div className="text-xs text-slate-500">{q.job.instituteName}</div></td>
                    <td className="px-4 py-3 text-xs">
                      {q.status === 'approved'
                        ? <span className="text-emerald-700 font-semibold">Published · {q.audience === 'premium' ? 'Premium only' : 'Free & Premium'}</span>
                        : <span className="text-crimson-700 font-semibold">Rejected</span>}
                      <div className="text-slate-500">{q.decidedAt}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{q.status === 'rejected' && <button className={btnGhost} onClick={() => act({ action: 'reopen', ids: [q.id] }, 'Moved back to approval.')}><RotateCcw className="w-4 h-4" /> Reconsider</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {decided.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nothing decided yet.</p>}
          </div>
        )}
      </section>

      {/* Run history */}
      {data.runs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">Run history ({data.runs.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {data.runs.slice(0, 20).map(r => <li key={r.id}>{r.startedAt} · {r.trigger} · {r.sources} source{r.sources === 1 ? '' : 's'} · <strong>{r.newItems} new</strong>{r.errors ? <span className="text-crimson-700"> · {r.errors} failed</span> : ''}</li>)}
          </ul>
        </details>
      )}

      {editing && (
        <EditModal
          item={editing}
          value={{ ...editing.job, ...(edits[editing.id] || {}) }}
          onClose={() => setEditing(null)}
          onSave={patch => { setEdits({ ...edits, [editing.id]: { ...(edits[editing.id] || {}), ...patch } }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function EditModal({ item, value, onClose, onSave }: { item: QueueItem; value: Job; onClose: () => void; onSave: (p: Partial<Job>) => void }) {
  const [f, setF] = useState({
    title: value.title, department: value.department || '', instituteName: value.instituteName, instituteShortName: value.instituteShortName,
    city: value.location.city || '', state: value.location.state || '', deadline: value.applicationDeadline || '', link: value.externalApplyUrl || item.sourceUrl,
    advt: value.advertisementNumber || '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Edit vacancy">
      <form
        onSubmit={e => { e.preventDefault(); onSave({ title: f.title.trim(), department: f.department.trim() || null, instituteName: f.instituteName.trim(), instituteShortName: f.instituteShortName.trim() || f.instituteName.trim(), location: { city: f.city.trim() || null, state: f.state.trim() || null }, applicationDeadline: f.deadline || null, externalApplyUrl: f.link.trim(), advertisementNumber: f.advt.trim() || null }); }}
        className="w-full max-w-2xl my-8 rounded-2xl bg-white border border-slate-200 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">Edit before publishing</h3>
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-4">
          {([
            ['title', 'Title', 'sm:col-span-2'], ['department', 'Department', ''], ['advt', 'Advertisement no.', ''],
            ['instituteName', 'Institution', ''], ['instituteShortName', 'Short name', ''], ['city', 'City', ''], ['state', 'State', ''],
          ] as [keyof typeof f, string, string][]).map(([k, l, c]) => (
            <label key={k} className={`block ${c}`}><span className="block text-xs font-semibold text-slate-700 mb-1">{l}</span><input required={k === 'title'} className={inputCls} value={f[k]} onChange={set(k)} /></label>
          ))}
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Application deadline</span><input type="date" className={inputCls} value={f.deadline} onChange={set('deadline')} /></label>
          <label className="block sm:col-span-2"><span className="block text-xs font-semibold text-slate-700 mb-1">Application link (college website)</span><input type="url" required className={inputCls} value={f.link} onChange={set('link')} /></label>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save changes</button>
        </div>
      </form>
    </div>
  );
}
