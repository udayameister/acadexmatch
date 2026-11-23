'use client';

import React, { useState } from 'react';
import { Check as CheckIcon, Copy, Loader2, Quote } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { Segmented, cardCls, fieldCls } from '@/components/toolsUi';
import { STYLES, extractDoi, format, html, plain, type CrossrefWork, type Style } from '@/lib/citation';

type Item = { input: string; doi: string | null; work?: CrossrefWork; error?: string };

async function lookup(doi: string): Promise<CrossrefWork> {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=info@acadexmatch.com`);
  if (r.status === 404) throw new Error('DOI not found in Crossref');
  if (!r.ok) throw new Error(`Crossref answered ${r.status}; try again in a moment`);
  return (await r.json()).message as CrossrefWork;
}

export default function ReferenceFormatterPage() {
  const [text, setText] = useState('');
  const [style, setStyle] = useState<Style>('apa');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const run = async () => {
    const lines = text.split(/\n|,(?=\s*(?:https?:|doi:|10\.))/).map(s => s.trim()).filter(Boolean).slice(0, 50);
    setBusy(true);
    const out: Item[] = lines.map(l => ({ input: l, doi: extractDoi(l) }));
    setItems(out.map(o => (o.doi ? o : { ...o, error: 'No DOI found in this line (a DOI starts with 10.)' })));
    await Promise.all(out.map(async (o, i) => {
      if (!o.doi) return;
      try { const work = await lookup(o.doi); setItems(cur => cur.map((c, j) => (j === i ? { ...c, work } : c))); }
      catch (e) { setItems(cur => cur.map((c, j) => (j === i ? { ...c, error: (e as Error).message } : c))); }
    }));
    setBusy(false);
  };

  const copy = async (key: string, runsList: ReturnType<typeof format>[]) => {
    const sep = style === 'bibtex' ? '\n\n' : '\n';
    const txt = runsList.map((r, i) => (style === 'ieee' ? `[${i + 1}] ` : '') + plain(r)).join(sep);
    const htm = runsList.map((r, i) => `<p>${style === 'ieee' ? `[${i + 1}] ` : ''}${html(r)}</p>`).join('');
    try {
      if (style !== 'bibtex' && 'ClipboardItem' in window) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([txt], { type: 'text/plain' }), 'text/html': new Blob([htm], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(txt);
      setCopied(key); setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard blocked */ }
  };
  const ok = items.filter(i => i.work);
  const sorted = style === 'apa' || style === 'harvard' ? [...ok].sort((a, b) => plain(format(a.work!, style)).localeCompare(plain(format(b.work!, style)))) : ok;

  return (
    <ToolPage slug="reference-formatter" title="Reference formatter"
      intro={<>Paste one or more <strong>DOIs</strong> — one per line — and get references in <strong>APA 7th, IEEE, Vancouver, Harvard or BibTeX</strong>, ready to paste into your thesis, paper or Shodhganga submission. Italics are kept when you paste into Word or Google Docs.</>}
      notes={<>
        <p>Details come from Crossref, the DOI registry used by most journals and publishers. If a publisher deposited incomplete details (no issue or pages), the reference will be incomplete too — check it against the article. APA and Harvard lists are sorted alphabetically; IEEE and Vancouver keep your order, as these styles number references by citation order.</p>
        <p>Nothing you paste is stored by AcadeXMatch; the DOIs go directly from your browser to Crossref.</p>
      </>}>
      <section className={`${cardCls} space-y-4`}>
        <textarea className={`${fieldCls} font-mono`} rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={'10.1109/ACCESS.2024.3381234\nhttps://doi.org/10.1016/j.neuroimage.2023.120123'} aria-label="DOIs, one per line" />
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Segmented label="Style" value={style} onChange={setStyle} options={STYLES.map(s => [s.key, s.label] as [Style, string])} />
          <button className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50" disabled={busy || !text.trim()} onClick={run}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Quote className="w-4 h-4" />} Format references</button>
        </div>
      </section>
      {items.length > 0 && (
        <section className={`${cardCls} space-y-3`} aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">{STYLES.find(s => s.key === style)!.label} · {ok.length} of {items.length}</h2>
            {ok.length > 1 && <button className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-1.5" onClick={() => copy('all', sorted.map(i => format(i.work!, style)))}>{copied === 'all' ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} Copy all</button>}
          </div>
          <ol className="space-y-3">
            {sorted.map((it, n) => { const runs = format(it.work!, style); return (
              <li key={it.doi} className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className={`flex-1 min-w-0 text-sm text-slate-800 break-words ${style === 'bibtex' ? 'font-mono whitespace-pre-wrap text-xs' : ''}`}>
                  {style === 'ieee' && <span>[{n + 1}] </span>}{runs.map((r, k) => (r.italic ? <i key={k}>{r.text}</i> : <React.Fragment key={k}>{r.text}</React.Fragment>))}
                </p>
                <button aria-label="Copy this reference" className="p-2 rounded-lg hover:bg-white text-slate-500 shrink-0" onClick={() => copy(it.doi!, [runs])}>{copied === it.doi ? <CheckIcon className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button>
              </li>
            ); })}
            {items.filter(i => !i.work).map((it, k) => (
              <li key={`p${k}`} className="text-sm p-3 rounded-xl border border-slate-100 text-slate-600 break-words">{it.error ? <span className="text-crimson-700">{it.input}: {it.error}</span> : <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {it.doi}</span>}</li>
            ))}
          </ol>
        </section>
      )}
    </ToolPage>
  );
}
