import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import {
  outreachSummary, listContacts, finderPreview, startFinder, stopFinder, saveSettings, suppress, saveCampaign, deleteCampaign,
  campaignPreviewCount, sendTest, startCampaign, pauseCampaign, launchOfferTemplate,
} from '@/lib/server/outreach';
import { aisheStats } from '@/lib/server/aishe';
import { withDb, accountOf } from '@/lib/server/db';
import { currentUserId } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Administrator: outreach overview, contact list (?contacts=1) or CSV export (?export=csv). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get('export') === 'csv') {
      const { rows } = await listContacts({ state: sp.get('state') || undefined, status: sp.get('status') || undefined, limit: 500, offset: 0 });
      const all = [...rows];
      for (let off = 500; all.length === off && off < 100000; off += 500) all.push(...(await listContacts({ state: sp.get('state') || undefined, status: sp.get('status') || undefined, limit: 500, offset: off })).rows);
      const csv = ['email,aishe_code,college,state,category,role,status,sends,last_sent_at,source_url', ...all.map(r => [r.email, r.aishe_code, r.college, r.state, r.category, r.role, r.status, r.sends, r.last_sent_at, r.source_url].map(csvCell).join(','))].join('\n');
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="outreach-contacts.csv"', 'Cache-Control': 'no-store' } });
    }
    if (sp.get('contacts') === '1') {
      return NextResponse.json(await listContacts({ search: sp.get('q') || undefined, state: sp.get('state') || undefined, status: sp.get('status') || undefined, limit: Number(sp.get('limit')) || 50, offset: Number(sp.get('offset')) || 0 }), { headers: { 'Cache-Control': 'no-store' } });
    }
    const [summary, stats, template] = await Promise.all([outreachSummary(), aisheStats(), launchOfferTemplate()]);
    return NextResponse.json({ ...summary, states: stats.byState.map(s => s.state).filter(Boolean), categories: stats.byCategory.map(c => c.category).filter(Boolean), template }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    switch (b.action) {
      case 'finderPreview': return NextResponse.json({ count: await finderPreview(b.filter || {}) });
      case 'startFinder': return NextResponse.json({ finder: await startFinder(b.filter || {}, Number(b.limit) || 200) });
      case 'stopFinder': await stopFinder(); return NextResponse.json({ ok: true });
      case 'settings': return NextResponse.json({ settings: await saveSettings(b.settings || {}) });
      case 'suppress': await suppress(String(b.value || ''), 'Removed by administrator'); return NextResponse.json({ ok: true });
      case 'saveCampaign': return NextResponse.json({ campaign: await saveCampaign(b.campaign || {}) });
      case 'deleteCampaign': await deleteCampaign(String(b.id || '')); return NextResponse.json({ ok: true });
      case 'previewCampaign': return NextResponse.json({ count: await campaignPreviewCount(b.campaign || {}) });
      case 'test': {
        const userId = await currentUserId(req);
        const me = await withDb(userId, d => accountOf(d, userId));
        if (!me?.email) return NextResponse.json({ error: 'No email address on your account.' }, { status: 400 });
        await sendTest(b.campaign || {}, me.email);
        return NextResponse.json({ ok: true, to: me.email });
      }
      case 'startCampaign': return NextResponse.json({ campaign: await startCampaign(String(b.id || '')) });
      case 'pauseCampaign': await pauseCampaign(String(b.id || '')); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
