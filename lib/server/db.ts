import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'crypto';
import {
  StorageService, STORAGE_KEYS, DEFAULT_ADMIN, StoreContext, setStoreContextProvider, toPublicUser,
} from '@/lib/storage';
import { INITIAL_INSTITUTES, INITIAL_JOBS } from '@/lib/data';
import type { Announcement, Application, CandidateProfile, InterviewSlotOffer, Job, JobAlert, Partner, TalentInvite, User, UserAccount } from '@/types';
import { isPremiumUser } from '@/lib/storage';
import { openStore, deleteBlobPrefix, DATA_DIR as PERSIST_DATA_DIR, type Db } from './persist';

/*
 * The shared AcadeXMatch database. Every collection (users, jobs, applications, ...) is kept under
 * the same keys the app has always used. In production the data lives in the hosting provider's
 * MySQL database (see persist.ts), outside the app's code, so deploying a new version never loses
 * it; locally it falls back to data/db.json. All reads and writes go through withDb, one at a time.
 */

export const DATA_DIR = PERSIST_DATA_DIR;
export const DOCUMENTS_KEY = 'acad_documents_v3';
/** Blob id of an uploaded document. */
export const docBlobId = (userId: string, file: string) => `documents/${userId.replace(/[^A-Za-z0-9_-]/g, '')}/${file.replace(/[^A-Za-z0-9._-]/g, '')}`;
const SESSIONS_KEY = '_sessions';
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'acad_session';

interface Session { userId: string; createdAt: number; expiresAt: number }

const g = globalThis as unknown as {
  __acadChain?: Promise<unknown>;
  __acadAls?: AsyncLocalStorage<StoreContext>;
};
const als = (g.__acadAls ||= new AsyncLocalStorage<StoreContext>());
setStoreContextProvider(() => als.getStore());

function lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g.__acadChain || Promise.resolve()).then(fn, fn);
  g.__acadChain = run.catch(() => undefined);
  return run;
}

function seed(db: Db): boolean {
  let changed = false;
  if (!Array.isArray(db[STORAGE_KEYS.INSTITUTES])) { db[STORAGE_KEYS.INSTITUTES] = INITIAL_INSTITUTES; changed = true; }
  if (!Array.isArray(db[STORAGE_KEYS.JOBS])) { db[STORAGE_KEYS.JOBS] = INITIAL_JOBS; changed = true; }
  for (const k of [STORAGE_KEYS.APPLICATIONS, STORAGE_KEYS.DPDP_REQUESTS, STORAGE_KEYS.AUDIT_LOGS, STORAGE_KEYS.USERS, STORAGE_KEYS.UPGRADE_REQUESTS, STORAGE_KEYS.PAYMENTS, STORAGE_KEYS.JOB_ALERTS, STORAGE_KEYS.TRACKED_JOBS, STORAGE_KEYS.INTERVIEW_SLOTS, STORAGE_KEYS.TALENT_INVITES, STORAGE_KEYS.ANNOUNCEMENTS, STORAGE_KEYS.PARTNERS, STORAGE_KEYS.INTERVIEW_PREP, DOCUMENTS_KEY]) {
    if (!Array.isArray(db[k])) { db[k] = []; changed = true; }
  }
  if (!db[STORAGE_KEYS.CANDIDATE_PROFILES] || typeof db[STORAGE_KEYS.CANDIDATE_PROFILES] !== 'object') { db[STORAGE_KEYS.CANDIDATE_PROFILES] = {}; changed = true; }
  if (!db[SESSIONS_KEY] || typeof db[SESSIONS_KEY] !== 'object') { db[SESSIONS_KEY] = {}; changed = true; }
  const users = db[STORAGE_KEYS.USERS] as UserAccount[];
  if (!users.some(u => u.role === 'super_admin')) { users.unshift({ ...DEFAULT_ADMIN }); changed = true; }
  return changed;
}

/** Runs fn with StorageService bound to the database as `userId`; saves whatever changed. */
export function withDb<T>(userId: string | null, fn: (db: Db, c: StoreContext) => T | Promise<T>, opts: { seed?: string; write?: boolean } = {}): Promise<T> {
  return lock(async () => {
    const store = await openStore();
    try {
      const db = store.data;
      let dirty = false;
      if (seed(db)) dirty = true;
      const c: StoreContext = {
        get: key => db[key],
        set: (key, value) => { if (key === STORAGE_KEYS.SESSION) return; db[key] = value; dirty = true; },
        userId,
        idSeed: opts.seed,
        idCounter: 0,
        hooks: {
          eraseUser: id => { removeUserDocuments(db, id); dirty = true; },
          resetAll: () => {
            for (const k of Object.keys(db)) if (k !== SESSIONS_KEY) delete db[k];
            deleteBlobPrefix('documents/').catch(() => undefined);
            seed(db);
            dirty = true;
          },
        },
      };
      const result = await als.run(c, () => fn(db, c));
      if (dirty || opts.write) await store.save();
      return result;
    } finally {
      await store.close();
    }
  });
}

// ------------------------------------------------------------------ sessions

export function sessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return Promise.resolve(null);
  return withDb(null, db => {
    const s = (db[SESSIONS_KEY] as Record<string, Session>)[token];
    if (!s || s.expiresAt < Date.now()) return null;
    const exists = (db[STORAGE_KEYS.USERS] as UserAccount[]).some(u => u.id === s.userId);
    return exists ? s.userId : null;
  });
}

export function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('hex');
  const maxAge = SESSION_DAYS * 86400;
  return withDb(null, db => {
    const sessions = db[SESSIONS_KEY] as Record<string, Session>;
    const now = Date.now();
    for (const [t, s] of Object.entries(sessions)) if (s.expiresAt < now) delete sessions[t];
    sessions[token] = { userId, createdAt: now, expiresAt: now + maxAge * 1000 };
    return { token, maxAge };
  }, { write: true });
}

export function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return Promise.resolve();
  return withDb(null, db => { delete (db[SESSIONS_KEY] as Record<string, Session>)[token]; }, { write: true });
}

export function deleteSessionsForUser(db: Db, userId: string): void {
  const sessions = db[SESSIONS_KEY] as Record<string, Session>;
  for (const [t, s] of Object.entries(sessions)) if (s.userId === userId) delete sessions[t];
}

// ------------------------------------------------------------------ documents

export interface StoredDocument {
  id: string;
  userId: string;
  category: string;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  file: string;
}

function removeUserDocuments(db: Db, userId: string): void {
  const docs = (db[DOCUMENTS_KEY] as StoredDocument[]) || [];
  db[DOCUMENTS_KEY] = docs.filter(d => d.userId !== userId);
  deleteBlobPrefix(`documents/${userId.replace(/[^A-Za-z0-9_-]/g, '')}/`).catch(() => undefined);
}

/** May `viewer` see `ownerId`'s documents? Owner, platform admin, or staff of an institute the owner applied to. */
export function canViewDocuments(db: Db, viewer: UserAccount | undefined, ownerId: string): boolean {
  if (!viewer) return false;
  if (viewer.id === ownerId || viewer.role === 'super_admin') return true;
  if ((viewer.role === 'institute_admin' || viewer.role === 'recruiter') && viewer.instituteId) {
    return (db[STORAGE_KEYS.APPLICATIONS] as Application[]).some(a => a.candidateId === ownerId && a.instituteId === viewer.instituteId);
  }
  return false;
}

// ------------------------------------------------------------------ helpers

export function accountOf(db: Db, userId: string | null): UserAccount | undefined {
  return userId ? (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.id === userId) : undefined;
}

const isStaff = (u?: UserAccount) => !!u && (u.role === 'institute_admin' || u.role === 'recruiter');

/** What the signed-in user may see — never password hashes, never other people's private records. */
export function buildSnapshot(db: Db, userId: string | null): { me: User | null; data: Record<string, unknown> } {
  const me = accountOf(db, userId);
  const users = db[STORAGE_KEYS.USERS] as UserAccount[];
  const jobs = db[STORAGE_KEYS.JOBS] as Job[];
  const apps = db[STORAGE_KEYS.APPLICATIONS] as Application[];
  const profiles = db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>;
  const strip = (u: UserAccount) => toPublicUser(u) as UserAccount;
  const isAdmin = me?.role === 'super_admin';
  const staffInst = isStaff(me) ? me!.instituteId : undefined;

  let visibleUsers: UserAccount[] = [];
  let visibleApps: Application[] = [];
  let visibleProfiles: Record<string, CandidateProfile> = {};
  let visibleJobs = jobs.filter(j => j.status === 'published' || j.status === 'closed');

  if (isAdmin) {
    visibleUsers = users.map(strip);
    visibleApps = apps;
    visibleProfiles = profiles;
    visibleJobs = jobs;
  } else if (me && staffInst) {
    visibleUsers = users.filter(u => u.id === me.id || u.instituteId === staffInst).map(strip);
    visibleApps = apps.filter(a => a.instituteId === staffInst);
    const applicantIds = new Set(visibleApps.map(a => a.candidateId));
    visibleProfiles = Object.fromEntries(Object.entries(profiles).filter(([id]) => applicantIds.has(id)));
    visibleJobs = jobs.filter(j => j.status === 'published' || j.status === 'closed' || j.instituteId === staffInst);
  } else if (me) {
    visibleUsers = [strip(me)];
    visibleApps = apps.filter(a => a.candidateId === me.id);
    visibleProfiles = profiles[me.id] ? { [me.id]: profiles[me.id] } : {};
  }

  // Interview slots: staff see their institute's; candidates see slots of vacancies they were invited to book,
  // without learning who booked the other slots.
  const allSlots = (db[STORAGE_KEYS.INTERVIEW_SLOTS] as InterviewSlotOffer[]) || [];
  let visibleSlots: InterviewSlotOffer[] = [];
  if (isAdmin) visibleSlots = allSlots;
  else if (me && staffInst) visibleSlots = allSlots.filter(x => x.instituteId === staffInst);
  else if (me) {
    const mine = visibleApps.filter(a => a.slotInvite || a.bookedSlotId);
    const jobIds = new Set(mine.map(a => a.jobId));
    const myAppIds = new Set(mine.map(a => a.id));
    visibleSlots = allSlots.filter(x => jobIds.has(x.jobId)).map(x => ({
      ...x, booked: !!x.bookedByAppId, bookedByAppId: x.bookedByAppId && myAppIds.has(x.bookedByAppId) ? x.bookedByAppId : null, committeeMembers: [],
    }));
  }
  const invites = (db[STORAGE_KEYS.TALENT_INVITES] as TalentInvite[]) || [];
  const visibleInvites = isAdmin ? invites : staffInst ? invites.filter(i => i.instituteId === staffInst) : me ? invites.filter(i => i.candidateId === me.id) : [];
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const audienceOk = (a: Announcement) => {
    if (a.audience === 'everyone') return true;
    if (!me) return false;
    if (a.audience === 'institutions') return isStaff(me);
    if (me.role !== 'candidate') return false;
    if (a.audience === 'premium') return isPremiumUser(me);
    if (a.audience === 'free') return !isPremiumUser(me);
    return true;
  };
  const anns = (db[STORAGE_KEYS.ANNOUNCEMENTS] as Announcement[]) || [];
  const visibleAnns = isAdmin ? anns : anns.filter(a => a.active && (!a.expiresAt || a.expiresAt >= todayIso) && audienceOk(a));
  const partners = (db[STORAGE_KEYS.PARTNERS] as Partner[]) || [];

  const own = <T extends { userId?: string }>(key: string): T[] => {
    const all = (db[key] as T[]) || [];
    return isAdmin ? all : me ? all.filter(r => r.userId === me.id) : [];
  };

  return {
    me: me ? toPublicUser(me) : null,
    data: {
      [STORAGE_KEYS.USERS]: visibleUsers,
      [STORAGE_KEYS.INSTITUTES]: db[STORAGE_KEYS.INSTITUTES],
      [STORAGE_KEYS.JOBS]: visibleJobs,
      [STORAGE_KEYS.CANDIDATE_PROFILES]: visibleProfiles,
      [STORAGE_KEYS.APPLICATIONS]: visibleApps,
      [STORAGE_KEYS.DPDP_REQUESTS]: own(STORAGE_KEYS.DPDP_REQUESTS),
      [STORAGE_KEYS.UPGRADE_REQUESTS]: own(STORAGE_KEYS.UPGRADE_REQUESTS),
      [STORAGE_KEYS.JOB_ALERTS]: own(STORAGE_KEYS.JOB_ALERTS),
      [STORAGE_KEYS.TRACKED_JOBS]: own(STORAGE_KEYS.TRACKED_JOBS),
      [STORAGE_KEYS.INTERVIEW_PREP]: me ? ((db[STORAGE_KEYS.INTERVIEW_PREP] as { userId: string }[]) || []).filter(r => r.userId === me.id) : [],
      [STORAGE_KEYS.PAYMENTS]: isAdmin ? db[STORAGE_KEYS.PAYMENTS] : me ? ((db[STORAGE_KEYS.PAYMENTS] as { userId: string; instituteId?: string }[]) || []).filter(p => p.userId === me.id || (staffInst && p.instituteId === staffInst)) : [],
      [STORAGE_KEYS.AUDIT_LOGS]: isAdmin ? db[STORAGE_KEYS.AUDIT_LOGS] : [],
      [STORAGE_KEYS.INTERVIEW_SLOTS]: visibleSlots,
      [STORAGE_KEYS.TALENT_INVITES]: visibleInvites,
      [STORAGE_KEYS.ANNOUNCEMENTS]: visibleAnns,
      [STORAGE_KEYS.PARTNERS]: isAdmin ? partners : partners.filter(p => p.active),
      [STORAGE_KEYS.PLAN_SETTINGS]: db[STORAGE_KEYS.PLAN_SETTINGS] ?? null,
    },
  };
}

// ------------------------------------------------------------------ permissions

type Guard = (me: UserAccount | undefined, args: unknown[], db: Db) => true | string;
const signedIn: Guard = me => (me ? true : 'Please sign in.');
const admin: Guard = me => (me?.role === 'super_admin' ? true : 'Only the platform administrator can do this.');
const candidate: Guard = me => (me?.role === 'candidate' ? true : 'Candidate accounts only.');
const jobOfOwnInstitute: Guard = (me, args, db) => {
  if (me?.role === 'super_admin') return true;
  const job = (db[STORAGE_KEYS.JOBS] as Job[]).find(j => j.id === args[0]);
  return isStaff(me) && job && job.instituteId === me!.instituteId ? true : 'You can only manage your own institute’s vacancies.';
};
const appOfOwnInstitute: Guard = (me, args, db) => {
  if (me?.role === 'super_admin') return true;
  const app = (db[STORAGE_KEYS.APPLICATIONS] as Application[]).find(a => a.id === args[0]);
  return isStaff(me) && app && app.instituteId === me!.instituteId ? true : 'You can only manage applications to your own institute.';
};
const ownProfile: Guard = (me, args, db) => {
  const p = args[0] as CandidateProfile | undefined;
  if (me?.role === 'super_admin') return true;
  if (!(me?.role === 'candidate' && p && p.userId === me.id)) return 'You can only edit your own profile.';
  // Only the administrator may set the documents-verified badge.
  const stored = (db[STORAGE_KEYS.CANDIDATE_PROFILES] as Record<string, CandidateProfile>)[me.id];
  p.documentsVerified = stored?.documentsVerified ?? null;
  return true;
};
const staffOrAdmin: Guard = me => (me?.role === 'super_admin' || isStaff(me) ? true : 'Institution staff only.');
const slotOfOwnInstitute: Guard = (me, args, db) => {
  if (me?.role === 'super_admin') return true;
  const slot = ((db[STORAGE_KEYS.INTERVIEW_SLOTS] as InterviewSlotOffer[]) || []).find(x => x.id === args[0]);
  return isStaff(me) && slot && slot.instituteId === me!.instituteId ? true : 'You can only manage your own institute’s slots.';
};

const ownAlert: Guard = (me, args, db) => {
  if (me?.role === 'super_admin') return true;
  return me && ((db[STORAGE_KEYS.JOB_ALERTS] as JobAlert[]) || []).some(a => a.id === args[0] && a.userId === me.id) ? true : 'You can only change your own alerts.';
};

const ownTracked: Guard = (me, args, db) => {
  if (me?.role === 'super_admin') return true;
  return me && ((db[STORAGE_KEYS.TRACKED_JOBS] as { id: string; userId: string }[]) || []).some(t => t.id === args[0] && t.userId === me.id) ? true : 'You can only change your own tracker.';
};

/** Every action the browser may ask the server to perform, with who may perform it. */
export const RPC_GUARDS: Record<string, Guard> = {
  // candidates
  updateCandidateProfile: ownProfile,
  saveProfileRecord: ownProfile,
  applyToJob: candidate,
  withdrawApplication: candidate,
  requestPremiumUpgrade: candidate,
  saveJobAlert: (me, args, db) => {
    if (me?.role !== 'candidate') return 'Job alerts are for candidate accounts.';
    const id = (args[0] as { id?: string } | undefined)?.id;
    if (!id) return true;
    return ((db[STORAGE_KEYS.JOB_ALERTS] as JobAlert[]) || []).some(a => a.id === id && a.userId === me.id) ? true : 'You can only change your own alerts.';
  },
  setJobAlertActive: ownAlert,
  deleteJobAlert: ownAlert,
  trackJob: candidate,
  untrackJob: candidate,
  addExternalTrackedJob: candidate,
  updateTrackedJob: ownTracked,
  removeTrackedJob: ownTracked,
  createDPDPRequest: signedIn,
  bookInterviewSlot: candidate,
  cancelInterviewBooking: signedIn,
  respondToOffer: candidate,
  respondTalentInvite: candidate,
  changePassword: signedIn,
  savePrepState: (me, args) => {
    if (!me) return 'Please sign in.';
    if (args[0] !== 'notes' && args[0] !== 'ticks') return 'Invalid request.';
    if (!args[1] || typeof args[1] !== 'object' || JSON.stringify(args[1]).length > 200_000) return 'Your notes are too long to save.';
    return true;
  },
  // institution staff (own institute) or admin
  addJob: (me, args) => {
    if (me?.role === 'super_admin') return true;
    const job = args[0] as Job | undefined;
    if (!(isStaff(me) && job && job.instituteId === me!.instituteId)) return 'You can only post vacancies for your own institute.';
    // Promotions are only set by a verified payment or by the administrator.
    job.featuredUntil = null; job.urgentUntil = null; job.featured = false;
    return true;
  },
  setJobStatus: jobOfOwnInstitute,
  updateJob: (me, args, db) => {
    const ok = jobOfOwnInstitute(me, args, db);
    if (ok === true && me?.role !== 'super_admin' && args[1] && typeof args[1] === 'object') {
      delete (args[1] as Partial<Job>).featuredUntil; delete (args[1] as Partial<Job>).urgentUntil; delete (args[1] as Partial<Job>).featured;
    }
    return ok;
  },
  setJobPromotion: admin,
  updateApplicationStage: appOfOwnInstitute,
  addReviewerScore: appOfOwnInstitute,
  scheduleInterview: appOfOwnInstitute,
  makeOffer: appOfOwnInstitute,
  addInterviewSlots: jobOfOwnInstitute,
  deleteInterviewSlot: slotOfOwnInstitute,
  inviteToBookSlots: staffOrAdmin,
  sendTalentInvite: staffOrAdmin,
  updateInstitute: (me, args) => {
    if (me?.role === 'super_admin') return true;
    const patch = (args[1] || {}) as Record<string, unknown>;
    const forbidden = ['verificationStatus', 'verifiedAt', 'subscription', 'aisheCode', 'id'].filter(k => k in patch);
    if (forbidden.length) return 'These institute details can only be changed by the platform administrator.';
    return me?.role === 'institute_admin' && me.instituteId === args[0] ? true : 'You can only edit your own institute.';
  },
  requestInstituteSubscription: (me, args) =>
    me?.role === 'super_admin' || (me?.role === 'institute_admin' && me.instituteId === args[0]) ? true : 'Only your institute administrator can request the subscription.',
  // platform admin only
  adminCreateUser: admin, adminUpdateUser: admin, adminResetPassword: admin, adminDeleteUser: admin,
  savePlanSettings: admin, setUserPlan: admin, resolveUpgradeRequest: admin, deleteUpgradeRequest: admin,
  updateInstituteVerification: admin, adminCreateInstitute: admin, adminUpdateInstitute: admin, adminDeleteInstitute: admin,
  setInstituteSubscription: admin, declineInstituteSubscription: admin,
  deleteJob: admin, deleteApplication: admin, addJobs: admin, closeExpiredJobs: admin,
  updateDPDPStatus: admin, eraseUserData: admin, deleteDPDPRequest: admin, clearAuditLogs: admin,
  importAllData: admin, resetAllData: admin, addAuditLog: admin, createPendingInstitute: admin,
  saveAnnouncement: admin, setAnnouncementActive: admin, deleteAnnouncement: admin, setCandidateVerification: admin,
  savePartner: admin, deletePartner: admin,
};

/** Runs one StorageService action on the server for the signed-in user, after the permission check. */
export async function runRpc(userId: string | null, method: string, args: unknown[], seedValue?: string): Promise<{ ok: true; result: unknown } | { ok: false; error: string; status: number }> {
  const guard = RPC_GUARDS[method];
  const fn = (StorageService as unknown as Record<string, unknown>)[method];
  if (!guard || typeof fn !== 'function') return { ok: false, error: 'Unknown action.', status: 400 };
  return withDb(userId, async db => {
    const me = accountOf(db, userId);
    const allowed = guard(me, args, db);
    if (allowed !== true) return { ok: false as const, error: allowed, status: 403 };
    try {
      const result = await (fn as (...a: unknown[]) => unknown).apply(StorageService, args);
      if (method === 'adminDeleteUser' || method === 'eraseUserData') {
        const id = String(args[0]);
        if (!accountOf(db, id)) deleteSessionsForUser(db, id);
      }
      return { ok: true as const, result };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || 'The action failed.', status: 400 };
    }
  }, { seed: typeof seedValue === 'string' ? seedValue.slice(0, 24) : undefined });
}
