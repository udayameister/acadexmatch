/* Job-alert emails go only to candidates whose alert keywords match; new vacancies are never broadcast.
 * Run: npx tsx tests/job-alerts.ts */
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { alertKeywords, matchesAlert } from '../lib/jobFilter';
import { DEFAULT_FILTERS } from '../lib/jobFilter';
import type { Job } from '../types';

const job = (id: string, title: string, department: string, extra: Partial<Job> = {}) => ({
  id, title, department, instituteName: 'Sample College', instituteShortName: 'SC', instituteId: 'inst-sc', instituteLogo: '', instituteType: null,
  designation: 'Assistant Professor', specializationTags: [], advertisementNumber: null, location: { city: 'Testpur', state: 'Kerala' },
  payScale: { cpcBand: null, entryPay: null, grossMonthlyEstimated: null, allowances: [] },
  requiredQualifications: { minDegree: null, netSletMandatory: null, phdNorms: null, minExperienceYears: null, experienceText: null, minUgcCarePubs: null, ugcRegulationsYear: null, specializationRequirements: [] },
  reservationCategory: null, applicationDeadline: '2099-01-01', status: 'published', isClaimedByInstitute: false, screeningQuestions: [], selectionProcess: [],
  description: null, responsibilities: [], benefits: [], postedAt: '2026-11-11', applicantCount: 0, featured: false, ...extra,
}) as unknown as Job;

// ---- keyword rules (pure)
assert.deepEqual(alertKeywords({ search: ' Computer Science,  VLSI ; physics or chemistry, ,x' }), ['Computer Science', 'VLSI', 'physics', 'chemistry']);
const cs = job('j1', 'Assistant Professor', 'Computer Science and Engineering');
const vlsi = job('j2', 'Associate Professor – VLSI Design', 'ECE');
const hist = job('j3', 'Assistant Professor', 'History');
const f = (search: string, extra = {}) => ({ ...DEFAULT_FILTERS, search, ...extra });
assert.equal(matchesAlert(cs, f('')), false, 'no keywords: nothing matches');
assert.equal(matchesAlert(cs, f('   ')), false);
assert.equal(matchesAlert(cs, f('Computer Science, VLSI')), true);
assert.equal(matchesAlert(vlsi, f('Computer Science, VLSI')), true);
assert.equal(matchesAlert(hist, f('Computer Science, VLSI')), false);
assert.equal(matchesAlert(cs, f('Computer Science', { state: 'Tamil Nadu' })), false, 'other filters still apply');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-alerts-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST;
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const users = ['u1', 'u2', 'u3'].map(id => ({ id, role: 'candidate', name: `Cand ${id}`, email: `${id}@example.com`, emailVerified: true, createdAt: '2026-11-01' }));
  const alerts = [
    { id: 'a-kw', userId: 'u1', name: 'CS or VLSI', filters: f('Computer Science, VLSI'), frequency: 'instant', active: true, createdAt: '2026-11-01' },
    { id: 'a-none', userId: 'u2', name: 'Everything in Kerala', filters: f('', { state: 'Kerala' }), frequency: 'instant', active: true, createdAt: '2026-11-01' },
  ];
  const write = (jobs: Job[]) => {
    const p = path.join(dir, 'data', 'db.json');
    const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    fs.writeFileSync(p, JSON.stringify({ ...cur, acad_users_v3: users, acad_job_alerts_v3: alerts, acad_jobs_v3: jobs }));
  };
  const { STORAGE_KEYS } = await import('../lib/storage');
  assert.equal(STORAGE_KEYS.JOB_ALERTS, 'acad_job_alerts_v3', 'test uses the real alert key');
  write([]);

  const { runJobAlerts } = await import('../lib/server/jobAlerts');
  await runJobAlerts({ force: true }); // first run only records what is already open
  write([cs, vlsi, hist]);
  const r = await runJobAlerts({ force: true });
  assert.equal(r.skippedNoKeywords, 1, 'the alert without keywords sends nothing');
  const { withDb } = await import('../lib/server/db');
  const outbox = await withDb(null, db => JSON.stringify(db));
  assert(/CS or VLSI/.test(outbox), 'keyword alert emailed');
  assert(!/Everything in Kerala/.test(outbox.replace(/"name":"Everything in Kerala"/g, '')), 'keyword-less alert not emailed');
  assert.equal(r.vacancies, 2, 'only the two matching vacancies (CS and VLSI), not History');

  // New vacancy approved by the admin: not broadcast to every candidate.
  const digest = await import('../lib/server/newPostDigest');
  await digest.recordApproved([{ type: 'job', id: 'j3' }]);
  assert.equal((await digest.digestStatus()).pending.length, 0, 'vacancies are not queued for everyone');
  assert.equal(await digest.maybeSendDigest({ force: true }), null);

  // Events are still announced.
  const p = path.join(dir, 'data', 'db.json');
  const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
  cur[STORAGE_KEYS.EVENTS] = [{ id: 'e1', kind: 'fdp', title: 'FDP on AI', organizer: 'Sample College', mode: 'online', startDate: '2099-01-01', endDate: '2099-01-02', status: 'published', city: '', state: '' }];
  fs.writeFileSync(p, JSON.stringify(cur));
  await digest.recordApproved([{ type: 'event', id: 'e1' }]);
  assert.equal((await digest.digestStatus()).pending.length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('job-alerts: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
