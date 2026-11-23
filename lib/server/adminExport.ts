/*
 * Administrator data export: each dataset lists the fields it can export (no passwords, tokens, salts,
 * NET roll numbers or payment-gateway secrets). The administrator picks the fields, their order and the row order;
 * the file is CSV or Excel. Every export is written to the audit log.
 */
import { withDb } from './db';
import { jobViewCounts } from './jobViews';
import { eventViewCounts } from './eventViews';
import { outreachDb } from './outreach';
import { STORAGE_KEYS } from '@/lib/storage';
import type { AcademicEvent, Application, AuditLog, CandidateProfile, Institute, Job, Payment, UserAccount } from '@/types';
import type { RowDataPacket } from 'mysql2';

type Val = string | number | boolean | null | undefined;
interface Field<T> { key: string; label: string; get: (r: T) => Val; def?: boolean; num?: boolean }
interface Dataset<T> { key: string; label: string; description: string; personal: boolean; fields: Field<T>[]; rows: () => Promise<T[]> }

const d10 = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const dt = (s?: string | null) => (s ? String(s).replace('T', ' ').slice(0, 16) : '');
const list = (a?: (string | null | undefined)[] | null) => (a || []).filter(Boolean).join('; ');
const yrs = (exp?: { startDate?: string; endDate?: string | null; isCurrent?: boolean }[]) => {
  let months = 0;
  for (const e of exp || []) {
    const s = e.startDate ? Date.parse(e.startDate) : NaN;
    const end = e.isCurrent || !e.endDate ? Date.now() : Date.parse(e.endDate);
    if (Number.isFinite(s) && Number.isFinite(end) && end > s) months += (end - s) / (30.44 * 86400_000);
  }
  return Math.round(months / 12 * 10) / 10;
};

const db = <T>(fn: (d: Record<string, unknown>) => T) => withDb(null, d => fn(d as Record<string, unknown>));

type U = UserAccount & { instituteName?: string };
const users: Dataset<U> = {
  key: 'users', label: 'Users (all accounts)', personal: true,
  description: 'Every account: candidates, institution administrators and the platform administrator.',
  rows: () => db(d => {
    const inst = new Map(((d[STORAGE_KEYS.INSTITUTES] as Institute[]) || []).map(i => [i.id, i.name]));
    return ((d[STORAGE_KEYS.USERS] as UserAccount[]) || []).map(u => ({ ...u, instituteName: u.instituteId ? inst.get(u.instituteId) : undefined }));
  }),
  fields: [
    { key: 'name', label: 'Name', get: u => u.name, def: true },
    { key: 'email', label: 'Email', get: u => u.email, def: true },
    { key: 'phone', label: 'Mobile', get: u => u.phone, def: true },
    { key: 'role', label: 'Role', get: u => ({ candidate: 'Candidate', institute_admin: 'Institution admin', super_admin: 'Platform admin' } as Record<string, string>)[u.role] || u.role, def: true },
    { key: 'institute', label: 'Institution', get: u => u.instituteName, def: true },
    { key: 'plan', label: 'Plan', get: u => u.plan || 'free', def: true },
    { key: 'premiumUntil', label: 'Premium until', get: u => d10(u.premiumUntil) },
    { key: 'emailVerified', label: 'Email confirmed', get: u => u.emailVerified !== false, def: true },
    { key: 'phoneVerified', label: 'Mobile confirmed', get: u => !!u.phoneVerified },
    { key: 'marketingConsent', label: 'Marketing consent', get: u => !!u.marketingConsent },
    { key: 'signIn', label: 'Sign-in methods', get: u => list([u.hasPassword !== false ? 'password' : null, ...(u.identities || []).map(i => (i as { provider?: string }).provider)]) },
    { key: 'createdAt', label: 'Joined', get: u => dt(u.createdAt), def: true },
    { key: 'termsAcceptedAt', label: 'Terms accepted', get: u => dt(u.termsAcceptedAt) },
    { key: 'id', label: 'User ID', get: u => u.id },
  ],
};

const candidates: Dataset<CandidateProfile> = {
  key: 'candidates', label: 'Candidate profiles', personal: true,
  description: 'Academic profiles: qualifications, NET/SET, Ph.D., experience, publications and API score.',
  rows: () => db(d => (d[STORAGE_KEYS.CANDIDATE_PROFILES] as CandidateProfile[]) || []),
  fields: [
    { key: 'name', label: 'Name', get: p => p.name, def: true },
    { key: 'email', label: 'Email', get: p => p.email, def: true },
    { key: 'phone', label: 'Mobile', get: p => p.phone, def: true },
    { key: 'city', label: 'City', get: p => p.location?.city, def: true },
    { key: 'state', label: 'State', get: p => p.location?.state, def: true },
    { key: 'designation', label: 'Current designation', get: p => p.currentDesignation, def: true },
    { key: 'institute', label: 'Current institution', get: p => p.currentInstitute, def: true },
    { key: 'degree', label: 'Highest degree', get: p => p.highestDegree, def: true },
    { key: 'net', label: 'NET / SET', get: p => (p.netSletStatus?.isQualified ? p.netSletStatus.examType || 'Yes' : 'No'), def: true },
    { key: 'netYear', label: 'NET / SET year', get: p => p.netSletStatus?.qualifiedYear, num: true },
    { key: 'netSubject', label: 'NET / SET subject', get: p => p.netSletStatus?.subject },
    { key: 'phd', label: 'Ph.D. completed', get: p => !!p.phdStatus?.isCompleted, def: true },
    { key: 'phdInstitute', label: 'Ph.D. institution', get: p => p.phdStatus?.institute },
    { key: 'phdYear', label: 'Ph.D. year', get: p => p.phdStatus?.graduationYear, num: true },
    { key: 'phdUgc', label: 'Ph.D. UGC 2009/2016 compliant', get: p => !!p.phdStatus?.isUgc2009_2016Compliant },
    { key: 'experience', label: 'Experience (years)', get: p => yrs(p.experience as never), num: true, def: true },
    { key: 'publications', label: 'Publications', get: p => (p.publications || []).length, num: true, def: true },
    { key: 'apiScore', label: 'API score', get: p => p.apiScore, num: true, def: true },
    { key: 'completeness', label: 'Profile complete (%)', get: p => p.profileCompleteness, num: true, def: true },
    { key: 'verified', label: 'Documents verified', get: p => !!p.documentsVerified, def: true },
    { key: 'interests', label: 'Research interests', get: p => list(p.researchInterests) },
    { key: 'skills', label: 'Skills', get: p => list(p.skills) },
    { key: 'discoverable', label: 'Visible to institutions', get: p => p.discoverable !== false },
    { key: 'scholar', label: 'Google Scholar', get: p => p.scholarLinks?.googleScholar },
    { key: 'orcid', label: 'ORCID', get: p => p.scholarLinks?.orcid },
    { key: 'userId', label: 'User ID', get: p => p.userId },
  ],
};

const institutions: Dataset<Institute> = {
  key: 'institutions', label: 'Institutions (registered)', personal: false,
  description: 'Institutions registered on AcadeXMatch with verification status and subscription.',
  rows: () => db(d => (d[STORAGE_KEYS.INSTITUTES] as Institute[]) || []),
  fields: [
    { key: 'name', label: 'Institution', get: i => i.name, def: true },
    { key: 'shortName', label: 'Short name', get: i => i.shortName },
    { key: 'type', label: 'Type', get: i => i.type, def: true },
    { key: 'aishe', label: 'AISHE code', get: i => i.aisheCode, def: true },
    { key: 'city', label: 'City', get: i => i.location?.city, def: true },
    { key: 'state', label: 'State', get: i => i.location?.state, def: true },
    { key: 'website', label: 'Website', get: i => i.website, def: true },
    { key: 'email', label: 'Contact email', get: i => i.contactEmail, def: true },
    { key: 'phone', label: 'Contact phone', get: i => i.contactPhone },
    { key: 'status', label: 'Verification', get: i => i.verificationStatus, def: true },
    { key: 'verifiedAt', label: 'Verified on', get: i => d10(i.verifiedAt), def: true },
    { key: 'naac', label: 'NAAC grade', get: i => i.accreditation?.naacGrade },
    { key: 'nirf', label: 'NIRF rank', get: i => i.accreditation?.nirfRankOverall, num: true },
    { key: 'established', label: 'Established', get: i => i.establishedYear, num: true },
    { key: 'subscription', label: 'Subscription until', get: i => d10((i.subscription as { activeUntil?: string } | undefined)?.activeUntil) },
    { key: 'id', label: 'Institution ID', get: i => i.id },
  ],
};

type JV = Job & { views: number; last7: number };
const vacancies: Dataset<JV> = {
  key: 'vacancies', label: 'Vacancies', personal: false,
  description: 'All vacancies (posted by institutions and imported), with views and applicants.',
  rows: async () => {
    const v = await jobViewCounts().catch(() => ({ jobs: {} as Record<string, { total: number; last7: number }> }));
    return db(d => ((d[STORAGE_KEYS.JOBS] as Job[]) || []).map(j => ({ ...j, views: v.jobs[j.id]?.total || 0, last7: v.jobs[j.id]?.last7 || 0 })));
  },
  fields: [
    { key: 'title', label: 'Title', get: j => j.title, def: true },
    { key: 'institution', label: 'Institution', get: j => j.instituteName, def: true },
    { key: 'department', label: 'Department', get: j => j.department, def: true },
    { key: 'designation', label: 'Designation', get: j => j.designation },
    { key: 'city', label: 'City', get: j => j.location?.city, def: true },
    { key: 'state', label: 'State', get: j => j.location?.state, def: true },
    { key: 'posted', label: 'Posted', get: j => d10(j.postedAt), def: true },
    { key: 'deadline', label: 'Last date', get: j => d10(j.applicationDeadline) || j.deadlineText, def: true },
    { key: 'status', label: 'Status', get: j => j.status, def: true },
    { key: 'claimed', label: 'Posted by the institution', get: j => j.isClaimedByInstitute !== false, def: true },
    { key: 'premium', label: 'Premium vacancy', get: j => !!j.isPremium },
    { key: 'views', label: 'Views', get: j => j.views, num: true, def: true },
    { key: 'views7', label: 'Views (last 7 days)', get: j => j.last7, num: true },
    { key: 'applicants', label: 'Applicants', get: j => j.applicantCount, num: true, def: true },
    { key: 'pay', label: 'Pay level', get: j => j.payScale?.cpcBand },
    { key: 'minDegree', label: 'Minimum qualification', get: j => j.requiredQualifications?.minDegree },
    { key: 'net', label: 'NET/SET required', get: j => j.requiredQualifications?.netSletMandatory },
    { key: 'reservation', label: 'Reservation', get: j => j.reservationCategory },
    { key: 'advert', label: 'Advertisement no.', get: j => j.advertisementNumber },
    { key: 'applyEmail', label: 'Apply e-mail', get: j => list((j.details?.applyEmails || []).map(e => e.email)) },
    { key: 'phones', label: 'Contact phones', get: j => list(j.details?.contactPhones) },
    { key: 'applyUrl', label: 'Apply link', get: j => j.externalApplyUrl },
    { key: 'source', label: 'Source page', get: j => j.source?.url },
    { key: 'link', label: 'AcadeXMatch link', get: j => `${(process.env.APP_URL || 'https://acadexmatch.com').replace(/\/$/, '')}/jobs/${j.id}` },
    { key: 'id', label: 'Vacancy ID', get: j => j.id },
  ],
};

const applications: Dataset<Application> = {
  key: 'applications', label: 'Applications', personal: true,
  description: 'Every application with the candidate, the vacancy, match score and current stage.',
  rows: () => db(d => (d[STORAGE_KEYS.APPLICATIONS] as Application[]) || []),
  fields: [
    { key: 'candidate', label: 'Candidate', get: a => a.candidateName, def: true },
    { key: 'email', label: 'Candidate email', get: a => a.candidateEmail, def: true },
    { key: 'phone', label: 'Candidate mobile', get: a => a.candidatePhone },
    { key: 'location', label: 'Candidate location', get: a => a.candidateLocation },
    { key: 'designation', label: 'Current designation', get: a => a.currentDesignation },
    { key: 'degree', label: 'Highest degree', get: a => a.highestDegree },
    { key: 'job', label: 'Vacancy', get: a => a.jobTitle, def: true },
    { key: 'department', label: 'Department', get: a => a.department },
    { key: 'institution', label: 'Institution', get: a => a.instituteName, def: true },
    { key: 'match', label: 'Match score', get: a => a.matchScore, num: true, def: true },
    { key: 'status', label: 'Stage', get: a => a.status, def: true },
    { key: 'applied', label: 'Applied on', get: a => dt(a.appliedDate), def: true },
    { key: 'interview', label: 'Interview', get: a => (a.interviewSlot ? dt((a.interviewSlot as { startTime?: string; date?: string }).startTime || (a.interviewSlot as { date?: string }).date) : '') },
    { key: 'offer', label: 'Offer response', get: a => a.offerDetails?.response },
    { key: 'id', label: 'Application ID', get: a => a.id },
  ],
};

type EV = AcademicEvent & { views: number; register: number };
const events: Dataset<EV> = {
  key: 'events', label: 'FDPs, workshops, seminars and conferences', personal: false,
  description: 'Advertised events with status, payment and visits.',
  rows: async () => {
    const v = await eventViewCounts().catch(() => ({ events: {} as Record<string, { total: number; register: number }> }));
    return db(d => ((d[STORAGE_KEYS.EVENTS] as AcademicEvent[]) || []).map(e => ({ ...e, views: v.events[e.id]?.total || 0, register: v.events[e.id]?.register || 0 })));
  },
  fields: [
    { key: 'title', label: 'Title', get: e => e.title, def: true },
    { key: 'kind', label: 'Type', get: e => e.kind, def: true },
    { key: 'organizer', label: 'Organiser', get: e => e.organizer, def: true },
    { key: 'department', label: 'Department', get: e => e.department },
    { key: 'mode', label: 'Mode', get: e => e.mode, def: true },
    { key: 'city', label: 'City', get: e => e.city },
    { key: 'state', label: 'State', get: e => e.state, def: true },
    { key: 'start', label: 'Starts', get: e => d10(e.startDate), def: true },
    { key: 'end', label: 'Ends', get: e => d10(e.endDate) },
    { key: 'regDeadline', label: 'Registration closes', get: e => d10(e.registrationDeadline) },
    { key: 'fee', label: 'Registration fee', get: e => e.registrationFee },
    { key: 'status', label: 'Status', get: e => e.status, def: true },
    { key: 'paid', label: 'Listing paid', get: e => !!e.paidAt || !!e.feeWaived || !!e.freeOffer },
    { key: 'views', label: 'Views', get: e => e.views, num: true, def: true },
    { key: 'registerClicks', label: 'Register clicks', get: e => e.register, num: true, def: true },
    { key: 'email', label: 'Contact email', get: e => e.contactEmail },
    { key: 'phone', label: 'Contact phone', get: e => e.contactPhone },
    { key: 'link', label: 'Registration link', get: e => e.registrationLink },
    { key: 'created', label: 'Submitted', get: e => dt(e.createdAt) },
    { key: 'id', label: 'Event ID', get: e => e.id },
  ],
};

const payments: Dataset<Payment> = {
  key: 'payments', label: 'Payments', personal: true,
  description: 'Payments with amounts, status, invoice numbers and refunds.',
  rows: () => db(d => (d[STORAGE_KEYS.PAYMENTS] as Payment[]) || []),
  fields: [
    { key: 'date', label: 'Date', get: p => dt(p.paidAt || p.createdAt), def: true },
    { key: 'name', label: 'Paid by', get: p => p.userName, def: true },
    { key: 'email', label: 'Email', get: p => p.userEmail, def: true },
    { key: 'institution', label: 'Institution', get: p => p.instituteName },
    { key: 'product', label: 'Product', get: p => p.product, def: true },
    { key: 'item', label: 'For', get: p => p.jobTitle || p.eventTitle || p.plan },
    { key: 'amount', label: 'Amount (₹)', get: p => p.amount, num: true, def: true },
    { key: 'status', label: 'Status', get: p => p.status, def: true },
    { key: 'method', label: 'Method', get: p => p.method },
    { key: 'invoice', label: 'Invoice no.', get: p => p.invoiceNumber, def: true },
    { key: 'refunded', label: 'Refunded (₹)', get: p => p.refundedAmount || 0, num: true },
    { key: 'fee', label: 'Gateway fee (₹)', get: p => p.gatewayFee, num: true },
    { key: 'until', label: 'Active until', get: p => d10(p.activeUntil) },
    { key: 'test', label: 'Test payment', get: p => !!p.testMode },
    { key: 'paymentId', label: 'Razorpay payment ID', get: p => p.razorpayPaymentId },
    { key: 'id', label: 'Payment ID', get: p => p.id },
  ],
};

const audit: Dataset<AuditLog> = {
  key: 'audit', label: 'Audit log', personal: true,
  description: 'Who did what and when (latest entries).',
  rows: () => db(d => (d[STORAGE_KEYS.AUDIT_LOGS] as AuditLog[]) || []),
  fields: [
    { key: 'time', label: 'Time', get: l => dt(l.timestamp), def: true },
    { key: 'actor', label: 'Who', get: l => l.actor, def: true },
    { key: 'role', label: 'Role', get: l => l.actorRole, def: true },
    { key: 'action', label: 'Action', get: l => l.action, def: true },
    { key: 'target', label: 'Target', get: l => l.target, def: true },
    { key: 'category', label: 'Category', get: l => l.complianceCategory, def: true },
    { key: 'ip', label: 'IP address', get: l => l.ipAddress },
  ],
};

type Row = Record<string, unknown>;
const sqlRows = (sql: string) => async () => { try { const p = await outreachDb(); const [r] = await p.query<RowDataPacket[]>(sql); return r as Row[]; } catch { return []; } };
const outreach: Dataset<Row> = {
  key: 'outreach', label: 'Institution outreach contacts', personal: true,
  description: 'College addresses found or imported for the institution outreach, with sending status.',
  rows: sqlRows('SELECT * FROM acx_outreach_contacts'),
  fields: [
    { key: 'college', label: 'College', get: r => r.college as string, def: true },
    { key: 'email', label: 'Email', get: r => r.email as string, def: true },
    { key: 'state', label: 'State', get: r => r.state as string, def: true },
    { key: 'category', label: 'Type', get: r => r.category as string },
    { key: 'aishe', label: 'AISHE code', get: r => r.aishe_code as string, def: true },
    { key: 'status', label: 'Status', get: r => r.status as string, def: true },
    { key: 'lastSent', label: 'Last emailed', get: r => (r.last_sent_at ? dt(new Date(r.last_sent_at as string).toISOString()) : ''), def: true },
    { key: 'source', label: 'Found on', get: r => r.source_url as string },
  ],
};
const teachers: Dataset<Row> = {
  key: 'teachers', label: 'Teacher invitations', personal: true,
  description: 'Teachers found on college faculty pages and their invitation status.',
  rows: sqlRows('SELECT * FROM acx_teacher_contacts'),
  fields: [
    { key: 'name', label: 'Name', get: r => r.name as string, def: true },
    { key: 'email', label: 'Email', get: r => r.email as string, def: true },
    { key: 'designation', label: 'Designation', get: r => r.designation as string, def: true },
    { key: 'department', label: 'Department', get: r => r.department as string, def: true },
    { key: 'college', label: 'College', get: r => r.college as string, def: true },
    { key: 'state', label: 'State', get: r => r.state as string, def: true },
    { key: 'status', label: 'Status', get: r => r.status as string, def: true },
    { key: 'sent', label: 'Invited on', get: r => (r.sent_at ? dt(new Date(r.sent_at as string).toISOString()) : '') },
    { key: 'source', label: 'Found on', get: r => r.source_url as string },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATASETS: Dataset<any>[] = [users, candidates, institutions, vacancies, applications, events, payments, outreach, teachers, audit];

export function exportCatalog() {
  return DATASETS.map(d => ({ key: d.key, label: d.label, description: d.description, personal: d.personal, fields: d.fields.map(f => ({ key: f.key, label: f.label, def: !!f.def, num: !!f.num })) }));
}

export interface ExportRequest { dataset: string; fields: string[]; sort?: { field: string; dir: 'asc' | 'desc' }[]; search?: string }

/** Header and rows for the chosen fields, in the chosen order, sorted as asked. */
export async function exportRows(req: ExportRequest): Promise<{ label: string; header: string[]; rows: Val[][]; personal: boolean }> {
  const ds = DATASETS.find(d => d.key === req.dataset);
  if (!ds) throw new Error('Unknown data set.');
  const byKey = new Map(ds.fields.map(f => [f.key, f]));
  const fields = (req.fields?.length ? req.fields : ds.fields.filter(f => f.def).map(f => f.key)).map(k => byKey.get(k)).filter(Boolean) as Field<unknown>[];
  if (!fields.length) throw new Error('Choose at least one field.');
  const all = await ds.rows();
  const q = (req.search || '').trim().toLowerCase();
  let rows = all.map(r => ds.fields.reduce<Record<string, Val>>((o, f) => { try { o[f.key] = f.get(r); } catch { o[f.key] = ''; } return o; }, {}));
  if (q) rows = rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(q)));
  const sorts = (req.sort || []).filter(s => byKey.has(s.field));
  if (sorts.length) {
    const empty = (v: Val) => v == null || v === '';
    const cmp = (a: Val, b: Val) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
      return String(a).localeCompare(String(b), 'en-IN', { numeric: true, sensitivity: 'base' });
    };
    rows.sort((x, y) => {
      for (const s of sorts) {
        const a = x[s.field], b = y[s.field];
        if (empty(a) !== empty(b)) return empty(a) ? 1 : -1; // blanks last either way
        if (empty(a)) continue;
        const c = cmp(a, b);
        if (c) return s.dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  return { label: ds.label, header: fields.map(f => f.label), rows: rows.map(r => fields.map(f => r[f.key])), personal: ds.personal };
}
