import nodemailer, { Transporter } from 'nodemailer';
import { randomBytes } from 'crypto';
import { withDb } from './db';
import { CONTACT_EMAIL } from '../contact';

/*
 * Outgoing email. Configure SMTP in .env.local (see env-settings-example.txt) — e.g. a Gmail account with
 * an App Password. Every message is also recorded in the admin Outbox; without SMTP settings the
 * Outbox is the only place emails appear, so the whole site can still be tested.
 */

export const OUTBOX_KEY = '_outbox';
const TOKENS_KEY = '_tokens';
const MAX_OUTBOX = 300;

export interface OutboxItem {
  id: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  createdAt: string;
  status: 'sent' | 'logged' | 'failed';
  error?: string;
  kind?: string;
}

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Email over HTTPS instead of SMTP, for hosts that block outgoing mail ports (465/587):
 * EMAIL_API=brevo or resend, EMAIL_API_KEY=… and MAIL_FROM="AcadeXMatch <info@acadexmatch.com>".
 */
function emailApi(): 'brevo' | 'resend' | null {
  const p = (process.env.EMAIL_API || '').toLowerCase();
  return (p === 'brevo' || p === 'resend') && process.env.EMAIL_API_KEY ? p : null;
}

export function emailConfigured(): boolean {
  return !!emailApi() || smtpConfigured();
}

export function mailSettingsSummary() {
  return {
    configured: emailConfigured(),
    host: emailApi() ? `${emailApi() === 'brevo' ? 'Brevo' : 'Resend'} email API` : process.env.SMTP_HOST || null,
    user: process.env.SMTP_USER || null,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || null,
    appUrl: process.env.APP_URL || null,
  };
}

const transporters = new Map<number, Transporter>();
function getTransport(port = Number(process.env.SMTP_PORT || 587)): Transporter {
  let t = transporters.get(port);
  if (!t) {
    const secure = port === Number(process.env.SMTP_PORT || 587) && process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    transporters.set(port, t);
  }
  return t;
}

/** Splits "Name <a@b.c>" into its parts. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: from.trim() };
}

async function sendViaApi(provider: 'brevo' | 'resend', msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = provider === 'brevo'
      ? await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'api-key': process.env.EMAIL_API_KEY!, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: parseFrom(from), to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text, ...(msg.html ? { htmlContent: msg.html } : {}) }),
      })
      : await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
      });
    if (!r.ok) {
      const d = await r.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(`${provider} ${r.status}: ${d.message || d.error || r.statusText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Is this a "can't reach the mail server on that port" error (blocked port), worth trying the other port? */
function portBlocked(e: unknown): boolean {
  const code = (e as { code?: string }).code || '';
  return ['EACCES', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) || /EACCES|ECONNREFUSED|ETIMEDOUT|Greeting never received|Connection timeout/i.test((e as Error).message || '');
}

/** Public address of the site for links in emails. */
export function appUrl(fallbackOrigin?: string): string {
  return (process.env.APP_URL || fallbackOrigin || 'http://localhost:3000').replace(/\/$/, '');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Simple branded HTML email around a message and an optional button. */
export interface EmailItem { title: string; lines: string[]; url: string; badge?: string }

export function emailLayout(opts: { heading: string; paragraphs: string[]; items?: EmailItem[]; button?: { label: string; url: string }; footer?: string; footerLink?: { label: string; url: string } }): { html: string; text: string } {
  const itemText = (opts.items || []).flatMap(i => ['', `• ${i.title}${i.badge ? ` [${i.badge}]` : ''}`, ...i.lines.map(l => `  ${l}`), `  ${i.url}`]);
  const text = [opts.heading, '', ...opts.paragraphs, ...itemText, ...(opts.button ? ['', `${opts.button.label}: ${opts.button.url}`] : []), '', opts.footer || '— AcadeXMatch', `Questions? ${CONTACT_EMAIL}`, ...(opts.footerLink ? [`${opts.footerLink.label}: ${opts.footerLink.url}`] : [])].join('\n');
  const itemsHtml = (opts.items || []).map(i => `<tr><td style="padding:12px 0;border-top:1px solid #F1E8E0"><a href="${esc(i.url)}" style="font-size:15px;font-weight:bold;color:#800000;text-decoration:none">${esc(i.title)}</a>${i.badge ? ` <span style="font-size:11px;font-weight:bold;color:#8A6A2A;background:#FBF3E2;border:1px solid #E8D3A6;border-radius:999px;padding:1px 8px">${esc(i.badge)}</span>` : ''}${i.lines.map(l => `<div style="font-size:13px;color:#6B5A5E;margin-top:3px">${esc(l)}</div>`).join('')}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#FFFDF8;font-family:Arial,Helvetica,sans-serif;color:#5A1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #EADFD6;border-radius:16px">
<tr><td style="padding:22px 28px;border-bottom:3px solid #C6A15B;font-size:20px;font-weight:bold;color:#800000">Acade<span style="color:#B48A3E">X</span>Match</td></tr>
<tr><td style="padding:26px 28px">
<h1 style="margin:0 0 14px;font-size:20px;color:#5A1020">${esc(opts.heading)}</h1>
${opts.paragraphs.map(p => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#4E3B3F">${esc(p)}</p>`).join('')}
${itemsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${itemsHtml}</table>` : ''}
${opts.button ? `<p style="margin:22px 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#800000;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${esc(opts.button.label)}</a></p><p style="font-size:12px;color:#76656A;word-break:break-all">Or open: ${esc(opts.button.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #EADFD6;font-size:12px;color:#76656A">${esc(opts.footer || 'You received this email from AcadeXMatch, the academic recruitment platform for Indian higher education.')} Questions? <a href="mailto:${CONTACT_EMAIL}" style="color:#800000">${CONTACT_EMAIL}</a>${opts.footerLink ? ` <a href="${esc(opts.footerLink.url)}" style="color:#800000">${esc(opts.footerLink.label)}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text };
}

/** Sends (if SMTP is set up) and records the message in the Outbox. Never throws. */
export async function sendMail(msg: { to: string; subject: string; text: string; html?: string; kind?: string }): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: `mail-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, kind: msg.kind,
    createdAt: new Date().toISOString(),
    status: 'logged',
  };
  const api = emailApi();
  if (api || smtpConfigured()) {
    try {
      if (api) await sendViaApi(api, msg);
      else {
        const mail = { from: process.env.MAIL_FROM || process.env.SMTP_USER, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html };
        const port = Number(process.env.SMTP_PORT || 587);
        try {
          await getTransport(port).sendMail(mail);
        } catch (e) {
          // Some hosts block one mail port; try the other standard one before giving up.
          if (!portBlocked(e)) throw e;
          const other = port === 465 ? 587 : 465;
          try { await getTransport(other).sendMail(mail); } catch (e2) {
            throw new Error(`${(e as Error).message} (port ${port}); ${(e2 as Error).message} (port ${other}). Your host seems to block email ports — use an email API instead (EMAIL_API, see env-settings-example.txt).`);
          }
        }
      }
      item.status = 'sent';
    } catch (e) {
      item.status = 'failed';
      item.error = (e as Error).message.slice(0, 600);
      console.error('[AcadeXMatch] Email failed:', item.error);
    }
  }
  await withDb(null, (db, c) => {
    const box = ((db[OUTBOX_KEY] as OutboxItem[]) || []).slice(0, MAX_OUTBOX - 1);
    c.set(OUTBOX_KEY, [item, ...box]);
  });
  return item;
}

// ------------------------------------------------------------------ one-time tokens

interface TokenRec { userId: string; type: 'verify' | 'reset'; expiresAt: number }

export function createToken(userId: string, type: TokenRec['type'], hours: number): Promise<string> {
  const token = randomBytes(24).toString('hex');
  return withDb(null, (db, c) => {
    const all = { ...((db[TOKENS_KEY] as Record<string, TokenRec>) || {}) };
    const now = Date.now();
    for (const [t, r] of Object.entries(all)) if (r.expiresAt < now || (r.userId === userId && r.type === type)) delete all[t];
    all[token] = { userId, type, expiresAt: now + hours * 3600_000 };
    c.set(TOKENS_KEY, all);
    return token;
  });
}

/** Returns the user id and removes the token if it is valid. */
export function consumeToken(token: string, type: TokenRec['type']): Promise<string | null> {
  return withDb(null, (db, c) => {
    const all = { ...((db[TOKENS_KEY] as Record<string, TokenRec>) || {}) };
    const r = all[token];
    if (!r || r.type !== type || r.expiresAt < Date.now()) return null;
    delete all[token];
    c.set(TOKENS_KEY, all);
    return r.userId;
  });
}
