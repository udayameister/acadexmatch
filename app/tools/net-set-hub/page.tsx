import React from 'react';
import Link from 'next/link';
import ToolPage from '@/components/ToolPage';
import NetSetHub from '@/components/NetSetHub';
import { getToolsData } from '@/lib/server/toolsData';
import { fmtDate, todayIst } from '@/lib/toolsData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NetSetHubPage() {
  const d = await getToolsData();
  return (
    <ToolPage slug="net-set-hub" title="NET / SET exam hub"
      intro={<>Dates, application windows, syllabus links and result notices for <strong>UGC-NET</strong>, <strong>CSIR-UGC NET</strong> and the <strong>state eligibility tests</strong> — in one place, with links to the official sites and a calendar file you can add to your phone.</>}
      notes={<>
        <p>Dates are read from the conducting body’s notice or a news report quoting it, on the date shown as “checked”. NTA and the state bodies sometimes change dates and publish subject-wise schedules separately, so always confirm on the official site and in your admit card.</p>
        <p>Qualified already? See which Assistant Professor posts you are eligible for with the <Link className="underline" href="/tools/eligibility-checker">eligibility checker</Link> and your <Link className="underline" href="/tools/ugc-shortlisting-score">UGC shortlisting score</Link>. Last updated {fmtDate(d.updatedAt.slice(0, 10))}.</p>
      </>}>
      <NetSetHub exams={d.exams} notices={d.notices} today={todayIst()} />
    </ToolPage>
  );
}
