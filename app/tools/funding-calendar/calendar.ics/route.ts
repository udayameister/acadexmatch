import { getToolsData } from '@/lib/server/toolsData';
import { callStatus, ics } from '@/lib/toolsData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deadlines of open and upcoming calls, to subscribe to or import into Google / Outlook calendars. */
export async function GET() {
  const d = await getToolsData();
  const events = d.calls.filter(c => c.deadline && callStatus(c) !== 'closed').map(c => ({
    uid: `call-${c.id}`, title: `Deadline: ${c.title} (${c.funder})`, date: c.deadline, url: c.link, description: [c.who, c.amount].filter(Boolean).join(' · '),
  }));
  return new Response(ics(events), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="research-funding-deadlines.ics"', 'Cache-Control': 'public, max-age=3600' } });
}
