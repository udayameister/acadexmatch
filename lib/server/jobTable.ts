import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Job } from '@/types';

/*
 * acx_job_posts — one row per vacancy (institution posts and crawled advertisements alike), with the
 * main fields in their own columns and the full advertisement sections in `details` (JSON text).
 *
 * The vacancies themselves stay in acx_kv (key db:acad_jobs_v3), which the app reads and writes; this
 * table is a mirror kept up to date after every save, for reporting, exports and SQL queries
 * (phpMyAdmin). Nothing reads it back, so a failure here never affects the site.
 * Field reference: docs/JOB_FIELDS.md.
 */

export const JOBS_KEY = 'acad_jobs_v3';

export const JOB_TABLE_DDL = `CREATE TABLE IF NOT EXISTS acx_job_posts (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  status VARCHAR(20) NOT NULL,
  title VARCHAR(500) NOT NULL,
  institute_id VARCHAR(191) NOT NULL,
  institute_name VARCHAR(300) NOT NULL,
  institute_type VARCHAR(100) NULL,
  department VARCHAR(300) NULL,
  designation VARCHAR(200) NULL,
  advertisement_number VARCHAR(200) NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  number_of_posts VARCHAR(120) NULL,
  pay_text VARCHAR(500) NULL,
  employment_type VARCHAR(40) NULL,
  qualification TEXT NULL,
  experience TEXT NULL,
  reservation VARCHAR(300) NULL,
  posted_at DATE NULL,
  deadline DATE NULL,
  deadline_text VARCHAR(500) NULL,
  deadline_estimated TINYINT(1) NOT NULL DEFAULT 0,
  apply_modes VARCHAR(100) NULL,
  apply_url TEXT NULL,
  apply_emails TEXT NULL,
  official_website VARCHAR(500) NULL,
  notification_link TEXT NULL,
  departments TEXT NULL,
  posts TEXT NULL,
  is_premium TINYINT(1) NOT NULL DEFAULT 0,
  is_scraped TINYINT(1) NOT NULL DEFAULT 0,
  source_kind VARCHAR(20) NULL,
  source_site VARCHAR(200) NULL,
  source_url TEXT NULL,
  applicant_count INT NOT NULL DEFAULT 0,
  details LONGTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status_deadline (status, deadline),
  KEY idx_institute (institute_id),
  KEY idx_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const COLS = ['id', 'status', 'title', 'institute_id', 'institute_name', 'institute_type', 'department', 'designation',
  'advertisement_number', 'city', 'state', 'number_of_posts', 'pay_text', 'employment_type', 'qualification', 'experience',
  'reservation', 'posted_at', 'deadline', 'deadline_text', 'deadline_estimated', 'apply_modes', 'apply_url', 'apply_emails',
  'official_website', 'notification_link', 'departments', 'posts', 'is_premium', 'is_scraped', 'source_kind', 'source_site',
  'source_url', 'applicant_count', 'details'] as const;

const cut = (v: unknown, n: number): string | null => { const t = typeof v === 'string' ? v.trim() : v == null ? '' : String(v); return t ? t.slice(0, n) : null; };
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const req = (r?: { post: string | null; text: string }[]) => (r?.length ? r.map(x => (x.post ? `${x.post}: ${x.text}` : x.text)).join('\n') : null);

/** One table row for a vacancy. */
export function jobRow(j: Job): (string | number | null)[] {
  const d = j.details || {};
  const q = j.requiredQualifications || ({} as Job['requiredQualifications']);
  const row: Record<(typeof COLS)[number], string | number | null> = {
    id: cut(j.id, 191) || '',
    status: cut(j.status, 20) || 'published',
    title: cut(j.title, 500) || '',
    institute_id: cut(j.instituteId, 191) || '',
    institute_name: cut(j.instituteName, 300) || '',
    institute_type: cut(j.instituteType, 100),
    department: cut(j.department, 300),
    designation: cut(j.designation, 200),
    advertisement_number: cut(j.advertisementNumber, 200),
    city: cut(j.location?.city, 120),
    state: cut(j.location?.state, 120),
    number_of_posts: cut(d.numberOfPosts ?? j.source?.numberOfPosts, 120),
    pay_text: cut(d.salaryText ?? j.payScale?.cpcBand, 500),
    employment_type: cut(d.employmentType, 40),
    qualification: req(d.qualifications) ?? cut(q.minDegree, 5000),
    experience: req(d.experience) ?? cut(q.experienceText, 5000),
    reservation: cut(d.reservation ?? j.reservationCategory, 300),
    posted_at: day(j.postedAt),
    deadline: day(j.applicationDeadline),
    deadline_text: cut(d.lastDateText ?? j.deadlineText, 500),
    deadline_estimated: d.deadlineEstimated ? 1 : 0,
    apply_modes: d.applyModes?.length ? d.applyModes.join(',') : null,
    apply_url: cut(j.externalApplyUrl, 5000),
    apply_emails: d.applyEmails?.length ? d.applyEmails.map(e => (e.note ? `${e.email} (${e.note})` : e.email)).join('\n') : null,
    official_website: cut(d.officialWebsite, 500),
    notification_link: cut(d.notificationLink, 5000),
    departments: d.departmentGroups?.length ? d.departmentGroups.flatMap(g => g.items).join(', ').slice(0, 60000) : (j.specializationTags?.length ? j.specializationTags.join(', ') : null),
    posts: d.postGroups?.length ? d.postGroups.flatMap(g => g.items).join(', ').slice(0, 60000) : null,
    is_premium: j.isPremium ? 1 : 0,
    is_scraped: j.source ? 1 : 0,
    source_kind: cut(j.source?.kind, 20),
    source_site: cut(j.source?.siteName, 200),
    source_url: cut(j.source?.url, 5000),
    applicant_count: Number(j.applicantCount) || 0,
    details: j.details ? JSON.stringify(j.details) : null,
  };
  return COLS.map(c => row[c]);
}

const UPSERT = `INSERT INTO acx_job_posts (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})
  ON DUPLICATE KEY UPDATE ${COLS.filter(c => c !== 'id').map(c => `${c} = VALUES(${c})`).join(', ')}`;

type Conn = Pool | PoolConnection;

/** Writes the rows of vacancies that changed and removes rows of deleted ones. */
export async function syncJobRows(conn: Conn, before: string | undefined, after: unknown): Promise<void> {
  const next = Array.isArray(after) ? (after as Job[]) : [];
  let prev = new Map<string, string>();
  try { prev = new Map((JSON.parse(before || '[]') as Job[]).map(j => [j.id, JSON.stringify(j)])); } catch { /* full write */ }
  for (const j of next) {
    if (!j?.id) continue;
    if (prev.get(j.id) === JSON.stringify(j)) { prev.delete(j.id); continue; }
    prev.delete(j.id);
    await conn.query(UPSERT, jobRow(j));
  }
  const gone = [...prev.keys()];
  for (let i = 0; i < gone.length; i += 200) await conn.query(`DELETE FROM acx_job_posts WHERE id IN (${gone.slice(i, i + 200).map(() => '?').join(',')})`, gone.slice(i, i + 200));
}

/** Creates the table and rebuilds it from the stored vacancies (once per server start). */
export async function rebuildJobTable(p: Pool): Promise<void> {
  await p.query(JOB_TABLE_DDL);
  const [rows] = await p.query<RowDataPacket[]>('SELECT v FROM acx_kv WHERE k = ?', [`db:${JOBS_KEY}`]);
  let jobs: Job[] = [];
  try { jobs = JSON.parse(String(rows[0]?.v || '[]')); } catch { return; }
  if (!Array.isArray(jobs)) return;
  for (const j of jobs) if (j?.id) await p.query(UPSERT, jobRow(j));
  const ids = jobs.map(j => j?.id).filter(Boolean);
  await p.query(ids.length ? `DELETE FROM acx_job_posts WHERE id NOT IN (${ids.map(() => '?').join(',')})` : 'DELETE FROM acx_job_posts', ids);
}
