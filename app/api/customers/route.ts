import { NextRequest, NextResponse } from 'next/server';
import { addCustomer, cleanWebsite, deleteCustomer, listCustomers, MAX_LOGO_BYTES, sniffImage, updateCustomer, Customer } from '@/lib/server/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Writes are for the admin console only (client-side auth in this prototype; the header blocks casual cross-site posts).
import { requireAdmin, sameOrigin } from '@/lib/server/auth';

async function denied(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return requireAdmin(req);
}

function publicView(list: Customer[], all: boolean) {
  return (all ? list : list.filter(c => c.visible)).map(c => ({
    id: c.id, name: c.name, website: c.website, visible: c.visible, order: c.order, addedAt: c.addedAt,
    logoUrl: `/api/customers/logo/${c.id}?v=${encodeURIComponent(c.logoFile)}`,
  }));
}

async function readLogo(file: FormDataEntryValue | null): Promise<{ bytes: Buffer; mimeType: string } | { error: string } | null> {
  if (!file || typeof file === 'string') return null;
  if (file.size > MAX_LOGO_BYTES) return { error: 'Logo must be 1 MB or smaller.' };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffImage(bytes);
  if (!mimeType) return { error: 'Logo must be a PNG, JPG or WebP image.' };
  return { bytes, mimeType };
}

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1' && !(await requireAdmin(req));
  return NextResponse.json(publicView(await listCustomers(), all), { headers: { 'Cache-Control': 'no-store' } });
}

/** Add a customer: multipart form with name, website (optional) and logo. */
export async function POST(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  const name = String(form.get('name') || '').trim();
  if (!name) return NextResponse.json({ error: 'Enter the customer name.' }, { status: 400 });
  const logo = await readLogo(form.get('logo'));
  if (!logo) return NextResponse.json({ error: 'Choose a logo image.' }, { status: 400 });
  if ('error' in logo) return NextResponse.json({ error: logo.error }, { status: 400 });
  await addCustomer(name, cleanWebsite(String(form.get('website') || '')), logo.bytes, logo.mimeType);
  return NextResponse.json(publicView(await listCustomers(), true));
}

/** Edit: multipart form with id and any of name, website, visible ("1"/"0"), move ("up"/"down"), logo. */
export async function PATCH(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  const form = await req.formData().catch(() => null);
  const id = String(form?.get('id') || '');
  if (!form || !id) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const logo = await readLogo(form.get('logo'));
  if (logo && 'error' in logo) return NextResponse.json({ error: logo.error }, { status: 400 });
  const v = form.get('visible');
  const move = form.get('move');
  const list = await updateCustomer(id, {
    name: form.has('name') ? String(form.get('name')) : undefined,
    website: form.has('website') ? String(form.get('website')) : undefined,
    visible: v === '1' ? true : v === '0' ? false : undefined,
    move: move === 'up' || move === 'down' ? move : undefined,
    logo: logo || undefined,
  });
  return NextResponse.json(publicView(list, true));
}

export async function DELETE(req: NextRequest) {
  { const d = await denied(req); if (d) return d; }
  const id = req.nextUrl.searchParams.get('id') || '';
  return NextResponse.json(publicView(await deleteCustomer(id), true));
}
