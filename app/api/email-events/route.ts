import { NextRequest, NextResponse } from 'next/server';
import { recordDeliveryEvent } from '@/lib/server/notifications';
import { safeEqual } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Delivery webhooks from the email provider (delivered / bounced / complaint).
 * Register https://acadexmatch.com/api/email-events?key=<EMAIL_WEBHOOK_SECRET> as the webhook URL:
 *  - Brevo: Transactional → Settings → Webhooks (events: delivered, hard bounce, soft bounce, spam, blocked, invalid).
 *  - Resend: Webhooks (events: email.delivered, email.bounced, email.complained).
 * Bounced and complained addresses stop receiving optional emails (security emails still go out).
 */
type Ev = 'delivered' | 'bounced' | 'complained' | 'deferred';

function mapBrevo(e: string): Ev | null {
  if (e === 'delivered') return 'delivered';
  if (['hard_bounce', 'hardBounce', 'invalid_email', 'invalid', 'blocked'].includes(e)) return 'bounced';
  if (['spam', 'complaint', 'unsubscribed'].includes(e)) return 'complained';
  if (['soft_bounce', 'softBounce', 'deferred'].includes(e)) return 'deferred';
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET || '';
  if (secret.length < 16 || !safeEqual(req.nextUrl.searchParams.get('key') || '', secret)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | Record<string, unknown>[] | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  const list = Array.isArray(body) ? body : [body];
  let n = 0;
  for (const raw of list.slice(0, 100)) {
    let ev: Ev | null = null, providerId: string | undefined, email: string | undefined;
    if (typeof raw.type === 'string' && raw.type.startsWith('email.')) { // Resend
      const d = (raw.data || {}) as { email_id?: string; to?: string[] };
      ev = raw.type === 'email.delivered' ? 'delivered' : raw.type === 'email.bounced' ? 'bounced' : raw.type === 'email.complained' ? 'complained' : raw.type === 'email.delivery_delayed' ? 'deferred' : null;
      providerId = d.email_id; email = d.to?.[0];
    } else if (typeof raw.event === 'string') { // Brevo
      ev = mapBrevo(raw.event);
      providerId = String(raw['message-id'] || raw.messageId || '') || undefined; email = typeof raw.email === 'string' ? raw.email : undefined;
    }
    if (ev) { await recordDeliveryEvent({ event: ev, providerId, email }); n++; }
  }
  return NextResponse.json({ ok: true, recorded: n });
}
