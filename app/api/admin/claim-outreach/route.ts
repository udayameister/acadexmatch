import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import {
  claimSummary, saveClaimSettings, saveClaimTemplate, defaultClaimTemplate, claimTest, sendClaim, attachClaim, markCalled, setSkip, claimSendDue,
} from '@/lib/server/claimOutreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Administrator: claim-your-listing overview, or the call list as CSV (?export=calls). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const s = await claimSummary();
    if (req.nextUrl.searchParams.get('export') === 'calls') {
      const rows = s.groups.filter(g => g.phones.length && !g.record.attached);
      const csv = ['college,state,city,phones,emails,vacancies,views,emailed,called,note,claim_link',
        ...rows.map(g => [g.college, g.state, g.city, g.phones.join(' / '), g.emails.map(e => e.email).join(' / '), g.jobs.map(j => j.title).join(' | '), g.views, g.record.emails.length, g.record.called || '', g.record.callNote || '', g.claimUrl].map(cell).join(','))].join('\n');
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="claim-call-list.csv"', ...noStore } });
    }
    return NextResponse.json(s, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const key = String(b.key || '');
  try {
    switch (b.action) {
      case 'settings': return NextResponse.json({ settings: await saveClaimSettings(b as never) });
      case 'template': return NextResponse.json({ template: await saveClaimTemplate({ subject: String(b.subject || ''), body: String(b.body || '') }) });
      case 'resetTemplate': return NextResponse.json({ template: await saveClaimTemplate(defaultClaimTemplate()) });
      case 'preview': return NextResponse.json(await claimTest(key, '', { subject: b.subject ? String(b.subject) : undefined, body: b.body ? String(b.body) : undefined }));
      case 'test': return NextResponse.json(await claimTest(key, String(b.to || ''), { subject: b.subject ? String(b.subject) : undefined, body: b.body ? String(b.body) : undefined }));
      case 'send': return NextResponse.json({ sent: await sendClaim(key, { force: !!b.force, to: b.to ? String(b.to) : undefined }) });
      case 'runNow': return NextResponse.json(await claimSendDue());
      case 'attach': return NextResponse.json(await attachClaim(key, String(b.instituteId || '')));
      case 'called': await markCalled(key, String(b.note || '')); return NextResponse.json({ ok: true });
      case 'skip': await setSkip(key, b.skip !== false); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
