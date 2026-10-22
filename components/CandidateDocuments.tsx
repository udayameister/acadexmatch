'use client';

import React, { useRef, useState } from 'react';
import {
  CandidateDocument, DocumentCategory, DocumentCategoryInfo, DOCUMENT_CATEGORIES, addDocument, deleteDocument, downloadDocument,
  formatBytes, missingRequired, openDocument, renameDocument, useDocuments, useProfilePhoto,
} from '@/lib/documents';
import { CheckCircle2, Circle, Download, Eye, FileText, ImageIcon, Loader2, Trash2, Upload, UserRound, AlertCircle } from 'lucide-react';

function requirementLabel(c: DocumentCategoryInfo, hasExperience: boolean): string {
  if (c.required === 'always') return 'Required';
  if (c.required === 'if-experience') return hasExperience ? 'Required' : 'If applicable';
  return 'Optional';
}

function DocIcon({ doc }: { doc: CandidateDocument }) {
  return doc.mimeType === 'application/pdf'
    ? <FileText className="w-4 h-4 text-brand-700 shrink-0" aria-hidden="true" />
    : <ImageIcon className="w-4 h-4 text-gold-600 shrink-0" aria-hidden="true" />;
}

/** Round avatar showing the candidate's uploaded photo, or a placeholder. */
export function CandidateAvatar({ userId, name, className = 'w-16 h-16' }: { userId?: string; name?: string; className?: string }) {
  const url = useProfilePhoto(userId);
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt={name ? `Photo of ${name}` : 'Profile photo'} className={`${className} rounded-full object-cover border-2 border-white shadow ring-1 ring-slate-200 shrink-0`} />
    : <span className={`${className} rounded-full bg-brand-50 border border-brand-100 text-brand-300 grid place-items-center shrink-0`} aria-hidden="true"><UserRound className="w-1/2 h-1/2" /></span>;
}

/** Checklist of required proofs, for the profile sidebar and dashboard. */
export function DocumentChecklist({ userId, hasExperience, compact = false }: { userId: string; hasExperience: boolean; compact?: boolean }) {
  const { docs, ready } = useDocuments(userId);
  if (!ready) return null;
  const missing = missingRequired(docs, hasExperience);
  const required = DOCUMENT_CATEGORIES.filter(c => c.required === 'always' || (c.required === 'if-experience' && hasExperience));
  return (
    <div className={compact ? '' : 'rounded-3xl bg-white border border-slate-200 p-6 shadow-sm'}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-slate-900">Document proofs</h3>
        <span className={`text-sm font-bold ${missing.length ? 'text-gold-700' : 'text-emerald-700'}`}>{required.length - missing.length}/{required.length}</span>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {DOCUMENT_CATEGORIES.map(c => {
          const count = docs.filter(d => d.category === c.key).length;
          const isRequired = c.required === 'always' || (c.required === 'if-experience' && hasExperience);
          return (
            <li key={c.key} className="flex items-center gap-2">
              {count > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className={`w-4 h-4 shrink-0 ${isRequired ? 'text-gold-500' : 'text-slate-300'}`} />}
              <a href="#documents" className="flex-1 text-slate-700 hover:text-brand-900">{c.title}</a>
              <span className="text-xs text-slate-500">{count > 0 ? count : isRequired ? 'Needed' : 'Optional'}</span>
            </li>
          );
        })}
      </ul>
      {!compact && (missing.length
        ? <p className="mt-3 text-xs text-gold-800 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2">Upload the missing proofs so institutions can verify your profile.</p>
        : <p className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">All required proofs uploaded.</p>)}
    </div>
  );
}

/** Upload / manage area used on the candidate profile page. */
export function DocumentUploader({ userId, hasExperience }: { userId: string; hasExperience: boolean }) {
  const { docs, ready, error: loadError } = useDocuments(userId);
  const [busy, setBusy] = useState<DocumentCategory | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const inputs = useRef<Partial<Record<DocumentCategory, HTMLInputElement | null>>>({});

  const upload = async (category: DocumentCategory, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(category);
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      try { await addDocument(userId, category, f); } catch (e) { errs.push((e as Error).message); }
    }
    setErrors(errs);
    setBusy(null);
  };

  const remove = async (doc: CandidateDocument) => {
    if (!confirm(`Remove "${doc.label}"?`)) return;
    await deleteDocument(doc.id);
  };

  if (!ready) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-700" /></div>;
  if (loadError) return <p className="text-sm text-crimson-700">{loadError}</p>;

  const photo = docs.find(d => d.category === 'photo');

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 space-y-1" role="alert">
          {errors.map(e => <div key={e} className="flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{e}</div>)}
        </div>
      )}

      {DOCUMENT_CATEGORIES.map(c => {
        const list = docs.filter(d => d.category === c.key);
        const req = requirementLabel(c, hasExperience);
        const accept = c.imagesOnly ? 'image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp';
        return (
          <div key={c.key} className={`p-4 rounded-2xl border ${list.length ? 'border-slate-200 bg-ivory' : req === 'Required' ? 'border-gold-200 bg-gold-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                {c.key === 'photo' && <CandidateAvatar userId={userId} className="w-14 h-14" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-sm">{c.title}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${req === 'Required' ? (list.length ? 'bg-emerald-50 text-emerald-700' : 'bg-gold-100 text-gold-800') : 'bg-slate-100 text-slate-600'}`}>
                      {list.length && req === 'Required' ? 'Done' : req}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.hint} {c.imagesOnly ? 'Max 2 MB.' : 'PDF or image, max 5 MB each.'}</p>
                </div>
              </div>
              <div className="shrink-0">
                <input
                  ref={el => { inputs.current[c.key] = el; }}
                  type="file"
                  accept={accept}
                  multiple={!c.single}
                  className="sr-only"
                  id={`upload-${c.key}`}
                  onChange={e => { upload(c.key, e.target.files); e.target.value = ''; }}
                />
                <button
                  type="button"
                  onClick={() => inputs.current[c.key]?.click()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  {busy === c.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {c.single && photo ? 'Replace photo' : c.single ? 'Upload photo' : list.length ? 'Add more' : 'Upload'}
                </button>
              </div>
            </div>

            {list.length > 0 && c.key !== 'photo' && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white border border-slate-200">
                {list.map(d => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                    <DocIcon doc={d} />
                    <input
                      defaultValue={d.label}
                      aria-label="Document name"
                      onBlur={e => { if (e.target.value.trim() && e.target.value !== d.label) renameDocument(d, e.target.value); }}
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 rounded px-1 -mx-1 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <span className="hidden sm:inline text-xs text-slate-500 shrink-0">{formatBytes(d.size)}</span>
                    <button type="button" onClick={() => openDocument(d)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50" title="View" aria-label={`View ${d.label}`}><Eye className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(d)} className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" title="Remove" aria-label={`Remove ${d.label}`}><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            {c.key === 'photo' && photo && (
              <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                {photo.fileName} · {formatBytes(photo.size)}
                <button type="button" onClick={() => remove(photo)} className="text-crimson-700 hover:underline">Remove</button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-slate-500">Files are kept in this browser on this device and are shown to institutions you apply to. Uploads save immediately.</p>
    </div>
  );
}

/** Read-only list for institutions and the admin. */
export function DocumentList({ userId, allowDelete = false }: { userId: string; allowDelete?: boolean }) {
  const { docs, ready } = useDocuments(userId);
  if (!ready) return <Loader2 className="w-4 h-4 animate-spin text-brand-700" />;
  const files = docs.filter(d => d.category !== 'photo');
  if (files.length === 0) return <p className="text-sm text-slate-500">No certificates uploaded yet.</p>;
  return (
    <div className="space-y-3">
      {DOCUMENT_CATEGORIES.filter(c => c.key !== 'photo').map(c => {
        const list = files.filter(d => d.category === c.key);
        if (!list.length) return null;
        return (
          <div key={c.key}>
            <div className="text-xs font-semibold text-slate-600 mb-1">{c.title}</div>
            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {list.map(d => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <DocIcon doc={d} />
                  <span className="flex-1 min-w-0 truncate text-slate-900">{d.label}</span>
                  <span className="text-xs text-slate-500 shrink-0">{formatBytes(d.size)}</span>
                  <button type="button" onClick={() => openDocument(d)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50" aria-label={`View ${d.label}`} title="View"><Eye className="w-4 h-4" /></button>
                  <button type="button" onClick={() => downloadDocument(d)} className="p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50" aria-label={`Download ${d.label}`} title="Download"><Download className="w-4 h-4" /></button>
                  {allowDelete && (
                    <button type="button" onClick={() => { if (confirm(`Delete "${d.label}"?`)) deleteDocument(d.id); }} className="p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50" aria-label={`Delete ${d.label}`} title="Delete"><Trash2 className="w-4 h-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
