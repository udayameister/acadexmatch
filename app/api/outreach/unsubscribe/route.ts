import { NextRequest, NextResponse } from 'next/server';
import { suppress, unsubscribeTokenValid } from '@/lib/server/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const page = (title: string, body: string) => new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} – AcadeXMatch</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#FFFDF8;color:#3A0A14"><div style="max-width:520px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #EADFD6;border-radius:16px">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${body}</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Link in the email: a confirmation page (so mail scanners that open links do not unsubscribe anyone). */
export async function GET(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get('e') || '').toLowerCase(), t = req.nextUrl.searchParams.get('t') || '';
  if (!unsubscribeTokenValid(e, t)) return page('Link not valid', '<p>This unsubscribe link is not valid. Email info@acadexmatch.com and we will remove your address.</p>');
  return page('Unsubscribe', `<p>Stop all emails from AcadeXMatch to <strong>${esc(e)}</strong>?</p>
<form method="post"><input type="hidden" name="e" value="${esc(e)}"><input type="hidden" name="t" value="${esc(t)}">
<button style="background:#800000;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`);
}

/** Form button, or one-click unsubscribe from the mail app (List-Unsubscribe-Post). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const e = String(form?.get('e') || req.nextUrl.searchParams.get('e') || '').toLowerCase();
  const t = String(form?.get('t') || req.nextUrl.searchParams.get('t') || '');
  if (!unsubscribeTokenValid(e, t)) return page('Link not valid', '<p>This unsubscribe link is not valid.</p>');
  await suppress(e, 'Unsubscribed');
  return page('You are unsubscribed', `<p>We will not email <strong>${esc(e)}</strong> again. Sorry for the interruption.</p>`);
}
