'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload, AlertTriangle } from 'lucide-react';
import { AisheCard, AisheHit, InstituteNameSearch } from '@/components/AisheLookup';

interface Stats { total: number; byState: { state: string; count: number }[]; byCategory: { category: string; count: number }[] }
interface UploadResult {
  file: string;
  rows: number;
  added?: number;
  updated?: number;
  unchanged?: number;
  total?: number;
  duplicates: number;
  skipped: number;
  skippedSample: { row: number; reason: string }[];
  columns: { header: string; field: string | null }[];
}

const FIELD_LABEL: Record<string, string> = {
  code: 'AISHE code', name: 'Institute name', category: 'Category', university: 'Affiliated university', type: 'Type',
  state: 'State', district: 'District', status: 'Status', website: 'Website', established: 'Year established', management: 'Management',
};

/** Admin: upload the AISHE institution list (Excel or CSV) and see what the directory holds. */
export default function AisheDirectoryPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [q, setQ] = useState('');
  const [hit, setHit] = useState<AisheHit | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/aishe', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setStats(d)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/admin/aishe', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || 'Upload failed.');
      else { setResult(d); load(); }
    } catch {
      setError('Upload failed. Check your connection and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-slate-900">AISHE institute directory</h2>
          <p className="text-sm text-slate-600 mt-1">
            Upload the institution list downloaded from the AISHE portal (Excel .xlsx or CSV). Institutions are matched by AISHE code:
            new codes are added and changed rows are updated. Nothing is deleted, so you can upload one state at a time.
            When an institution signs up, it can pick itself from this list and its details are filled in.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          Columns read: AISHE Code and Institute Name (required); Category, Name of Affiliated University, Type of Institute, State, District, Status, Website, Year of Establishment, Management (if present).
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-500 cursor-pointer text-sm text-slate-700 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-brand-800 shrink-0" aria-hidden="true" />
            <span className="truncate">{file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : 'Choose an Excel or CSV file…'}</span>
            <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only"
              onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setError(''); }} />
          </label>
          <button type="button" disabled={!file || busy} onClick={upload}
            className="px-5 py-3 rounded-xl bg-brand-900 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" aria-hidden="true" />{busy ? 'Uploading…' : 'Upload and update'}
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />{error}
          </div>
        )}

        {result && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />{result.file}: {result.rows.toLocaleString('en-IN')} institutions read
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([['Added', result.added], ['Updated', result.updated], ['Unchanged', result.unchanged], ['Skipped rows', result.skipped]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white border border-emerald-100 px-3 py-2">
                  <div className="text-xs text-slate-500">{l}</div>
                  <div className="text-lg font-bold text-slate-900">{(v ?? 0).toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-600">
              Columns: {result.columns.map(c => (
                <span key={c.header} className={`inline-block mr-1.5 mb-1 px-2 py-0.5 rounded border ${c.field ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200 text-slate-400 line-through'}`}>
                  {c.header}{c.field ? ` → ${FIELD_LABEL[c.field] || c.field}` : ''}
                </span>
              ))}
            </div>
            {result.duplicates > 0 && <div className="text-xs text-slate-600">{result.duplicates} repeated AISHE codes in the file; the last row was used.</div>}
            {result.skippedSample.length > 0 && (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer font-medium">Skipped rows</summary>
                <ul className="mt-1 space-y-0.5">{result.skippedSample.map(s => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>
                {result.skipped > result.skippedSample.length && <div>…and {result.skipped - result.skippedSample.length} more</div>}
              </details>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-900">In the directory</h3>
          <div className="font-serif text-3xl font-bold text-slate-900">{stats ? stats.total.toLocaleString('en-IN') : '…'}</div>
          <div className="text-xs text-slate-500">institutions</div>
          {stats && stats.total > 0 && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 text-sm">
              <table className="w-full">
                <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium pb-1">State</th><th className="font-medium pb-1 text-right">Institutions</th></tr></thead>
                <tbody>{stats.byState.slice(0, 40).map(s => <tr key={s.state} className="border-t border-slate-100"><td className="py-1">{s.state}</td><td className="py-1 text-right tabular-nums">{s.count.toLocaleString('en-IN')}</td></tr>)}</tbody>
              </table>
              <table className="w-full">
                <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium pb-1">Category</th><th className="font-medium pb-1 text-right">Institutions</th></tr></thead>
                <tbody>{stats.byCategory.map(s => <tr key={s.category} className="border-t border-slate-100"><td className="py-1">{s.category}</td><td className="py-1 text-right tabular-nums">{s.count.toLocaleString('en-IN')}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-900">Try the search</h3>
          <p className="text-xs text-slate-500">This is the same search institutions see on the sign-up form.</p>
          <InstituteNameSearch value={q} onChange={v => { setQ(v); setHit(null); }} onPick={h => { setHit(h); setQ(h.name); }}
            className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          {hit && <AisheCard hit={hit} />}
        </div>
      </div>
    </div>
  );
}
