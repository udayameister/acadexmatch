import { STORAGE_KEYS, StorageService, istToday } from '@/lib/storage';
import { withDb } from './db';
import { appUrl, EmailItem } from './mailer';
import { notify } from './notifications';
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
    const staff = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => (u.role === 'institute_admin' || u.role === 'recruiter') && u.instituteId);
    return { closed, staff };
  });
  if (!out || out.closed.length === 0) return 0;

  const byInst = new Map<string, Job[]>();
  for (const j of out.closed) byInst.set(j.instituteId, [...(byInst.get(j.instituteId) || []), j]);
  const base = appUrl();
  for (const [instId, jobs] of byInst) {
    const items: EmailItem[] = jobs.map(j => ({ title: j.title, lines: [`Last date: ${j.applicationDeadline}${j.advertisementNumber ? ` · Advt. ${j.advertisementNumber}` : ''}`, `${j.applicantCount || 0} application(s) received`], url: `${base}/institute/ats` }));
    for (const admin of out.staff.filter(u => u.instituteId === instId)) {
      await notify({
        key: `closed:${admin.id}:${today}`, category: 'recruiter', kind: 'vacancy_closed', user: admin,
        subject: `Closed after the last date: ${jobs.length} vacanc${jobs.length === 1 ? 'y' : 'ies'}`,
        heading: `${jobs.length} vacanc${jobs.length === 1 ? 'y was' : 'ies were'} closed after the last date`,
        paragraphs: [`Hello ${admin.name},`, 'These vacancies passed their last date and are no longer open to new applications. Applications already received stay in your applicant pipeline. To extend a vacancy, change its last date and publish it again.'],
        items,
        button: { label: 'Open applicant pipeline', url: `${base}/institute/ats` },
      });
    }
  }
  return out.closed.length;
}

const EXPIRY_REMIND_DAYS = 3;

/**
 * Once a day (after 9 am IST): tells institution staff about their published vacancies whose last
 * date is EXPIRY_REMIND_DAYS days away, so they can extend or close them. One email per vacancy and
 * last date (a changed last date gets a new reminder).
 */
export async function sendExpiryReminders(): Promise<number> {
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  if (hour < 9) return 0;
  const today = istToday();
  const target = new Date(Date.parse(`${today}T00:00:00Z`) + EXPIRY_REMIND_DAYS * 86400000).toISOString().slice(0, 10);
  const due = await withDb(null, db => {
    const jobs = ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(j => j.status === 'published' && j.isClaimedByInstitute && j.applicationDeadline === target);
    const staff = ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => (u.role === 'institute_admin' || u.role === 'recruiter') && u.instituteId);
    return jobs.flatMap(j => staff.filter(u => u.instituteId === j.instituteId).map(u => ({ j, u })));
  });
  const base = appUrl();
  let n = 0;
  for (const { j, u } of due) {
    const r = await notify({
      key: `expiry-remind:${j.id}:${j.applicationDeadline}:${u.id}`, category: 'recruiter', kind: 'vacancy_expiring', user: u,
      subject: `Your Job Listing Is Approaching Its Expiry Date — ${j.title}`,
      heading: 'Your vacancy closes in 3 days',
      paragraphs: [`Hello ${u.name},`, `“${j.title}” closes on ${j.applicationDeadline}. It has ${j.applicantCount || 0} application(s) so far.`, 'To keep it open longer, change its last date. Otherwise it closes automatically after the last date.'],
      button: { label: 'Manage this vacancy', url: `${base}/institute/dashboard` },
      ref: { jobId: j.id },
    });
    if (r) n++;
  }
  return n;
}
