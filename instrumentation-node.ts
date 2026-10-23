import { maybeRunDaily } from './lib/server/scrapeQueue';
import { sendRenewalReminders, reconcilePayments } from './lib/server/payments';
import { runJobAlerts } from './lib/server/jobAlerts';
import { runExpiryCheck } from './lib/server/expiry';
import { sendDeadlineReminders } from './lib/server/deadlineReminders';
import { sendInterviewReminders, pruneOldSlots } from './lib/server/notify';

const g = globalThis as unknown as { __acadScheduler?: boolean };

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
        pruneOldSlots().catch(() => undefined);
      });
  };
  setTimeout(tick, 30_000); // shortly after start-up
  setInterval(tick, 10 * 60_000); // then check every 10 minutes
}
