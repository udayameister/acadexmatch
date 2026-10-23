import type { Payment } from '@/types';

/** Human-readable description of what a payment bought (receipts, invoices, audit log). */
export function productLabel(p: Pick<Payment, 'product' | 'instituteName' | 'months' | 'plan' | 'jobTitle' | 'days'>): string {
  if (p.product === 'candidate_premium') return `AcadeXMatch Premium${p.plan === 'scholar' ? ' (research scholar)' : p.plan === 'monthly' ? ' (monthly)' : ''} — ${p.months} month${p.months === 1 ? '' : 's'}`;
  if (p.product === 'institution_premium') return `Institution Premium — ${p.instituteName} — ${p.months} months`;
  return `${p.product === 'featured_listing' ? 'Featured vacancy' : 'Urgent hiring label'} — ${p.jobTitle} — ${p.days} days`;
}

export type PaymentState = 'paid' | 'partly_refunded' | 'refunded' | 'failed' | 'created';

/** Where a payment stands, counting refunds. */
export function paymentState(p: Pick<Payment, 'status' | 'amount' | 'refundedAmount'>): PaymentState {
  if (p.status !== 'paid') return p.status;
  const refunded = p.refundedAmount || 0;
  if (refunded <= 0) return 'paid';
  return refunded >= p.amount ? 'refunded' : 'partly_refunded';
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  paid: 'Paid', partly_refunded: 'Partly refunded', refunded: 'Refunded', failed: 'Failed', created: 'Not completed',
};

export const PAYMENT_STATE_STYLE: Record<PaymentState, string> = {
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  partly_refunded: 'bg-gold-50 text-gold-800 border-gold-200',
  refunded: 'bg-slate-100 text-slate-700 border-slate-200',
  failed: 'bg-crimson-50 text-crimson-700 border-crimson-100',
  created: 'bg-slate-50 text-slate-600 border-slate-200',
};
