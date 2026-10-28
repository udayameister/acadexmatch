'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StorageService } from '@/lib/storage';
import { useSelection, BulkBar } from '@/components/Selection';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Pencil, Plus, Trash2, Upload, X, ExternalLink, Images } from 'lucide-react';

interface AdminCustomer { id: string; name: string; website?: string; visible: boolean; order: number; addedAt: string; logoUrl: string }

const inputCls = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition';
const iconBtn = 'p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50 transition disabled:opacity-30';
const ACCEPT = 'image/png,image/jpeg,image/webp';

async function call(method: string, body?: FormData, query = ''): Promise<AdminCustomer[]> {
  const r = await fetch(`/api/customers${query}`, { method, body, headers: { 'x-acad-admin': '1' }, cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The server could not save that.');
  return d;
}

function checkFile(f: File | null): string | null {
  if (!f) return 'Choose a logo image.';
  if (!ACCEPT.split(',').includes(f.type)) return 'Logo must be a PNG, JPG or WebP image.';
  if (f.size > 1024 * 1024) return 'Logo must be 1 MB or smaller.';
  return null;
}

export default function CustomersPanel() {
  const [list, setList] = useState<AdminCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', website: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const sel = useSelection((list || []).map(c => c.id));

  /** Adds several logos at once; each customer is named after its file (editable afterwards). */
  const addMany = async (files: FileList | null) => {
    if (!files?.length) return;
    const all = Array.from(files);
    const errors: string[] = [];
    let added = 0;
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      setProgress(`Uploading ${i + 1} of ${all.length}…`);
      const bad = checkFile(f);
      if (bad) { errors.push(`${f.name}: ${bad}`); continue; }
      const fd = new FormData();
      fd.set('name', f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());
      fd.set('website', '');
      fd.set('logo', f);
      try { setList(await call('POST', fd)); added++; } catch (err) { errors.push(`${f.name}: ${(err as Error).message}`); }
    }
    setProgress(null);
    setError(errors.length ? errors.join(' · ') : null);
    if (added) {
      say(`Added ${added} customer${added === 1 ? '' : 's'}. Edit names and websites as needed.`);
      StorageService.addAuditLog(`Added ${added} customer logos`, 'customers', 'AUTHENTICATION');
    }
  };

  const bulkVisible = async (visible: boolean) => {
    const ids = sel.ids; sel.clear();
    for (const id of ids) {
      const fd = new FormData(); fd.set('id', id); fd.set('visible', visible ? '1' : '0');
      try { setList(await call('PATCH', fd)); } catch (err) { setError((err as Error).message); }
    }
    say(`${ids.length} customer${ids.length === 1 ? '' : 's'} ${visible ? 'shown on' : 'hidden from'} the home page.`);
  };

  const bulkDelete = async () => {
    if (!confirm(`Remove ${sel.count} customer${sel.count === 1 ? '' : 's'} from Our Customers?`)) return;
    const ids = sel.ids; sel.clear();
    for (const id of ids) {
      try { setList(await call('DELETE', undefined, `?id=${encodeURIComponent(id)}`)); } catch (err) { setError((err as Error).message); }
    }
    say(`Removed ${ids.length} customer${ids.length === 1 ? '' : 's'}.`);
    StorageService.addAuditLog(`Removed ${ids.length} customer logos`, 'customers', 'AUTHENTICATION');
  };

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };
  const load = useCallback(() => call('GET', undefined, '?all=1').then(setList).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = checkFile(file);
    if (bad) { setError(bad); return; }
    const fd = new FormData();
    fd.set('name', form.name);
    fd.set('website', form.website);
    fd.set('logo', file!);
    setBusy(true);
    try {
      setList(await call('POST', fd));
      setForm({ name: '', website: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setError(null);
      say('Customer added to the home page.');
      StorageService.addAuditLog(`Added customer logo: ${form.name}`, 'customers', 'AUTHENTICATION');
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  };

  const patch = async (id: string, fields: Record<string, string | File>, msg?: string) => {
    const fd = new FormData();
    fd.set('id', id);
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    try { setList(await call('PATCH', fd)); if (msg) say(msg); } catch (err) { setError((err as Error).message); }
  };

  const remove = async (c: AdminCustomer) => {
    if (!confirm(`Remove ${c.name} from Our Customers?`)) return;
    try { setList(await call('DELETE', undefined, `?id=${encodeURIComponent(c.id)}`)); say('Customer removed.'); StorageService.addAuditLog(`Removed customer logo: ${c.name}`, 'customers', 'AUTHENTICATION'); }
    catch (err) { setError((err as Error).message); }
  };

  if (!list && !error) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" /></div>;

  return (
    <div className="space-y-6">
      {flash && <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-brand-950 text-white text-sm shadow-xl" role="status">{flash}</div>}

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-900">Add a customer</h3>
        <p className="text-xs text-slate-500 mt-1">Logos appear in the &ldquo;Our Customers&rdquo; section of the home page for every visitor. PNG, JPG or WebP, up to 1 MB; a transparent PNG about 400 × 160 px looks best.</p>
        <form onSubmit={add} className="mt-4 grid md:grid-cols-[auto_1fr_1fr_auto] gap-3 items-end">
          <div>
            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" id="customer-logo" onChange={e => { setFile(e.target.files?.[0] || null); setError(null); }} />
            <label htmlFor="customer-logo" className="w-28 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-400 bg-ivory grid place-items-center cursor-pointer overflow-hidden" title="Choose logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="Logo preview" className="max-h-16 max-w-[6rem] object-contain" /> : <span className="flex flex-col items-center text-xs text-slate-500"><ImagePlus className="w-5 h-5 mb-1" />Logo</span>}
            </label>
          </div>
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Name</span><input required className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Madanapalle Institute of Technology & Science" /></label>
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Website (optional)</span><input className={inputCls} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://www.mits.ac.in" /></label>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</button>
        </form>
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <input ref={multiRef} type="file" accept={ACCEPT} multiple className="sr-only" id="customer-logos-multi" onChange={e => { addMany(e.target.files); e.target.value = ''; }} />
          <label htmlFor="customer-logos-multi" className={`${btnGhost} cursor-pointer`}><Images className="w-4 h-4" /> Add several logos at once</label>
          <span className="text-xs text-slate-500">{progress || 'Each logo becomes a customer named after its file; edit names and websites afterwards.'}</span>
        </div>
        {error && <p className="mt-3 text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2" role="alert">{error}</p>}
      </section>

      <section className="space-y-3">
        <BulkBar sel={sel} noun="customer">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold" onClick={() => bulkVisible(true)}><Eye className="w-3.5 h-3.5" /> Show</button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold" onClick={() => bulkVisible(false)}><EyeOff className="w-3.5 h-3.5" /> Hide</button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white text-xs font-semibold" onClick={bulkDelete}><Trash2 className="w-3.5 h-3.5" /> Remove</button>
        </BulkBar>
        <div className="flex items-center justify-between gap-3">
          {list && list.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-700 shrink-0"><input type="checkbox" className="w-4 h-4 accent-brand-900" checked={sel.allOn} onChange={sel.toggleAll} /> Select all</label>
          )}
          <h3 className="font-bold text-slate-900 flex-1">On the home page ({list?.filter(c => c.visible).length || 0} shown, {list?.length || 0} total)</h3>
          <a href="/#customers" target="_blank" rel="noopener noreferrer" className={btnGhost}><ExternalLink className="w-4 h-4" /> View section</a>
        </div>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list?.map((c, i) => (
            <li key={c.id} className={`relative p-4 rounded-2xl border shadow-sm flex gap-4 ${sel.has(c.id) ? 'ring-2 ring-brand-900' : ''} ${c.visible ? 'bg-white border-slate-200' : 'bg-slate-50 border-dashed border-slate-300 opacity-70'}`}>
              <input type="checkbox" className="absolute top-3 right-3 w-4 h-4 accent-brand-900 cursor-pointer" aria-label={`Select ${c.name}`} checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} />
              <div className="w-24 h-16 rounded-lg bg-ivory border border-slate-200 grid place-items-center shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logoUrl} alt={`${c.name} logo`} className="max-h-14 max-w-[5.5rem] object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 text-sm line-clamp-2">{c.name}</div>
                {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-brand-800 truncate block">{c.website.replace(/^https?:\/\//, '')}</a>}
                {!c.visible && <div className="text-xs text-slate-500 mt-0.5">Hidden</div>}
                <div className="flex gap-0.5 mt-2 -ml-1.5">
                  <button className={iconBtn} disabled={i === 0} title="Move earlier" aria-label={`Move ${c.name} earlier`} onClick={() => patch(c.id, { move: 'up' })}><ArrowUp className="w-4 h-4" /></button>
                  <button className={iconBtn} disabled={i === (list.length - 1)} title="Move later" aria-label={`Move ${c.name} later`} onClick={() => patch(c.id, { move: 'down' })}><ArrowDown className="w-4 h-4" /></button>
                  <button className={iconBtn} title={c.visible ? 'Hide' : 'Show'} aria-label={c.visible ? `Hide ${c.name}` : `Show ${c.name}`} onClick={() => patch(c.id, { visible: c.visible ? '0' : '1' }, c.visible ? 'Hidden from the home page.' : 'Shown on the home page.')}>{c.visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  <button className={iconBtn} title="Edit" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" title="Remove" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {list?.length === 0 && <p className="p-8 text-center text-sm text-slate-500 rounded-2xl bg-white border border-slate-200">No customers yet. The section stays hidden on the home page until you add one.</p>}
      </section>

      {editing && <EditCustomer c={editing} onClose={() => setEditing(null)} onSave={async (fields) => { await patch(editing.id, fields, 'Customer updated.'); setEditing(null); }} />}
    </div>
  );
}

function EditCustomer({ c, onClose, onSave }: { c: AdminCustomer; onClose: () => void; onSave: (f: Record<string, string | File>) => Promise<void> }) {
  const [name, setName] = useState(c.name);
  const [website, setWebsite] = useState(c.website || '');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit customer">
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (file) { const bad = checkFile(file); if (bad) { setErr(bad); return; } }
          const f: Record<string, string | File> = { name, website };
          if (file) f.logo = file;
          await onSave(f);
        }}
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">Edit customer</h3>
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Name</span><input required className={inputCls} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Website</span><input className={inputCls} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" /></label>
          <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">Replace logo (optional)</span><input type="file" accept={ACCEPT} className="text-sm" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
          {err && <p className="text-sm text-crimson-700">{err}</p>}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}><Upload className="w-4 h-4" /> Save</button>
        </div>
      </form>
    </div>
  );
}
