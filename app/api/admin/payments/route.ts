import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { refundPayment, recordOfflinePayment, reconcilePayments } from '@/lib/server/payments';
import type { PaymentProduct } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRODUCTS: PaymentProduct[] = ['candidate_premium', 'institution_premium', 'featured_listing', 'urgent_listing'];

/** Admin payment actions: refund, record an offline payment, check unfinished orders with Razorpay. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (body.action === 'refund') {
    const r = await refundPayment({ paymentId: String(body.paymentId || ''), amount: body.amount === '' || body.amount == null ? undefined : Number(body.amount), note: body.note ? String(body.note) : undefined, endAccess: !!body.endAccess, manual: !!body.manual });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (body.action === 'offline') {
    if (!PRODUCTS.includes(body.product)) return NextResponse.json({ ok: false, error: 'Choose what was bought.' }, { status: 400 });
    const r = await recordOfflinePayment({
      email: String(body.email || ''), product: body.product, amount: Number(body.amount), method: String(body.method || 'other'),
      reference: body.reference ? String(body.reference) : undefined, paidOn: body.paidOn ? String(body.paidOn) : undefined,
      plan: body.plan, months: body.months ? Number(body.months) : undefined, jobId: body.jobId ? String(body.jobId) : undefined, note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (body.action === 'reconcile') return NextResponse.json({ ok: true, ...(await reconcilePayments()) });
  return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
}
