import { maybeRunDaily } from './lib/server/scrapeQueue';
import { smsConfigured, smsProvider } from './lib/server/sms';
import { configuredProviders } from './lib/server/oidc';
import { emailConfigured } from './lib/server/mailer';
import { sendRenewalReminders, reconcilePayments } from './lib/server/payments';
import { runJobAlerts } from './lib/server/jobAlerts';
import { runExpiryCheck, sendExpiryReminders } from './lib/server/expiry';
import { processQueue, queueHealth } from './lib/server/notifications';
import { sendDeadlineReminders } from './lib/server/deadlineReminders';
import { sendInterviewReminders, pruneOldSlots } from './lib/server/notify';

const g = globalThis as unknown as { __acadScheduler?: boolean; __acadConfigLogged?: boolean };

// One line at start-up saying which sign-in and message providers are switched on (no secrets).
if (!g.__acadConfigLogged) {
  g.__acadConfigLogged = true;
  const on = (v?: string) => !!(v && v.trim());
  const problems: string[] = [];
  if (!on(process.env.AUTH_SECRET) || (process.env.AUTH_SECRET || '').length < 32) problems.push('AUTH_SECRET missing or shorter than 32 characters (Google/Microsoft sign-ins in progress and SMS codes stop working after a restart)');
  if (on(process.env.SMS_PROVIDER) && !smsConfigured()) problems.push(`SMS_PROVIDER=${process.env.SMS_PROVIDER} is set but its keys are incomplete, so SMS is off`);
  if (on(process.env.GOOGLE_CLIENT_ID) !== on(process.env.GOOGLE_CLIENT_SECRET)) problems.push('Google sign-in needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  if (on(process.env.MICROSOFT_CLIENT_ID) !== on(process.env.MICROSOFT_CLIENT_SECRET)) problems.push('Microsoft sign-in needs both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET');
  console.log(`[AcadeXMatch] Sign-in: password${smsConfigured() ? `, SMS (${smsProvider()})` : ''}${configuredProviders().map(p => `, ${p}`).join('')} · Email: ${emailConfigured() ? 'on' : 'off (messages are only recorded)'}`);
  for (const p of problems) console.warn(`[AcadeXMatch] Configuration: ${p}`);
}

if (process.env.ACAD_DISABLE_SCHEDULER !== '1' && !g.__acadScheduler) {
  g.__acadScheduler = true;
  const tick = () => {
    maybeRunDaily().catch(err => console.error('[AcadeXMatch] Daily scrape error', err));
    sendRenewalReminders().catch(err => console.error('[AcadeXMatch] Renewal reminder error', err));
    reconcilePayments().catch(err => console.error('[AcadeXMatch] Payment check error', err));
    // Close expired vacancies first so alerts never include them.
    runExpiryCheck()
      .catch(err => console.error('[AcadeXMatch] Expiry check error', err))
      .finally(() => {
        runJobAlerts().catch(err => console.error('[AcadeXMatch] Job alert error', err));
        sendDeadlineReminders().catch(err => console.error('[AcadeXMatch] Deadline reminder error', err));
        sendInterviewReminders().catch(err => console.error('[AcadeXMatch] Interview reminder error', err));
        sendExpiryReminders().catch(err => console.error('[AcadeXMatch] Expiry reminder error', err));
        pruneOldSlots().catch(() => undefined);
      });
  };
  setTimeout(tick, 30_000); // shortly after start-up
  // Email queue: send due messages and retries every minute; warn in the log if many fail.
  setInterval(() => { processQueue().catch(err => console.error('[AcadeXMatch] Email queue error', err)); }, 60_000);
  setInterval(() => { queueHealth().catch(() => undefined); }, 60 * 60_000);
  setInterval(tick, 10 * 60_000); // then check every 10 minutes
}
