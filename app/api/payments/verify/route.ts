import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { checkoutSignatureValid, completePayment, markFailed } from '@/lib/server/payments';
import type { Payment } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Called by the browser after Razorpay checkout: verifies the signature and activates the plan. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  const signature = String(body.razorpay_signature || '');
  const owner = await withDb(null, db => ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).find(p => p.razorpayOrderId === orderId)?.userId);
  if (!userId || owner !== userId) return NextResponse.json({ ok: false, error: 'This payment does not belong to your account.' }, { status: 403 });
  if (body.failed) { await markFailed(orderId, typeof body.reason === 'string' ? body.reason : undefined); return NextResponse.json({ ok: true }); }
  if (!checkoutSignatureValid(orderId, paymentId, signature)) {
    return NextResponse.json({ ok: false, error: 'The payment could not be verified. If money was deducted, it will be confirmed automatically or refunded by Razorpay.' }, { status: 400 });
  }
  const r = await completePayment(orderId, paymentId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
