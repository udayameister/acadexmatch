import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, requireAdmin, sameOrigin } from '@/lib/server/auth';
import { withDb } from '@/lib/server/db';
import { clientIp } from '@/lib/server/security';
import { exportCatalog, exportRows, type ExportRequest } from '@/lib/server/adminExport';
import { buildCsv, buildXlsx } from '@/lib/server/xlsx';
import { StorageService } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: the data sets and fields that can be exported. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ datasets: exportCatalog() }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Administrator: preview (first rows) or download as CSV / Excel, with the chosen fields, field order and row order. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as ExportRequest & { format?: string };
  const body: ExportRequest = {
    dataset: String(b.dataset || ''),
    fields: Array.isArray(b.fields) ? b.fields.map(String).slice(0, 80) : [],
    sort: Array.isArray(b.sort) ? b.sort.slice(0, 3).map(s => ({ field: String(s.field || ''), dir: s.dir === 'desc' ? 'desc' : 'asc' })) : [],
    search: b.search ? String(b.search).slice(0, 100) : '',
  };
  try {
    const out = await exportRows(body);
    if (b.format === 'preview') return NextResponse.json({ header: out.header, rows: out.rows.slice(0, 15), total: out.rows.length }, { headers: { 'Cache-Control': 'no-store' } });
    const format = b.format === 'xlsx' ? 'xlsx' : 'csv';
    // Accountability (DPDP): every export is recorded in the audit log.
    const id = await currentUserId(req);
    if (id) await withDb(id, () => StorageService.addAuditLog(`Exported ${out.rows.length} rows of “${out.label}” as ${format.toUpperCase()} (${out.header.length} fields${body.search ? `, filtered by “${body.search}”` : ''}) from ${clientIp(req)}`, body.dataset, out.personal ? 'PII_ACCESS' : 'JOB_MODERATION')).catch(() => undefined);
    const stamp = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const name = `acadexmatch-${body.dataset}-${stamp}.${format}`;
    if (format === 'xlsx') {
      const buf = buildXlsx(out.label, out.header, out.rows);
      return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
    }
    return new NextResponse(buildCsv(out.header, out.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
