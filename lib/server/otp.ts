import { withDb } from './db';
import { allow, keyedDigest, randomDigits, randomToken, retryAfter, safeEqual } from './security';
import { sendOtpSms, smsConfigured } from './sms';
import { emailLayout, sendMail } from './mailer';

/*
 * One-time codes sent by SMS (sign-in, phone confirmation, password recovery) or by email (the extra
 * step for administrator sign-in). Codes are random, 6 digits by default, valid 5 minutes, usable once;
 * only an HMAC of the code is stored. Requesting a new code replaces the previous one.
 * Limits (per number/address, per IP and per account) stop SMS abuse and guessing.
 */

const KEY = '_otp';
export type OtpPurpose = 'login' | 'verify-phone' | 'reset' | 'admin-mfa';
export type OtpChannel = 'sms' | 'email';

interface Challenge {
  id: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  target: string;
  userId?: string;
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  /** Extra state for the step after verification (e.g. "remember me"). */
  data?: Record<string, unknown>;
  /** A placeholder for an unknown number: answers like a real one but can never be verified. */
  decoy?: boolean;
}

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const OTP_LENGTH = Math.min(8, Math.max(4, num(process.env.OTP_LENGTH, 6)));
export const OTP_MINUTES = num(process.env.OTP_EXPIRY_MINUTES, 5);
export const OTP_RESEND_SECONDS = num(process.env.OTP_RESEND_SECONDS, 60);
const MAX_ATTEMPTS = num(process.env.OTP_MAX_ATTEMPTS, 5);
const PER_TARGET_HOUR = num(process.env.OTP_MAX_PER_HOUR, 5);
const PER_TARGET_DAY = num(process.env.OTP_MAX_PER_DAY, 10);
const PER_IP_HOUR = num(process.env.OTP_MAX_PER_IP_HOUR, 20);

export interface StartResult { ok: boolean; challengeId?: string; resendIn?: number; error?: string; status?: number }

/** Sends a new code. For sign-in with an unknown number pass userId undefined and `decoy: true`: nothing is sent, the answer is the same. */
export async function startChallenge(opts: { purpose: OtpPurpose; channel: OtpChannel; target: string; userId?: string; ip: string; decoy?: boolean; data?: Record<string, unknown>; name?: string }): Promise<StartResult> {
  if (opts.channel === 'sms' && !smsConfigured()) return { ok: false, status: 503, error: 'Sign-in by SMS is not available yet.' };
  const t = opts.target.toLowerCase();
  const limitKeys = [`otp:t:h:${t}`, `otp:t:d:${t}`, `otp:ip:${opts.ip}`];
  if (!allow(limitKeys[2], PER_IP_HOUR, 3600_000)) return { ok: false, status: 429, error: `Too many codes requested. Try again in ${Math.ceil(retryAfter(limitKeys[2]) / 60)} minutes.` };

  // Cooldown between codes for the same number/address (checked in the database, so it holds across servers).
  const last = await withDb(null, db => Object.values((db[KEY] as Record<string, Challenge>) || {}).filter(c => c.target === t && c.purpose === opts.purpose).sort((a, b) => b.createdAt - a.createdAt)[0]);
  const wait = last ? Math.ceil((last.createdAt + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) return { ok: false, status: 429, resendIn: wait, error: `Please wait ${wait} seconds before asking for another code.` };
  if (!allow(limitKeys[0], PER_TARGET_HOUR, 3600_000) || !allow(limitKeys[1], PER_TARGET_DAY, 86400_000)) {
    return { ok: false, status: 429, error: 'Too many codes were requested for this number. Try again later.' };
  }

  const code = randomDigits(OTP_LENGTH);
  const id = randomToken(18);
  const now = Date.now();
  const ch: Challenge = {
    id, purpose: opts.purpose, channel: opts.channel, target: t, userId: opts.userId, codeHash: keyedDigest(code, `otp:${id}`),
    createdAt: now, expiresAt: now + OTP_MINUTES * 60_000, attempts: 0, ...(opts.data ? { data: opts.data } : {}), ...(opts.decoy ? { decoy: true } : {}),
  };
  await withDb(null, (db, c) => {
    const all = { ...((db[KEY] as Record<string, Challenge>) || {}) };
    for (const [k, v] of Object.entries(all)) {
      // Expired challenges are removed; older ones for the same target and purpose are superseded.
      if (v.expiresAt < now - 86400_000 || (v.target === t && v.purpose === opts.purpose && v.expiresAt > now)) {
        if (v.expiresAt < now - 86400_000) delete all[k];
        else all[k] = { ...v, expiresAt: Math.min(v.expiresAt, now - 1), codeHash: '' };
      }
    }
    all[id] = ch;
    c.set(KEY, all);
  });

  if (!opts.decoy) {
    try {
      if (opts.channel === 'sms') await sendOtpSms(opts.target, code, OTP_MINUTES);
      else {
        const { html, text } = emailLayout({
          heading: 'Your sign-in code',
          paragraphs: [`Hello ${opts.name || ''},`.replace(' ,', ','), `Your AcadeXMatch code is ${code}. It is valid for ${OTP_MINUTES} minutes and can be used once.`, 'If you did not try to sign in, change your password now — someone else may know it.'],
          footer: 'This is an account security email from AcadeXMatch and is always sent.',
        });
        const r = await sendMail({ to: opts.target, subject: 'Your AcadeXMatch sign-in code', text, html, kind: 'otp-email', sensitive: true });
        if (r.status === 'failed') throw new Error('email failed');
      }
    } catch (e) {
      console.error(`[AcadeXMatch] Could not send ${opts.channel} code:`, (e as Error).message);
      await withDb(null, (db, c) => { const all = { ...((db[KEY] as Record<string, Challenge>) || {}) }; delete all[id]; c.set(KEY, all); });
      return { ok: false, status: 502, error: opts.channel === 'sms' ? 'The SMS could not be sent. Check the number and try again in a minute.' : 'The email could not be sent. Try again in a minute.' };
    }
  }
  return { ok: true, challengeId: id, resendIn: OTP_RESEND_SECONDS };
}

export interface VerifyResult { ok: boolean; error?: string; userId?: string; target?: string; purpose?: OtpPurpose; data?: Record<string, unknown> }

/** Checks a code. A challenge can be verified once; after too many wrong codes it is cancelled. */
export function verifyChallenge(id: string, code: string, purpose: OtpPurpose): Promise<VerifyResult> {
  const clean = String(code || '').replace(/\D/g, '');
  return withDb(null, (db, c) => {
    const all = { ...((db[KEY] as Record<string, Challenge>) || {}) };
    const ch = all[String(id || '')];
    const generic = 'That code is not correct or has expired. Ask for a new code.';
    if (!ch || ch.purpose !== purpose || !ch.codeHash) return { ok: false, error: generic };
    if (ch.expiresAt < Date.now()) { delete all[ch.id]; c.set(KEY, all); return { ok: false, error: 'This code has expired. Ask for a new one.' }; }
    ch.attempts++;
    const match = !ch.decoy && clean.length === OTP_LENGTH && safeEqual(keyedDigest(clean, `otp:${ch.id}`), ch.codeHash);
    if (!match) {
      if (ch.attempts >= MAX_ATTEMPTS) { delete all[ch.id]; c.set(KEY, all); return { ok: false, error: 'Too many wrong codes. Ask for a new code.' }; }
      all[ch.id] = ch; c.set(KEY, all);
      return { ok: false, error: `That code is not correct. ${MAX_ATTEMPTS - ch.attempts} ${MAX_ATTEMPTS - ch.attempts === 1 ? 'try' : 'tries'} left.` };
    }
    delete all[ch.id]; // single use
    c.set(KEY, all);
    return { ok: true, userId: ch.userId, target: ch.target, purpose: ch.purpose, data: ch.data };
  });
}
