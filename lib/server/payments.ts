import { createHmac, timingSafeEqual } from 'crypto';
import { STORAGE_KEYS, DEFAULT_PLAN_SETTINGS, DEFAULT_PROMOTION, StorageService, isPremiumUser, isInstituteSubscribed, premiumPlansOf } from '@/lib/storage';
import { withDb, accountOf } from './db';
import { emailLayout, sendMail, appUrl } from './mailer';
import { productLabel } from '@/lib/paymentLabel';
import type { Institute, Job, Payment, PaymentProduct, PlanSettings, PremiumPlanOption, UserAccount } from '@/types';

/*
 * Razorpay payments. Keys come from .env.local (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; optional
 * RAZORPAY_WEBHOOK_SECRET). Orders are created and payments verified here on the server; the browser
 * only opens Razorpay's checkout. A verified payment activates the plan and issues an invoice.
 */

const API = () => (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '');

export function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
export function razorpayPublic() {
  const key = process.env.RAZORPAY_KEY_ID || '';
  return { configured: razorpayConfigured(), keyId: razorpayConfigured() ? key : null, testMode: key.startsWith('rzp_test_'), webhook: !!process.env.RAZORPAY_WEBHOOK_SECRET };
}

function settingsOf(db: Record<string, unknown>): PlanSettings {
  return { ...DEFAULT_PLAN_SETTINGS, ...((db[STORAGE_KEYS.PLAN_SETTINGS] as Partial<PlanSettings>) || {}) };
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function addMonths(fromIso: string, months: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(fromIso: string, days: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface OrderOptions { plan?: PremiumPlanOption['key']; jobId?: string }

/** Creates a Razorpay order for the signed-in user. */
export async function createOrder(userId: string, product: PaymentProduct, opts: OrderOptions = {}): Promise<{ ok: true; order: { id: string; amount: number; currency: string }; payment: Payment; keyId: string } | { ok: false; error: string; status: number }> {
  if (!razorpayConfigured()) return { ok: false, error: 'Online payment is not set up yet. Please send an upgrade request instead.', status: 400 };
  const prep = await withDb(userId, db => {
    const me = accountOf(db, userId);
    if (!me) return { error: 'Please sign in.' };
    const s = settingsOf(db);
    if (product === 'candidate_premium') {
      if (me.role !== 'candidate') return { error: 'Premium is for candidate accounts.' };
      const plans = premiumPlansOf(s);
      const plan = plans.find(p => p.key === opts.plan) || plans.find(p => p.key === 'yearly') || plans[0];
      if (!plan) return { error: 'No Premium plan is available right now.' };
      return { me, amount: Math.round(plan.priceInr), months: plan.months, plan: plan.key };
    }
    if (product === 'featured_listing' || product === 'urgent_listing') {
      if (!(me.role === 'institute_admin' || me.role === 'recruiter') || !me.instituteId) return { error: 'Only institution staff can promote a vacancy.' };
      const job = (db[STORAGE_KEYS.JOBS] as Job[]).find(j => j.id === opts.jobId);
      if (!job || job.instituteId !== me.instituteId) return { error: 'You can only promote your own institute’s vacancies.' };
      if (job.status !== 'published') return { error: 'Only a published vacancy can be promoted.' };
      const inst = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).find(i => i.id === me.instituteId);
      const featured = product === 'featured_listing';
      const amount = Math.round((featured ? s.featuredPriceInr ?? DEFAULT_PROMOTION.featuredPriceInr : s.urgentPriceInr ?? DEFAULT_PROMOTION.urgentPriceInr) || 0);
      const days = (featured ? s.featuredDays : s.urgentDays) || (featured ? DEFAULT_PROMOTION.featuredDays : DEFAULT_PROMOTION.urgentDays);
      return { me, inst, amount, months: 0, days, jobId: job.id, jobTitle: job.title };
    }
    if (me.role !== 'institute_admin' || !me.instituteId) return { error: 'Only an institute administrator can pay for the institution plan.' };
    const inst = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).find(i => i.id === me.instituteId);
    if (!inst) return { error: 'Your account is not linked to an institute.' };
    return { me, inst, amount: Math.round(s.institutionPriceInr || 0), months: s.institutionDurationMonths };
  });
  if ('error' in prep) return { ok: false, error: prep.error!, status: 403 };
  if (!prep.amount || prep.amount < 1) return { ok: false, error: 'The price has not been set. Please contact the administrator.', status: 400 };

  const receipt = `acx_${Date.now().toString(36)}`;
  let order: { id: string; amount: number; currency: string };
  try {
    const r = await fetch(`${API()}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({ amount: prep.amount * 100, currency: 'INR', receipt, notes: { userId, product, instituteId: prep.inst?.id || '' } }),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d?.error?.description || 'Razorpay could not create the order.', status: 502 };
    order = d;
  } catch {
    return { ok: false, error: 'Could not reach Razorpay. Please try again.', status: 502 };
  }

  const payment: Payment = {
    id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId, userName: prep.me.name, userEmail: prep.me.email, product,
    instituteId: prep.inst?.id, instituteName: prep.inst?.name,
    amount: prep.amount, currency: 'INR', months: prep.months, status: 'created',
    plan: 'plan' in prep ? prep.plan : undefined,
    jobId: 'jobId' in prep ? prep.jobId : undefined, jobTitle: 'jobTitle' in prep ? prep.jobTitle : undefined, days: 'days' in prep ? prep.days : undefined,
    razorpayOrderId: order.id, createdAt: new Date().toISOString(),
    testMode: (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_'),
  };
  await withDb(userId, (db, c) => c.set(STORAGE_KEYS.PAYMENTS, [payment, ...((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || [])]));
  return { ok: true, order, payment, keyId: process.env.RAZORPAY_KEY_ID! };
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks the signature Razorpay returns to the browser after a successful payment. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature || '');
}

export function webhookSignatureValid(rawBody: string, signature: string): boolean {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature || '');
}

/**
 * Marks the order paid and activates the plan. Safe to call more than once (checkout callback and
 * webhook may both arrive): only the first call activates.
 */
export async function completePayment(orderId: string, paymentId: string): Promise<{ ok: boolean; payment?: Payment; error?: string; already?: boolean }> {
  const res = await withDb(null, (db, c) => {
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).slice();
    const i = payments.findIndex(p => p.razorpayOrderId === orderId);
    if (i === -1) return { ok: false, error: 'Unknown order.' };
    const p = { ...payments[i] };
    if (p.status === 'paid') return { ok: true, payment: p, already: true };
    const s = settingsOf(db);
    const year = new Date().getFullYear();
    const count = payments.filter(x => x.invoiceNumber?.startsWith(`ACX-${year}-`)).length + 1;
    p.status = 'paid';
    p.razorpayPaymentId = paymentId;
    p.paidAt = new Date().toISOString();
    p.invoiceNumber = `ACX-${year}-${String(count).padStart(4, '0')}`;

    if (p.product === 'candidate_premium') {
      const users = (db[STORAGE_KEYS.USERS] as UserAccount[]).slice();
      const u = users.find(x => x.id === p.userId);
      if (u) {
        const start = isPremiumUser(u) && u.premiumUntil ? u.premiumUntil : todayIso();
        const until = addMonths(start, p.months || s.premiumDurationMonths);
        Object.assign(u, { plan: 'premium', premiumUntil: until });
        p.activeUntil = until;
        c.set(STORAGE_KEYS.USERS, users);
        const reqs = ((db[STORAGE_KEYS.UPGRADE_REQUESTS] as { userId: string; status: string }[]) || [])
          .map(r => (r.userId === p.userId && r.status === 'pending' ? { ...r, status: 'approved', resolvedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) } : r));
        c.set(STORAGE_KEYS.UPGRADE_REQUESTS, reqs);
      }
    } else if (p.product === 'featured_listing' || p.product === 'urgent_listing') {
      const jobs = (db[STORAGE_KEYS.JOBS] as Job[]).slice();
      const job = jobs.find(j => j.id === p.jobId);
      if (job) {
        const field = p.product === 'featured_listing' ? 'featuredUntil' : 'urgentUntil';
        const cur = job[field];
        const start = cur && cur >= todayIso() ? cur : todayIso();
        const until = addDays(start, p.days || 30);
        job[field] = until;
        p.activeUntil = until;
        c.set(STORAGE_KEYS.JOBS, jobs);
      }
    } else if (p.instituteId) {
      const insts = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).slice();
      const inst = insts.find(x => x.id === p.instituteId);
      if (inst) {
        const cur = inst.subscription;
        const start = isInstituteSubscribed(inst) && cur?.activeUntil ? cur.activeUntil : todayIso();
        const until = addMonths(start, p.months || s.institutionDurationMonths);
        inst.subscription = { ...(cur || {}), status: 'active', activeUntil: until, activatedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) };
        p.activeUntil = until;
        c.set(STORAGE_KEYS.INSTITUTES, insts);
      }
    }
    payments[i] = p;
    c.set(STORAGE_KEYS.PAYMENTS, payments);
    c.userId = p.userId;
    StorageService.addAuditLog(`Payment ${paymentId} received: ₹${p.amount} for ${productLabel(p)}, active until ${p.activeUntil}`, p.id, 'AUTHENTICATION');
    return { ok: true, payment: p };
  });
  if (res.ok && res.payment && !res.already) sendReceipt(res.payment).catch(() => undefined);
  return res;
}

export async function markFailed(orderId: string): Promise<void> {
  await withDb(null, (db, c) => {
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).map(p => (p.razorpayOrderId === orderId && p.status === 'created' ? { ...p, status: 'failed' as const } : p));
    c.set(STORAGE_KEYS.PAYMENTS, payments);
  });
}

async function sendReceipt(p: Payment) {
  const what = productLabel(p);
  const { html, text } = emailLayout({
    heading: 'Payment received — thank you!',
    paragraphs: [
      `Hello ${p.userName},`,
      `We received your payment of ₹${p.amount.toLocaleString('en-IN')} for ${what}. It is active until ${p.activeUntil}.`,
      `Invoice ${p.invoiceNumber} · Razorpay payment ${p.razorpayPaymentId}`,
    ],
    button: { label: 'View invoice', url: `${appUrl()}/invoice/${p.id}` },
  });
  await sendMail({ to: p.userEmail, subject: `Receipt ${p.invoiceNumber} — ${what}`, text, html, kind: 'receipt' });
}

// ------------------------------------------------------------------ renewal reminders

const REMINDERS_KEY = '_renewal_reminders';

/** Emails people whose plan ends in 7 days or 1 day. Each reminder is sent once. */
export async function sendRenewalReminders(): Promise<number> {
  const due = await withDb(null, (db, c) => {
    const sent = { ...((db[REMINDERS_KEY] as Record<string, string>) || {}) };
    const today = todayIso();
    const inDays = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const out: { to: string; name: string; what: string; until: string; days: number }[] = [];
    for (const u of (db[STORAGE_KEYS.USERS] as UserAccount[])) {
      if (u.role !== 'candidate' || u.plan !== 'premium' || !u.premiumUntil) continue;
      const d = inDays(u.premiumUntil);
      const key = `u:${u.id}:${u.premiumUntil}:${d}`;
      if ((d === 7 || d === 1) && !sent[key]) { sent[key] = today; out.push({ to: u.email, name: u.name, what: 'your AcadeXMatch Premium plan', until: u.premiumUntil, days: d }); }
    }
    for (const inst of (db[STORAGE_KEYS.INSTITUTES] as Institute[])) {
      const until = inst.subscription?.status === 'active' ? inst.subscription.activeUntil : undefined;
      if (!until) continue;
      const d = inDays(until);
      const key = `i:${inst.id}:${until}:${d}`;
      if ((d === 7 || d === 1) && !sent[key]) {
        sent[key] = today;
        for (const staff of (db[STORAGE_KEYS.USERS] as UserAccount[]).filter(x => x.role === 'institute_admin' && x.instituteId === inst.id)) {
          out.push({ to: staff.email, name: staff.name, what: `the Institution Premium subscription for ${inst.name}`, until, days: d });
        }
      }
    }
    c.set(REMINDERS_KEY, sent);
    return out;
  });
  for (const r of due) {
    const { html, text } = emailLayout({
      heading: r.days === 1 ? 'Your plan ends tomorrow' : 'Your plan ends in 7 days',
      paragraphs: [`Hello ${r.name},`, `This is a reminder that ${r.what} ends on ${r.until}. Renew now to keep uninterrupted access.`],
      button: { label: 'Renew now', url: `${appUrl()}/premium` },
    });
    await sendMail({ to: r.to, subject: r.days === 1 ? 'Your AcadeXMatch plan ends tomorrow' : 'Your AcadeXMatch plan ends in 7 days', text, html, kind: 'renewal' });
  }
  return due.length;
}
