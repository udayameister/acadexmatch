import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { createOrder, razorpayPublic } from '@/lib/server/payments';
import { CANDIDATE_PREMIUM_FREE } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether online payment is available (public: key id only, never the secret). */
export async function GET() {
  return NextResponse.json(razorpayPublic(), { headers: { 'Cache-Control': 'no-store' } });
}

/** Creates a Razorpay order for { product, plan?, jobId? }. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const PRODUCTS = ['candidate_premium', 'institution_premium', 'featured_listing', 'urgent_listing'] as const;
  const product = PRODUCTS.includes(body.product) ? (body.product as (typeof PRODUCTS)[number]) : 'candidate_premium';
  if (product === 'candidate_premium' && CANDIDATE_PREMIUM_FREE) return NextResponse.json({ error: 'Premium is free for every candidate. Nothing to pay.' }, { status: 400 });
  const plan = ['monthly', 'yearly', 'scholar'].includes(body.plan) ? body.plan : undefined;
  const r = await createOrder(userId, product, { plan, jobId: typeof body.jobId === 'string' ? body.jobId : undefined });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ keyId: r.keyId, orderId: r.order.id, amount: r.order.amount, currency: r.order.currency, paymentId: r.payment.id, name: r.payment.userName, email: r.payment.userEmail });
}
