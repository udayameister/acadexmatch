import { STORAGE_KEYS, StorageService, istToday } from '@/lib/storage';
import { withDb } from './db';
import { emailLayout, sendMail, appUrl, EmailItem } from './mailer';
import type { Job, UserAccount } from '@/types';

const LAST_RUN_KEY = '_expiry_last_run';

/**
 * Once a day: closes published vacancies whose last date is over and tells each institution's
 * administrators which of their vacancies were closed.
 */
export async function runExpiryCheck(opts: { force?: boolean } = {}): Promise<number> {
  const today = istToday();
  const out = await withDb(null, (db, c) => {
    if (!opts.force && db[LAST_RUN_KEY] === today) return null;
    c.set(LAST_RUN_KEY, today);
    const closed = StorageService.closeExpiredJobs();
    const staff = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => u.role === 'institute_admin' && u.instituteId);
    return { closed, staff };
  });
  if (!out || out.closed.length === 0) return 0;

  const byInst = new Map<string, Job[]>();
  for (const j of out.closed) byInst.set(j.instituteId, [...(byInst.get(j.instituteId) || []), j]);
  const base = appUrl();
  for (const [instId, jobs] of byInst) {
    const items: EmailItem[] = jobs.map(j => ({ title: j.title, lines: [`Last date: ${j.applicationDeadline}${j.advertisementNumber ? ` · Advt. ${j.advertisementNumber}` : ''}`, `${j.applicantCount || 0} application(s) received`], url: `${base}/institute/ats` }));
    for (const admin of out.staff.filter(u => u.instituteId === instId)) {
      const { html, text } = emailLayout({
        heading: `${jobs.length} vacanc${jobs.length === 1 ? 'y was' : 'ies were'} closed after the last date`,
        paragraphs: [`Hello ${admin.name},`, 'These vacancies passed their last date and are no longer open to new applications. Applications already received stay in your applicant pipeline. To extend a vacancy, change its last date and publish it again.'],
        items,
        button: { label: 'Open applicant pipeline', url: `${base}/institute/ats` },
      });
      await sendMail({ to: admin.email, subject: `Closed after the last date: ${jobs.length} vacanc${jobs.length === 1 ? 'y' : 'ies'}`, text, html, kind: 'vacancy_closed' });
    }
  }
  return out.closed.length;
}
