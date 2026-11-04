import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { addAdvisor, cleanAdvisor, deleteAdvisor, listAdvisors, MAX_PHOTO_BYTES, publicAdvisor, sniffImage, updateAdvisor, type Advisor } from '@/lib/server/advisory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function denied(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return requireAdmin(req);
}

const view = (list: Advisor[], all: boolean) => (all ? list : list.filter(a => a.visible)).map(publicAdvisor);

async function readPhoto(file: FormDataEntryValue | null): Promise<{ bytes: Buffer; mimeType: string } | { error: string } | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) return { error: 'The photo must be 2 MB or smaller.' };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffImage(bytes);
  if (!mimeType) return { error: 'The photo must be a JPG, PNG or WebP image.' };
  return { bytes, mimeType };
}

const fieldsOf = (f: FormData) => cleanAdvisor({
  name: f.get('name'), boardRole: f.get('boardRole'), designation: f.get('designation'),
  organization: f.get('organization'), bio: f.get('bio'), profileUrl: f.get('profileUrl'),
});

/** Visible members (everyone); ?all=1 includes hidden ones for the administrator. */
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1' && !(await requireAdmin(req));
  return NextResponse.json(view(await listAdvisors(), all), { headers: { 'Cache-Control': 'no-store' } });
}

/** Administrator: add a member (multipart: name, boardRole, designation, organization, bio, profileUrl, photo). */
export async function POST(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const fields = fieldsOf(form);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
  const photo = await readPhoto(form.get('photo'));
  if (photo && 'error' in photo) return NextResponse.json({ error: photo.error }, { status: 400 });
  if ((await listAdvisors()).length >= 60) return NextResponse.json({ error: 'The board can list up to 60 members.' }, { status: 400 });
  await addAdvisor(fields, photo || undefined);
  return NextResponse.json(view(await listAdvisors(), true));
}

/** Administrator: edit (fields), show/hide (visible=1/0), move (up/down), replace or remove the photo. */
export async function PATCH(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  const form = await req.formData().catch(() => null);
  const id = String(form?.get('id') || '');
  if (!form || !id) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  let fields;
  if (form.has('name')) {
    const f = fieldsOf(form);
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    fields = f;
  }
  const photo = await readPhoto(form.get('photo'));
  if (photo && 'error' in photo) return NextResponse.json({ error: photo.error }, { status: 400 });
  const v = form.get('visible'), move = form.get('move');
  const list = await updateAdvisor(id, {
    fields, photo: photo || undefined, removePhoto: form.get('removePhoto') === '1',
    visible: v === '1' ? true : v === '0' ? false : undefined,
    move: move === 'up' || move === 'down' ? move : undefined,
  });
  if (!list) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  return NextResponse.json(view(list, true));
}

export async function DELETE(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  return NextResponse.json(view(await deleteAdvisor(req.nextUrl.searchParams.get('id') || ''), true));
}
