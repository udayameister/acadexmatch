import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from './db';
import { emailLayout, sendMail, appUrl, EmailItem } from './mailer';
import type { Job, TrackedJob, UserAccount } from '@/types';

const SENT_KEY = '_deadline_reminders';
const SEND_HOUR_IST = 8;
const REMIND_DAYS = [3, 1];

function ist(): { day: string; hour: number } {
  const d = new Date();
  return {
    day: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    hour: Number(d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })),
  };
}

/** Emails candidates 3 days and 1 day before the last date of vacancies they saved but have not applied to. */
export async function sendDeadlineReminders(opts: { force?: boolean } = {}): Promise<number> {
  const { day, hour } = ist();
  if (!opts.force && hour < SEND_HOUR_IST) return 0;
  const due = await withDb(null, (db, c) => {
    const sent = { ...((db[SENT_KEY] as Record<string, string>) || {}) };
    const jobs = new Map(((db[STORAGE_KEYS.JOBS] as Job[]) || []).map(j => [j.id, j]));
    const users = new Map(((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).map(u => [u.id, u]));
    const perUser = new Map<string, { t: TrackedJob; deadline: string; days: number }[]>();
    for (const t of (db[STORAGE_KEYS.TRACKED_JOBS] as TrackedJob[]) || []) {
      if (t.status !== 'saved') continue;
      const job = t.jobId ? jobs.get(t.jobId) : undefined;
      if (job && job.status !== 'published') continue;
      const deadline = job?.applicationDeadline || t.deadline;
      if (!deadline) continue;
      const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
      if (!REMIND_DAYS.includes(days)) continue;
      const key = `${t.id}:${deadline}:${days}`;
      if (sent[key]) continue;
      const u = users.get(t.userId);
      if (!u || u.emailVerified === false) continue;
      sent[key] = day;
      perUser.set(u.id, [...(perUser.get(u.id) || []), { t, deadline, days }]);
    }
    // keep the log small: drop entries older than ~60 days
    const cutoff = new Date(Date.parse(`${day}T00:00:00Z`) - 60 * 86400000).toISOString().slice(0, 10);
    for (const [k, v] of Object.entries(sent)) if (v < cutoff) delete sent[k];
    c.set(SENT_KEY, sent);
    return [...perUser.entries()].map(([uid, list]) => ({ user: users.get(uid)!, list }));
  });

  const base = appUrl();
  for (const { user, list } of due) {
    const items: EmailItem[] = list.sort((a, b) => a.days - b.days).map(({ t, deadline, days }) => ({
      title: t.title,
      badge: days === 1 ? 'Closes tomorrow' : `${days} days left`,
      lines: [`${t.institute} · Last date ${deadline}`],
      url: t.jobId ? `${base}/jobs/${t.jobId}` : t.url || `${base}/candidate/tracker`,
    }));
    const soonest = Math.min(...list.map(x => x.days));
    const { html, text } = emailLayout({
      heading: list.length === 1 ? `Last date ${soonest === 1 ? 'tomorrow' : `in ${soonest} days`}: ${list[0].t.title}` : `${list.length} saved vacancies are closing soon`,
      paragraphs: [`Hello ${user.name},`, 'You saved these vacancies in your AcadeXMatch tracker and have not marked them as applied yet.'],
      items,
      button: { label: 'Open my tracker', url: `${base}/candidate/tracker` },
      footer: 'Reminders stop once you mark a vacancy as applied or remove it from your tracker.',
    });
    await sendMail({ to: user.email, subject: list.length === 1 ? `Closing ${soonest === 1 ? 'tomorrow' : `in ${soonest} days`}: ${list[0].t.title}` : `${list.length} saved vacancies are closing soon`, text, html, kind: 'deadline_reminder' });
  }
  return due.length;
}
