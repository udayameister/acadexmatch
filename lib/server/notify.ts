import { STORAGE_KEYS, isPremiumUser } from '@/lib/storage';
import { withDb } from './db';
import { appUrl } from './mailer';
import { pingIndexNow } from './indexnow';
import { notify, type NotifyInput } from './notifications';
import type { Announcement, Application, ApplicationStage, InterviewSlotOffer, Job, TalentInvite, UserAccount } from '@/types';

/*
 * Emails for things that happen in the job portal. afterRpc() runs only after /api/rpc has saved an
 * action successfully, so a failed, duplicate or refused action never sends anything. Every message
 * goes through the notification queue (lib/server/notifications.ts) with an idempotency key, so a
 * retried request never emails twice, and the recipient's preferences are respected.
 */

type Db = Record<string, unknown>;
const users = (db: Db) => (db[STORAGE_KEYS.USERS] as UserAccount[]) || [];
const apps = (db: Db) => (db[STORAGE_KEYS.APPLICATIONS] as Application[]) || [];
const jobs = (db: Db) => (db[STORAGE_KEYS.JOBS] as Job[]) || [];
const staffOf = (db: Db, instituteId: string) => users(db).filter(u => (u.role === 'institute_admin' || u.role === 'recruiter') && u.instituteId === instituteId);

const STAGE_TEXT: Partial<Record<ApplicationStage, { title: string; line: string }>> = {
  screening: { title: 'Your application is being screened', line: 'The institution has started screening your application.' },
  eligible: { title: 'You meet the eligibility criteria', line: 'The institution found that you meet the eligibility criteria for this post.' },
  shortlisted: { title: 'You have been shortlisted', line: 'Congratulations — you have been shortlisted. The institution will contact you about the next step.' },
  committee_review: { title: 'Your application is with the selection committee', line: 'Your application is now being reviewed by the selection committee.' },
  joined: { title: 'Welcome aboard', line: 'The institution has recorded that you joined.' },
  rejected: { title: 'Update on your application', line: 'The institution has decided not to take your application further at this stage. Thank you for applying — keep an eye on new vacancies that match your profile.' },
};

function slotLines(s: NonNullable<Application['interviewSlot']>): string[] {
  return [
    `Date and time: ${s.date} at ${s.time}`,
    `Mode: ${s.platform}${s.roomVenue ? ` · ${s.roomVenue}` : ''}`,
    ...(s.meetingLink ? [`Meeting link: ${s.meetingLink}`] : []),
    ...(s.instructions ? [`Instructions: ${s.instructions}`] : []),
  ];
}

/** Called by /api/rpc after an action succeeds. Never throws. */
export async function afterRpc(method: string, args: unknown[], actorId: string | null, result: unknown): Promise<void> {
  try {
    const ok = !(result && typeof result === 'object' && (result as { success?: boolean }).success === false);
    if (!ok) return;
    const base = appUrl();

    // Public pages changed: tell IndexNow search engines (only when INDEXNOW_KEY is set).
    const jobPaths = (ids: unknown[]) => ids.map(id => `/jobs/${encodeURIComponent(String(id))}`);
    if (method === 'addJob') pingIndexNow([...jobPaths([(args[0] as { id?: string })?.id]), '/jobs']).catch(() => undefined);
    if (method === 'updateJob' || method === 'setJobStatus' || method === 'deleteJob') pingIndexNow(jobPaths([args[0]])).catch(() => undefined);
    if (method === 'addJobs') pingIndexNow([...jobPaths(((args[0] as { id?: string }[]) || []).map(j => j?.id)), '/jobs']).catch(() => undefined);
    if (method === 'updateInstitute' || method === 'updateInstituteVerification' || method === 'adminUpdateInstitute') pingIndexNow([`/institutes/${encodeURIComponent(String(args[0]))}`]).catch(() => undefined);

    const out: NotifyInput[] = await withDb(null, db => build(db, method, args, actorId, result, base));
    let queued = 0;
    for (const m of out) if (await notify(m).catch(e => { console.error('[AcadeXMatch] notify failed', m.kind, (e as Error).message); return null; })) queued++;
    if (method === 'saveAnnouncement' && queued) {
      const id = (result as { id?: string })?.id;
      await withDb(null, (db, c) => {
        const anns = (db[STORAGE_KEYS.ANNOUNCEMENTS] as Announcement[]) || [];
        c.set(STORAGE_KEYS.ANNOUNCEMENTS, anns.map(x => (x.id === id ? { ...x, emailed: (x.emailed || 0) + queued } : x)));
      });
    }
  } catch (e) {
    console.error('[AcadeXMatch] Notification error', (e as Error).message);
  }
}

/** Works out which emails an action produces (reads only; nothing is sent here). */
function build(db: Db, method: string, args: unknown[], actorId: string | null, result: unknown, base: string): NotifyInput[] {
  const list: NotifyInput[] = [];
  const userById = (id?: string) => users(db).find(u => u.id === id);

  if (method === 'applyToJob') {
    const a = (result as { application?: Application })?.application;
    const saved = a && apps(db).find(x => x.id === a.id);
    if (!saved) return list;
    const job = jobs(db).find(j => j.id === saved.jobId);
    const cand = userById(saved.candidateId);
    if (cand) list.push({
      key: `app-submitted:${saved.id}`, category: 'applications', kind: 'application-submitted', user: cand,
      subject: `Application Submitted Successfully — ${saved.jobTitle}`, heading: 'Your application was submitted',
      paragraphs: [`Hello ${cand.name},`, `Your application for ${saved.jobTitle} at ${saved.instituteName} was received on ${saved.appliedDate}.`, `Application reference: ${saved.id}`, 'You will get an email when the institution updates its status.'],
      items: [{ title: saved.jobTitle, lines: [`${saved.instituteName}${saved.department ? ` · ${saved.department}` : ''}`, ...(job?.applicationDeadline ? [`Last date: ${job.applicationDeadline}`] : [])], url: `${base}/jobs/${saved.jobId}` }],
      button: { label: 'Track my applications', url: `${base}/candidate/applications` },
      ref: { jobId: saved.jobId, applicationId: saved.id },
    });
    for (const s of staffOf(db, saved.instituteId)) list.push({
      key: `app-received:${saved.id}:${s.id}`, category: 'recruiter', kind: 'application-received', user: s,
      subject: `New application — ${saved.jobTitle}`, heading: 'A new application arrived',
      paragraphs: [`Hello ${s.name},`, `${saved.candidateName} applied for ${saved.jobTitle} on ${saved.appliedDate}.`, `Highest degree: ${saved.highestDegree || 'not stated'} · Match score: ${saved.matchScore}/100`, `Application reference: ${saved.id}`],
      button: { label: 'Open the applicant pipeline', url: `${base}/institute/ats` },
      ref: { jobId: saved.jobId, applicationId: saved.id },
    });
  }

  if (method === 'updateApplicationStage') {
    const [appId, stage] = args as [string, ApplicationStage];
    const a = apps(db).find(x => x.id === appId);
    const text = STAGE_TEXT[stage];
    const cand = a && userById(a.candidateId);
    if (a && cand && text && a.status === stage) list.push({
      key: `status:${a.id}:${stage}:${a.stageHistory.length}`, category: 'statusUpdates', kind: 'status-update', user: cand,
      subject: 'Your Job Application Status Has Been Updated', heading: text.title,
      paragraphs: [`Hello ${cand.name},`, `${a.jobTitle} · ${a.instituteName}`, text.line, `Application reference: ${a.id}`],
      button: { label: 'View my application', url: `${base}/candidate/applications` },
      ref: { jobId: a.jobId, applicationId: a.id },
    });
  }

  if (method === 'scheduleInterview') {
    const a = apps(db).find(x => x.id === String(args[0]));
    const cand = a && userById(a.candidateId);
    if (a?.interviewSlot && cand) list.push({
      key: `interview:${a.id}:${a.interviewSlot.date}:${a.interviewSlot.time}`, category: 'interviews', kind: 'interview-scheduled', user: cand,
      subject: `Interview scheduled — ${a.jobTitle}`, heading: 'Your interview is scheduled',
      paragraphs: [`Hello ${cand.name},`, `${a.instituteName} has scheduled your interview for ${a.jobTitle}.`, ...slotLines(a.interviewSlot), 'Times are Indian Standard Time (IST) unless stated otherwise. You will get a reminder the day before and one hour before.'],
      button: { label: 'Prepare for your interview', url: `${base}/candidate/interview-prep` },
      ref: { jobId: a.jobId, applicationId: a.id },
    });
  }

  if (method === 'inviteToBookSlots') {
    const ids = new Set((args[0] as string[]) || []);
    for (const a of apps(db).filter(x => ids.has(x.id) && x.slotInvite)) {
      const cand = userById(a.candidateId);
      if (cand) list.push({
        key: `slot-invite:${a.id}:${a.slotInvite!.invitedAt}`, category: 'interviews', kind: 'interview-invite', user: cand,
        subject: `Choose your interview time — ${a.jobTitle}`, heading: 'You are invited to an interview',
        paragraphs: [`Hello ${cand.name},`, `${a.instituteName} has shortlisted you for ${a.jobTitle} and invites you to choose an interview slot.`, ...(a.slotInvite?.message ? [`Message from the institution: ${a.slotInvite.message}`] : [])],
        button: { label: 'Choose a slot', url: `${base}/candidate/applications` },
        ref: { jobId: a.jobId, applicationId: a.id },
      });
    }
  }

  if (method === 'bookInterviewSlot') {
    const a = apps(db).find(x => x.id === String(args[0]));
    if (a?.interviewSlot) {
      const cand = userById(a.candidateId);
      if (cand) list.push({
        key: `interview:${a.id}:${a.interviewSlot.date}:${a.interviewSlot.time}`, category: 'interviews', kind: 'interview-scheduled', user: cand,
        subject: `Interview booked — ${a.jobTitle}`, heading: 'Your interview slot is booked',
        paragraphs: [`Hello ${cand.name},`, `You booked an interview with ${a.instituteName} for ${a.jobTitle}.`, ...slotLines(a.interviewSlot)],
        button: { label: 'Prepare for your interview', url: `${base}/candidate/interview-prep` },
        ref: { jobId: a.jobId, applicationId: a.id },
      });
      for (const s of staffOf(db, a.instituteId)) list.push({
        key: `slot-booked:${a.id}:${a.interviewSlot.date}:${a.interviewSlot.time}:${s.id}`, category: 'recruiter', kind: 'interview-booked', user: s,
        subject: `Interview slot booked — ${a.candidateName}`, heading: 'An applicant booked an interview slot',
        paragraphs: [`Hello ${s.name},`, `${a.candidateName} booked ${a.interviewSlot.date} at ${a.interviewSlot.time} (${a.interviewSlot.platform}) for ${a.jobTitle}.`],
        button: { label: 'Open the applicant pipeline', url: `${base}/institute/ats` },
        ref: { jobId: a.jobId, applicationId: a.id },
      });
    }
  }

  if (method === 'cancelInterviewBooking') {
    const a = apps(db).find(x => x.id === String(args[0]));
    const actorIsCandidate = a && actorId === a.candidateId;
    if (a) {
      const stamp = Date.now().toString(36);
      if (actorIsCandidate) for (const s of staffOf(db, a.instituteId)) list.push({
        key: `slot-cancel:${a.id}:${stamp}:${s.id}`, category: 'recruiter', kind: 'interview-cancelled', user: s,
        subject: `Interview booking cancelled — ${a.candidateName}`, heading: 'An interview booking was cancelled',
        paragraphs: [`Hello ${s.name},`, `${a.candidateName} cancelled their interview booking for ${a.jobTitle}. The slot is free again.`],
        button: { label: 'Open the applicant pipeline', url: `${base}/institute/ats` }, ref: { jobId: a.jobId, applicationId: a.id },
      });
      else { const cand = userById(a.candidateId); if (cand) list.push({
        key: `slot-cancel:${a.id}:${stamp}`, category: 'interviews', kind: 'interview-cancelled', user: cand,
        subject: `Interview cancelled — ${a.jobTitle}`, heading: 'Your interview booking was cancelled',
        paragraphs: [`Hello ${cand.name},`, `${a.instituteName} cancelled your interview booking for ${a.jobTitle}. They may invite you to choose a new time.`],
        button: { label: 'View my application', url: `${base}/candidate/applications` }, ref: { jobId: a.jobId, applicationId: a.id },
      }); }
    }
  }

  if (method === 'makeOffer') {
    const a = apps(db).find(x => x.id === String(args[0]));
    const cand = a && userById(a.candidateId);
    if (a?.offerDetails && cand) list.push({
      key: `offer:${a.id}:${a.offerDetails.issuedAt || a.offerDetails.joiningDate}`, category: 'statusUpdates', kind: 'offer', user: cand,
      subject: `Offer of appointment — ${a.jobTitle}`, heading: 'You have received an offer',
      paragraphs: [`Hello ${cand.name},`, `${a.instituteName} has offered you the position of ${a.offerDetails.designation}.`, `Joining date: ${a.offerDetails.joiningDate}${a.offerDetails.acceptBy ? ` · Please respond by ${a.offerDetails.acceptBy}` : ''}.`],
      button: { label: 'View the offer letter', url: `${base}/offer/${a.id}` },
      ref: { jobId: a.jobId, applicationId: a.id },
    });
  }

  if (method === 'respondToOffer') {
    const a = apps(db).find(x => x.id === String(args[0]));
    if (a?.offerDetails?.response) for (const s of staffOf(db, a.instituteId)) list.push({
      key: `offer-reply:${a.id}:${a.offerDetails.response}:${s.id}`, category: 'recruiter', kind: 'offer-response', user: s,
      subject: `Offer ${a.offerDetails.response} — ${a.candidateName}`, heading: `${a.candidateName} ${a.offerDetails.response} the offer`,
      paragraphs: [`Hello ${s.name},`, `${a.candidateName} ${a.offerDetails.response} your offer for ${a.jobTitle}.`],
      button: { label: 'Open the applicant pipeline', url: `${base}/institute/ats` },
      ref: { jobId: a.jobId, applicationId: a.id },
    });
  }

  if (method === 'sendTalentInvite') {
    const [candidateId, jobId] = args as string[];
    const inv = ((db[STORAGE_KEYS.TALENT_INVITES] as TalentInvite[]) || []).find(i => i.candidateId === candidateId && i.jobId === jobId);
    const cand = userById(candidateId);
    if (inv && cand) list.push({
      key: `talent:${inv.id}`, category: 'jobAlerts', kind: 'talent-invite', user: cand,
      subject: `${inv.instituteName} invites you to apply`, heading: `An invitation from ${inv.instituteName}`,
      paragraphs: [`Hello ${cand.name},`, `${inv.instituteName} found your profile on AcadeXMatch and invites you to apply for ${inv.jobTitle}.`, ...(inv.message ? [`Their message: ${inv.message}`] : []), 'You can switch off talent search at any time on your profile.'],
      button: { label: 'See the vacancy', url: `${base}/jobs/${inv.jobId}` },
      ref: { jobId: inv.jobId },
    });
  }

  if (method === 'addJob') {
    const job = jobs(db).find(j => j.id === (args[0] as { id?: string })?.id);
    const poster = userById(actorId || undefined);
    if (job && poster && (poster.role === 'institute_admin' || poster.role === 'recruiter')) list.push({
      key: `job-posted:${job.id}`, category: 'recruiter', kind: 'job-posted', user: poster,
      subject: `Vacancy published — ${job.title}`, heading: 'Your vacancy is live',
      paragraphs: [`Hello ${poster.name},`, `“${job.title}” is published on AcadeXMatch${job.applicationDeadline ? ` and accepts applications until ${job.applicationDeadline}` : ''}.`, 'You will get an email for each new application (you can change this in your notification settings).'],
      button: { label: 'View the vacancy', url: `${base}/jobs/${job.id}` },
      ref: { jobId: job.id },
    });
  }

  if (method === 'updateInstituteVerification') {
    const [instId, status] = args as [string, 'verified' | 'rejected'];
    for (const s of staffOf(db, instId)) list.push({
      key: `inst-verify:${instId}:${status}:${s.id}`, category: 'account', kind: 'institute-verification', user: s,
      subject: status === 'verified' ? 'Your institution is verified on AcadeXMatch' : 'Your institution registration needs attention',
      heading: status === 'verified' ? 'Institution verified' : 'Institution not verified',
      paragraphs: [`Hello ${s.name},`, status === 'verified' ? 'The platform administrator verified your institution. You can now publish vacancies.' : 'The platform administrator could not verify your institution with the details provided. Reply to this email or contact us with your AISHE code and an official document.'],
      button: { label: 'Open your dashboard', url: `${base}/institute/dashboard` },
    });
  }

  if (method === 'adminResetPassword') {
    const u = userById(String(args[0]));
    if (u) list.push({
      key: `pw-admin:${u.id}:${Date.now().toString(36)}`, category: 'security', kind: 'password-changed', user: u,
      subject: 'Your Password Has Been Changed', heading: 'Your password was reset by the administrator',
      paragraphs: [`Hello ${u.name},`, 'The platform administrator set a new password for your account, at your request or for security reasons. Use the password they gave you, then change it on your account page.', 'If you did not expect this, contact us.'],
      button: { label: 'Sign in', url: `${base}/login` },
    });
  }

  if (method === 'saveAnnouncement' && (args[0] as { email?: boolean })?.email && (result as { id?: string })?.id) {
    const id = (result as { id: string }).id;
    const a = ((db[STORAGE_KEYS.ANNOUNCEMENTS] as Announcement[]) || []).find(x => x.id === id);
    if (a) {
      const target = users(db).filter(u => (
        a.audience === 'everyone' ? u.role !== 'super_admin'
          : a.audience === 'institutions' ? (u.role === 'institute_admin' || u.role === 'recruiter')
            : u.role === 'candidate' && (a.audience === 'candidates' || (a.audience === 'premium' ? isPremiumUser(u) : !isPremiumUser(u)))));
      for (const u of target.slice(0, 2000)) list.push({
        key: `announce:${a.id}:${u.id}`, category: 'announcements', kind: 'announcement', user: u,
        subject: a.title, heading: a.title, paragraphs: a.body.split(/\n{2,}/),
        button: a.link ? { label: 'Read more', url: a.link.startsWith('/') ? `${base}${a.link}` : a.link } : undefined,
      });
    }
  }
  return list;
}

// ------------------------------------------------------------------ interview reminders

/** "10:30 AM IST" / "14:00" on "2026-11-05" → epoch ms (IST), or null if the time can't be read. */
export function interviewStart(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const m = String(time || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+05:30`);
}

const REMINDERS = (process.env.INTERVIEW_REMINDER_HOURS || '24,1').split(',').map(Number).filter(n => n > 0).sort((a, b) => b - a);

/**
 * Interview reminders (default 24 hours and 1 hour before). Runs every 10 minutes. The idempotency
 * key includes the interview date and time, so a rescheduled interview gets fresh reminders and a
 * cancelled one (no longer "interview scheduled") gets none.
 */
export async function sendInterviewReminders(now = Date.now()): Promise<number> {
  const base = appUrl();
  const due = await withDb(null, db => {
    const out: NotifyInput[] = [];
    for (const a of apps(db)) {
      const s = a.interviewSlot;
      if (!s || a.status !== 'interview_scheduled') continue;
      const start = interviewStart(s.date, s.time);
      if (!start || start <= now) continue;
      const left = (start - now) / 3600_000;
      // The nearest reminder whose time has come (a reminder is skipped if a shorter one is already due).
      const hours = [...REMINDERS].reverse().find(h => left <= h);
      if (!hours) continue;
      const cand = users(db).find(u => u.id === a.candidateId);
      if (!cand) continue;
      out.push({
        key: `iv-remind:${a.id}:${s.date}:${s.time}:${hours}`, category: 'interviews', kind: 'interview-reminder', user: cand,
        subject: `Interview Reminder — ${a.jobTitle}`, heading: hours >= 24 ? 'Your interview is tomorrow' : `Your interview starts in ${hours === 1 ? 'about an hour' : `about ${hours} hours`}`,
        paragraphs: [`Hello ${cand.name},`, `${a.instituteName} · ${a.jobTitle}`, ...slotLines(s)],
        button: { label: 'Prepare for your interview', url: `${base}/candidate/interview-prep` },
        ref: { jobId: a.jobId, applicationId: a.id },
      });
    }
    return out;
  });
  let n = 0;
  for (const m of due) if (await notify(m).catch(() => null)) n++;
  return n;
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

