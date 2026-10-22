import { NextRequest, NextResponse } from 'next/server';
import { completePayment, markFailed, webhookSignatureValid } from '@/lib/server/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook (Dashboard → Webhooks → URL https://your-site/api/payments/webhook, events
 * payment.captured, order.paid, payment.failed; secret = RAZORPAY_WEBHOOK_SECRET). Activates plans
 * even if the buyer closed the browser before the checkout callback.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!webhookSignatureValid(raw, req.headers.get('x-razorpay-signature') || '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  let evt: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const pay = evt.payload?.payment?.entity;
  if (pay?.order_id && pay.id) {
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') await completePayment(pay.order_id, pay.id);
    else if (evt.event === 'payment.failed') await markFailed(pay.order_id);
  }
  return NextResponse.json({ ok: true });
}
