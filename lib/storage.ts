import {
  Institute,
  Job,
  CandidateProfile,
  Application,
  DPDPDataRequest,
  AuditLog,
  User,
  UserAccount,
  UserRole,
  InstitutionType,
  UpgradeRequest,
  PlanSettings,
  CandidatePlan,
  InstituteSubscription,
  Payment, JobAlert, JobSearchFilters, AlertFrequency, TrackedJob, TrackedStatus,
  ApplicationStage,
  ReviewerScoreItem,
  InterviewSlot,
  InterviewSlotOffer,
  TalentInvite,
  Announcement,
  Partner,
  PremiumPlanOption,
} from '@/types';
import { INITIAL_INSTITUTES, INITIAL_JOBS } from './data';
import { calculateMatchScore, withDerivedProfileFields } from './scoring';
import { pbkdf2Sha256 } from './pbkdf2';
import { cleanFilters, nameFromFilters } from './jobFilter';

// v3: accounts with hashed passwords; no seeded demo users / applications.
export const STORAGE_KEYS = {
  INSTITUTES: 'acad_institutes_v3',
  JOBS: 'acad_jobs_v3',
  CANDIDATE_PROFILES: 'acad_candidate_profiles_v3',
  APPLICATIONS: 'acad_applications_v3',
  DPDP_REQUESTS: 'acad_dpdp_requests_v3',
  AUDIT_LOGS: 'acad_audit_logs_v3',
  SESSION: 'acad_session_v3',
  USERS: 'acad_users_v3',
  UPGRADE_REQUESTS: 'acad_upgrade_requests_v3',
  PLAN_SETTINGS: 'acad_plan_settings_v3',
  PAYMENTS: 'acad_payments_v3',
  JOB_ALERTS: 'acad_job_alerts_v3',
  TRACKED_JOBS: 'acad_tracked_jobs_v3',
  INTERVIEW_SLOTS: 'acad_interview_slots_v3',
  TALENT_INVITES: 'acad_talent_invites_v3',
  ANNOUNCEMENTS: 'acad_announcements_v3',
  PARTNERS: 'acad_partners_v3',
  INTERVIEW_PREP: 'acad_interview_prep_v3',
};

interface PrepStateRecord { id: string; userId: string; kind: 'notes' | 'ticks'; data: Record<string, unknown>; updatedAt: string }

export const STORAGE_EVENT = 'acad-storage-updated';
const MAX_AUDIT_LOGS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AuthResult = { success: true; user: User } | { success: false; error: string };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  /** Existing institute an institute admin belongs to. */
  instituteId?: string;
  /** Details for a new institute registered by an institute admin (created as pending verification). */
  newInstitute?: { name: string; aisheCode: string; city: string; state: string; website?: string };
}

/*
 * Where the data lives. The same StorageService code runs in two places:
 *  - on the server (lib/server/db.ts), against the shared database, as the authority;
 *  - in the browser (lib/clientSync.ts), against a synced copy of what the signed-in user may see,
 *    so pages update instantly; every change is then re-run and checked on the server.
 */
export interface StoreContext {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Signed-in user's id, or null. */
  userId: string | null;
  /** Shared seed so ids created in the browser and on the server match. */
  idSeed?: string;
  idCounter: number;
  hooks?: { eraseUser?(userId: string): void; resetAll?(): void };
}

let contextProvider: () => StoreContext | undefined = () => undefined;
export function setStoreContextProvider(fn: () => StoreContext | undefined): void {
  contextProvider = fn;
}
function ctx(): StoreContext | undefined {
  return contextProvider();
}

function getFromStorage<T>(key: string, fallback: T): T {
  const c = ctx();
  if (!c) return fallback;
  const v = c.get(key);
  return v === undefined || v === null ? fallback : (v as T);
}

function setToStorage<T>(key: string, value: T): void {
  const c = ctx();
  if (!c) return;
  c.set(key, value);
}

function nowIst(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function newId(prefix: string): string {
  const c = ctx();
  if (c?.idSeed) return `${prefix}-${c.idSeed}${(c.idCounter++).toString(36)}`;
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * PBKDF2-SHA256 password hash. Uses Web Crypto when available; browsers hide it on plain-http
 * network addresses (e.g. http://192.168.1.10:3000), so a pure-JS implementation with identical
 * output is used there.
 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) {
    try {
      const keyMaterial = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, keyMaterial, 256);
      return toHex(bits);
    } catch {
      // fall through to the JavaScript implementation
    }
  }
  return toHex(pbkdf2Sha256(enc.encode(password), salt, 120000).buffer as ArrayBuffer);
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes.buffer);
}

export function toPublicUser(account: UserAccount): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, salt, ...user } = account;
  return user;
}

/**
 * Tidies a web address typed into a form: "www.mits.ac.in" or "mits.ac.in/careers" becomes "https://…".
 * Empty input stays empty; anything that is not a web address is returned unchanged.
 */
export function normalizeUrl(value?: string | null): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('//')) return `https:${v}`;
  if (/^[^\s/@]+\.[a-z]{2,}([/:?#].*)?$/i.test(v)) return `https://${v}`;
  return v;
}

/** Email domain of an institute, derived from its website ("https://www.iitb.ac.in" -> "iitb.ac.in"). */
export function institutionDomain(institute: Institute): string | null {
  try {
    return institute.website ? new URL(normalizeUrl(institute.website)).hostname.replace(/^www\./, '').toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Today's date in India (YYYY-MM-DD). */
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Published vacancies whose last date (India time) is over. */
export function expiredOpenJobs(jobs: Job[]): Job[] {
  const t = istToday();
  return jobs.filter(j => j.status === 'published' && !!j.applicationDeadline && j.applicationDeadline < t);
}

export function isDeadlinePassed(job: Job): boolean {
  return job.applicationDeadline !== null && job.applicationDeadline < today();
}

/** Blank dossier for a newly registered candidate — every field is filled in by the candidate. */
export function createEmptyCandidateProfile(user: User): CandidateProfile {
  return withDerivedProfileFields({
    id: `cand-${user.id}`,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: '',
    location: { city: '', state: '' },
    currentDesignation: '',
    currentInstitute: '',
    highestDegree: '',
    netSletStatus: { isQualified: false },
    phdStatus: { isCompleted: false, isUgc2009_2016Compliant: false },
    education: [],
    experience: [],
    publications: [],
    researchInterests: [],
    skills: [],
    scholarLinks: {},
    apiScore: 0,
    profileCompleteness: 0,
    bio: '',
    teachingPhilosophy: '',
    awardLevel: 'none',
    aiMatchingConsent: true,
  });
}

/**
 * Default platform administrator, available in every browser until another admin exists.
 * Email: admin@acadexmatch.in  Password: Admin@12345  (change it after first login).
 */
export const DEFAULT_ADMIN: UserAccount = {
  id: 'user-default-admin',
  name: 'Platform Administrator',
  email: 'admin@acadexmatch.in',
  role: 'super_admin',
  createdAt: '2026-10-21',
  salt: 'a5c3d9e1f7b2468c0d1e2f3a4b5c6d7e',
  passwordHash: '88bc10c0951a833cc90535fc7a069c192e6cd1b670a7a68e1df7bbbd3ecdcaba',
  emailVerified: true,
};

export const DEFAULT_PREMIUM_PLANS: PremiumPlanOption[] = [
  { key: 'monthly', label: 'Monthly', months: 1, priceInr: 149, enabled: true },
  { key: 'yearly', label: 'Yearly', months: 12, priceInr: 999, enabled: true, note: 'Best value' },
  { key: 'scholar', label: 'Research scholar', months: 12, priceInr: 499, enabled: true, note: 'For registered Ph.D. research scholars (JRF / SRF / full-time). We may ask for your registration proof.' },
];

/** Enabled Premium plan options. Older settings without plan options fall back to one yearly plan. */
export function premiumPlansOf(s: PlanSettings): PremiumPlanOption[] {
  if (!s.premiumPlans?.length) return [{ key: 'yearly', label: 'Yearly', months: s.premiumDurationMonths || 12, priceInr: s.premiumPriceInr || 0, enabled: true }];
  return s.premiumPlans.filter(p => p.enabled && p.priceInr > 0 && p.months > 0);
}

export const DEFAULT_PROMOTION = { featuredPriceInr: 1999, featuredDays: 30, urgentPriceInr: 499, urgentDays: 14 };

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  premiumPriceLabel: '₹999 per year',
  premiumDurationMonths: 12,
  upgradeInstructions: 'Send your upgrade request. The AcadeXMatch team will contact you with payment details and activate Premium once payment is received. Questions: info@acadexmatch.com',
  institutionPriceLabel: '₹14,999 per year',
  institutionDurationMonths: 12,
  institutionInstructions: 'After you register, the AcadeXMatch team will send an invoice to your official email. Your institution tools are activated as soon as payment is received. Questions: info@acadexmatch.com',
  premiumPriceInr: 999,
  institutionPriceInr: 14999,
  premiumPlans: DEFAULT_PREMIUM_PLANS,
  ...DEFAULT_PROMOTION,
  gstPercent: 18,
  invoiceBusinessName: 'AcadeXMatch',
  invoiceAddress: '',
  invoiceGstin: '',
};


const todayIstIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
/** Paid "Featured" promotion still running. */
export function isJobFeatured(job: Pick<Job, 'featuredUntil'>): boolean {
  return !!job.featuredUntil && job.featuredUntil >= todayIstIso();
}
/** Paid "Urgent hiring" label still running. */
export function isJobUrgent(job: Pick<Job, 'urgentUntil'>): boolean {
  return !!job.urgentUntil && job.urgentUntil >= todayIstIso();
}

/** True when an institute has an active, unexpired Institution Premium subscription. */
export function isInstituteSubscribed(inst: Pick<Institute, 'subscription'> | null | undefined): boolean {
  const sub = inst?.subscription;
  if (!sub || sub.status !== 'active') return false;
  return !sub.activeUntil || sub.activeUntil >= today();
}

/** True when a user currently has active Premium access. */
export function isPremiumUser(user: Pick<User, 'role' | 'plan' | 'premiumUntil'> | null | undefined): boolean {
  if (!user || user.role !== 'candidate' || user.plan !== 'premium') return false;
  return !user.premiumUntil || user.premiumUntil >= today();
}

/** Where a Free candidate applies: the vacancy's own link, else the institute website. */
export function externalApplyLink(job: Job, institute?: Institute | null): string | null {
  const url = job.externalApplyUrl?.trim() || institute?.website?.trim() || '';
  return /^https?:\/\//i.test(url) ? url : null;
}

export const StorageService = {
  // ---------------------------------------------------------------- Accounts

  /** Accounts visible here. On the server they include password hashes; the browser copy never does. */
  getAccounts(): UserAccount[] {
    return getFromStorage<UserAccount[]>(STORAGE_KEYS.USERS, []);
  },

  getUsers(): User[] {
    return this.getAccounts().map(toPublicUser);
  },

  hasSuperAdmin(): boolean {
    return this.getAccounts().some(u => u.role === 'super_admin');
  },

  getCurrentUser(): User | null {
    const userId = ctx()?.userId;
    if (!userId) return null;
    const account = this.getAccounts().find(u => u.id === userId);
    return account ? toPublicUser(account) : null;
  },

  async register(input: RegisterInput): Promise<AuthResult> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: 'Please enter your full name.' };
    if (!EMAIL_RE.test(email)) return { success: false, error: 'Please enter a valid email address.' };
    if (input.password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' };

    const accounts = this.getAccounts();
    if (accounts.some(u => u.email === email)) {
      return { success: false, error: 'An account with this email already exists. Please sign in.' };
    }
    if (input.role === 'super_admin' && this.hasSuperAdmin()) {
      return { success: false, error: 'A platform administrator already exists.' };
    }

    let instituteId: string | undefined;
    if (input.role === 'institute_admin') {
      if (input.newInstitute) {
        const ni = input.newInstitute;
        if (!ni.name.trim() || !ni.aisheCode.trim()) {
          return { success: false, error: 'Institute name and AISHE code are required.' };
        }
        const existing = this.getInstitutes().find(i => i.aisheCode.toLowerCase() === ni.aisheCode.trim().toLowerCase());
        if (existing) {
          return { success: false, error: `AISHE code ${ni.aisheCode} is already registered to ${existing.name}. Select it from the list instead.` };
        }
        instituteId = this.createPendingInstitute(ni, email).id;
      } else if (input.instituteId && this.getInstituteById(input.instituteId)) {
        const domain = institutionDomain(this.getInstituteById(input.instituteId)!);
        if (domain && !(email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`))) {
          return { success: false, error: `Use your official @${domain} email to join this institute.` };
        }
        instituteId = input.instituteId;
      } else {
        return { success: false, error: 'Please select your institute or register a new one.' };
      }
    }

    const salt = randomSalt();
    const account: UserAccount = {
      id: newId('user'),
      name,
      email,
      role: input.role,
      instituteId,
      createdAt: today(),
      salt,
      passwordHash: await hashPassword(input.password, salt),
      emailVerified: false,
    };
    setToStorage(STORAGE_KEYS.USERS, [...accounts, account]);

    const user = toPublicUser(account);
    if (user.role === 'candidate') {
      this.saveProfileRecord(createEmptyCandidateProfile(user));
    }

    const c = ctx();
    if (c) c.userId = user.id; // the new account is signed in for the rest of this request
    this.addAuditLog(`New ${user.role.replace('_', ' ')} account registered: ${email}`, user.id, 'AUTHENTICATION');
    if (user.role === 'institute_admin' && instituteId) {
      this.requestInstituteSubscription(instituteId, email);
    }
    return { success: true, user };
  },

  async login(emailInput: string, password: string): Promise<AuthResult> {
    const email = emailInput.trim().toLowerCase();
    const account = this.getAccounts().find(u => u.email === email);
    // Hash even when the account is missing so failed lookups take similar time.
    const hash = await hashPassword(password, account?.salt || '00'.repeat(16));
    if (!account || hash !== account.passwordHash) {
      return { success: false, error: 'Incorrect email or password.' };
    }
    const c = ctx();
    if (c) c.userId = account.id;
    this.addAuditLog(`Signed in: ${email}`, account.id, 'AUTHENTICATION');
    return { success: true, user: toPublicUser(account) };
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const user = this.getCurrentUser();
    if (!user) return { success: false, error: 'Not signed in.' };
    if (newPassword.length < 8) return { success: false, error: 'New password must be at least 8 characters.' };
    const accounts = this.getAccounts();
    const account = accounts.find(a => a.id === user.id)!;
    if ((await hashPassword(currentPassword, account.salt)) !== account.passwordHash) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    const salt = randomSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    setToStorage(STORAGE_KEYS.USERS, accounts.map(a => (a.id === user.id ? { ...a, salt, passwordHash } : a)));
    this.addAuditLog('Password changed', user.id, 'AUTHENTICATION');
    return { success: true };
  },

  /** Replaced in the browser by a call that ends the server session (see lib/clientSync.ts). */
  logout(): void | Promise<void> {
    const user = this.getCurrentUser();
    if (user) this.addAuditLog(`Signed out: ${user.email}`, user.id, 'AUTHENTICATION');
  },

  // ------------------------------------------------------ Admin: user management

  isSuperAdmin(): boolean {
    return this.getCurrentUser()?.role === 'super_admin';
  },

  /** Creates any kind of account (including another platform admin) without signing in as it. */
  async adminCreateUser(input: RegisterInput): Promise<{ success: boolean; error?: string }> {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: 'Please enter a full name.' };
    if (!EMAIL_RE.test(email)) return { success: false, error: 'Please enter a valid email address.' };
    if (input.password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' };
    const accounts = this.getAccounts();
    if (accounts.some(u => u.email === email)) return { success: false, error: 'An account with this email already exists.' };
    const needsInstitute = input.role === 'institute_admin' || input.role === 'recruiter';
    if (needsInstitute && !(input.instituteId && this.getInstituteById(input.instituteId))) {
      return { success: false, error: 'Choose the institute this account belongs to.' };
    }
    const salt = randomSalt();
    const account: UserAccount = {
      id: newId('user'),
      name,
      email,
      role: input.role,
      instituteId: needsInstitute ? input.instituteId : undefined,
      createdAt: today(),
      salt,
      passwordHash: await hashPassword(input.password, salt),
      emailVerified: true,
    };
    setToStorage(STORAGE_KEYS.USERS, [...accounts, account]);
    if (account.role === 'candidate') this.saveProfileRecord(createEmptyCandidateProfile(toPublicUser(account)));
    this.addAuditLog(`Admin created ${account.role.replace('_', ' ')} account ${email}`, account.id, 'AUTHENTICATION');
    return { success: true };
  },

  adminUpdateUser(id: string, patch: { name?: string; email?: string; role?: UserRole; instituteId?: string }): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const accounts = this.getAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) return { success: false, error: 'Account not found.' };
    const email = (patch.email ?? target.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { success: false, error: 'Please enter a valid email address.' };
    if (accounts.some(a => a.email === email && a.id !== id)) return { success: false, error: 'Another account already uses this email.' };
    const role = patch.role ?? target.role;
    const admins = accounts.filter(a => a.role === 'super_admin');
    if (target.role === 'super_admin' && role !== 'super_admin') {
      if (id === this.getCurrentUser()?.id) return { success: false, error: 'You cannot remove your own administrator rights.' };
      if (admins.length <= 1) return { success: false, error: 'At least one platform administrator must remain.' };
    }
    const needsInstitute = role === 'institute_admin' || role === 'recruiter';
    const instituteId = needsInstitute ? (patch.instituteId ?? target.instituteId) : undefined;
    if (needsInstitute && !(instituteId && this.getInstituteById(instituteId))) {
      return { success: false, error: 'Choose the institute this account belongs to.' };
    }
    const name = (patch.name ?? target.name).trim();
    if (name.length < 2) return { success: false, error: 'Please enter a full name.' };
    const updated: UserAccount = { ...target, name, email, role, instituteId };
    setToStorage(STORAGE_KEYS.USERS, accounts.map(a => (a.id === id ? updated : a)));
    const profile = this.getProfilesMap()[id];
    if (role === 'candidate') {
      this.saveProfileRecord(profile ? { ...profile, name, email } : createEmptyCandidateProfile(toPublicUser(updated)));
    }
    this.addAuditLog(`Admin updated account ${email}`, id, 'AUTHENTICATION');
    return { success: true };
  },

  async adminResetPassword(id: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    if (newPassword.length < 8) return { success: false, error: 'Password must be at least 8 characters.' };
    const accounts = this.getAccounts();
    if (!accounts.some(a => a.id === id)) return { success: false, error: 'Account not found.' };
    const salt = randomSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    setToStorage(STORAGE_KEYS.USERS, accounts.map(a => (a.id === id ? { ...a, salt, passwordHash } : a)));
    this.addAuditLog('Admin reset an account password', id, 'AUTHENTICATION');
    return { success: true };
  },

  adminDeleteUser(id: string): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    if (id === this.getCurrentUser()?.id) return { success: false, error: 'You cannot delete the account you are signed in with.' };
    const accounts = this.getAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) return { success: false, error: 'Account not found.' };
    if (target.role === 'super_admin' && accounts.filter(a => a.role === 'super_admin').length <= 1) {
      return { success: false, error: 'At least one platform administrator must remain.' };
    }
    this.eraseUserData(id);
    return { success: true };
  },

  // ------------------------------------------------------- Candidate plans

  isCurrentUserPremium(): boolean {
    return isPremiumUser(this.getCurrentUser());
  },

  getPlanSettings(): PlanSettings {
    return { ...DEFAULT_PLAN_SETTINGS, ...getFromStorage<Partial<PlanSettings>>(STORAGE_KEYS.PLAN_SETTINGS, {}) };
  },

  savePlanSettings(settings: PlanSettings): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.PLAN_SETTINGS, settings);
    this.addAuditLog('Updated Premium plan settings', 'plan-settings', 'AUTHENTICATION');
  },

  /** Admin: set a candidate's plan. `months` extends Premium from today (or from the current end date). */
  setUserPlan(userId: string, plan: CandidatePlan, months?: number): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const accounts = this.getAccounts();
    const target = accounts.find(a => a.id === userId);
    if (!target || target.role !== 'candidate') return { success: false, error: 'Plans apply to candidate accounts only.' };
    let premiumUntil: string | undefined;
    if (plan === 'premium' && months && months > 0) {
      const start = target.plan === 'premium' && target.premiumUntil && target.premiumUntil >= today() ? new Date(target.premiumUntil) : new Date();
      start.setMonth(start.getMonth() + months);
      premiumUntil = start.toISOString().slice(0, 10);
    }
    setToStorage(STORAGE_KEYS.USERS, accounts.map(a => (a.id === userId ? { ...a, plan, premiumUntil: plan === 'premium' ? premiumUntil : undefined } : a)));
    this.addAuditLog(plan === 'premium' ? `Premium granted to ${target.email}${premiumUntil ? ` until ${premiumUntil}` : ''}` : `Premium removed from ${target.email}`, userId, 'AUTHENTICATION');
    return { success: true };
  },

  getJobAlerts(): JobAlert[] {
    return getFromStorage<JobAlert[]>(STORAGE_KEYS.JOB_ALERTS, []);
  },

  getMyJobAlerts(): JobAlert[] {
    const user = this.getCurrentUser();
    return user ? this.getJobAlerts().filter(a => a.userId === user.id) : [];
  },

  /** Creates or updates one of the signed-in candidate's job alerts. */
  saveJobAlert(input: { id?: string; name: string; filters: JobSearchFilters; frequency: AlertFrequency; active?: boolean }): { success: boolean; error?: string; id?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return { success: false, error: 'Job alerts are for candidate accounts.' };
    const all = this.getJobAlerts();
    const mine = all.filter(a => a.userId === user.id);
    const name = (input.name || '').trim().slice(0, 80) || nameFromFilters(cleanFilters(input.filters)).slice(0, 80);
    const frequency: AlertFrequency = input.frequency === 'weekly' ? 'weekly' : 'daily';
    if (input.id) {
      const cur = mine.find(a => a.id === input.id);
      if (!cur) return { success: false, error: 'Alert not found.' };
      setToStorage(STORAGE_KEYS.JOB_ALERTS, all.map(a => (a.id === cur.id ? { ...a, name, filters: cleanFilters(input.filters), frequency, active: input.active ?? a.active } : a)));
      return { success: true, id: cur.id };
    }
    if (mine.length >= 10) return { success: false, error: 'You can keep up to 10 job alerts. Delete one to add another.' };
    const alert: JobAlert = { id: newId('alert'), userId: user.id, name, filters: cleanFilters(input.filters), frequency, active: input.active ?? true, createdAt: nowIst() };
    setToStorage(STORAGE_KEYS.JOB_ALERTS, [alert, ...all]);
    return { success: true, id: alert.id };
  },

  setJobAlertActive(id: string, active: boolean): void {
    const user = this.getCurrentUser();
    if (!user) return;
    setToStorage(STORAGE_KEYS.JOB_ALERTS, this.getJobAlerts().map(a => (a.id === id && (a.userId === user.id || user.role === 'super_admin') ? { ...a, active } : a)));
  },

  deleteJobAlert(id: string): void {
    const user = this.getCurrentUser();
    if (!user) return;
    setToStorage(STORAGE_KEYS.JOB_ALERTS, this.getJobAlerts().filter(a => !(a.id === id && (a.userId === user.id || user.role === 'super_admin'))));
  },

  /** Interview-prep practice notes ('notes') and checklist ticks ('ticks') of the signed-in user. */
  getPrepState<T = Record<string, unknown>>(kind: 'notes' | 'ticks'): T {
    const user = this.getCurrentUser();
    if (!user) return {} as T;
    const rec = getFromStorage<PrepStateRecord[]>(STORAGE_KEYS.INTERVIEW_PREP, []).find(r => r.userId === user.id && r.kind === kind);
    return (rec?.data || {}) as T;
  },

  savePrepState(kind: 'notes' | 'ticks', data: Record<string, unknown>): void {
    const user = this.getCurrentUser();
    if (!user || (kind !== 'notes' && kind !== 'ticks')) return;
    const rest = getFromStorage<PrepStateRecord[]>(STORAGE_KEYS.INTERVIEW_PREP, []).filter(r => !(r.userId === user.id && r.kind === kind));
    setToStorage(STORAGE_KEYS.INTERVIEW_PREP, [...rest, { id: `${user.id}_${kind}`, userId: user.id, kind, data, updatedAt: new Date().toISOString() }]);
  },

  getTrackedJobs(): TrackedJob[] {
    return getFromStorage<TrackedJob[]>(STORAGE_KEYS.TRACKED_JOBS, []);
  },

  getMyTrackedJobs(): TrackedJob[] {
    const user = this.getCurrentUser();
    return user ? this.getTrackedJobs().filter(t => t.userId === user.id) : [];
  },

  /** Saves an AcadeXMatch vacancy to the candidate's deadline tracker (or updates its status). */
  trackJob(jobId: string, status: TrackedStatus = 'saved'): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return { success: false, error: 'Sign in with a candidate account to save vacancies.' };
    const job = this.getJobs().find(j => j.id === jobId);
    if (!job) return { success: false, error: 'Vacancy not found.' };
    const all = this.getTrackedJobs();
    const cur = all.find(t => t.userId === user.id && t.jobId === jobId);
    const now = nowIst();
    if (cur) {
      setToStorage(STORAGE_KEYS.TRACKED_JOBS, all.map(t => (t.id === cur.id ? { ...t, status, appliedOn: status === 'applied' ? (t.appliedOn || today()) : t.appliedOn, updatedAt: now } : t)));
      return { success: true };
    }
    if (all.filter(t => t.userId === user.id).length >= 200) return { success: false, error: 'Your tracker is full (200 vacancies). Remove some first.' };
    const item: TrackedJob = {
      id: newId('trk'), userId: user.id, jobId, title: job.title, institute: job.instituteName,
      deadline: job.applicationDeadline || '', url: job.externalApplyUrl || undefined, status,
      appliedOn: status === 'applied' ? today() : undefined, reference: job.advertisementNumber || undefined, addedAt: now,
    };
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, [item, ...all]);
    return { success: true };
  },

  /** Adds a vacancy found outside AcadeXMatch to the tracker. */
  addExternalTrackedJob(input: { title: string; institute: string; deadline?: string; url?: string; status?: TrackedStatus; appliedOn?: string; reference?: string; notes?: string }): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return { success: false, error: 'Candidate accounts only.' };
    const title = (input.title || '').trim().slice(0, 160);
    const institute = (input.institute || '').trim().slice(0, 160);
    if (!title || !institute) return { success: false, error: 'Enter the position and the institution.' };
    const url = normalizeUrl(input.url);
    if (url && !/^https?:\/\//i.test(url)) return { success: false, error: 'The link must start with http:// or https://' };
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(input.deadline || '') ? input.deadline! : '';
    const all = this.getTrackedJobs();
    if (all.filter(t => t.userId === user.id).length >= 200) return { success: false, error: 'Your tracker is full (200 vacancies). Remove some first.' };
    const status = input.status || 'saved';
    const item: TrackedJob = {
      id: newId('trk'), userId: user.id, title, institute, deadline, url: url || undefined, status,
      appliedOn: /^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn || '') ? input.appliedOn : (status === 'applied' ? today() : undefined),
      reference: input.reference?.trim().slice(0, 80) || undefined, notes: input.notes?.trim().slice(0, 1000) || undefined, addedAt: nowIst(),
    };
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, [item, ...all]);
    return { success: true };
  },

  updateTrackedJob(id: string, patch: Partial<Pick<TrackedJob, 'status' | 'appliedOn' | 'reference' | 'notes' | 'deadline' | 'title' | 'institute' | 'url'>>): void {
    const user = this.getCurrentUser();
    if (!user) return;
    const clean: Partial<TrackedJob> = {};
    if (patch.status) clean.status = patch.status;
    if (patch.appliedOn !== undefined) clean.appliedOn = /^\d{4}-\d{2}-\d{2}$/.test(patch.appliedOn) ? patch.appliedOn : undefined;
    if (patch.deadline !== undefined) clean.deadline = /^\d{4}-\d{2}-\d{2}$/.test(patch.deadline) ? patch.deadline : '';
    if (patch.reference !== undefined) clean.reference = patch.reference.trim().slice(0, 80) || undefined;
    if (patch.notes !== undefined) clean.notes = patch.notes.trim().slice(0, 1000) || undefined;
    if (patch.title !== undefined && patch.title.trim()) clean.title = patch.title.trim().slice(0, 160);
    if (patch.institute !== undefined && patch.institute.trim()) clean.institute = patch.institute.trim().slice(0, 160);
    if (patch.url !== undefined) { const u = normalizeUrl(patch.url); clean.url = /^https?:\/\//i.test(u) ? u : undefined; }
    if (clean.status === 'applied') {
      const cur = this.getTrackedJobs().find(t => t.id === id);
      if (cur && !cur.appliedOn && clean.appliedOn === undefined) clean.appliedOn = today();
    }
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, this.getTrackedJobs().map(t => (t.id === id && t.userId === user.id ? { ...t, ...clean, updatedAt: nowIst() } : t)));
  },

  removeTrackedJob(id: string): void {
    const user = this.getCurrentUser();
    if (!user) return;
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, this.getTrackedJobs().filter(t => !(t.id === id && (t.userId === user.id || user.role === 'super_admin'))));
  },

  untrackJob(jobId: string): void {
    const user = this.getCurrentUser();
    if (!user) return;
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, this.getTrackedJobs().filter(t => !(t.jobId === jobId && t.userId === user.id)));
  },

  getPayments(): Payment[] {
    return getFromStorage<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  },

  getUpgradeRequests(): UpgradeRequest[] {
    return getFromStorage<UpgradeRequest[]>(STORAGE_KEYS.UPGRADE_REQUESTS, []);
  },

  getMyUpgradeRequest(): UpgradeRequest | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    return this.getUpgradeRequests().find(r => r.userId === user.id && r.status === 'pending');
  },

  requestPremiumUpgrade(note?: string): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return { success: false, error: 'Please sign in with a candidate account.' };
    if (isPremiumUser(user)) return { success: false, error: 'You already have Premium.' };
    if (this.getMyUpgradeRequest()) return { success: false, error: 'Your upgrade request is already with the team.' };
    const req: UpgradeRequest = {
      id: newId('upg'),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      requestedAt: nowIst(),
      note: note?.trim() || undefined,
      status: 'pending',
    };
    setToStorage(STORAGE_KEYS.UPGRADE_REQUESTS, [req, ...this.getUpgradeRequests()]);
    this.addAuditLog('Requested Premium upgrade', req.id, 'AUTHENTICATION');
    return { success: true };
  },

  resolveUpgradeRequest(id: string, approve: boolean): void {
    if (!this.isSuperAdmin()) return;
    const req = this.getUpgradeRequests().find(r => r.id === id);
    if (!req) return;
    if (approve) this.setUserPlan(req.userId, 'premium', this.getPlanSettings().premiumDurationMonths);
    setToStorage(STORAGE_KEYS.UPGRADE_REQUESTS, this.getUpgradeRequests().map(r => (r.id === id
      ? { ...r, status: approve ? 'approved' : 'rejected', resolvedAt: nowIst() }
      : r)));
  },

  deleteUpgradeRequest(id: string): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.UPGRADE_REQUESTS, this.getUpgradeRequests().filter(r => r.id !== id));
  },

  // -------------------------------------------------------------- Institutes

  getInstitutes(): Institute[] {
    return getFromStorage<Institute[]>(STORAGE_KEYS.INSTITUTES, INITIAL_INSTITUTES);
  },

  getInstituteById(id: string): Institute | undefined {
    return this.getInstitutes().find(i => i.id === id);
  },

  getCurrentInstitute(): Institute | undefined {
    const user = this.getCurrentUser();
    return user?.instituteId ? this.getInstituteById(user.instituteId) : undefined;
  },

  createPendingInstitute(
    ni: { name: string; aisheCode: string; city: string; state: string; website?: string },
    contactEmail: string,
  ): Institute {
    const name = ni.name.trim();
    const institute: Institute = {
      id: newId('inst'),
      name,
      shortName: name.length > 28 ? name.split(/\s+/).map(w => w[0]).join('').toUpperCase() : name,
      type: 'Autonomous Engineering College',
      location: { city: ni.city.trim(), state: ni.state.trim(), pincode: '', campusType: 'Urban' },
      accreditation: { naacGrade: 'Under Review', aicteApproved: false, ugc2f12bStatus: false, nbaAccreditedDepts: [] },
      departments: [],
      aisheCode: ni.aisheCode.trim().toUpperCase(),
      establishedYear: new Date().getFullYear(),
      website: normalizeUrl(ni.website),
      logo: '',
      bannerImage: '',
      verificationStatus: 'pending',
      about: `${name} registered on the platform and is awaiting AISHE verification.`,
      contactEmail,
      contactPhone: '',
      stats: { facultyCount: 0, studentCount: 0, patentsFiled: 0, hIndexAverage: 0 },
    };
    setToStorage(STORAGE_KEYS.INSTITUTES, [...this.getInstitutes(), institute]);
    return institute;
  },

  updateInstitute(id: string, patch: Partial<Institute>): void {
    if (typeof patch.website === 'string') patch = { ...patch, website: normalizeUrl(patch.website) };
    setToStorage(STORAGE_KEYS.INSTITUTES, this.getInstitutes().map(i => (i.id === id ? { ...i, ...patch, id } : i)));
    this.addAuditLog(`Updated institute profile ${id}`, id, 'INSTITUTE_VERIFICATION');
  },

  updateInstituteVerification(id: string, status: 'verified' | 'rejected'): void {
    const institutes = this.getInstitutes().map(i =>
      i.id === id
        ? { ...i, verificationStatus: status, verifiedAt: status === 'verified' ? new Date().toISOString() : undefined }
        : i,
    );
    setToStorage(STORAGE_KEYS.INSTITUTES, institutes);
    this.addAuditLog(`Institute ${id} marked ${status}`, id, 'INSTITUTE_VERIFICATION');
  },

  /** Admin: add a fully specified institute (verified by default). */
  adminCreateInstitute(data: {
    name: string; shortName?: string; type: InstitutionType; aisheCode: string; city: string; state: string;
    website?: string; contactEmail?: string; contactPhone?: string; naacGrade?: Institute['accreditation']['naacGrade'];
    nirfRankOverall?: number; establishedYear?: number; departments?: string[]; about?: string;
    verificationStatus?: Institute['verificationStatus'];
  }): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const name = data.name.trim();
    const aishe = data.aisheCode.trim().toUpperCase();
    if (!name || !aishe) return { success: false, error: 'Institute name and AISHE code are required.' };
    if (this.getInstitutes().some(i => i.aisheCode.toUpperCase() === aishe)) return { success: false, error: `AISHE code ${aishe} is already registered.` };
    const status = data.verificationStatus || 'verified';
    const institute: Institute = {
      id: newId('inst'),
      name,
      shortName: data.shortName?.trim() || name,
      type: data.type,
      location: { city: data.city.trim(), state: data.state.trim(), pincode: '', campusType: 'Urban' },
      accreditation: { naacGrade: data.naacGrade || 'Under Review', nirfRankOverall: data.nirfRankOverall, aicteApproved: false, ugc2f12bStatus: false, nbaAccreditedDepts: [] },
      departments: data.departments || [],
      aisheCode: aishe,
      establishedYear: data.establishedYear || new Date().getFullYear(),
      website: normalizeUrl(data.website),
      logo: '',
      bannerImage: '',
      verificationStatus: status,
      verifiedAt: status === 'verified' ? new Date().toISOString() : undefined,
      about: data.about?.trim() || `${name} is listed on AcadeXMatch.`,
      contactEmail: data.contactEmail?.trim() || '',
      contactPhone: data.contactPhone?.trim() || '',
      stats: { facultyCount: 0, studentCount: 0, patentsFiled: 0, hIndexAverage: 0 },
    };
    setToStorage(STORAGE_KEYS.INSTITUTES, [...this.getInstitutes(), institute]);
    this.addAuditLog(`Admin added institute ${name}`, institute.id, 'INSTITUTE_VERIFICATION');
    return { success: true };
  },

  /** Admin: edit an institute and keep its name in sync on its vacancies and applications. */
  adminUpdateInstitute(id: string, patch: Partial<Institute>): void {
    this.updateInstitute(id, patch);
    const inst = this.getInstituteById(id);
    if (!inst) return;
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.instituteId === id
      ? { ...j, instituteName: inst.name, instituteShortName: inst.shortName, instituteType: inst.type }
      : j)));
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.instituteId === id ? { ...a, instituteName: inst.name } : a)));
  },

  /** Admin: remove an institute with its vacancies and their applications; linked staff accounts are unlinked. */
  adminDeleteInstitute(id: string): void {
    if (!this.isSuperAdmin()) return;
    const name = this.getInstituteById(id)?.name || id;
    setToStorage(STORAGE_KEYS.INSTITUTES, this.getInstitutes().filter(i => i.id !== id));
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().filter(j => j.instituteId !== id));
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().filter(a => a.instituteId !== id));
    setToStorage(STORAGE_KEYS.USERS, this.getAccounts().map(a => (a.instituteId === id ? { ...a, instituteId: undefined } : a)));
    this.addAuditLog(`Admin deleted institute ${name} with its vacancies and applications`, id, 'INSTITUTE_VERIFICATION');
  },

  // ------------------------------------------------ Institution subscriptions

  /** Records a subscription request for an institute (no-op if already active or pending). */
  requestInstituteSubscription(instituteId: string, requestedBy: string, note?: string): void {
    const inst = this.getInstituteById(instituteId);
    if (!inst || isInstituteSubscribed(inst) || inst.subscription?.status === 'pending') return;
    const subscription: InstituteSubscription = {
      ...(inst.subscription || {}),
      status: 'pending',
      requestedAt: nowIst(),
      requestedBy,
      note: note?.trim() || undefined,
    };
    setToStorage(STORAGE_KEYS.INSTITUTES, this.getInstitutes().map(i => (i.id === instituteId ? { ...i, subscription } : i)));
    this.addAuditLog(`Institution Premium requested for ${inst.name} by ${requestedBy}`, instituteId, 'INSTITUTE_VERIFICATION');
  },

  /** Admin: activate (optionally for `months`, extending any current period) or deactivate an institute's subscription. */
  setInstituteSubscription(instituteId: string, active: boolean, months?: number): void {
    if (!this.isSuperAdmin()) return;
    const inst = this.getInstituteById(instituteId);
    if (!inst) return;
    let subscription: InstituteSubscription;
    if (active) {
      let activeUntil: string | undefined;
      if (months && months > 0) {
        const cur = inst.subscription;
        const start = cur?.status === 'active' && cur.activeUntil && cur.activeUntil >= today() ? new Date(cur.activeUntil) : new Date();
        start.setMonth(start.getMonth() + months);
        activeUntil = start.toISOString().slice(0, 10);
      }
      subscription = { ...(inst.subscription || {}), status: 'active', activeUntil, activatedAt: nowIst() };
    } else {
      subscription = { ...(inst.subscription || {}), status: 'inactive', activeUntil: undefined };
    }
    setToStorage(STORAGE_KEYS.INSTITUTES, this.getInstitutes().map(i => (i.id === instituteId ? { ...i, subscription } : i)));
    this.addAuditLog(active ? `Institution Premium activated for ${inst.name}${subscription.activeUntil ? ` until ${subscription.activeUntil}` : ''}` : `Institution Premium deactivated for ${inst.name}`, instituteId, 'INSTITUTE_VERIFICATION');
  },

  declineInstituteSubscription(instituteId: string): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.INSTITUTES, this.getInstitutes().map(i => (i.id === instituteId ? { ...i, subscription: { ...(i.subscription || {}), status: 'declined' } } : i)));
    this.addAuditLog('Institution Premium request declined', instituteId, 'INSTITUTE_VERIFICATION');
  },

  // -------------------------------------------------------------------- Jobs

  getJobs(): Job[] {
    return getFromStorage<Job[]>(STORAGE_KEYS.JOBS, INITIAL_JOBS);
  },

  /** Published jobs visible to the public job board. */
  getPublishedJobs(): Job[] {
    return this.getJobs().filter(j => j.status === 'published');
  },

  getJobById(id: string): Job | undefined {
    return this.getJobs().find(j => j.id === id);
  },

  addJob(job: Job): void {
    const actor = this.getCurrentUser();
    if (actor && actor.role !== 'super_admin' && !isInstituteSubscribed(this.getInstituteById(job.instituteId))) {
      throw new Error('An active Institution Premium subscription is required to post vacancies.');
    }
    if (job.externalApplyUrl) job = { ...job, externalApplyUrl: normalizeUrl(job.externalApplyUrl) };
    setToStorage(STORAGE_KEYS.JOBS, [job, ...this.getJobs()]);
    this.addAuditLog(`Published faculty vacancy: ${job.title}`, job.id, 'JOB_MODERATION');
  },

  setJobStatus(jobId: string, status: Job['status']): void {
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.id === jobId ? { ...j, status } : j)));
    this.addAuditLog(`Vacancy ${jobId} set to ${status}`, jobId, 'JOB_MODERATION');
  },

  /** Closes published vacancies whose last date has passed. Returns the vacancies closed. */
  closeExpiredJobs(): Job[] {
    const all = this.getJobs();
    const expired = expiredOpenJobs(all);
    if (expired.length === 0) return [];
    const at = new Date().toISOString();
    const ids = new Set(expired.map(j => j.id));
    setToStorage(STORAGE_KEYS.JOBS, all.map(j => (ids.has(j.id) ? { ...j, status: 'closed' as const, autoClosedAt: at } : j)));
    const user = this.getCurrentUser();
    const log: AuditLog = {
      id: newId('log'), timestamp: nowIst(), actor: user?.email || 'system (daily check)', actorRole: user?.role || 'super_admin',
      action: `Closed ${expired.length} vacanc${expired.length === 1 ? 'y' : 'ies'} after the last date`, target: expired.map(j => j.id).join(', ').slice(0, 300), complianceCategory: 'JOB_MODERATION',
    };
    setToStorage(STORAGE_KEYS.AUDIT_LOGS, [log, ...this.getAuditLogs()].slice(0, MAX_AUDIT_LOGS));
    return expired;
  },

  updateJob(id: string, patch: Partial<Job>): void {
    if (typeof patch.externalApplyUrl === 'string') patch = { ...patch, externalApplyUrl: normalizeUrl(patch.externalApplyUrl) };
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.id === id ? { ...j, ...patch, id } : j)));
    if (patch.title || patch.department) {
      setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.jobId === id
        ? { ...a, jobTitle: patch.title ?? a.jobTitle, department: patch.department ?? a.department }
        : a)));
    }
    this.addAuditLog(`Vacancy ${id} edited`, id, 'JOB_MODERATION');
  },

  /** Admin: start (days > 0) or stop (days = 0) a Featured / Urgent promotion without payment. */
  setJobPromotion(jobId: string, kind: 'featured' | 'urgent', days: number): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const job = this.getJobById(jobId);
    if (!job) return { success: false, error: 'Vacancy not found.' };
    let until: string | null = null;
    if (days > 0) { const d = new Date(`${todayIstIso()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.min(365, Math.round(days))); until = d.toISOString().slice(0, 10); }
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.id === jobId ? { ...j, [kind === 'featured' ? 'featuredUntil' : 'urgentUntil']: until } : j)));
    this.addAuditLog(`${kind === 'featured' ? 'Featured' : 'Urgent'} promotion ${until ? `set until ${until}` : 'removed'} for ${job.title}`, jobId, 'JOB_MODERATION');
    return { success: true };
  },

  /** Removes a vacancy and every application made to it. */
  deleteJob(id: string): void {
    const title = this.getJobById(id)?.title || id;
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().filter(j => j.id !== id));
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().filter(a => a.jobId !== id));
    this.addAuditLog(`Deleted vacancy: ${title}`, id, 'JOB_MODERATION');
  },

  deleteApplication(id: string): void {
    const app = this.getApplicationById(id);
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().filter(a => a.id !== id));
    if (app) {
      setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.id === app.jobId ? { ...j, applicantCount: Math.max(0, (j.applicantCount || 1) - 1) } : j)));
    }
    this.addAuditLog(`Deleted application ${id}${app ? ` (${app.candidateEmail} → ${app.jobTitle})` : ''}`, id, 'SELECTION_COMMITTEE');
  },

  /** Imports scraped jobs, skipping ones already on the board (same title + institute). Returns count added. */
  addJobs(newJobs: Job[]): number {
    const existing = this.getJobs();
    const key = (j: Job) => `${j.title.toLowerCase().trim()}_${j.instituteName.toLowerCase().trim()}`;
    const existingKeys = new Set(existing.map(key));
    const toAdd = newJobs.filter(j => !existingKeys.has(key(j)));
    setToStorage(STORAGE_KEYS.JOBS, [...toAdd, ...existing]);
    this.addAuditLog(`Imported ${toAdd.length} vacancies via university scraper`, 'batch-scrape', 'JOB_MODERATION');
    return toAdd.length;
  },

  // ------------------------------------------------------- Candidate profile

  getProfilesMap(): Record<string, CandidateProfile> {
    return getFromStorage<Record<string, CandidateProfile>>(STORAGE_KEYS.CANDIDATE_PROFILES, {});
  },

  /** Profile of the signed-in candidate, or null when no candidate is signed in. */
  getCandidateProfile(): CandidateProfile | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return null;
    return this.getProfilesMap()[user.id] || createEmptyCandidateProfile(user);
  },

  getCandidateProfileByUserId(userId: string): CandidateProfile | undefined {
    return this.getProfilesMap()[userId];
  },

  saveProfileRecord(profile: CandidateProfile): void {
    const map = this.getProfilesMap();
    map[profile.userId] = withDerivedProfileFields(profile);
    setToStorage(STORAGE_KEYS.CANDIDATE_PROFILES, map);
  },

  updateCandidateProfile(profile: CandidateProfile): CandidateProfile {
    const derived = withDerivedProfileFields(profile);
    this.saveProfileRecord(derived);
    this.addAuditLog(`Updated academic profile (API score ${derived.apiScore})`, profile.id, 'PII_ACCESS');
    return derived;
  },

  // ------------------------------------------------------------ Applications

  getAllApplications(): Application[] {
    return getFromStorage<Application[]>(STORAGE_KEYS.APPLICATIONS, []);
  },

  /** Applications visible to the signed-in user, scoped by role. */
  getApplications(): Application[] {
    const user = this.getCurrentUser();
    if (!user) return [];
    const all = this.getAllApplications();
    if (user.role === 'super_admin') return all;
    if (user.role === 'institute_admin' || user.role === 'recruiter') {
      return user.instituteId ? all.filter(a => a.instituteId === user.instituteId) : [];
    }
    return all.filter(a => a.candidateId === user.id);
  },

  getApplicationById(id: string): Application | undefined {
    return this.getAllApplications().find(a => a.id === id);
  },

  getMyApplicationForJob(jobId: string): Application | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    return this.getAllApplications().find(a => a.jobId === jobId && a.candidateId === user.id);
  },

  applyToJob(
    jobId: string,
    screeningAnswers?: { question: string; answer: string }[],
  ): { success: true; application: Application } | { success: false; error: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'candidate') return { success: false, error: 'Please sign in with a candidate account to apply.' };
    if (!isPremiumUser(user)) return { success: false, error: 'Applying through AcadeXMatch is a Premium feature. Free members can apply on the institution\'s website.' };
    const job = this.getJobById(jobId);
    if (!job) return { success: false, error: 'This vacancy no longer exists.' };
    if (job.status !== 'published') return { success: false, error: 'This vacancy is not accepting applications.' };
    if (isDeadlinePassed(job)) return { success: false, error: 'The application deadline for this vacancy has passed.' };
    if (this.getMyApplicationForJob(jobId)) return { success: false, error: 'You have already applied to this vacancy.' };

    const candidate = this.getCandidateProfile()!;
    if (!candidate.phone.trim() || !candidate.highestDegree.trim()) {
      return { success: false, error: 'Please complete your profile (phone number and highest degree) before applying.' };
    }
    const match = candidate.aiMatchingConsent === false
      ? {
          overallScore: 0, qualificationMatch: 0, researchSynergy: 0, ugcCarePubsFit: 0, experienceMatch: 0,
          meetsMandatoryNetPhd: true,
          positiveSignals: [],
          potentialGaps: ['Candidate has withdrawn consent for automated matching — review manually.'],
        }
      : calculateMatchScore(candidate, job);

    const application: Application = {
      id: newId('app'),
      jobId: job.id,
      candidateId: user.id,
      jobTitle: job.title,
      department: job.department || '',
      instituteId: job.instituteId,
      instituteName: job.instituteName,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      candidateLocation: [candidate.location.city, candidate.location.state].filter(Boolean).join(', '),
      currentDesignation: candidate.currentDesignation,
      highestDegree: candidate.highestDegree,
      matchScore: match.overallScore,
      matchBreakdown: match,
      status: 'applied',
      stageHistory: [{ stage: 'applied', timestamp: nowIst(), actor: candidate.name, note: 'Application submitted via portal' }],
      reviewerScores: [],
      screeningAnswers,
      appliedDate: today(),
    };

    setToStorage(STORAGE_KEYS.APPLICATIONS, [application, ...this.getAllApplications()]);
    setToStorage(STORAGE_KEYS.JOBS, this.getJobs().map(j => (j.id === jobId ? { ...j, applicantCount: j.applicantCount + 1 } : j)));
    const invites = this.getTalentInvites();
    if (invites.some(i => i.candidateId === user.id && i.jobId === job.id)) {
      setToStorage(STORAGE_KEYS.TALENT_INVITES, invites.map(i => (i.candidateId === user.id && i.jobId === job.id ? { ...i, status: 'applied' as const, respondedAt: nowIst() } : i)));
    }
    this.addAuditLog(`Applied for ${job.title} at ${job.instituteShortName}`, application.id, 'PII_ACCESS');
    return { success: true, application };
  },

  withdrawApplication(appId: string): void {
    const user = this.getCurrentUser();
    const app = this.getApplicationById(appId);
    if (!user || !app || app.candidateId !== user.id) return;
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().filter(a => a.id !== appId));
    setToStorage(
      STORAGE_KEYS.JOBS,
      this.getJobs().map(j => (j.id === app.jobId ? { ...j, applicantCount: Math.max(0, j.applicantCount - 1) } : j)),
    );
    this.addAuditLog(`Withdrew application for ${app.jobTitle}`, appId, 'PII_ACCESS');
  },

  updateApplicationStage(appId: string, newStage: ApplicationStage, note?: string): void {
    const actor = this.getCurrentUser()?.name || 'Faculty Search Committee';
    const apps = this.getAllApplications().map(a =>
      a.id === appId
        ? {
            ...a,
            status: newStage,
            stageHistory: [
              ...a.stageHistory,
              { stage: newStage, timestamp: nowIst(), actor, note: note || `Moved to ${newStage.replace(/_/g, ' ')}` },
            ],
          }
        : a,
    );
    setToStorage(STORAGE_KEYS.APPLICATIONS, apps);
    this.addAuditLog(`Application ${appId} moved to ${newStage}`, appId, 'SELECTION_COMMITTEE');
  },

  addReviewerScore(appId: string, score: ReviewerScoreItem): void {
    const actor = this.getCurrentUser()?.name || score.reviewerName;
    const apps = this.getAllApplications().map(a => {
      if (a.id !== appId) return a;
      const scores = [...a.reviewerScores.filter(s => s.reviewerRole !== score.reviewerRole), score];
      const moveToReview = ['applied', 'screening', 'eligible', 'shortlisted', 'interview_scheduled'].includes(a.status);
      return {
        ...a,
        reviewerScores: scores,
        status: moveToReview ? ('committee_review' as ApplicationStage) : a.status,
        stageHistory: moveToReview
          ? [...a.stageHistory, { stage: 'committee_review' as ApplicationStage, timestamp: nowIst(), actor, note: `${score.reviewerRole} submitted evaluation` }]
          : a.stageHistory,
      };
    });
    setToStorage(STORAGE_KEYS.APPLICATIONS, apps);
    this.addAuditLog(`Committee score ${score.totalScore}/100 by ${score.reviewerRole} for ${appId}`, appId, 'COMMITTEE_SCORING');
  },

  scheduleInterview(appId: string, slot: InterviewSlot): void {
    if (slot.meetingLink) slot = { ...slot, meetingLink: normalizeUrl(slot.meetingLink) };
    const actor = this.getCurrentUser()?.name || 'Faculty Search Committee';
    const apps = this.getAllApplications().map(a =>
      a.id === appId
        ? {
            ...a,
            interviewSlot: slot,
            status: 'interview_scheduled' as ApplicationStage,
            stageHistory: [
              ...a.stageHistory,
              { stage: 'interview_scheduled' as ApplicationStage, timestamp: nowIst(), actor, note: `Interview on ${slot.date} at ${slot.time} (${slot.platform})` },
            ],
          }
        : a,
    );
    setToStorage(STORAGE_KEYS.APPLICATIONS, apps);
    this.addAuditLog(`Interview scheduled for ${appId} on ${slot.date}`, appId, 'INTERVIEW_COLLOQUIUM');
  },

  // ------------------------------------------------------- Interview slots

  getInterviewSlots(): InterviewSlotOffer[] {
    return getFromStorage<InterviewSlotOffer[]>(STORAGE_KEYS.INTERVIEW_SLOTS, []);
  },

  getSlotsForJob(jobId: string): InterviewSlotOffer[] {
    return this.getInterviewSlots().filter(s => s.jobId === jobId).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  },

  /** Adds `count` consecutive slots for a vacancy, starting at `startTime`. */
  addInterviewSlots(jobId: string, input: {
    date: string; startTime: string; count: number; durationMin: number; gapMin?: number;
    platform: InterviewSlot['platform']; meetingLink?: string; roomVenue?: string; committeeMembers?: string[]; instructions?: string;
  }): { success: boolean; added?: number; error?: string } {
    const user = this.getCurrentUser();
    const job = this.getJobById(jobId);
    if (!user || !job) return { success: false, error: 'Vacancy not found.' };
    if (user.role !== 'super_admin' && user.instituteId !== job.instituteId) return { success: false, error: 'You can only add slots for your own institute’s vacancies.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < istToday()) return { success: false, error: 'Choose today or a later date.' };
    const m = /^(\d{1,2}):(\d{2})$/.exec(input.startTime || '');
    if (!m) return { success: false, error: 'Enter a start time.' };
    const count = Math.max(1, Math.min(40, Math.floor(input.count || 1)));
    const dur = Math.max(5, Math.min(240, Math.floor(input.durationMin || 30)));
    const gap = Math.max(0, Math.min(120, Math.floor(input.gapMin || 0)));
    let minutes = Number(m[1]) * 60 + Number(m[2]);
    const existing = this.getInterviewSlots();
    const taken = new Set(existing.filter(x => x.jobId === jobId && x.date === input.date).map(x => x.time));
    const created: InterviewSlotOffer[] = [];
    for (let i = 0; i < count && minutes + dur <= 24 * 60; i++) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      if (!taken.has(time)) {
        created.push({
          id: newId('slot'), instituteId: job.instituteId, jobId, date: input.date, time, durationMin: dur,
          platform: input.platform, meetingLink: normalizeUrl(input.meetingLink) || undefined, roomVenue: input.roomVenue?.trim() || undefined,
          committeeMembers: (input.committeeMembers || []).map(x => x.trim()).filter(Boolean), instructions: (input.instructions || '').trim(),
          createdAt: nowIst(), bookedByAppId: null,
        });
      }
      minutes += dur + gap;
    }
    if (!created.length) return { success: false, error: 'Those times already have slots.' };
    setToStorage(STORAGE_KEYS.INTERVIEW_SLOTS, [...existing, ...created]);
    this.addAuditLog(`Added ${created.length} interview slots for ${job.title} on ${input.date}`, jobId, 'INTERVIEW_COLLOQUIUM');
    return { success: true, added: created.length };
  },

  deleteInterviewSlot(slotId: string): { success: boolean; error?: string } {
    const slot = this.getInterviewSlots().find(s => s.id === slotId);
    if (!slot) return { success: false, error: 'Slot not found.' };
    if (slot.bookedByAppId || slot.booked) return { success: false, error: 'This slot is booked. Cancel the booking first.' };
    setToStorage(STORAGE_KEYS.INTERVIEW_SLOTS, this.getInterviewSlots().filter(s => s.id !== slotId));
    return { success: true };
  },

  /** Lets applicants choose a slot for their vacancy. */
  inviteToBookSlots(appIds: string[], message?: string): { success: boolean; invited?: number; error?: string } {
    const user = this.getCurrentUser();
    if (!user) return { success: false, error: 'Please sign in.' };
    const ids = new Set(appIds);
    let invited = 0;
    const now = nowIst();
    const apps = this.getAllApplications().map(a => {
      if (!ids.has(a.id) || a.status === 'rejected' || (user.role !== 'super_admin' && a.instituteId !== user.instituteId)) return a;
      invited++;
      const early = ['applied', 'screening', 'eligible'].includes(a.status);
      return {
        ...a,
        slotInvite: { invitedAt: now, invitedBy: user.name, message: message?.trim().slice(0, 600) || undefined },
        status: early ? ('shortlisted' as ApplicationStage) : a.status,
        stageHistory: [...a.stageHistory, { stage: early ? ('shortlisted' as ApplicationStage) : a.status, timestamp: now, actor: user.name, note: 'Invited to choose an interview slot' }],
      };
    });
    if (!invited) return { success: false, error: 'No applications could be invited.' };
    setToStorage(STORAGE_KEYS.APPLICATIONS, apps);
    this.addAuditLog(`Invited ${invited} applicant(s) to book interview slots`, 'slots', 'INTERVIEW_COLLOQUIUM');
    return { success: true, invited };
  },

  bookInterviewSlot(appId: string, slotId: string): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    const app = this.getApplicationById(appId);
    if (!user || !app || app.candidateId !== user.id) return { success: false, error: 'Application not found.' };
    if (!app.slotInvite) return { success: false, error: 'The institution has not invited you to book a slot yet.' };
    if (app.status === 'rejected') return { success: false, error: 'This application is closed.' };
    const slots = this.getInterviewSlots();
    const slot = slots.find(s => s.id === slotId);
    if (!slot || slot.jobId !== app.jobId) return { success: false, error: 'That slot is not available.' };
    if (slot.date < istToday()) return { success: false, error: 'That slot has passed.' };
    const takenByOther = slot.bookedByAppId ? slot.bookedByAppId !== appId : !!slot.booked && app.bookedSlotId !== slotId;
    if (takenByOther) return { success: false, error: 'Someone has just booked that slot. Please choose another.' };
    const now = nowIst();
    setToStorage(STORAGE_KEYS.INTERVIEW_SLOTS, slots.map(s => {
      if (s.id === slotId) return { ...s, bookedByAppId: appId, booked: true };
      if (s.id === app.bookedSlotId) return { ...s, bookedByAppId: null, booked: false };
      return s;
    }));
    const interviewSlot: InterviewSlot = {
      date: slot.date, time: `${slot.time} IST`, platform: slot.platform, meetingLink: slot.meetingLink, roomVenue: slot.roomVenue,
      committeeMembers: slot.committeeMembers, instructions: slot.instructions,
    };
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.id === appId ? {
      ...a, interviewSlot, bookedSlotId: slotId, status: 'interview_scheduled' as ApplicationStage,
      stageHistory: [...a.stageHistory, { stage: 'interview_scheduled' as ApplicationStage, timestamp: now, actor: user.name, note: `Candidate booked ${slot.date} at ${slot.time} (${slot.platform})` }],
    } : a)));
    this.addAuditLog(`Booked interview slot ${slot.date} ${slot.time}`, appId, 'INTERVIEW_COLLOQUIUM');
    return { success: true };
  },

  cancelInterviewBooking(appId: string): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    const app = this.getApplicationById(appId);
    if (!user || !app) return { success: false, error: 'Application not found.' };
    const isOwner = app.candidateId === user.id;
    const isStaff = user.role === 'super_admin' || ((user.role === 'institute_admin' || user.role === 'recruiter') && user.instituteId === app.instituteId);
    if (!isOwner && !isStaff) return { success: false, error: 'Not allowed.' };
    if (!app.bookedSlotId) return { success: false, error: 'There is no booking to cancel.' };
    setToStorage(STORAGE_KEYS.INTERVIEW_SLOTS, this.getInterviewSlots().map(s => (s.id === app.bookedSlotId ? { ...s, bookedByAppId: null, booked: false } : s)));
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.id === appId ? {
      ...a, interviewSlot: undefined, bookedSlotId: undefined, status: 'shortlisted' as ApplicationStage,
      stageHistory: [...a.stageHistory, { stage: 'shortlisted' as ApplicationStage, timestamp: nowIst(), actor: user.name, note: 'Interview booking cancelled' }],
    } : a)));
    return { success: true };
  },

  // ------------------------------------------------------- Offers

  makeOffer(appId: string, d: { designation: string; grossPay: string; joiningDate: string; reportTo?: string; acceptBy?: string; signatory?: string; signatoryTitle?: string }): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    const app = this.getApplicationById(appId);
    if (!user || !app) return { success: false, error: 'Application not found.' };
    if (!d.designation?.trim() || !d.joiningDate) return { success: false, error: 'Enter the designation and joining date.' };
    const inst = this.getInstituteById(app.instituteId);
    const year = istToday().slice(0, 4);
    const seq = this.getAllApplications().filter(a => a.instituteId === app.instituteId && a.offerDetails?.letterNumber).length + 1;
    const now = nowIst();
    const offerDetails = {
      designation: d.designation.trim(), grossPay: (d.grossPay || '').trim(), joiningDate: d.joiningDate,
      offerLetterGenerated: true, reportTo: d.reportTo?.trim() || undefined, acceptBy: d.acceptBy || undefined,
      letterNumber: app.offerDetails?.letterNumber || `${(inst?.shortName || 'INST').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}/FAC/${year}/${String(seq).padStart(3, '0')}`,
      issuedAt: istToday(), signatory: d.signatory?.trim() || inst?.offerSignatory || undefined,
      signatoryTitle: d.signatoryTitle?.trim() || inst?.offerSignatoryTitle || undefined,
    };
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.id === appId ? {
      ...a, offerDetails, status: 'offer' as ApplicationStage,
      stageHistory: [...a.stageHistory, { stage: 'offer' as ApplicationStage, timestamp: now, actor: user.name, note: `Offer issued (${offerDetails.letterNumber})` }],
    } : a)));
    this.addAuditLog(`Offer issued for ${app.jobTitle} to ${app.candidateEmail}`, appId, 'SELECTION_COMMITTEE');
    return { success: true };
  },

  respondToOffer(appId: string, response: 'accepted' | 'declined'): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    const app = this.getApplicationById(appId);
    if (!user || !app || app.candidateId !== user.id || !app.offerDetails) return { success: false, error: 'Offer not found.' };
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().map(a => (a.id === appId ? {
      ...a, offerDetails: { ...a.offerDetails!, response, respondedAt: nowIst() },
      stageHistory: [...a.stageHistory, { stage: a.status, timestamp: nowIst(), actor: user.name, note: response === 'accepted' ? 'Candidate accepted the offer' : 'Candidate declined the offer' }],
    } : a)));
    return { success: true };
  },

  // ------------------------------------------------------- Talent search invitations

  getTalentInvites(): TalentInvite[] {
    return getFromStorage<TalentInvite[]>(STORAGE_KEYS.TALENT_INVITES, []);
  },

  /** Institution staff invite a discoverable Premium candidate to apply (server only: needs other users' profiles). */
  async sendTalentInvite(candidateId: string, jobId: string, message: string): Promise<{ success: boolean; error?: string }> {
    const user = this.getCurrentUser();
    if (!user || !(user.role === 'institute_admin' || user.role === 'recruiter') || !user.instituteId) return { success: false, error: 'Only institution staff can send invitations.' };
    const inst = this.getInstituteById(user.instituteId);
    if (!inst || !isInstituteSubscribed(inst)) return { success: false, error: 'An active Institution Premium subscription is required.' };
    const job = this.getJobById(jobId);
    if (!job || job.instituteId !== inst.id || job.status !== 'published') return { success: false, error: 'Choose one of your published vacancies.' };
    const account = this.getAccounts().find(a => a.id === candidateId);
    const profile = this.getProfilesMap()[candidateId];
    if (!account || account.role !== 'candidate' || !profile?.discoverable || !isPremiumUser(account)) return { success: false, error: 'This candidate is not available for invitations.' };
    const all = this.getTalentInvites();
    if (all.some(i => i.candidateId === candidateId && i.jobId === jobId)) return { success: false, error: 'You have already invited this candidate for that vacancy.' };
    if (this.getAllApplications().some(a => a.candidateId === candidateId && a.jobId === jobId)) return { success: false, error: 'This candidate has already applied for that vacancy.' };
    const todayCount = all.filter(i => i.instituteId === inst.id && i.sentAt.startsWith(new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }))).length;
    if (todayCount >= 50) return { success: false, error: 'Daily invitation limit reached (50). Please try again tomorrow.' };
    const invite: TalentInvite = {
      id: newId('inv'), instituteId: inst.id, instituteName: inst.name, jobId, jobTitle: job.title, candidateId,
      candidateName: account.name, message: (message || '').trim().slice(0, 1000), sentBy: user.name, sentAt: nowIst(), status: 'sent',
    };
    setToStorage(STORAGE_KEYS.TALENT_INVITES, [invite, ...all]);
    this.addAuditLog(`Talent invitation sent to ${account.email} for ${job.title}`, invite.id, 'PII_ACCESS');
    return { success: true };
  },

  respondTalentInvite(inviteId: string, status: 'interested' | 'declined'): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    const inv = this.getTalentInvites().find(i => i.id === inviteId);
    if (!user || !inv || inv.candidateId !== user.id) return { success: false, error: 'Invitation not found.' };
    setToStorage(STORAGE_KEYS.TALENT_INVITES, this.getTalentInvites().map(i => (i.id === inviteId ? { ...i, status, respondedAt: nowIst() } : i)));
    return { success: true };
  },

  // ------------------------------------------------------- Announcements

  getAnnouncements(): Announcement[] {
    return getFromStorage<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
  },

  saveAnnouncement(input: { id?: string; title: string; body: string; audience: Announcement['audience']; link?: string; expiresAt?: string | null; email?: boolean }): { success: boolean; id?: string; error?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'super_admin') return { success: false, error: 'Only the platform administrator can do this.' };
    const title = (input.title || '').trim().slice(0, 140);
    const body = (input.body || '').trim().slice(0, 2000);
    if (!title || !body) return { success: false, error: 'Enter a title and message.' };
    const link = (input.link || '').trim();
    if (link && !/^(https?:\/\/|\/)/i.test(link)) return { success: false, error: 'The link must start with https:// or /.' };
    const all = this.getAnnouncements();
    if (input.id && all.some(a => a.id === input.id)) {
      setToStorage(STORAGE_KEYS.ANNOUNCEMENTS, all.map(a => (a.id === input.id ? { ...a, title, body, audience: input.audience, link: link || undefined, expiresAt: input.expiresAt || null } : a)));
      return { success: true, id: input.id };
    }
    const a: Announcement = { id: newId('ann'), title, body, audience: input.audience, link: link || undefined, createdAt: nowIst(), createdBy: user.name, expiresAt: input.expiresAt || null, active: true, emailed: 0 };
    setToStorage(STORAGE_KEYS.ANNOUNCEMENTS, [a, ...all].slice(0, 200));
    this.addAuditLog(`Announcement published: ${title}`, a.id, 'AUTHENTICATION');
    return { success: true, id: a.id };
  },

  setAnnouncementActive(id: string, active: boolean): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.ANNOUNCEMENTS, this.getAnnouncements().map(a => (a.id === id ? { ...a, active } : a)));
  },

  deleteAnnouncement(id: string): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.ANNOUNCEMENTS, this.getAnnouncements().filter(a => a.id !== id));
  },

  // ------------------------------------------------------- Quality checks

  setCandidateVerification(userId: string, verified: boolean, note?: string): { success: boolean; error?: string } {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'super_admin') return { success: false, error: 'Only the platform administrator can do this.' };
    const p = this.getProfilesMap()[userId];
    if (!p) return { success: false, error: 'Profile not found.' };
    this.saveProfileRecord({ ...p, documentsVerified: verified ? { at: istToday(), by: user.name, note: note?.trim() || undefined } : null });
    this.addAuditLog(`${verified ? 'Verified' : 'Removed verification of'} documents for ${p.email}`, userId, 'PII_ACCESS');
    return { success: true };
  },

  // ------------------------------------------------------- Partners

  getPartners(): Partner[] {
    return getFromStorage<Partner[]>(STORAGE_KEYS.PARTNERS, []);
  },

  savePartner(input: Partial<Partner> & { name: string; url: string; category: Partner['category'] }): { success: boolean; error?: string } {
    if (!this.isSuperAdmin()) return { success: false, error: 'Only the platform administrator can do this.' };
    const name = (input.name || '').trim().slice(0, 120);
    const url = normalizeUrl(input.url);
    if (!name || !/^https?:\/\//i.test(url)) return { success: false, error: 'Enter a name and a web address starting with https://.' };
    const all = this.getPartners();
    const rec: Partner = {
      id: input.id && all.some(p => p.id === input.id) ? input.id : newId('partner'),
      name, url, category: input.category, description: (input.description || '').trim().slice(0, 400),
      offer: (input.offer || '').trim().slice(0, 160) || undefined, active: input.active ?? true, createdAt: input.createdAt || istToday(),
    };
    setToStorage(STORAGE_KEYS.PARTNERS, all.some(p => p.id === rec.id) ? all.map(p => (p.id === rec.id ? rec : p)) : [rec, ...all]);
    return { success: true };
  },

  deletePartner(id: string): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.PARTNERS, this.getPartners().filter(p => p.id !== id));
  },

  // ------------------------------------------------------- DPDP & audit logs

  getDPDPRequests(): DPDPDataRequest[] {
    return getFromStorage<DPDPDataRequest[]>(STORAGE_KEYS.DPDP_REQUESTS, []);
  },

  getMyDPDPRequests(): DPDPDataRequest[] {
    const user = this.getCurrentUser();
    return user ? this.getDPDPRequests().filter(r => r.userId === user.id) : [];
  },

  createDPDPRequest(type: DPDPDataRequest['requestType'], reason?: string): DPDPDataRequest | null {
    const user = this.getCurrentUser();
    if (!user) return null;
    const request: DPDPDataRequest = {
      id: newId('dpdp'),
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      requestType: type,
      status: 'Pending',
      requestedAt: nowIst(),
      reason,
    };
    setToStorage(STORAGE_KEYS.DPDP_REQUESTS, [request, ...this.getDPDPRequests()]);
    this.addAuditLog(`Data principal request: ${type}`, request.id, 'DPDP_CONSENT');
    return request;
  },

  /** Everything stored about the signed-in user, for data-portability downloads. */
  exportMyData(): Record<string, unknown> | null {
    const user = this.getCurrentUser();
    if (!user) return null;
    return {
      exportedAt: new Date().toISOString(),
      account: user,
      profile: this.getProfilesMap()[user.id] || null,
      applications: this.getAllApplications().filter(a => a.candidateId === user.id),
      dataRequests: this.getMyDPDPRequests(),
    };
  },

  /**
   * Resolves a DPDP request. Completing an erasure request deletes the user's account, profile
   * and applications; revoking consent switches AI matching off for their profile.
   */
  updateDPDPStatus(reqId: string, status: DPDPDataRequest['status'], notes?: string): void {
    const req = this.getDPDPRequests().find(r => r.id === reqId);
    if (!req) return;

    if (status === 'Completed' && req.userId) {
      if (req.requestType.startsWith('Right to Erasure')) {
        this.eraseUserData(req.userId);
      } else if (req.requestType.startsWith('Revoke')) {
        const profile = this.getProfilesMap()[req.userId];
        if (profile) this.saveProfileRecord({ ...profile, aiMatchingConsent: false });
      }
    }

    const reqs = this.getDPDPRequests().map(r =>
      r.id === reqId
        ? { ...r, status, completedAt: status === 'Completed' ? nowIst() : r.completedAt, dpoActionNotes: notes || r.dpoActionNotes }
        : r,
    );
    setToStorage(STORAGE_KEYS.DPDP_REQUESTS, reqs);
    this.addAuditLog(`DPDP request ${reqId} set to ${status}`, reqId, 'DPDP_CONSENT');
  },

  eraseUserData(userId: string): void {
    const map = this.getProfilesMap();
    delete map[userId];
    setToStorage(STORAGE_KEYS.CANDIDATE_PROFILES, map);
    setToStorage(STORAGE_KEYS.APPLICATIONS, this.getAllApplications().filter(a => a.candidateId !== userId));
    setToStorage(STORAGE_KEYS.USERS, this.getAccounts().filter(a => a.id !== userId));
    setToStorage(STORAGE_KEYS.JOB_ALERTS, this.getJobAlerts().filter(a => a.userId !== userId));
    setToStorage(STORAGE_KEYS.TRACKED_JOBS, this.getTrackedJobs().filter(t => t.userId !== userId));
    setToStorage(STORAGE_KEYS.INTERVIEW_PREP, getFromStorage<PrepStateRecord[]>(STORAGE_KEYS.INTERVIEW_PREP, []).filter(r => r.userId !== userId));
    ctx()?.hooks?.eraseUser?.(userId);
    this.addAuditLog(`Erased all personal data for user ${userId}`, userId, 'DPDP_CONSENT');
  },

  deleteDPDPRequest(reqId: string): void {
    setToStorage(STORAGE_KEYS.DPDP_REQUESTS, this.getDPDPRequests().filter(r => r.id !== reqId));
    this.addAuditLog(`Deleted data-rights request ${reqId}`, reqId, 'DPDP_CONSENT');
  },

  clearAuditLogs(): void {
    if (!this.isSuperAdmin()) return;
    setToStorage(STORAGE_KEYS.AUDIT_LOGS, []);
    this.addAuditLog('Audit log cleared', 'audit-log', 'AUTHENTICATION');
  },

  /** Admin: full backup of every platform record (runs on the server; the browser version downloads it). */
  exportAllData(): Record<string, unknown> | Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'AcadeXMatch', version: 3 };
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      if (name === 'SESSION') continue;
      const v = ctx()?.get(key);
      if (v !== undefined) data[key] = v;
    }
    return data;
  },

  /** Admin: restore a backup made with exportAllData. Returns number of collections restored. */
  importAllData(backup: Record<string, unknown>): number | Promise<number> {
    if (!this.isSuperAdmin()) return 0;
    let restored = 0;
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      if (name === 'SESSION' || !(key in backup)) continue;
      setToStorage(key, backup[key]);
      restored++;
    }
    this.addAuditLog(`Restored ${restored} data collections from backup`, 'backup', 'AUTHENTICATION');
    return restored;
  },

  /** Admin: wipe all platform data and return to the seeded defaults. */
  resetAllData(): void | Promise<void> {
    if (!this.isSuperAdmin()) return;
    ctx()?.hooks?.resetAll?.();
  },

  getAuditLogs(): AuditLog[] {
    return getFromStorage<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  },

  addAuditLog(action: string, target: string, category: AuditLog['complianceCategory']): void {
    const user = this.getCurrentUser();
    const log: AuditLog = {
      id: newId('log'),
      timestamp: nowIst(),
      actor: user?.email || 'anonymous',
      actorRole: user?.role || 'candidate',
      action,
      target,
      complianceCategory: category,
    };
    setToStorage(STORAGE_KEYS.AUDIT_LOGS, [log, ...this.getAuditLogs()].slice(0, MAX_AUDIT_LOGS));
  },
};
