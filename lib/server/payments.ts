import { createHmac, timingSafeEqual } from 'crypto';
import { STORAGE_KEYS, DEFAULT_PLAN_SETTINGS, DEFAULT_PROMOTION, StorageService, isPremiumUser, isInstituteSubscribed, premiumPlansOf } from '@/lib/storage';
import { withDb, accountOf } from './db';
import { emailLayout, sendMail, appUrl } from './mailer';
import { productLabel } from '@/lib/paymentLabel';
import type { Institute, Job, Payment, PaymentEvent, PaymentProduct, PaymentRefund, PlanSettings, PremiumPlanOption, UserAccount } from '@/types';

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
    razorpayOrderId: order.id, createdAt: new Date().toISOString(), source: 'razorpay', events: [evt('created', `Order ${order.id}`)],
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

/** One line in a payment's history. */
function evt(type: PaymentEvent['type'], note?: string): PaymentEvent {
  return { at: new Date().toISOString(), type, ...(note ? { note } : {}) };
}

/** Calls the Razorpay API with the account keys. */
async function rzp<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T & { error?: { description?: string } } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${API()}${path}`, {
      method: init.method || 'GET',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

interface RzpPayment {
  id: string; order_id?: string; status?: string; method?: string; bank?: string; wallet?: string;
  fee?: number; tax?: number; error_description?: string; card?: { network?: string; last4?: string; type?: string };
}

/** Payment method, charges and status as Razorpay reports them (best effort; never blocks activation). */
async function paymentDetails(paymentId: string): Promise<Partial<Payment>> {
  if (!razorpayConfigured()) return {};
  try {
    const r = await rzp<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}?expand[]=card`);
    if (!r.ok) return {};
    return methodFields(r.data);
  } catch {
    return {};
  }
}

function methodFields(d: RzpPayment): Partial<Payment> {
  const m = d.method || '';
  const detail =
    m === 'card' && d.card ? `${d.card.network || 'Card'} ${d.card.type || ''} card${d.card.last4 ? ` ····${d.card.last4}` : ''}`.replace(/\s+/g, ' ')
      : m === 'netbanking' ? `${d.bank || ''} net banking`.trim()
        : m === 'wallet' ? `${d.wallet || ''} wallet`.trim()
          : m === 'upi' ? 'UPI'
            : m === 'emi' ? 'EMI' : m;
  return {
    ...(m ? { method: m, methodDetail: detail } : {}),
    ...(typeof d.fee === 'number' ? { gatewayFee: d.fee / 100 } : {}),
    ...(typeof d.tax === 'number' ? { gatewayTax: d.tax / 100 } : {}),
  };
}

function nextInvoiceNumber(payments: Payment[]): string {
  const year = new Date().getFullYear();
  const used = payments.map(x => x.invoiceNumber).filter((n): n is string => !!n && n.startsWith(`ACX-${year}-`)).map(n => Number(n.split('-')[2]) || 0);
  return `ACX-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(4, '0')}`;
}

/** Turns on what the payment bought and sets p.activeUntil. */
function activate(db: Record<string, unknown>, c: { set: (k: string, v: unknown) => void }, p: Payment): void {
  const s = settingsOf(db);
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
}

/** Takes back the time this payment added (used after a full refund, when the admin asks for it). */
function revoke(db: Record<string, unknown>, c: { set: (k: string, v: unknown) => void }, p: Payment): string {
  const done = (note: string, until?: string) => { if (until) p.activeUntil = until; return note; };
  const today = todayIso();
  if (p.product === 'candidate_premium') {
    const users = (db[STORAGE_KEYS.USERS] as UserAccount[]).slice();
    const u = users.find(x => x.id === p.userId);
    if (!u?.premiumUntil) return 'Nothing left to end';
    const until = addMonths(u.premiumUntil, -(p.months || 0));
    if (until <= today) Object.assign(u, { plan: 'free', premiumUntil: undefined }); else u.premiumUntil = until;
    c.set(STORAGE_KEYS.USERS, users);
    return until <= today ? done('Premium ended', today) : done(`Premium shortened to ${until}`, until);
  }
  if (p.product === 'featured_listing' || p.product === 'urgent_listing') {
    const jobs = (db[STORAGE_KEYS.JOBS] as Job[]).slice();
    const job = jobs.find(j => j.id === p.jobId);
    const field = p.product === 'featured_listing' ? 'featuredUntil' : 'urgentUntil';
    if (!job?.[field]) return 'Nothing left to end';
    const until = addDays(job[field]!, -(p.days || 0));
    job[field] = until <= today ? null : until;
    c.set(STORAGE_KEYS.JOBS, jobs);
    return until <= today ? done('Promotion ended', today) : done(`Promotion shortened to ${until}`, until);
  }
  const insts = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).slice();
  const inst = insts.find(x => x.id === p.instituteId);
  if (!inst?.subscription?.activeUntil) return 'Nothing left to end';
  const until = addMonths(inst.subscription.activeUntil, -(p.months || 0));
  inst.subscription = until <= today ? { ...inst.subscription, status: 'inactive', activeUntil: until } : { ...inst.subscription, activeUntil: until };
  c.set(STORAGE_KEYS.INSTITUTES, insts);
  return until <= today ? done('Subscription ended', today) : done(`Subscription shortened to ${until}`, until);
}

/**
 * Marks the order paid and activates the plan. Safe to call more than once (checkout callback and
 * webhook may both arrive): only the first call activates.
 */
export async function completePayment(orderId: string, paymentId: string, known?: RzpPayment): Promise<{ ok: boolean; payment?: Payment; error?: string; already?: boolean }> {
  const details = known ? methodFields(known) : await paymentDetails(paymentId);
  const res = await withDb(null, (db, c) => {
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).slice();
    const i = payments.findIndex(p => p.razorpayOrderId === orderId);
    if (i === -1) return { ok: false, error: 'Unknown order.' };
    const p: Payment = { ...payments[i] };
    if (p.status === 'paid') {
      // Fill in method/charges if the first confirmation did not have them.
      if (!p.method && details.method) { payments[i] = { ...p, ...details }; c.set(STORAGE_KEYS.PAYMENTS, payments); }
      return { ok: true, payment: p, already: true };
    }
    Object.assign(p, details);
    p.status = 'paid';
    p.razorpayPaymentId = paymentId;
    p.paidAt = new Date().toISOString();
    p.invoiceNumber = nextInvoiceNumber(payments);
    p.failureReason = undefined;
    activate(db, c, p);
    p.events = [...(p.events || []), evt('paid', `${details.methodDetail || 'Online'} · ${paymentId}`)];
    payments[i] = p;
    c.set(STORAGE_KEYS.PAYMENTS, payments);
    c.userId = p.userId;
    StorageService.addAuditLog(`Payment ${paymentId} received: ₹${p.amount} for ${productLabel(p)}, active until ${p.activeUntil}`, p.id, 'AUTHENTICATION');
    return { ok: true, payment: p };
  });
  if (res.ok && res.payment && !res.already) sendReceipt(res.payment).catch(() => undefined);
  return res;
}

export async function markFailed(orderId: string, reason?: string): Promise<void> {
  await withDb(null, (db, c) => {
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).map(p => (p.razorpayOrderId === orderId && p.status === 'created'
      ? { ...p, status: 'failed' as const, failureReason: reason?.slice(0, 300) || p.failureReason, events: [...(p.events || []), evt('failed', reason?.slice(0, 300))] }
      : p));
    c.set(STORAGE_KEYS.PAYMENTS, payments);
  });
}

// ------------------------------------------------------------------ refunds

/** Saves a refund on the payment (once per refund id). Returns the updated payment, or null if unknown. */
async function saveRefund(match: (p: Payment) => boolean, refund: PaymentRefund, endAccess = false): Promise<Payment | null> {
  return withDb(null, (db, c) => {
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).slice();
    const i = payments.findIndex(match);
    if (i === -1) return null;
    const p: Payment = { ...payments[i] };
    const refunds = [...(p.refunds || [])];
    const j = refunds.findIndex(r => r.id === refund.id);
    if (j === -1) {
      refunds.push(refund);
      p.events = [...(p.events || []), evt('refund', `₹${refund.amount} ${refund.status}${refund.note ? ` — ${refund.note}` : ''}`)];
    } else if (refunds[j].status !== refund.status) {
      refunds[j] = { ...refunds[j], status: refund.status };
      p.events = [...(p.events || []), evt('refund', `Refund ${refund.id} ${refund.status}`)];
    } else return p;
    p.refunds = refunds;
    p.refundedAmount = Math.round(refunds.filter(r => r.status !== 'failed').reduce((a, r) => a + r.amount, 0) * 100) / 100;
    if (endAccess) p.events = [...p.events!, evt('access_ended', revoke(db, c, p))];
    payments[i] = p;
    c.set(STORAGE_KEYS.PAYMENTS, payments);
    c.userId = null;
    StorageService.addAuditLog(`Refund of ₹${refund.amount} recorded for invoice ${p.invoiceNumber} (${refund.status})`, p.id, 'AUTHENTICATION');
    return p;
  });
}

/** Admin: refunds all or part of a paid order (through Razorpay, or recorded as done outside Razorpay). */
export async function refundPayment(input: { paymentId: string; amount?: number; note?: string; endAccess?: boolean; manual?: boolean }): Promise<{ ok: boolean; error?: string; payment?: Payment }> {
  const p = await withDb(null, db => ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).find(x => x.id === input.paymentId));
  if (!p || p.status !== 'paid') return { ok: false, error: 'Only a paid order can be refunded.' };
  const left = Math.round((p.amount - (p.refundedAmount || 0)) * 100) / 100;
  const amount = input.amount === undefined || input.amount === null ? left : Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0) || amount > left) return { ok: false, error: `Enter an amount between ₹1 and ₹${left}.` };
  const note = (input.note || '').trim().slice(0, 200) || undefined;
  const fullRefund = amount === left;
  let refund: PaymentRefund;
  if (input.manual || p.source === 'offline') {
    refund = { id: `manual-${Date.now().toString(36)}`, amount, at: new Date().toISOString(), status: 'processed', note, manual: true };
  } else {
    if (!razorpayConfigured() || !p.razorpayPaymentId) return { ok: false, error: 'Razorpay is not connected.' };
    const r = await rzp<{ id: string; amount: number; status: string }>(`/payments/${encodeURIComponent(p.razorpayPaymentId)}/refund`, {
      method: 'POST', body: { amount: Math.round(amount * 100), notes: { reason: note || 'Refund by AcadeXMatch', invoice: p.invoiceNumber || '' } },
    });
    if (!r.ok) return { ok: false, error: r.data?.error?.description || 'Razorpay refused the refund.' };
    refund = { id: r.data.id, amount: r.data.amount / 100, at: new Date().toISOString(), status: r.data.status === 'processed' ? 'processed' : 'pending', note };
  }
  const saved = await saveRefund(x => x.id === p.id, refund, !!input.endAccess && fullRefund);
  if (!saved) return { ok: false, error: 'Payment not found.' };
  sendRefundEmail(saved, refund).catch(() => undefined);
  return { ok: true, payment: saved };
}

/** Webhook: a refund created or processed in Razorpay (also ones started from the Razorpay dashboard). */
export async function refundFromWebhook(r: { id: string; payment_id: string; amount: number; status?: string; notes?: { reason?: string } }): Promise<void> {
  const status: PaymentRefund['status'] = r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending';
  const saved = await saveRefund(x => x.razorpayPaymentId === r.payment_id, { id: r.id, amount: r.amount / 100, at: new Date().toISOString(), status, note: r.notes?.reason });
  void saved;
}

// ------------------------------------------------------------------ offline payments

/** Admin: records money received outside Razorpay (bank transfer, UPI to the account, cheque, cash), activates the plan and issues an invoice. */
export async function recordOfflinePayment(input: {
  email: string; product: PaymentProduct; amount: number; method: string; reference?: string; paidOn?: string;
  plan?: PremiumPlanOption['key']; months?: number; jobId?: string; note?: string;
}): Promise<{ ok: boolean; error?: string; payment?: Payment }> {
  const res = await withDb(null, (db, c) => {
    const users = db[STORAGE_KEYS.USERS] as UserAccount[];
    const u = users.find(x => x.email.toLowerCase() === String(input.email || '').trim().toLowerCase());
    if (!u) return { ok: false, error: 'No account with that email.' };
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!(amount > 0)) return { ok: false, error: 'Enter the amount received.' };
    const s = settingsOf(db);
    const methods: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash', other: 'Other' };
    const method = methods[input.method] ? input.method : 'other';
    const reference = (input.reference || '').trim().slice(0, 80);
    const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn || '') ? input.paidOn! : todayIso();
    const p: Payment = {
      id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      userId: u.id, userName: u.name, userEmail: u.email, product: input.product,
      amount, currency: 'INR', months: 0, status: 'paid', source: 'offline',
      razorpayOrderId: '', createdAt: new Date().toISOString(), paidAt: new Date(`${paidOn}T12:00:00+05:30`).toISOString(),
      method, methodDetail: `${methods[method]}${reference ? ` · ref ${reference}` : ''}`,
    };
    if (input.product === 'candidate_premium') {
      if (u.role !== 'candidate') return { ok: false, error: 'Candidate Premium is for candidate accounts.' };
      const plan = premiumPlansOf(s).find(x => x.key === input.plan);
      p.plan = plan?.key; p.months = Math.max(1, Math.round(Number(input.months) || plan?.months || s.premiumDurationMonths));
    } else if (input.product === 'institution_premium') {
      const inst = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).find(i => i.id === u.instituteId);
      if (!inst) return { ok: false, error: 'That account is not linked to an institute.' };
      p.instituteId = inst.id; p.instituteName = inst.name; p.months = Math.max(1, Math.round(Number(input.months) || s.institutionDurationMonths));
    } else {
      const job = (db[STORAGE_KEYS.JOBS] as Job[]).find(j => j.id === input.jobId);
      if (!job || job.instituteId !== u.instituteId) return { ok: false, error: 'Choose a vacancy of that account’s institute.' };
      const inst = (db[STORAGE_KEYS.INSTITUTES] as Institute[]).find(i => i.id === job.instituteId);
      const featured = input.product === 'featured_listing';
      p.instituteId = inst?.id; p.instituteName = inst?.name; p.jobId = job.id; p.jobTitle = job.title;
      p.days = Math.max(1, Math.round(Number(input.months) || (featured ? s.featuredDays : s.urgentDays) || 30));
    }
    const payments = ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || []).slice();
    p.invoiceNumber = nextInvoiceNumber(payments);
    activate(db, c, p);
    p.events = [evt('created', 'Recorded by the administrator'), evt('paid', `${p.methodDetail}${input.note ? ` — ${input.note.slice(0, 200)}` : ''}`)];
    c.set(STORAGE_KEYS.PAYMENTS, [p, ...payments]);
    c.userId = null;
    StorageService.addAuditLog(`Offline payment recorded: ₹${amount} from ${u.email} for ${productLabel(p)}`, p.id, 'AUTHENTICATION');
    return { ok: true, payment: p };
  });
  if (res.ok && res.payment) sendReceipt(res.payment).catch(() => undefined);
  return res;
}

// ------------------------------------------------------------------ reconciliation

/**
 * Checks unfinished orders with Razorpay so no payment is missed (e.g. the buyer closed the browser and
 * the webhook was not set up). Paid ones are activated, failed or abandoned ones are closed.
 */
export async function reconcilePayments(): Promise<{ checked: number; paid: number; failed: number }> {
  const out = { checked: 0, paid: 0, failed: 0 };
  if (!razorpayConfigured()) return out;
  const open = await withDb(null, db => ((db[STORAGE_KEYS.PAYMENTS] as Payment[]) || [])
    .filter(p => p.status === 'created' && p.source !== 'offline' && p.razorpayOrderId && Date.now() - Date.parse(p.createdAt) > 10 * 60_000));
  for (const p of open.slice(0, 50)) {
    out.checked++;
    try {
      const r = await rzp<{ items?: RzpPayment[] }>(`/orders/${encodeURIComponent(p.razorpayOrderId)}/payments`);
      if (!r.ok) continue;
      const items = r.data.items || [];
      const captured = items.find(x => x.status === 'captured');
      if (captured) { await completePayment(p.razorpayOrderId, captured.id, captured); out.paid++; continue; }
      if (items.some(x => x.status === 'authorized')) continue; // Razorpay will capture or refund it automatically
      const ageH = (Date.now() - Date.parse(p.createdAt)) / 3_600_000;
      if (items.length && items.every(x => x.status === 'failed')) { await markFailed(p.razorpayOrderId, items[items.length - 1].error_description || 'Payment failed'); out.failed++; }
      else if (!items.length && ageH > 24) { await markFailed(p.razorpayOrderId, 'Checkout was not completed'); out.failed++; }
    } catch { /* try again next time */ }
  }
  return out;
}

async function sendReceipt(p: Payment) {
  const what = productLabel(p);
  const { html, text } = emailLayout({
    heading: 'Payment received — thank you!',
    paragraphs: [
      `Hello ${p.userName},`,
      `We received your payment of ₹${p.amount.toLocaleString('en-IN')} for ${what}. It is active until ${p.activeUntil}.`,
      p.source === 'offline' ? `Invoice ${p.invoiceNumber} · ${p.methodDetail || 'Paid offline'}` : `Invoice ${p.invoiceNumber} · ${p.methodDetail ? `${p.methodDetail} · ` : ''}Razorpay payment ${p.razorpayPaymentId}`,
    ],
    button: { label: 'View invoice', url: `${appUrl()}/invoice/${p.id}` },
  });
  await sendMail({ to: p.userEmail, subject: `Receipt ${p.invoiceNumber} — ${what}`, text, html, kind: 'receipt' });
}

async function sendRefundEmail(p: Payment, r: PaymentRefund) {
  const what = productLabel(p);
  const { html, text } = emailLayout({
    heading: r.status === 'processed' ? 'Your refund has been processed' : 'Your refund has been started',
    paragraphs: [
      `Hello ${p.userName},`,
      `We have refunded ₹${r.amount.toLocaleString('en-IN')} of your payment for ${what} (invoice ${p.invoiceNumber}).`,
      p.source === 'offline' || r.manual ? 'The amount is returned by the same method you paid with.' : 'Razorpay returns the money to the card, UPI account or bank you paid with, usually within 5–7 working days.',
      ...(r.note ? [`Note: ${r.note}`] : []),
    ],
    button: { label: 'View invoice', url: `${appUrl()}/invoice/${p.id}` },
  });
  await sendMail({ to: p.userEmail, subject: `Refund for invoice ${p.invoiceNumber}`, text, html, kind: 'receipt' });
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
