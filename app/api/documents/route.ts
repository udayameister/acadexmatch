import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { withDb, accountOf, canViewDocuments, DOCUMENTS_KEY, DOC_DIR, StoredDocument } from '@/lib/server/db';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { STORAGE_KEYS } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORIES = ['photo', 'qualification', 'phd_net', 'experience', 'other'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO = 2 * 1024 * 1024;

function sniff(b: Buffer): string | null {
  if (b.length > 4 && b.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const view = (d: StoredDocument) => ({ id: d.id, userId: d.userId, category: d.category, label: d.label, fileName: d.fileName, mimeType: d.mimeType, size: d.size, uploadedAt: d.uploadedAt, url: `/api/documents/file/${d.id}` });

/** List a user's documents (owner, admin, or staff of an institute the user applied to). */
export async function GET(req: NextRequest) {
  const me = await currentUserId(req);
  if (req.nextUrl.searchParams.get('summary') === '1') {
    // Admin only: per-candidate document counts for the verification queue (no file contents).
    const sum = await withDb(me, db => {
      if (accountOf(db, me)?.role !== 'super_admin') return null;
      const out: Record<string, { count: number; categories: string[]; lastUploadedAt: string }> = {};
      for (const d of (db[DOCUMENTS_KEY] as StoredDocument[]) || []) {
        if (d.category === 'photo') continue;
        const o = (out[d.userId] ||= { count: 0, categories: [], lastUploadedAt: '' });
        o.count++;
        if (!o.categories.includes(d.category)) o.categories.push(d.category);
        if (d.uploadedAt > o.lastUploadedAt) o.lastUploadedAt = d.uploadedAt;
      }
      return out;
    });
    return sum ? NextResponse.json(sum, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  const owner = req.nextUrl.searchParams.get('userId') || me || '';
  const res = await withDb(me, db => {
    if (!canViewDocuments(db, accountOf(db, me), owner)) return null;
    return ((db[DOCUMENTS_KEY] as StoredDocument[]) || []).filter(d => d.userId === owner).map(view);
  });
  return res ? NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Not allowed' }, { status: 403 });
}

/** Upload: candidates for themselves; the admin for anyone. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const me = await currentUserId(req);
  const form = await req.formData().catch(() => null);
  if (!me || !form) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const owner = String(form.get('userId') || me);
  const category = String(form.get('category') || '');
  const file = form.get('file');
  if (!CATEGORIES.includes(category) || !file || typeof file === 'string') return NextResponse.json({ error: 'Choose a file and a document type.' }, { status: 400 });
  const limit = category === 'photo' ? MAX_PHOTO : MAX_BYTES;
  if (file.size > limit) return NextResponse.json({ error: `${file.name} is larger than ${limit / 1024 / 1024} MB.` }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime || (category === 'photo' && mime === 'application/pdf')) {
    return NextResponse.json({ error: `${file.name}: please upload ${category === 'photo' ? 'a JPG, PNG or WebP image' : 'a PDF, JPG, PNG or WebP file'}.` }, { status: 400 });
  }
  const result = await withDb(me, async (db, c) => {
    const actor = accountOf(db, me);
    const ownerAcc = accountOf(db, owner);
    if (!actor || !ownerAcc || (actor.id !== owner && actor.role !== 'super_admin')) return null;
    let docs = ((db[DOCUMENTS_KEY] as StoredDocument[]) || []).slice();
    if (category === 'photo') {
      for (const old of docs.filter(d => d.userId === owner && d.category === 'photo')) {
        await fs.unlink(path.join(DOC_DIR, path.basename(owner), path.basename(old.file))).catch(() => undefined);
      }
      docs = docs.filter(d => !(d.userId === owner && d.category === 'photo'));
    }
    const id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${id}.${EXT[mime]}`;
    await fs.mkdir(path.join(DOC_DIR, path.basename(owner)), { recursive: true });
    await fs.writeFile(path.join(DOC_DIR, path.basename(owner), fileName), bytes);
    const doc: StoredDocument = {
      id, userId: owner, category, label: String(form.get('label') || file.name).trim().slice(0, 120) || file.name,
      fileName: path.basename(file.name).slice(0, 150), mimeType: mime, size: bytes.length, uploadedAt: new Date().toISOString(), file: fileName,
    };
    c.set(DOCUMENTS_KEY, [...docs, doc]);
    void STORAGE_KEYS;
    return view(doc);
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: 'Not allowed' }, { status: 403 });
}

/** Rename (owner or admin). */
export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const me = await currentUserId(req);
  const body = await req.json().catch(() => ({}));
  const ok = await withDb(me, (db, c) => {
    const actor = accountOf(db, me);
    const docs = (db[DOCUMENTS_KEY] as StoredDocument[]) || [];
    const d = docs.find(x => x.id === body.id);
    if (!actor || !d || (actor.id !== d.userId && actor.role !== 'super_admin')) return false;
    const label = String(body.label || '').trim().slice(0, 120);
    if (label) c.set(DOCUMENTS_KEY, docs.map(x => (x.id === d.id ? { ...x, label } : x)));
    return true;
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not allowed' }, { status: 403 });
}

/** Delete (owner or admin). */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const me = await currentUserId(req);
  const id = req.nextUrl.searchParams.get('id');
  const ok = await withDb(me, async (db, c) => {
    const actor = accountOf(db, me);
    const docs = (db[DOCUMENTS_KEY] as StoredDocument[]) || [];
    const d = docs.find(x => x.id === id);
    if (!actor || !d || (actor.id !== d.userId && actor.role !== 'super_admin')) return false;
    await fs.unlink(path.join(DOC_DIR, path.basename(d.userId), path.basename(d.file))).catch(() => undefined);
    c.set(DOCUMENTS_KEY, docs.filter(x => x.id !== d.id));
    return true;
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not allowed' }, { status: 403 });
}
