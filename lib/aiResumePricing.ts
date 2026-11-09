import type { PlanSettings } from '@/types';
import { AI_RESUME_DEFAULT_PREMIUM_PRICE_INR, AI_RESUME_DEFAULT_PRICE_INR } from '@/types';

/** Price (₹, incl. GST) of one AI resume session for this buyer. */
export function aiResumePriceFor(s: Partial<PlanSettings>, premium: boolean): number {
  const full = Math.round(s.aiResumePriceInr ?? AI_RESUME_DEFAULT_PRICE_INR);
  const prem = Math.round(s.aiResumePremiumPriceInr ?? AI_RESUME_DEFAULT_PREMIUM_PRICE_INR);
  return premium ? Math.min(full, prem) : full;
}

/**
 * The lower AI resume price is for candidates on a paid Premium plan. (While every candidate gets Premium
 * free, that blanket access does not count, so the discount only follows an actual Premium plan.)
 */
export function onPaidPremium(u: { role: string; plan?: string; premiumUntil?: string } | null | undefined): boolean {
  if (!u || u.role !== 'candidate' || u.plan !== 'premium') return false;
  return !u.premiumUntil || u.premiumUntil >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
