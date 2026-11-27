import React from 'react';
import { ExternalLink } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import FundingCalendar from '@/components/FundingCalendar';
import { getToolsData } from '@/lib/server/toolsData';
import { FUNDING_PORTALS, fmtDate, todayIst } from '@/lib/toolsData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FundingCalendarPage() {
  const d = await getToolsData();
  const today = todayIst();
  return (
    <ToolPage slug="funding-calendar" title="Research funding and fellowship calendar"
      intro={<>Open calls for <strong>research grants and fellowships</strong> in India — ANRF, DST, ICSSR, ICMR, DRDO, UGC and others — with who can apply, the support offered and the <strong>deadline</strong>, nearest first. Every entry links to the official notice.</>}
      notes={<>
        <p>Each call was read from the funder’s notice or a page quoting it, on the date shown as “checked”. Funders often extend or change dates, so confirm on the official notice before you apply. Times are Indian Standard Time.</p>
        <p>Last updated {fmtDate(d.updatedAt.slice(0, 10))}. Know of a call that is missing? Write to <a className="underline" href="mailto:info@acadexmatch.com?subject=Funding%20call%20for%20the%20calendar">info@acadexmatch.com</a> with the link.</p>
      </>}>
      <FundingCalendar calls={d.calls} today={today} />
      <section className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-2">
        <h2 className="font-semibold text-slate-900">Where funders announce new calls</h2>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {FUNDING_PORTALS.map(p => <li key={p.url}><a className="text-brand-700 hover:underline inline-flex items-center gap-1" href={p.url} target="_blank" rel="noopener noreferrer">{p.name} <ExternalLink className="w-3 h-3" /></a></li>)}
        </ul>
      </section>
    </ToolPage>
  );
}
