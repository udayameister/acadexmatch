import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { readSpreadsheet } from '@/lib/server/sheet';
import { importContacts, importWebsites } from '@/lib/server/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Administrator: upload an Excel/CSV list (multipart "file", "kind" = websites | contacts).
 *  - websites: AISHE Code + Website columns; fills in college websites so the contact finder can visit them.
 *  - contacts: Email + AISHE Code or College columns; adds the addresses straight to the contact list.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const kind = String(form?.get('kind') || '');
  const file = form?.get('file');
  if (kind !== 'websites' && kind !== 'contacts') return NextResponse.json({ error: 'Unknown import type.' }, { status: 400 });
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose an Excel (.xlsx) or CSV file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 10 MB. Split it and upload each part.' }, { status: 400 });
  try {
    const rows = readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
    const result = kind === 'websites' ? await importWebsites(rows) : await importContacts(rows);
    return NextResponse.json({ ok: true, kind, file: file.name, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Could not read this file.' }, { status: 400 });
  }
}
