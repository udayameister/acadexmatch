'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, CheckCircle2, MapPin, Search } from 'lucide-react';

/** Public fields of an AISHE directory entry, as returned by /api/aishe. */
export interface AisheHit {
  code: string;
  name: string;
  category: string;
  university: string;
  type: string;
  state: string;
  district: string;
  status: string;
  website: string;
}

const CODE_RE = /^[A-Z]{1,2}\s*[-–/ ]?\s*\d{1,7}$/i;

/** Looks up one AISHE code; null when it is not in the directory. */
export async function lookupAisheCode(code: string, signal?: AbortSignal): Promise<AisheHit | null> {
  if (!CODE_RE.test(code.trim())) return null;
  const r = await fetch(`/api/aishe?code=${encodeURIComponent(code.trim())}`, { signal, cache: 'no-store' }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json().catch(() => null))?.result as AisheHit | null) ?? null;
}

/**
 * Institute name box that searches the AISHE directory as you type (name or AISHE code) and
 * calls onPick with the chosen institution. Typing freely still works when nothing matches.
 */
export function InstituteNameSearch({ id, value, onChange, onPick, className, placeholder = 'Institute name or AISHE code' }: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (hit: AisheHit) => void;
  className?: string;
  placeholder?: string;
}) {
  const [hits, setHits] = useState<AisheHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');
  const picked = useRef('');
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || q === picked.current) { setHits([]); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/aishe?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => { setHits(d.results || []); setActive(-1); setSearched(q); setLoading(false); })
        .catch(() => { if (!ctl.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (h: AisheHit) => {
    picked.current = h.name;
    onPick(h);
    setOpen(false);
    setHits([]);
  };

  const showList = open && value.trim().length >= 2 && value.trim() !== picked.current;

  return (
    <div ref={box} className="relative">
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
      <input
        id={id}
        required
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={e => { picked.current = ''; onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!showList || !hits.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        className={`${className ?? ''} pl-10`}
      />
      {showList && (
        <div id={listId} role="listbox" className="absolute z-30 left-0 right-0 mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-lg">
          {hits.map((h, i) => (
            <button
              type="button"
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              key={h.code}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(h)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3.5 py-2.5 border-b border-slate-100 last:border-0 ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
            >
              <div className="text-sm font-semibold text-slate-900 break-words">{h.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                <span className="font-mono text-slate-700">{h.code}</span>
                {(h.district || h.state) && <span>{[h.district, h.state].filter(Boolean).join(', ')}</span>}
                {h.university && <span className="break-words">· {h.university}</span>}
                {h.status && !/^active$/i.test(h.status) && <span className="text-crimson-700">· {h.status}</span>}
              </div>
            </button>
          ))}
          {!hits.length && (
            <div className="px-3.5 py-3 text-xs text-slate-500">
              {loading || searched !== value.trim() ? 'Searching the AISHE directory…' : 'Not found in the AISHE directory. Type the details below.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Summary card for the chosen directory entry. */
export function AisheCard({ hit, onClear }: { hit: AisheHit; onClear?: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 break-words">{hit.name}</div>
            <div className="text-xs text-slate-600 mt-1 space-y-0.5">
              <div><span className="font-mono font-bold text-slate-800">{hit.code}</span>{hit.status ? ` · ${hit.status}` : ''}</div>
              {(hit.type || hit.category) && <div className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" aria-hidden="true" />{[hit.type, hit.category].filter(Boolean).join(' · ')}</div>}
              {hit.university && <div>Affiliated to {hit.university}</div>}
              {(hit.district || hit.state) && <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{[hit.district, hit.state].filter(Boolean).join(', ')}</div>}
            </div>
          </div>
        </div>
        {onClear && <button type="button" onClick={onClear} className="text-xs font-medium text-slate-500 hover:text-slate-800 shrink-0">Change</button>}
      </div>
      <p className="text-xs text-emerald-800 mt-2">Details filled in from the AISHE directory. Check them, and correct the city if needed.</p>
    </div>
  );
}
