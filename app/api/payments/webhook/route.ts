import { NextRequest, NextResponse } from 'next/server';
import { completePayment, markFailed, refundFromWebhook, webhookSignatureValid } from '@/lib/server/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook (Dashboard → Webhooks → URL https://your-site/api/payments/webhook, events
 * payment.captured, order.paid, payment.failed, refund.created, refund.processed, refund.failed; secret =
 * RAZORPAY_WEBHOOK_SECRET). Activates plans even if the buyer closed the browser before the checkout
 * callback, records why payments failed, and records refunds (including ones made in the Razorpay dashboard).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!webhookSignatureValid(raw, req.headers.get('x-razorpay-signature') || '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  type Entity = { id?: string; order_id?: string; payment_id?: string; amount?: number; status?: string; error_description?: string; method?: string; notes?: { reason?: string } };
  let evt: { event?: string; payload?: { payment?: { entity?: Entity }; refund?: { entity?: Entity } } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const pay = evt.payload?.payment?.entity;
  const refund = evt.payload?.refund?.entity;
  if (evt.event?.startsWith('refund.') && refund?.id && refund.payment_id && typeof refund.amount === 'number') {
    await refundFromWebhook({ id: refund.id, payment_id: refund.payment_id, amount: refund.amount, status: refund.status, notes: refund.notes });
  } else if (pay?.order_id && pay.id) {
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') await completePayment(pay.order_id, pay.id, pay.method ? { ...pay, id: pay.id } : undefined);
    else if (evt.event === 'payment.failed') await markFailed(pay.order_id, pay.error_description);
  }
  return NextResponse.json({ ok: true });
}
