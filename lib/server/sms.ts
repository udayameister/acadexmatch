/*
 * Text messages (one-time codes). Provider chosen with SMS_PROVIDER:
 *
 *  msg91  — India (DLT-compliant). MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (a DLT-approved OTP template whose
 *           variable is ##OTP## (or set MSG91_OTP_VAR), e.g. "##OTP## is your AcadeXMatch code. Valid 5 minutes. Do not share it."),
 *           optional MSG91_SENDER (6-letter DLT header) and MSG91_DLT_TE_ID.
 *  twilio — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (a number) or TWILIO_MESSAGING_SERVICE_SID.
 *           For Indian numbers Twilio also needs DLT registration of the sender and template.
 *
 * Without a configured provider, SMS sign-in and verification are hidden and the API refuses to
 * send — nothing is ever pretended to have been sent. In automated tests SMS_PROVIDER=test records
 * messages in memory instead (refused when NODE_ENV=production).
 */

export type SmsProvider = 'msg91' | 'twilio' | 'test';

export function smsProvider(): SmsProvider | null {
  const p = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (p === 'msg91' && process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return 'msg91';
  if (p === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)) return 'twilio';
  if (p === 'test' && process.env.NODE_ENV !== 'production' && process.env.ACAD_TEST_SMS === '1') return 'test';
  return null;
}

export function smsConfigured(): boolean {
  return smsProvider() !== null;
}

/** Messages "sent" by the test provider, for automated tests only. */
export const testOutbox: { to: string; code: string; at: number }[] = ((globalThis as unknown as { __acadSms?: { to: string; code: string; at: number }[] }).__acadSms ||= []);

/** Sends a one-time code. Throws with a short reason on failure (the code itself is never logged). */
export async function sendOtpSms(toE164: string, code: string, minutes: number): Promise<void> {
  const provider = smsProvider();
  if (!provider) throw new Error('SMS is not set up.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    if (provider === 'test') { testOutbox.push({ to: toE164, code, at: Date.now() }); return; }
    if (provider === 'msg91') {
      const body = {
        template_id: process.env.MSG91_TEMPLATE_ID,
        ...(process.env.MSG91_SENDER ? { sender: process.env.MSG91_SENDER } : {}),
        ...(process.env.MSG91_DLT_TE_ID ? { DLT_TE_ID: process.env.MSG91_DLT_TE_ID } : {}),
        short_url: '0',
        // The template's variable names: MSG91_OTP_VAR (default OTP) for the code, optional MSG91_MINUTES_VAR.
        recipients: [{ mobiles: toE164.replace(/^\+/, ''), [process.env.MSG91_OTP_VAR || 'OTP']: code, ...(process.env.MSG91_MINUTES_VAR ? { [process.env.MSG91_MINUTES_VAR]: String(minutes) } : {}) }],
      };
      const r = await fetch(`${(process.env.MSG91_API_URL || 'https://control.msg91.com').replace(/\/$/, '')}/api/v5/flow`, {
        method: 'POST', signal: ctrl.signal,
        headers: { authkey: process.env.MSG91_AUTH_KEY!, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({})) as { type?: string; message?: string };
      if (!r.ok || d.type === 'error') throw new Error(`MSG91 ${r.status}: ${String(d.message || r.statusText).slice(0, 120)}`);
      return;
    }
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const form = new URLSearchParams({ To: toE164, Body: `${code} is your AcadeXMatch verification code. It expires in ${minutes} minutes. Do not share it with anyone.` });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else form.set('From', process.env.TWILIO_FROM!);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({})) as { message?: string };
      throw new Error(`Twilio ${r.status}: ${String(d.message || r.statusText).slice(0, 120)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
