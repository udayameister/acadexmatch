import type { Payment } from '@/types';

/** Human-readable description of what a payment bought (receipts, invoices, audit log). */
export function productLabel(p: Pick<Payment, 'product' | 'instituteName' | 'months' | 'plan' | 'jobTitle' | 'days'>): string {
  if (p.product === 'candidate_premium') return `AcadeXMatch Premium${p.plan === 'scholar' ? ' (research scholar)' : p.plan === 'monthly' ? ' (monthly)' : ''} — ${p.months} month${p.months === 1 ? '' : 's'}`;
  if (p.product === 'institution_premium') return `Institution Premium — ${p.instituteName} — ${p.months} months`;
  return `${p.product === 'featured_listing' ? 'Featured vacancy' : 'Urgent hiring label'} — ${p.jobTitle} — ${p.days} days`;
}
