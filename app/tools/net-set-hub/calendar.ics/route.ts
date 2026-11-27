import { NextRequest } from 'next/server';
import { getToolsData } from '@/lib/server/toolsData';
import { ics, noticeWhen } from '@/lib/toolsData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upcoming NET / SET dates (optionally ?exam=ugc-net,csir-net) as an iCalendar file. */
export async function GET(req: NextRequest) {
  const d = await getToolsData();
  const only = (req.nextUrl.searchParams.get('exam') || '').split(',').filter(Boolean);
  const events = d.notices.filter(n => noticeWhen(n) !== 'past' && (!only.length || only.includes(n.examId))).map(n => ({
    uid: `notice-${n.id}`, title: n.title, date: n.date, endDate: n.endDate || undefined, url: n.link, description: n.note,
  }));
  return new Response(ics(events), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="net-set-dates.ics"', 'Cache-Control': 'public, max-age=3600' } });
}
