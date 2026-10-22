import { NextRequest, NextResponse } from 'next/server';
import { pauseAlert, unsubscribeTokenValid } from '@/lib/server/jobAlerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · AcadeXMatch</title></head>
<body style="margin:0;background:#FFFDF8;font-family:'DM Sans',Arial,sans-serif;color:#5A1020">
<div style="max-width:480px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #EADFD6;border-radius:18px;border-top:4px solid #C6A15B">
<div style="font-weight:bold;font-size:20px;color:#800000">Acade<span style="color:#B48A3E">X</span>Match</div>
<h1 style="font-size:22px;margin:22px 0 10px">${title}</h1><p style="color:#4E3B3F;line-height:1.55">${body}</p>
<p style="margin-top:24px"><a href="/candidate/alerts" style="background:#800000;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Manage job alerts</a></p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** One-click pause from the link at the bottom of a job-alert email. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('a') || '';
  const t = req.nextUrl.searchParams.get('t') || '';
  if (!id || !(await unsubscribeTokenValid(id, t))) return page('Link not valid', 'This link is incomplete or has been changed. Sign in to manage your job alerts.', 400);
  const alert = await pauseAlert(id);
  if (!alert) return page('Alert not found', 'This job alert no longer exists.', 404);
  return page('Alert paused', `You will not get more emails for “${alert.name.replace(/[<>&"]/g, '')}”. You can turn it back on at any time.`);
}
