import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, requireAdmin, sameOrigin } from '@/lib/server/auth';
import { withDb } from '@/lib/server/db';
import { StorageService } from '@/lib/storage';
import { readSpreadsheet } from '@/lib/server/sheet';
import { aisheStats, importAishe, parseAisheRows } from '@/lib/server/aishe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;

/** Directory size by state and category (admin). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await aisheStats());
}

/**
 * Uploads an AISHE export (.xlsx or .csv, multipart field "file"). Rows are matched by AISHE code:
 * new codes are added, changed rows updated, nothing is deleted. ?preview=1 checks the file only.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose an Excel (.xlsx) or CSV file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 25 MB. Split it by state and upload each part.' }, { status: 400 });
  let parsed;
  try {
    parsed = parseAisheRows(readSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Could not read this file.' }, { status: 400 });
  }
  const summary = {
    file: file.name,
    rows: parsed.records.length,
    columns: parsed.columns,
    duplicates: parsed.duplicates,
    skipped: parsed.skipped.length,
    skippedSample: parsed.skipped.slice(0, 20),
    sample: parsed.records.slice(0, 5),
  };
  if (req.nextUrl.searchParams.get('preview') === '1') return NextResponse.json({ ok: true, preview: true, ...summary });
  if (!parsed.records.length) return NextResponse.json({ error: 'No rows with an AISHE code and institute name were found.', ...summary }, { status: 400 });

  const result = await importAishe(parsed.records);
  const userId = await currentUserId(req);
  await withDb(userId, () => StorageService.addAuditLog(
    `AISHE directory upload "${file.name.slice(0, 80)}": ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged, ${parsed.skipped.length} skipped`,
    'aishe-directory', 'INSTITUTE_VERIFICATION',
  )).catch(() => undefined);
  return NextResponse.json({ ok: true, ...summary, ...result });
}
