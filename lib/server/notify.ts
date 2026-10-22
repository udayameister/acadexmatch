import { STORAGE_KEYS, isPremiumUser } from '@/lib/storage';
import { withDb } from './db';
import { emailLayout, sendMail, appUrl } from './mailer';
import type { Announcement, Application, InterviewSlotOffer, TalentInvite, UserAccount } from '@/types';

/*
 * Emails sent after certain actions succeed (interview invitations, offers, talent invitations,
 * announcements), plus a daily reminder for booked interviews. Without SMTP settings the emails
 * only appear in the admin Outbox, so everything can still be tested.
 */

type Db = Record<string, unknown>;
const users = (db: Db) => (db[STORAGE_KEYS.USERS] as UserAccount[]) || [];
const apps = (db: Db) => (db[STORAGE_KEYS.APPLICATIONS] as Application[]) || [];

async function mailUsers(list: { to: string; subject: string; heading: string; paragraphs: string[]; button?: { label: string; url: string } }[], kind: string) {
  for (const m of list) {
    const { html, text } = emailLayout({ heading: m.heading, paragraphs: m.paragraphs, button: m.button });
    await sendMail({ to: m.to, subject: m.subject, text, html, kind }).catch(() => undefined);
  }
}

/** Called by /api/rpc after an action succeeds. Never throws. */
export async function afterRpc(method: string, args: unknown[], actorId: string | null, result: unknown): Promise<void> {
  try {
    const ok = !(result && typeof result === 'object' && (result as { success?: boolean }).success === false);
    if (!ok) return;
    const base = appUrl();

    if (method === 'inviteToBookSlots') {
      const ids = new Set((args[0] as string[]) || []);
      const out = await withDb(null, db => apps(db).filter(a => ids.has(a.id) && a.slotInvite).map(a => {
        const u = users(db).find(x => x.id === a.candidateId);
        return u ? { to: u.email, subject: `Choose your interview time — ${a.jobTitle}`, heading: 'You are invited to an interview', paragraphs: [
          `${a.instituteName} has shortlisted you for ${a.jobTitle} and invites you to choose an interview slot.`,
          ...(a.slotInvite?.message ? [`Message from the institution: ${a.slotInvite.message}`] : []),
        ], button: { label: 'Choose a slot', url: `${base}/candidate/applications` } } : null;
      }).filter(Boolean) as Parameters<typeof mailUsers>[0]);
      await mailUsers(out, 'interview-invite');
    }

    if (method === 'bookInterviewSlot') {
      const appId = String(args[0]);
      const out = await withDb(null, db => {
        const a = apps(db).find(x => x.id === appId);
        if (!a?.interviewSlot) return [];
        const staff = users(db).filter(u => (u.role === 'institute_admin' || u.role === 'recruiter') && u.instituteId === a.instituteId);
        return staff.map(u => ({ to: u.email, subject: `Interview slot booked — ${a.candidateName}`, heading: 'An applicant booked an interview slot', paragraphs: [
          `${a.candidateName} booked ${a.interviewSlot!.date} at ${a.interviewSlot!.time} (${a.interviewSlot!.platform}) for ${a.jobTitle}.`,
        ], button: { label: 'Open the applicant pipeline', url: `${base}/institute/ats` } }));
      });
      await mailUsers(out, 'interview-booked');
    }

    if (method === 'makeOffer') {
      const appId = String(args[0]);
      const out = await withDb(null, db => {
        const a = apps(db).find(x => x.id === appId);
        const u = a && users(db).find(x => x.id === a.candidateId);
        return a && u && a.offerDetails ? [{ to: u.email, subject: `Offer of appointment — ${a.jobTitle}`, heading: 'You have received an offer', paragraphs: [
          `${a.instituteName} has offered you the position of ${a.offerDetails.designation}.`,
          `Joining date: ${a.offerDetails.joiningDate}${a.offerDetails.acceptBy ? ` · Please respond by ${a.offerDetails.acceptBy}` : ''}.`,
        ], button: { label: 'View the offer letter', url: `${base}/offer/${a.id}` } }] : [];
      });
      await mailUsers(out, 'offer');
    }

    if (method === 'sendTalentInvite') {
      const [candidateId, jobId] = args as string[];
      const out = await withDb(null, db => {
        const inv = ((db[STORAGE_KEYS.TALENT_INVITES] as TalentInvite[]) || []).find(i => i.candidateId === candidateId && i.jobId === jobId);
        const u = users(db).find(x => x.id === candidateId);
        return inv && u ? [{ to: u.email, subject: `${inv.instituteName} invites you to apply`, heading: `An invitation from ${inv.instituteName}`, paragraphs: [
          `${inv.instituteName} found your profile on AcadeXMatch and invites you to apply for ${inv.jobTitle}.`,
          ...(inv.message ? [`Their message: ${inv.message}`] : []),
          'You can switch off talent search at any time on your profile.',
        ], button: { label: 'See the vacancy', url: `${base}/jobs/${inv.jobId}` } }] : [];
      });
      await mailUsers(out, 'talent-invite');
    }

    if (method === 'saveAnnouncement' && (args[0] as { email?: boolean })?.email && (result as { id?: string })?.id) {
      const id = (result as { id: string }).id;
      const out = await withDb(null, (db, c) => {
        const anns = (db[STORAGE_KEYS.ANNOUNCEMENTS] as Announcement[]) || [];
        const a = anns.find(x => x.id === id);
        if (!a || a.emailed) return [];
        const target = users(db).filter(u => u.emailVerified !== false && (
          a.audience === 'everyone' ? u.role !== 'super_admin'
            : a.audience === 'institutions' ? (u.role === 'institute_admin' || u.role === 'recruiter')
              : u.role === 'candidate' && (a.audience === 'candidates' || (a.audience === 'premium' ? isPremiumUser(u) : !isPremiumUser(u)))));
        c.set(STORAGE_KEYS.ANNOUNCEMENTS, anns.map(x => (x.id === id ? { ...x, emailed: target.length } : x)));
        return target.slice(0, 2000).map(u => ({ to: u.email, subject: a.title, heading: a.title, paragraphs: a.body.split(/\n{2,}/), button: a.link ? { label: 'Read more', url: a.link.startsWith('/') ? `${base}${a.link}` : a.link } : undefined }));
      });
      await mailUsers(out, 'announcement');
    }
  } catch (e) {
    console.error('[AcadeXMatch] Notification error', e);
  }
}

const REMIND_KEY = '_interview_reminders';

/** Emails candidates the day before a booked or scheduled interview (once). */
export async function sendInterviewReminders(): Promise<number> {
  const now = new Date();
  const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  if (hour < 9) return 0;
  const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const base = appUrl();
  const due = await withDb(null, (db, c) => {
    const sent = { ...((db[REMIND_KEY] as Record<string, string>) || {}) };
    const list = apps(db).filter(a => a.interviewSlot?.date === tomorrow && a.status === 'interview_scheduled' && !sent[`${a.id}:${tomorrow}`]);
    const outList = list.map(a => {
      sent[`${a.id}:${tomorrow}`] = tomorrow;
      const u = users(db).find(x => x.id === a.candidateId);
      const s = a.interviewSlot!;
      return u && u.emailVerified !== false ? { to: u.email, subject: `Reminder: interview tomorrow — ${a.jobTitle}`, heading: 'Your interview is tomorrow', paragraphs: [
        `${a.instituteName} · ${a.jobTitle}`, `${s.date} at ${s.time} · ${s.platform}${s.roomVenue ? ` · ${s.roomVenue}` : ''}`,
        ...(s.meetingLink ? [`Meeting link: ${s.meetingLink}`] : []), ...(s.instructions ? [s.instructions] : []),
      ], button: { label: 'Prepare for your interview', url: `${base}/candidate/interview-prep` } } : null;
    }).filter(Boolean) as Parameters<typeof mailUsers>[0];
    if (list.length) c.set(REMIND_KEY, sent);
    return outList;
  });
  await mailUsers(due, 'interview-reminder');
  return due.length;
}

/** Interview slots in the past that nobody booked are removed after a week. */
export async function pruneOldSlots(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await withDb(null, (db, c) => {
    const slots = (db[STORAGE_KEYS.INTERVIEW_SLOTS] as InterviewSlotOffer[]) || [];
    const keep = slots.filter(s => s.bookedByAppId || s.date >= cutoff);
    if (keep.length !== slots.length) c.set(STORAGE_KEYS.INTERVIEW_SLOTS, keep);
  });
}
