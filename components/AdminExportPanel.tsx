'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, FileText, GripVertical, Loader2, Plus, RotateCcw, ShieldAlert, X } from 'lucide-react';

interface FieldDef { key: string; label: string; def: boolean; num: boolean }
interface DatasetDef { key: string; label: string; description: string; personal: boolean; fields: FieldDef[] }
interface Sort { field: string; dir: 'asc' | 'desc' }
interface Choice { order: string[]; on: string[]; sort: Sort[] }

const btn = 'px-3 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50';
const primary = `${btn} bg-brand-900 hover:bg-brand-800 text-white`;
const ghost = `${btn} bg-white border border-slate-200 text-slate-800 hover:bg-slate-50`;
const input = 'px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100';
const STORE = 'acx_admin_export_v1';

const defaults = (d: DatasetDef): Choice => ({ order: d.fields.map(f => f.key), on: d.fields.filter(f => f.def).map(f => f.key), sort: [] });
function remembered(): Record<string, Choice> { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } }
function remember(all: Record<string, Choice>) { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage blocked */ } }

/** Administrator: download any data set as CSV or Excel with chosen fields, field order and row order. */
export default function AdminExportPanel() {
  const [sets, setSets] = useState<DatasetDef[]>([]);
  const [ds, setDs] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ header: string[]; rows: (string | number | boolean | null)[][]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/export', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(d => {
      setSets(d.datasets || []);
      setDs(d.datasets?.[0]?.key || '');
      setChoices(remembered());
    }).catch(() => setErr('Could not load the export options.'));
  }, []);

  const def = sets.find(s => s.key === ds);
  const choice: Choice | null = useMemo(() => {
    if (!def) return null;
    const c = choices[ds];
    if (!c) return defaults(def);
    // Keep remembered order, add fields that are new since, drop ones that no longer exist.
    const known = new Set(def.fields.map(f => f.key));
    const order = [...c.order.filter(k => known.has(k)), ...def.fields.map(f => f.key).filter(k => !c.order.includes(k))];
    return { order, on: c.on.filter(k => known.has(k)), sort: c.sort.filter(s => known.has(s.field)) };
  }, [def, choices, ds]);
  const update = (fn: (c: Choice) => Choice) => {
    if (!def || !choice) return;
    const next = { ...choices, [ds]: fn(choice) };
    setChoices(next); remember(next);
  };
  const label = (k: string) => def?.fields.find(f => f.key === k)?.label || k;
  const selected = choice ? choice.order.filter(k => choice.on.includes(k)) : [];
  const body = useMemo(() => ({ dataset: ds, fields: selected, sort: choice?.sort || [], search }), [ds, selected.join(','), JSON.stringify(choice?.sort), search]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreview = useCallback(async () => {
    if (!ds || !body.fields.length) { setPreview(null); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/admin/export', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, format: 'preview' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Preview failed');
      setPreview(d); setErr('');
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [body, ds]);
  useEffect(() => { const t = setTimeout(loadPreview, 350); return () => clearTimeout(t); }, [loadPreview]);

  const download = async (format: 'csv' | 'xlsx') => {
    setBusy(format); setErr('');
    try {
      const r = await fetch('/api/admin/export', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, format }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Download failed (${r.status})`);
      const name = r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `export.${format}`;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  const move = (from: number, to: number) => update(c => {
    if (to < 0 || to >= c.order.length || from === to) return c;
    const o = [...c.order]; const [k] = o.splice(from, 1); o.splice(to, 0, k);
    return { ...c, order: o };
  });

  if (!sets.length) return <div className="p-5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-500 flex items-center gap-2">{err || <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>}</div>;

  return (
    <div className="space-y-6">
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Download className="w-5 h-5 text-brand-700" /> Download data</h2>
          <p className="text-sm text-slate-600 mt-1">Choose the data, tick the fields you want, put them in order (drag, or use the arrows), choose how rows are sorted, then download a CSV or Excel file.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2" role="radiogroup" aria-label="Data set">
          {sets.map(s => (
            <button key={s.key} role="radio" aria-checked={s.key === ds} onClick={() => { setDs(s.key); setSearch(''); }}
              className={`text-left p-3 rounded-xl border text-sm transition ${s.key === ds ? 'border-brand-700 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="font-semibold text-slate-900 block leading-snug">{s.label}</span>
              {s.personal && <span className="text-[11px] text-amber-700">Personal data</span>}
            </button>
          ))}
        </div>
        {def && <p className="text-sm text-slate-600">{def.description}</p>}
        {def?.personal && (
          <p className="text-xs p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" /> This file contains personal data (DPDP Act 2023). Every download is recorded in the audit log. Keep the file safe, share it only with people who need it, and delete it when you are done.</p>
        )}
      </section>

      {def && choice && (
        <div className="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6 items-start">
          <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Fields and their order</h3>
              <span className="text-xs text-slate-500">{selected.length} of {def.fields.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" onClick={() => update(c => ({ ...c, on: [...c.order] }))}>All</button>
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" onClick={() => update(c => ({ ...c, on: [] }))}>None</button>
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold inline-flex items-center gap-1" onClick={() => update(() => defaults(def))}><RotateCcw className="w-3 h-3" /> Standard</button>
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" title="Ticked fields first, in their current order" onClick={() => update(c => ({ ...c, order: [...c.order.filter(k => c.on.includes(k)), ...c.order.filter(k => !c.on.includes(k))] }))}>Ticked first</button>
            </div>
            <ol className="space-y-1 max-h-[32rem] overflow-y-auto pr-1">
              {choice.order.map((k, i) => {
                const on = choice.on.includes(k);
                return (
                  <li key={k} draggable onDragStart={() => { dragFrom.current = i; }} onDragOver={e => { e.preventDefault(); setDragOver(i); }} onDragLeave={() => setDragOver(null)}
                    onDrop={e => { e.preventDefault(); if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null; setDragOver(null); }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-sm ${dragOver === i ? 'border-brand-500 bg-brand-50' : on ? 'border-slate-200 bg-white' : 'border-transparent bg-slate-50 text-slate-500'}`}>
                    <GripVertical className="w-4 h-4 text-slate-300 cursor-grab shrink-0" aria-hidden />
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={e => update(c => ({ ...c, on: e.target.checked ? [...c.on, k] : c.on.filter(x => x !== k) }))} />
                      <span className="truncate">{label(k)}</span>
                    </label>
                    {on && <span className="text-[10px] font-bold text-brand-700 tabular-nums w-5 text-right">{selected.indexOf(k) + 1}</span>}
                    <button aria-label={`Move ${label(k)} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button aria-label={`Move ${label(k)} down`} disabled={i === choice.order.length - 1} onClick={() => move(i, i + 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="space-y-6 min-w-0">
            <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-semibold text-slate-900">Row order and filter</h3>
              <div className="space-y-2">
                {choice.sort.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-500 w-16">{i === 0 ? 'Sort by' : 'then by'}</span>
                    <select className={input} value={s.field} onChange={e => update(c => ({ ...c, sort: c.sort.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) }))}>
                      {def.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select className={input} value={s.dir} onChange={e => update(c => ({ ...c, sort: c.sort.map((x, j) => (j === i ? { ...x, dir: e.target.value as Sort['dir'] } : x)) }))}>
                      <option value="asc">{def.fields.find(f => f.key === s.field)?.num ? 'Smallest first' : 'A → Z / oldest first'}</option>
                      <option value="desc">{def.fields.find(f => f.key === s.field)?.num ? 'Largest first' : 'Z → A / newest first'}</option>
                    </select>
                    <button aria-label="Remove this sort" className="p-1.5 rounded-lg hover:bg-slate-100" onClick={() => update(c => ({ ...c, sort: c.sort.filter((_, j) => j !== i) }))}><X className="w-4 h-4" /></button>
                  </div>
                ))}
                {choice.sort.length < 3 && (
                  <button className={ghost} onClick={() => update(c => ({ ...c, sort: [...c.sort, { field: selected[0] || def.fields[0].key, dir: 'asc' }] }))}><Plus className="w-4 h-4" /> {choice.sort.length ? 'Then sort by…' : 'Sort rows by…'}</button>
                )}
                {!choice.sort.length && <p className="text-xs text-slate-500">Without sorting, rows come in the order they are stored.</p>}
              </div>
              <label className="block text-sm text-slate-600">Only rows containing (optional)
                <input className={`${input} w-full mt-1`} placeholder="e.g. Tamil Nadu, Assistant Professor, @gmail.com" value={search} onChange={e => setSearch(e.target.value)} />
              </label>
            </section>

            <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">Preview {preview && <span className="font-normal text-sm text-slate-500">· {preview.total.toLocaleString('en-IN')} rows{preview.total > preview.rows.length ? ` (first ${preview.rows.length} shown)` : ''}</span>}</h3>
                <div className="flex gap-2">
                  <button className={ghost} disabled={!selected.length || !!busy} onClick={() => download('csv')}>{busy === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Download CSV</button>
                  <button className={primary} disabled={!selected.length || !!busy} onClick={() => download('xlsx')}>{busy === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Download Excel</button>
                </div>
              </div>
              {err && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-200 text-crimson-900">{err}</p>}
              {!selected.length ? <p className="text-sm text-slate-500">Tick at least one field.</p> : (
                <div className={`overflow-x-auto border border-slate-100 rounded-xl ${loading ? 'opacity-60' : ''}`}>
                  <table className="text-xs w-max min-w-full">
                    <thead><tr className="bg-brand-950 text-white">{preview?.header.map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>
                      {preview?.rows.map((r, i) => <tr key={i} className="border-t border-slate-100 even:bg-slate-50/60">{r.map((v, j) => <td key={j} className="px-3 py-1.5 whitespace-nowrap max-w-[22rem] truncate">{v === true ? 'Yes' : v === false ? 'No' : v == null ? '' : String(v)}</td>)}</tr>)}
                      {preview && !preview.rows.length && <tr><td className="px-3 py-6 text-slate-500" colSpan={preview.header.length || 1}>No rows.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500">Excel files open with a frozen, filterable header row. CSV files open correctly in Excel and Google Sheets (UTF-8). Your field choices are remembered in this browser.</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
