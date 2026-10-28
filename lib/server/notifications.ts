import { createHmac } from 'crypto';
import { STORAGE_KEYS } from '@/lib/storage';
import type { NotificationPrefs, UserAccount } from '@/types';
import { withDb } from './db';
import { appUrl, emailLayout, sendMail, emailConfigured, type EmailItem } from './mailer';
import { safeEqual, serverSecret } from './security';

/*
 * Central email notifications.
 *
 *  notify() records a message in a queue (the database key `_notify_queue`) after the business change
 *  it reports has been saved, then a worker sends it. Each message has an idempotency key, so the same
 *  event never produces two emails; failed sends are retried with exponential backoff. The queue also
 *  serves as each user's notification history. Bodies are dropped once a message is sent, and messages
 *  that carry sign-in links or codes are never stored with their content.
 *
 *  Security emails (verification, password reset/change, new sign-in, email/phone change) always go out.
 *  Everything else respects the user's preferences (Account → Notifications) and needs a confirmed email.
 */

export const QUEUE_KEY = '_notify_queue';
const SUPPRESS_KEY = '_email_suppressed';
const MAX_QUEUE = 5000;
const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [1, 5, 30, 120, 360, 720];

export type Category =
  | 'security' | 'account' | 'applications' | 'statusUpdates' | 'interviews' | 'jobAlerts'
  | 'deadlineReminders' | 'recruiter' | 'announcements' | 'marketing';

/** Preference key for each optional category (security/account have none: always sent). */
const PREF_OF: Partial<Record<Category, keyof NotificationPrefs>> = {
  applications: 'applications', statusUpdates: 'statusUpdates', interviews: 'interviews', jobAlerts: 'jobAlerts',
  deadlineReminders: 'deadlineReminders', recruiter: 'recruiter', announcements: 'announcements', marketing: 'marketing',
};

export const PREF_DEFAULTS: Required<NotificationPrefs> = {
  applications: true, statusUpdates: true, interviews: true, jobAlerts: true, deadlineReminders: true,
  recruiter: true, announcements: true, marketing: false, loginAlerts: true,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  security: 'Account security', account: 'Account', applications: 'Applications', statusUpdates: 'Application status',
  interviews: 'Interviews', jobAlerts: 'Job alerts', deadlineReminders: 'Deadline reminders', recruiter: 'Recruiter',
  announcements: 'Announcements', marketing: 'News and offers',
};

export function prefsOf(u: Pick<UserAccount, 'notificationPrefs' | 'marketingConsent'>): Required<NotificationPrefs> {
  return { ...PREF_DEFAULTS, ...(u.marketingConsent ? { marketing: true } : {}), ...(u.notificationPrefs || {}) };
}

export interface QueueItem {
  id: string;
  /** Idempotency key: one message per key, ever (kept while the item is in the queue). */
  key: string;
  userId?: string;
  to: string;
  category: Category;
  kind: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  sensitive?: boolean;
  /** What the message is about, for the history page. */
  ref?: { jobId?: string; applicationId?: string; label?: string };
  status: 'queued' | 'sending' | 'sent' | 'logged' | 'failed' | 'skipped' | 'bounced' | 'complained' | 'delivered';
  attempts: number;
  nextAt: number;
  createdAt: string;
  sentAt?: string;
  error?: string;
  providerId?: string;
}

export interface NotifyInput {
  key: string;
  category: Category;
  kind: string;
  /** Recipient account; its address, preferences and verification are checked. */
  user?: Pick<UserAccount, 'id' | 'email' | 'name' | 'emailVerified' | 'notificationPrefs' | 'marketingConsent'>;
  /** Or a bare address (only for security/account emails, e.g. the old address after an email change). */
  to?: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  items?: EmailItem[];
  button?: { label: string; url: string };
  footer?: string;
  /** Replaces the default footer link (unsubscribe from this category / notification settings). */
  footerLink?: { label: string; url: string };
  sensitive?: boolean;
  ref?: QueueItem['ref'];
  /** Send right away in this request (sign-in links and codes) rather than waiting for the worker. */
  immediate?: boolean;
}

const optional = (c: Category) => c !== 'security' && c !== 'account';

// ------------------------------------------------------------------ unsubscribe links

export function unsubscribeSig(userId: string, category: string): string {
  return createHmac('sha256', serverSecret()).update(`unsub:${userId}:${category}`).digest('base64url').slice(0, 32);
}
export function unsubscribeSigValid(userId: string, category: string, sig: string): boolean {
  return safeEqual(unsubscribeSig(userId, category), sig);
}
export function unsubscribeUrl(userId: string, category: Category): string {
  return `${appUrl()}/unsubscribe?u=${encodeURIComponent(userId)}&c=${category}&s=${unsubscribeSig(userId, category)}`;
}

// ------------------------------------------------------------------ enqueue

/**
 * Queues one email. Call it only after the change it reports has been saved, and never from inside a
 * withDb callback. Returns the queue item, or null when it was skipped (duplicate, preference off,
 * unconfirmed address, suppressed address).
 */
export async function notify(input: NotifyInput): Promise<QueueItem | null> {
  const base = appUrl();
  const cat = input.category;
  const prefKey = PREF_OF[cat];
  const unsub = input.user && prefKey ? unsubscribeUrl(input.user.id, cat) : null;
  const { html, text } = emailLayout({
    heading: input.heading, paragraphs: input.paragraphs, items: input.items, button: input.button,
    footer: input.footer || (optional(cat) ? 'You receive this email because of your AcadeXMatch notification settings.' : 'This is an account security email from AcadeXMatch and is always sent.'),
    footerLink: input.footerLink || (unsub ? { label: 'Unsubscribe from these emails', url: unsub } : { label: 'Notification settings', url: `${base}/account/notifications` }),
  });
  const oneClick = unsub ? unsub.replace('/unsubscribe?', '/api/unsubscribe?') : null;
  const headers = oneClick ? { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;

  const item = await withDb(null, (db, c) => {
    const queue = (db[QUEUE_KEY] as QueueItem[]) || [];
    if (queue.some(q => q.key === input.key)) return null;
    let to = input.to || '';
    let skip: string | null = null;
    if (input.user) {
      const acc = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).find(u => u.id === input.user!.id) || (input.user as UserAccount);
      to = acc.email;
      if (prefKey && !prefsOf(acc)[prefKey]) skip = 'Switched off in notification settings';
      else if (optional(cat) && acc.emailVerified === false) skip = 'Email address not confirmed';
    }
    if (!to) return null;
    const suppressed = ((db[SUPPRESS_KEY] as Record<string, string>) || {})[to.toLowerCase()];
    if (!skip && suppressed && optional(cat)) skip = `Address suppressed (${suppressed})`;
    const q: QueueItem = {
      id: `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      key: input.key, userId: input.user?.id, to, category: cat, kind: input.kind, subject: input.subject,
      ...(skip ? {} : { text, html, headers }),
      ...(input.sensitive ? { sensitive: true } : {}),
      ...(input.ref ? { ref: input.ref } : {}),
      status: skip ? 'skipped' : 'queued', attempts: 0, nextAt: Date.now(), createdAt: new Date().toISOString(),
      ...(skip ? { error: skip } : {}),
    };
    c.set(QUEUE_KEY, [q, ...queue].slice(0, MAX_QUEUE));
    return q;
  });
  if (item && item.status === 'queued') {
    if (input.immediate) await deliver(item.id);
    kick(); // also picks up other due messages and retries
  }
  return item;
}

// ------------------------------------------------------------------ worker

let running: Promise<number> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/** Starts the worker soon (in this process), without blocking the caller. */
export function kick(): void {
  if (kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; processQueue().catch(e => console.error('[AcadeXMatch] Notification worker error', (e as Error).message)); }, 200);
}

/** Claims one queued item (so two processes never send it twice). */
async function claim(id?: string): Promise<QueueItem | null> {
  return withDb(null, (db, c) => {
    const queue = (db[QUEUE_KEY] as QueueItem[]) || [];
    const now = Date.now();
    // An item stuck in "sending" (process stopped mid-send) goes back to the queue after 10 minutes.
    for (const q of queue) if (q.status === 'sending' && now - q.nextAt > 10 * 60_000) { q.status = 'queued'; c.set(QUEUE_KEY, queue); }
    const it = id ? queue.find(q => q.id === id && q.status === 'queued') : [...queue].reverse().find(q => q.status === 'queued' && q.nextAt <= now);
    if (!it) return null;
    it.status = 'sending';
    it.nextAt = now;
    c.set(QUEUE_KEY, queue);
    return { ...it };
  });
}

async function deliver(id?: string): Promise<boolean> {
  const it = await claim(id);
  if (!it) return false;
  const r = await sendMail({ to: it.to, subject: it.subject, text: it.text || '', html: it.html, kind: it.kind, sensitive: it.sensitive, headers: it.headers });
  await withDb(null, (db, c) => {
    const queue = (db[QUEUE_KEY] as QueueItem[]) || [];
    const q = queue.find(x => x.id === it.id);
    if (!q) return;
    q.attempts++;
    if (r.status === 'failed') {
      q.error = (r.error || 'Send failed').slice(0, 300);
      if (r.permanent || q.attempts >= MAX_ATTEMPTS) { q.status = 'failed'; delete q.text; delete q.html; }
      else { q.status = 'queued'; q.nextAt = Date.now() + BACKOFF_MIN[Math.min(q.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000; }
    } else {
      q.status = r.status; // 'sent', or 'logged' when no provider is configured
      q.sentAt = new Date().toISOString();
      if (r.providerId) q.providerId = r.providerId;
      delete q.error; delete q.text; delete q.html; delete q.headers;
    }
    c.set(QUEUE_KEY, queue);
  });
  return true;
}

/** Sends every due message (up to 50 per run). Runs from the scheduler and after notify(). */
export function processQueue(): Promise<number> {
  if (running) return running;
  running = (async () => {
    let n = 0;
    try {
      while (n < 50 && (await deliver())) n++;
    } finally {
      running = null;
    }
    return n;
  })();
  return running;
}

// ------------------------------------------------------------------ delivery events (webhooks)

/** Records a delivery event from the email provider; bounces and complaints stop optional emails to that address. */
export async function recordDeliveryEvent(ev: { providerId?: string; email?: string; event: 'delivered' | 'bounced' | 'complained' | 'deferred' }): Promise<boolean> {
  return withDb(null, (db, c) => {
    const queue = (db[QUEUE_KEY] as QueueItem[]) || [];
    const q = ev.providerId ? queue.find(x => x.providerId === ev.providerId) : undefined;
    if (q && ev.event !== 'deferred') { q.status = ev.event; c.set(QUEUE_KEY, queue); }
    const email = (ev.email || q?.to || '').toLowerCase();
    if (email && (ev.event === 'bounced' || ev.event === 'complained')) {
      const sup = { ...((db[SUPPRESS_KEY] as Record<string, string>) || {}) };
      sup[email] = `${ev.event} ${new Date().toISOString().slice(0, 10)}`;
      c.set(SUPPRESS_KEY, sup);
    }
    return !!q;
  });
}

// ------------------------------------------------------------------ history & health

export interface HistoryRow { id: string; category: Category; categoryLabel: string; subject: string; createdAt: string; sentAt?: string; status: QueueItem['status']; note?: string; ref?: QueueItem['ref'] }

/** The signed-in user's own notifications (newest first). No message bodies, no other users' data. */
export function historyFor(userId: string, limit = 100): Promise<HistoryRow[]> {
  return withDb(null, db => ((db[QUEUE_KEY] as QueueItem[]) || [])
    .filter(q => q.userId === userId)
    .slice(0, limit)
    .map(q => ({
      id: q.id, category: q.category, categoryLabel: CATEGORY_LABEL[q.category] || q.category, subject: q.subject, createdAt: q.createdAt,
      sentAt: q.sentAt, status: q.status, ref: q.ref,
      note: q.status === 'skipped' ? q.error : q.status === 'failed' ? 'Could not be delivered. Contact us if you need this message.' : q.status === 'queued' && q.attempts ? 'Delivery is being retried.' : q.status === 'logged' ? 'Recorded (email sending is not switched on yet).' : undefined,
    })));
}

/** Counts for the admin health view; logs a warning when many recent sends failed. */
export function queueHealth(): Promise<{ queued: number; failed24h: number; sent24h: number; emailConfigured: boolean }> {
  return withDb(null, db => {
    const queue = (db[QUEUE_KEY] as QueueItem[]) || [];
    const since = Date.now() - 86400_000;
    const recent = queue.filter(q => Date.parse(q.createdAt) > since);
    const h = { queued: queue.filter(q => q.status === 'queued').length, failed24h: recent.filter(q => q.status === 'failed').length, sent24h: recent.filter(q => ['sent', 'delivered'].includes(q.status)).length, emailConfigured: emailConfigured() };
    if (h.failed24h >= 10 && h.failed24h > h.sent24h) console.warn(`[AcadeXMatch] Email delivery problem: ${h.failed24h} failed in 24 h, ${h.sent24h} sent.`);
    return h;
  });
}
