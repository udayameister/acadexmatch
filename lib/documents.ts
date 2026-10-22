'use client';

import { useEffect, useState } from 'react';

/**
 * Candidate proof documents (profile photo, certificates), stored on the server (data/documents)
 * and shown only to the candidate, the platform admin and institutions the candidate applied to.
 */

export type DocumentCategory = 'photo' | 'qualification' | 'phd_net' | 'experience' | 'other';

export interface CandidateDocument {
  id: string;
  userId: string;
  category: DocumentCategory;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  /** Server address of the file (access-checked). */
  url: string;
}

export interface DocumentCategoryInfo {
  key: DocumentCategory;
  title: string;
  hint: string;
  required: 'always' | 'if-experience' | 'optional';
  imagesOnly?: boolean;
  single?: boolean;
}

export const DOCUMENT_CATEGORIES: DocumentCategoryInfo[] = [
  { key: 'photo', title: 'Profile photo', hint: 'A recent passport-style photo (JPG or PNG).', required: 'always', imagesOnly: true, single: true },
  { key: 'qualification', title: 'Qualification certificates', hint: 'Degree certificates and mark sheets / transcripts for UG, PG and Ph.D.', required: 'always' },
  { key: 'phd_net', title: 'Ph.D. / NET / SLET / JRF proof', hint: 'Ph.D. award or provisional certificate, NET / SLET / JRF qualifying certificates.', required: 'optional' },
  { key: 'experience', title: 'Experience certificates', hint: 'Appointment, experience or relieving letters for each position you list.', required: 'if-experience' },
  { key: 'other', title: 'Other certificates', hint: 'Awards, fellowships, FDPs, patents, publication proofs and similar.', required: 'optional' },
];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export const DOCS_EVENT = 'acad-docs-updated';

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DOCS_EVENT));
}

/** Returns an error message if the file is not acceptable for this category, otherwise null. */
export function validateFile(file: File, category: DocumentCategory): string | null {
  const info = DOCUMENT_CATEGORIES.find(c => c.key === category)!;
  const allowed = info.imagesOnly ? IMAGE_TYPES : DOC_TYPES;
  if (!allowed.includes(file.type)) {
    return info.imagesOnly ? `${file.name}: please upload a JPG, PNG or WebP image.` : `${file.name}: please upload a PDF, JPG, PNG or WebP file.`;
  }
  const limit = info.imagesOnly ? MAX_PHOTO_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) return `${file.name} is larger than ${limit / 1024 / 1024} MB.`;
  return null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'The document service is unavailable.');
  return d as T;
}

export async function listDocuments(userId: string): Promise<CandidateDocument[]> {
  return api<CandidateDocument[]>(`/api/documents?userId=${encodeURIComponent(userId)}`);
}

export async function addDocument(userId: string, category: DocumentCategory, file: File, label?: string): Promise<CandidateDocument> {
  const error = validateFile(file, category);
  if (error) throw new Error(error);
  const fd = new FormData();
  fd.set('userId', userId);
  fd.set('category', category);
  fd.set('label', (label || file.name.replace(/\.[^.]+$/, '')).trim().slice(0, 120));
  fd.set('file', file);
  const doc = await api<CandidateDocument>('/api/documents', { method: 'POST', body: fd });
  notify();
  return doc;
}

export async function renameDocument(doc: CandidateDocument, label: string): Promise<void> {
  await api('/api/documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, label }) });
  notify();
}

export async function deleteDocument(id: string): Promise<void> {
  await api(`/api/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  notify();
}

/** Uploads one file on behalf of a user (used when moving data from the older browser-only version). */
export async function uploadDocumentFor(userId: string, meta: { category: DocumentCategory; label: string; fileName: string; mimeType: string }, blob: Blob): Promise<void> {
  const fd = new FormData();
  fd.set('userId', userId);
  fd.set('category', meta.category);
  fd.set('label', meta.label);
  fd.set('file', new File([blob], meta.fileName, { type: meta.mimeType }));
  await api('/api/documents', { method: 'POST', body: fd });
}

/** Documents saved by the older browser-only version (IndexedDB), for moving them to the server. */
export function readLegacyBrowserDocuments(): Promise<{ userId: string; category: DocumentCategory; label: string; fileName: string; mimeType: string; blob: Blob }[]> {
  return new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve([]);
    const req = indexedDB.open('acadexmatch-documents', 1);
    req.onupgradeneeded = () => { req.transaction?.abort(); resolve([]); };
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('documents')) { db.close(); return resolve([]); }
      const all = db.transaction('documents').objectStore('documents').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result || []); };
      all.onerror = () => { db.close(); resolve([]); };
    };
  });
}

/** Which required categories are still missing. */
export function missingRequired(docs: CandidateDocument[], hasExperience: boolean): DocumentCategoryInfo[] {
  return DOCUMENT_CATEGORIES.filter(c =>
    (c.required === 'always' || (c.required === 'if-experience' && hasExperience)) &&
    !docs.some(d => d.category === c.key));
}

/** Live list of a user's documents; refreshes whenever documents change. */
export function useDocuments(userId: string | undefined): { docs: CandidateDocument[]; ready: boolean; error: string | null } {
  const [docs, setDocs] = useState<CandidateDocument[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) { setDocs([]); setReady(true); return; }
    let cancelled = false;
    const load = () => listDocuments(userId)
      .then(d => { if (!cancelled) { setDocs(d); setError(null); setReady(true); } })
      .catch(e => { if (!cancelled) { setError(e.message); setReady(true); } });
    load();
    window.addEventListener(DOCS_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(DOCS_EVENT, load); };
  }, [userId]);
  return { docs, ready, error };
}

/** Address of a user's profile photo, or null. */
export function useProfilePhoto(userId: string | undefined): string | null {
  const { docs } = useDocuments(userId);
  return docs.find(d => d.category === 'photo')?.url || null;
}

/** Opens a document in a new tab (PDFs and images display inline in the browser). */
export function openDocument(doc: CandidateDocument): void {
  const w = window.open(doc.url, '_blank');
  if (w) w.opener = null;
  else downloadDocument(doc);
}

export function downloadDocument(doc: CandidateDocument): void {
  const a = document.createElement('a');
  a.href = `${doc.url}${doc.url.includes('?') ? '&' : '?'}download=1`;
  a.download = doc.fileName;
  a.click();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
