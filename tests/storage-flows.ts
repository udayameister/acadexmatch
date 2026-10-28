// Integration test of StorageService flows against an in-memory store (the same StoreContext the
// server and the browser provide). Sign-in state lives in the context's userId.
import type { StoreContext } from '../lib/storage';

const store = new Map<string, string>();
const memCtx: StoreContext = {
  get: k => (store.has(k) ? JSON.parse(store.get(k)!) : undefined),
  set: (k, v) => void store.set(k, JSON.stringify(v)),
  userId: null,
  idCounter: 0,
};
(globalThis as any).window = undefined;

let failures = 0;
function check(label: string, cond: unknown, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
}

async function main() {
  const storage = await import('../lib/storage');
  const { INITIAL_INSTITUTES, INITIAL_JOBS } = await import('../lib/data');
  memCtx.set(storage.STORAGE_KEYS.INSTITUTES, INITIAL_INSTITUTES);
  memCtx.set(storage.STORAGE_KEYS.JOBS, INITIAL_JOBS);
  storage.setStoreContextProvider(() => memCtx);
  const StorageService = storage.StorageService;
  const signOut = StorageService.logout.bind(StorageService);
  StorageService.logout = () => { signOut(); memCtx.userId = null; };

  check('no user signed in initially', StorageService.getCurrentUser() === null);
  check('no applications visible anonymously', StorageService.getApplications().length === 0);
  check('seed jobs published', StorageService.getPublishedJobs().length === 6);
  check('anonymous profile is null', StorageService.getCandidateProfile() === null);

  // Platform admin bootstrap
  const admin = await StorageService.register({ name: 'Platform Admin', email: 'admin@acadexmatch.in', password: 'Platform#Key2026', role: 'super_admin' });
  check('first super admin can register', admin.success, admin);
  const admin2 = await StorageService.register({ name: 'Second', email: 'x@acadexmatch.in', password: 'Platform#Key2026', role: 'super_admin' });
  check('second super admin is refused', !admin2.success);
  StorageService.logout();

  // Validation
  check('short password rejected', !(await StorageService.register({ name: 'A B', email: 'ab@x.com', password: 'short', role: 'candidate' })).success);
  check('bad email rejected', !(await StorageService.register({ name: 'A B', email: 'nope', password: 'Long#enough2026', role: 'candidate' })).success);

  // Institute admin: domain enforcement
  const badInst = await StorageService.register({ name: 'Prof X', email: 'profx@gmail.com', password: 'Faculty#Gate2026', role: 'institute_admin', instituteId: 'inst-iitb' });
  check('IIT Bombay join refused for gmail address', !badInst.success, badInst);
  const inst = await StorageService.register({ name: 'Prof. Dean', email: 'dean@iitb.ac.in', password: 'Faculty#Gate2026', role: 'institute_admin', instituteId: 'inst-iitb' });
  check('IIT Bombay join allowed for @iitb.ac.in', inst.success, inst);
  check('institute admin sees own institute', StorageService.getCurrentInstitute()?.id === 'inst-iitb');
  StorageService.logout();

  // New pending institute
  const newInst = await StorageService.register({
    name: 'Registrar', email: 'registrar@newcollege.edu.in', password: 'Faculty#Gate2026', role: 'institute_admin',
    newInstitute: { name: 'New Engineering College', aisheCode: 'C-99999', city: 'Pune', state: 'Maharashtra' },
  });
  check('new institute registration works', newInst.success, newInst);
  check('new institute is pending', StorageService.getCurrentInstitute()?.verificationStatus === 'pending');
  const pendingId = StorageService.getCurrentInstitute()!.id;
  StorageService.logout();

  // Candidate
  const cand = await StorageService.register({ name: 'Dr. Kavya Iyer', email: 'kavya@example.org', password: 'Scholar#Path2026', role: 'candidate' });
  check('candidate registers', cand.success);
  const dup = await StorageService.register({ name: 'Dup', email: 'KAVYA@example.org', password: 'Scholar#Path2026', role: 'candidate' });
  check('duplicate email (case-insensitive) refused', !dup.success);
  let profile = StorageService.getCandidateProfile()!;
  check('empty profile created with API 0', profile && profile.apiScore === 0 && profile.publications.length === 0, profile?.apiScore);

  const job = StorageService.getPublishedJobs().find(j => j.instituteId === 'inst-iitb')!;
  const early = StorageService.applyToJob(job.id, []);
  check('apply blocked until profile has phone & degree', !early.success, early);

  profile = StorageService.updateCandidateProfile({
    ...profile,
    phone: '+91 98401 23456',
    highestDegree: 'Ph.D. in Computer Science',
    phdStatus: { isCompleted: true, institute: 'IIT Madras', isUgc2009_2016Compliant: true, graduationYear: 2020 },
    netSletStatus: { isQualified: true, examType: 'UGC-NET (JRF)' },
    education: [
      { id: 'e1', degree: 'B.Tech', field: 'CSE', institute: 'X', year: 2012, gradePercentage: '78%' },
      { id: 'e2', degree: 'M.Tech', field: 'CSE', institute: 'Y', year: 2014, gradePercentage: '8.9 CGPA' },
    ],
    experience: [{ id: 'x1', designation: 'Assistant Professor', instituteOrCompany: 'Anna University', department: '', startDate: '2020-07-01', endDate: 'Present', isCurrent: true, type: 'Teaching' }],
    researchInterests: ['Machine Learning', 'Computer Science'],
  });
  check('API score recomputed from real data', profile.apiScore === 13 + 25 + 30 + 7 + 0 + 10 + 0, profile.apiScore);
  check('completeness > 0', profile.profileCompleteness > 0);

  // Premium is free for every candidate (CANDIDATE_PREMIUM_FREE), so a new candidate can apply right away.
  check('every candidate counts as Premium', storage.isPremiumUser(StorageService.getCurrentUser()));
  const ok = StorageService.applyToJob(job.id, [{ question: 'q', answer: 'a' }]);
  check('candidate can apply', ok.success, ok);
  check('duplicate application refused', !StorageService.applyToJob(job.id, []).success);
  check('applicant count incremented', StorageService.getJobById(job.id)!.applicantCount === 1);
  check('candidate sees exactly 1 application', StorageService.getApplications().length === 1);
  const appId = (ok as any).application.id as string;
  StorageService.logout();

  // Wrong password
  check('wrong password refused', !(await StorageService.login('dean@iitb.ac.in', 'wrongpass')).success);
  check('unknown email refused', !(await StorageService.login('ghost@iitb.ac.in', 'Faculty#Gate2026')).success);

  // Institute reviews
  check('institute admin logs in', (await StorageService.login('DEAN@iitb.ac.in', 'Faculty#Gate2026')).success);
  check('institute sees the application', StorageService.getApplications().some(a => a.id === appId));
  StorageService.updateApplicationStage(appId, 'shortlisted');
  StorageService.scheduleInterview(appId, { date: '2026-11-01', time: '10:00 AM IST', platform: 'Zoom', meetingLink: 'https://zoom.us/j/1', committeeMembers: ['Dean'], instructions: '' });
  StorageService.addReviewerScore(appId, {
    reviewerId: 'r1', reviewerName: 'Prof. Dean', reviewerRole: 'Dean (Academic)', researchPotentialScore: 25, teachingPedagogyScore: 20,
    apiScoreValidation: 18, interviewPerformance: 20, totalScore: 83, recommendation: 'Recommend', confidentialNotes: '', submittedAt: '',
  });
  const app = StorageService.getApplicationById(appId)!;
  check('stage moved to committee_review after scoring', app.status === 'committee_review', app.status);
  check('stage history recorded', app.stageHistory.length === 4, app.stageHistory.map(h => h.stage));
  check('history actor is real user', app.stageHistory[1].actor === 'Prof. Dean', app.stageHistory[1].actor);
  StorageService.logout();

  // Other institute cannot see it
  await StorageService.login('registrar@newcollege.edu.in', 'Faculty#Gate2026');
  check('other institute sees no applications', StorageService.getApplications().length === 0);
  StorageService.logout();

  // Admin verifies the pending institute
  await StorageService.login('admin@acadexmatch.in', 'Platform#Key2026');
  StorageService.updateInstituteVerification(pendingId, 'verified');
  check('admin verified institute', StorageService.getInstituteById(pendingId)!.verificationStatus === 'verified');
  check('admin sees all applications', StorageService.getApplications().length === 1);
  StorageService.logout();

  // DPDP erasure
  await StorageService.login('kavya@example.org', 'Scholar#Path2026');
  const exported = StorageService.exportMyData() as any;
  check('export contains profile and application', exported.profile && exported.applications.length === 1);
  const req = StorageService.createDPDPRequest('Right to Erasure (Delete all Academic CV & Personal Data)')!;
  StorageService.logout();
  await StorageService.login('admin@acadexmatch.in', 'Platform#Key2026');
  StorageService.updateDPDPStatus(req.id, 'Completed');
  check('erasure removed account', !StorageService.getUsers().some(u => u.email === 'kavya@example.org'));
  check('erasure removed applications', StorageService.getAllApplications().length === 0);
  check('erased user can no longer log in', !(await StorageService.login('kavya@example.org', 'Scholar#Path2026')).success);

  // Passwords never stored in plain text
  const raw = store.get('acad_users_v3') || '';
  check('no plaintext passwords in storage', !raw.includes('Scholar#Path2026') && !raw.includes('Faculty#Gate2026'));
  check('audit log populated with real actors', StorageService.getAuditLogs().some(l => l.actor === 'dean@iitb.ac.in'));

  // Promotions and plans
  const pj = StorageService.getPublishedJobs()[0];
  check('admin can feature a vacancy', StorageService.setJobPromotion(pj.id, 'featured', 10).success && storage.isJobFeatured(StorageService.getJobById(pj.id)!));
  StorageService.setJobPromotion(pj.id, 'featured', 0);
  check('admin can remove the promotion', !storage.isJobFeatured(StorageService.getJobById(pj.id)!));
  StorageService.logout();
  check('anonymous user cannot feature a vacancy', !StorageService.setJobPromotion(pj.id, 'urgent', 5).success);
  const plans = storage.premiumPlansOf(StorageService.getPlanSettings());
  check('three Premium plans by default', plans.map(p => p.key).join(',') === 'monthly,yearly,scholar', plans.map(p => p.key));

  console.log(failures === 0 ? '\nALL FLOW TESTS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
}

main();
