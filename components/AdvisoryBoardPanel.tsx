'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';

interface Member { id: string; name: string; boardRole: string; designation: string; organization: string; bio: string; profileUrl: string | null; photoUrl: string | null; visible: boolean; order: number }
type Draft = { id?: string; name: string; boardRole: string; designation: string; organization: string; bio: string; profileUrl: string; hadPhoto?: boolean };
const blank: Draft = { name: '', boardRole: 'Member', designation: '', organization: '', bio: '', profileUrl: '' };
const input = 'w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500';
const ROLES = ['Chair', 'Co-Chair', 'Member', 'Academic Advisor', 'Industry Advisor', 'Legal Advisor', 'Mentor'];

/** Administrator: advisory board members shown on the About page. */
export default function AdvisoryBoardPanel() {
  const [list, setList] = useState<Member[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/advisory?all=1', { credentials: 'same-origin', cache: 'no-store' });
    setList(r.ok ? await r.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (method: 'POST' | 'PATCH' | 'DELETE', body?: FormData, query = '') => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/advisory${query}`, { method, body, credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not save.'); return false; }
      setList(d);
      return true;
    } finally { setBusy(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const f = new FormData();
    if (draft.id) f.append('id', draft.id);
    for (const k of ['name', 'boardRole', 'designation', 'organization', 'bio', 'profileUrl'] as const) f.append(k, draft[k]);
    if (photo) f.append('photo', photo);
    if (removePhoto) f.append('removePhoto', '1');
    if (await send(draft.id ? 'PATCH' : 'POST', f)) {
      setFlash(draft.id ? 'Member updated.' : `${draft.name} added to the advisory board.`);
      setDraft(null); setPhoto(null); setRemovePhoto(false);
      setTimeout(() => setFlash(''), 4000);
    }
  };
  const act = (m: Member, fields: Record<string, string>) => { const f = new FormData(); f.append('id', m.id); for (const [k, v] of Object.entries(fields)) f.append(k, v); return send('PATCH', f); };
  const remove = async (m: Member) => { if (confirm(`Remove ${m.name} from the advisory board?`)) { if (await send('DELETE', undefined, `?id=${encodeURIComponent(m.id)}`)) setFlash(`${m.name} removed.`); } };
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft(d => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Users className="w-5 h-5 text-brand-700" /> Advisory board</h2>
          <p className="text-sm text-slate-500">Shown on the <a href="/about#advisory-board" target="_blank" rel="noreferrer" className="text-brand-800 font-semibold hover:underline">About page</a> in this order. Hidden members are not shown. Add only people who have agreed to be listed.</p>
        </div>
        {!draft && <button type="button" onClick={() => { setDraft({ ...blank }); setPhoto(null); setRemovePhoto(false); }} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 self-start"><Plus className="w-4 h-4" /> Add member</button>}
      </div>

      {flash && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="status">{flash}</p>}

      {draft && (
        <form onSubmit={save} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">{draft.id ? `Edit ${draft.name}` : 'New member'}</h3><button type="button" aria-label="Cancel" onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-600">Full name *<input className={input} value={draft.name} onChange={set('name')} maxLength={120} placeholder="Dr. A. Kumar" required /></label>
            <label className="text-xs text-slate-600">Role on the board
              <input className={input} value={draft.boardRole} onChange={set('boardRole')} maxLength={60} list="adv-roles" />
              <datalist id="adv-roles">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
            </label>
            <label className="text-xs text-slate-600">Designation<input className={input} value={draft.designation} onChange={set('designation')} maxLength={160} placeholder="Professor and Head, Department of CSE" /></label>
            <label className="text-xs text-slate-600">Organisation<input className={input} value={draft.organization} onChange={set('organization')} maxLength={160} placeholder="University / institute / company" /></label>
            <label className="text-xs text-slate-600 sm:col-span-2">Short bio (optional)<textarea className={input} rows={3} value={draft.bio} onChange={set('bio')} maxLength={600} /></label>
            <label className="text-xs text-slate-600">Profile link (optional)<input className={input} value={draft.profileUrl} onChange={set('profileUrl')} maxLength={300} placeholder="https://www.linkedin.com/in/…" /></label>
            <div className="text-xs text-slate-600">Photo (optional, JPG/PNG/WebP, up to 2 MB)
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">{photo ? photo.name.slice(0, 30) : draft.hadPhoto && !removePhoto ? 'Replace photo' : 'Choose photo'}</button>
                {draft.hadPhoto && !photo && <label className="flex items-center gap-1.5"><input type="checkbox" checked={removePhoto} onChange={e => setRemovePhoto(e.target.checked)} className="accent-brand-700" /> Remove current photo</label>}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Member photo" onChange={e => { setPhoto(e.target.files?.[0] || null); setRemovePhoto(false); }} />
            </div>
          </div>
          {err && <p role="alert" className="text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="px-5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-1.5">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{draft.id ? 'Save changes' : 'Add to board'}</button>
            <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {err && !draft && <p role="alert" className="text-sm text-crimson-700">{err}</p>}
      {list === null ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>
        : !list.length ? <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-sm text-slate-500 text-center">No members yet. The section appears on the About page once you add a member.</p>
        : (
          <ul className="space-y-2">
            {list.map((m, i) => (
              <li key={m.id} className={`p-3 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 ${m.visible ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-75'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {m.photoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0" />
                    : <span className="w-11 h-11 rounded-full bg-brand-50 text-brand-800 grid place-items-center text-sm font-bold shrink-0" aria-hidden="true">{m.name.replace(/^(dr|prof)\.?\s+/i, '')[0]}</span>}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm break-words">{m.name} <span className="text-xs font-semibold text-gold-800">· {m.boardRole}</span>{!m.visible && <span className="ml-1 text-xs font-normal text-slate-500">(hidden)</span>}</div>
                    <div className="text-xs text-slate-500 break-words">{[m.designation, m.organization].filter(Boolean).join(', ')}</div>
                    {m.profileUrl && <a href={m.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-800 inline-flex items-center gap-1 hover:underline">Profile <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button type="button" disabled={busy || i === 0} onClick={() => act(m, { move: 'up' })} aria-label={`Move ${m.name} up`} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" disabled={busy || i === list.length - 1} onClick={() => act(m, { move: 'down' })} aria-label={`Move ${m.name} down`} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button type="button" disabled={busy} onClick={() => act(m, { visible: m.visible ? '0' : '1' })} className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">{m.visible ? <><EyeOff className="w-4 h-4" /> Hide</> : <><Eye className="w-4 h-4" /> Show</>}</button>
                  <button type="button" onClick={() => { setDraft({ id: m.id, name: m.name, boardRole: m.boardRole, designation: m.designation, organization: m.organization, bio: m.bio, profileUrl: m.profileUrl || '', hadPhoto: !!m.photoUrl }); setPhoto(null); setRemovePhoto(false); setErr(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"><Pencil className="w-4 h-4" /> Edit</button>
                  <button type="button" disabled={busy} onClick={() => remove(m)} className="px-2.5 py-2 rounded-lg border border-crimson-100 text-xs text-crimson-700 hover:bg-crimson-50 inline-flex items-center gap-1"><Trash2 className="w-4 h-4" /> Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
