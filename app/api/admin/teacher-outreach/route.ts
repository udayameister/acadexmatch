import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import {
  teacherSummary, listTeachers, teacherFinderPreview, startTeacherFinder, stopTeacherFinder, saveTeacherSettings,
  saveTeacherTemplate, sendTeacherTest, setTeacherSending, removeTeacher, defaultTemplate, testTeacherSite,
} from '@/lib/server/teacherOutreach';
import { suppress } from '@/lib/server/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const noStore = { 'Cache-Control': 'no-store' };

/** Administrator: teacher invitations overview, the address list (?list=1) or a CSV export (?export=csv). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  try {
    const q = { search: sp.get('q') || undefined, status: sp.get('status') || undefined, state: sp.get('state') || undefined };
    if (sp.get('export') === 'csv') {
      const all = [];
      for (let off = 0; off < 100000; off += 200) { const { rows } = await listTeachers({ ...q, limit: 200, offset: off }); all.push(...rows); if (rows.length < 200) break; }
      const csv = ['email,name,designation,department,college,state,status,found_at,sent_at,source_url', ...all.map(r => [r.email, r.name, r.designation, r.department, r.college, r.state, r.status, r.found_at, r.sent_at, r.source_url].map(csvCell).join(','))].join('\n');
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="teacher-invitations.csv"', ...noStore } });
    }
    if (sp.get('list') === '1') return NextResponse.json(await listTeachers({ ...q, limit: Number(sp.get('limit')) || 50, offset: Number(sp.get('offset')) || 0 }), { headers: noStore });
    return NextResponse.json(await teacherSummary(), { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const filter = { state: b.state ? String(b.state) : undefined, category: b.category ? String(b.category) : undefined, recheck: b.recheck === true };
  try {
    switch (b.action) {
      case 'preview': return NextResponse.json({ colleges: await teacherFinderPreview(filter) });
      case 'startFinder': return NextResponse.json({ finder: await startTeacherFinder(filter, Number(b.limit) || 100) });
      case 'testSite': return NextResponse.json(await testTeacherSite(String(b.url || '')));
      case 'stopFinder': await stopTeacherFinder(); return NextResponse.json({ ok: true });
      case 'settings': return NextResponse.json({ settings: await saveTeacherSettings(b as never) });
      case 'template': return NextResponse.json({ template: await saveTeacherTemplate({ subject: String(b.subject || ''), body: String(b.body || '') }) });
      case 'resetTemplate': return NextResponse.json({ template: await saveTeacherTemplate(defaultTemplate()) });
      case 'test': await sendTeacherTest(String(b.to || ''), { subject: b.subject ? String(b.subject) : undefined, body: b.body ? String(b.body) : undefined }); return NextResponse.json({ ok: true });
      case 'start': await setTeacherSending(true); return NextResponse.json({ ok: true });
      case 'pause': await setTeacherSending(false); return NextResponse.json({ ok: true });
      case 'remove': await removeTeacher(String(b.email || '')); return NextResponse.json({ ok: true });
      case 'suppress': await suppress(String(b.value || ''), 'admin (teacher invitations)'); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
