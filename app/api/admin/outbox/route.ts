import { NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/lib/server/db';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { OUTBOX_KEY, OutboxItem, mailSettingsSummary, sendMail, emailLayout } from '@/lib/server/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recent outgoing emails and whether SMTP is set up (admin only). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const items = await withDb(null, db => ((db[OUTBOX_KEY] as OutboxItem[]) || []).slice(0, 200));
  return NextResponse.json({ settings: mailSettingsSummary(), items }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Send a test email: { to }. Or clear the outbox: { clear: true }. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body.clear) {
    await withDb(null, (_db, c) => c.set(OUTBOX_KEY, []));
    return NextResponse.json({ ok: true });
  }
  const to = String(body.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  const { html, text } = emailLayout({ heading: 'Test email', paragraphs: ['This is a test message from your AcadeXMatch admin console. If you can read it, email sending works.'] });
  const r = await sendMail({ to, subject: 'AcadeXMatch test email', text, html, kind: 'test' });
  return NextResponse.json({ ok: r.status !== 'failed', item: r });
}
