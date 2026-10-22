'use client';

import React, { useMemo, useState } from 'react';
import { verifyJournalUgcCareStatus } from '@/lib/scoring';
import { parseBibtex, bibAuthors } from '@/lib/bibtex';
import type { PublicationItem } from '@/types';
import { X, Loader2, Download, Search, FileText } from 'lucide-react';

interface Found { title: string; venue: string; year: number | null; authors: string; doi: string | null; type: PublicationItem['type']; source: string }
type Tab = 'orcid' | 'doi' | 'bibtex';

const input = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

function bibType(t: string): PublicationItem['type'] {
  if (t === 'inproceedings' || t === 'conference' || t === 'proceedings') return 'Conference';
  if (t === 'book' || t === 'incollection' || t === 'inbook') return 'Book Chapter';
  if (t === 'patent') return 'Patent';
  return 'Journal';
}

export default function PublicationImport({ existing, defaultOrcid, fallbackAuthor, onClose, onAdd }: {
  existing: PublicationItem[];
  defaultOrcid?: string;
  fallbackAuthor: string;
  onClose: () => void;
  onAdd: (pubs: PublicationItem[], orcid?: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('orcid');
  const [orcid, setOrcid] = useState(defaultOrcid || '');
  const [doi, setDoi] = useState('');
  const [bib, setBib] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [usedOrcid, setUsedOrcid] = useState<string | undefined>();

  const known = useMemo(() => ({
    dois: new Set(existing.map(p => (p.doi || '').toLowerCase()).filter(Boolean)),
    titles: new Set(existing.map(p => norm(p.title))),
  }), [existing]);
  const isDup = (f: Found) => (f.doi && known.dois.has(f.doi.toLowerCase())) || known.titles.has(norm(f.title));

  const show = (list: Found[], msg?: string) => {
    setFound(list);
    setPicked(new Set(list.map((f, i) => (isDup(f) ? -1 : i)).filter(i => i >= 0)));
    setNote(msg || (list.length === 0 ? 'Nothing found.' : null));
  };

  const get = async (url: string) => {
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Lookup failed.');
      return d;
    } catch (e) {
      setErr((e as Error).message); setFound([]);
      return null;
    } finally { setBusy(false); }
  };

  const fromOrcid = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await get(`/api/publications/orcid?id=${encodeURIComponent(orcid)}`);
    if (d) { setUsedOrcid(d.orcid); show(d.works, `${d.works.length} work(s) on the ORCID record${d.name ? ` of ${d.name}` : ''}.`); }
  };
  const fromDoi = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await get(`/api/publications/doi?doi=${encodeURIComponent(doi)}`);
    if (d) show(d.works, d.notFound?.length ? `Not found: ${d.notFound.join(', ')}` : undefined);
  };
  const fromBib = (text: string) => {
    setErr(null);
    const entries = parseBibtex(text);
    if (entries.length === 0) { setErr('No BibTeX entries found. In Google Scholar: My profile → select articles → Export → BibTeX.'); setFound([]); return; }
    show(entries.filter(e => e.fields.title).map(e => ({
      title: e.fields.title, venue: e.fields.journal || e.fields.booktitle || e.fields.publisher || e.fields.school || '',
      year: Number(e.fields.year) || null, authors: bibAuthors(e.fields.author), doi: e.fields.doi || null, type: bibType(e.type), source: 'BibTeX',
    })));
  };

  const add = () => {
    const pubs: PublicationItem[] = found.filter((_, i) => picked.has(i)).map((f, i) => {
      const est = verifyJournalUgcCareStatus(f.venue || '');
      return {
        id: `pub-${Date.now()}-${i}`,
        title: f.title, journalOrConference: f.venue || 'Venue not stated', year: f.year || new Date().getFullYear(),
        authors: f.authors || fallbackAuthor, doi: f.doi || undefined, type: f.type,
        ugcCareListed: est.isUgcCare, scopusIndexed: est.isScopus, sciScieIndexed: est.isSci,
      };
    });
    onAdd(pubs, tab === 'orcid' ? usedOrcid : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Import publications">
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Import publications</h2>
            <p className="text-xs text-slate-500 mt-0.5">Details are copied from the source. Indexing (UGC-CARE / Scopus / SCI) is estimated from the venue — check it after importing.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 pt-4">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit text-xs font-semibold" role="tablist">
            {([['orcid', 'ORCID'], ['doi', 'DOI'], ['bibtex', 'Google Scholar / BibTeX']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setFound([]); setErr(null); setNote(null); }} className={`px-3.5 py-2 rounded-lg ${tab === k ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-600'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {tab === 'orcid' && (
            <form onSubmit={fromOrcid} className="flex flex-col sm:flex-row gap-2">
              <input className={input} value={orcid} onChange={e => setOrcid(e.target.value)} placeholder="ORCID iD, e.g. 0000-0002-1825-0097" aria-label="ORCID iD" required />
              <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Fetch works</button>
            </form>
          )}
          {tab === 'doi' && (
            <form onSubmit={fromDoi} className="space-y-2">
              <textarea rows={3} className={input} value={doi} onChange={e => setDoi(e.target.value)} placeholder={'One or more DOIs (up to 20), separated by spaces or new lines\n10.1109/TPAMI.2023.1234567'} aria-label="DOIs" required />
              <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Look up</button>
            </form>
          )}
          {tab === 'bibtex' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">Google Scholar has no public data feed, so export your list instead: open your Scholar profile, tick the articles, choose <strong>Export → BibTeX</strong>, then upload the file or paste its text here.</p>
              <div className="flex flex-wrap gap-2">
                <label className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 cursor-pointer inline-flex items-center gap-2 hover:bg-slate-50"><FileText className="w-4 h-4" /> Upload .bib file
                  <input type="file" accept=".bib,.txt,text/plain" className="sr-only" onChange={async e => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setBib(t); fromBib(t); } }} />
                </label>
              </div>
              <textarea rows={5} className={`${input} font-mono text-xs`} value={bib} onChange={e => setBib(e.target.value)} placeholder="@article{key, title={…}, author={…}, journal={…}, year={2024}}" aria-label="BibTeX text" />
              <button onClick={() => fromBib(bib)} disabled={!bib.trim()} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60">Read entries</button>
            </div>
          )}

          {err && <p className="text-sm text-crimson-700" role="alert">{err}</p>}
          {note && <p className="text-sm text-slate-600" role="status">{note}</p>}

          {found.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{picked.size} of {found.length} selected</span>
                <span className="flex gap-3"><button className="underline" onClick={() => setPicked(new Set(found.map((_, i) => i)))}>Select all</button><button className="underline" onClick={() => setPicked(new Set())}>None</button></span>
              </div>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {found.map((f, i) => (
                  <li key={i} className="p-3 flex gap-3 items-start">
                    <input type="checkbox" className="mt-1 accent-brand-700" checked={picked.has(i)} onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(i); else n.delete(i); setPicked(n); }} aria-label={`Import ${f.title}`} />
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-slate-900 leading-snug">{f.title}{isDup(f) && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 align-middle">Already in profile</span>}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{[f.authors, f.venue, f.year, f.type, f.doi && `DOI ${f.doi}`].filter(Boolean).join(' · ')}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700">Cancel</button>
          <button onClick={add} disabled={picked.size === 0} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50">Add {picked.size || ''} to profile</button>
        </div>
      </div>
    </div>
  );
}
