'use client';

import React, { useState } from 'react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import type { Partner } from '@/types';
import { ExternalLink, Handshake, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

const CATEGORIES: Partner['category'][] = ['NET / SET coaching', 'Faculty development', 'Research services', 'Other'];

/** Candidate-facing list of partner services (only active partners reach the browser). */
export function PartnerOffers({ limit = 4 }: { limit?: number }) {
  const partners = useStorageValue<Partner[]>(() => StorageService.getPartners().filter(p => p.active), []);
  if (!partners.length) return null;
  return (
    <section className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Handshake className="w-4 h-4 text-brand-700" /> Partner services</h3>
      <p className="text-xs text-slate-500 mt-1">Coaching, faculty development and research services from AcadeXMatch partners.</p>
      <ul className="mt-4 space-y-3">
        {partners.slice(0, limit).map(p => (
          <li key={p.id} className="p-3 rounded-xl border border-slate-100 bg-cream/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a href={p.url} target="_blank" rel="noopener noreferrer sponsored" className="font-semibold text-slate-900 hover:text-brand-800 inline-flex items-center gap-1">{p.name} <ExternalLink className="w-3 h-3" /></a>
                <div className="text-xs text-slate-500">{p.category}</div>
              </div>
              {p.offer && <span className="text-xs font-semibold bg-gold-50 text-gold-800 border border-gold-200 px-2 py-0.5 rounded-full text-right">{p.offer}</span>}
            </div>
            {p.description && <p className="text-xs text-slate-600 mt-1.5">{p.description}</p>}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-slate-400 mt-3">Partner listings are paid placements.</p>
    </section>
  );
}

const EMPTY = { id: '', name: '', url: '', category: CATEGORIES[0], description: '', offer: '', active: true };

/** Admin: manage partner listings. */
export function PartnersPanel() {
  const all = useStorageValue<Partner[]>(() => StorageService.getPartners(), []);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const existing = all.find(p => p.id === form.id);
    const r = StorageService.savePartner({ ...form, id: form.id || undefined, createdAt: existing?.createdAt });
    setMsg(r.success ? { ok: true, text: form.id ? 'Partner updated.' : 'Partner added.' } : { ok: false, text: r.error || 'Failed.' });
    if (r.success) setForm(EMPTY);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Handshake className="w-4 h-4 text-brand-700" /><h3 className="font-bold text-slate-900">Partner listings</h3></div>
      <p className="text-xs text-slate-500">Paid listings for coaching institutes, faculty-development programmes and research services. Active partners appear on the candidate dashboard, marked as paid placements.</p>
      {msg && <p className={`p-3 rounded-xl text-sm border ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-crimson-50 border-crimson-100 text-crimson-700'}`} role="status">{msg.text}</p>}
      <form onSubmit={submit} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <h4 className="font-semibold text-slate-900">{form.id ? 'Edit partner' : 'Add a partner'}</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-semibold text-slate-700">Name</span><input className={input} required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Website</span><input className={input} required type="text" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Category</span><select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Partner['category'] })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="block"><span className="text-xs font-semibold text-slate-700">Offer for members (optional)</span><input className={input} maxLength={160} placeholder="15% off for AcadeXMatch members" value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} /></label>
        </div>
        <label className="block"><span className="text-xs font-semibold text-slate-700">Short description</span><textarea className={input} rows={2} maxLength={400} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <div className="flex justify-end gap-2">
          {form.id && <button type="button" className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm" onClick={() => setForm(EMPTY)}>Cancel</button>}
          <button className="px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">{form.id ? 'Save changes' : 'Add partner'}</button>
        </div>
      </form>
      {all.length === 0 ? <p className="text-sm text-slate-500">No partners yet.</p> : (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
          {all.map(p => (
            <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><a href={p.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-900 hover:underline">{p.name}</a><span className="text-xs text-slate-500">{p.category}</span>{!p.active && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">Hidden</span>}</div>
                {p.offer && <p className="text-xs text-gold-800 mt-0.5">{p.offer}</p>}
                {p.description && <p className="text-sm text-slate-600 mt-1">{p.description}</p>}
                <p className="text-xs text-slate-400 mt-1">Added {p.createdAt}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label={`Edit ${p.name}`} onClick={() => setForm({ id: p.id, name: p.name, url: p.url, category: p.category, description: p.description, offer: p.offer || '', active: p.active })}><Pencil className="w-4 h-4" /></button>
                <button className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" aria-label={p.active ? `Hide ${p.name}` : `Show ${p.name}`} onClick={() => StorageService.savePartner({ ...p, active: !p.active })}>{p.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                <button className="p-2 rounded-lg border border-crimson-100 text-crimson-700 hover:bg-crimson-50" aria-label={`Delete ${p.name}`} onClick={() => { if (confirm(`Delete ${p.name}?`)) StorageService.deletePartner(p.id); }}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
