/* FacultyPlus parser, duplicate checks and the reading engine (against a local stand-in for the WordPress API).
 * The sample posts below are invented, in FacultyPlus's two layouts; no FacultyPlus text is stored here.
 * Run: npx tsx tests/facultyplus.ts */
import assert from 'assert';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { cfDecode, institutionFromTitle, parseFacultyPlusPost, type WpPost } from '../lib/facultyplus';
import { duplicateGroups, findDuplicate, institutionKey, isDuplicate, postKinds } from '../lib/jobDuplicates';

const TODAY = '2026-11-10';
const post = (id: number, title: string, html: string, date = '2026-11-10T09:00:00'): WpPost => ({
  id, date, link: `https://www.facultyplus.com/sample-${id}/`, title: { rendered: title }, content: { rendered: html }, categories: [1459],
});

// ---- Layout A (labelled paragraphs + Important Dates / Important Links tables)
const A = post(900001, 'Teaching Careers at Sample Engineering College (Autonomous), Testpur', `
<p>Sample Engineering College (Autonomous), Testpur has announced openings. This intro is the listing site's own writing.</p>
<p><strong>Date Posted:</strong> 10 November 2026</p>
<p><strong>Hiring Organization Name:</strong> Sample Engineering College (Autonomous), Testpur</p>
<p><strong>Organization Profile:</strong> A long profile written by the listing site that must not be copied.</p>
<p><strong>Job Title/Designation:</strong> The college is hiring for</p>
<ul><li>Assistant Professor</li><li>Associate Professor</li><li>Professor</li></ul>
<p><strong>Vacancy available in departments:</strong> Openings are available in</p>
<ul><li>Computer Science &amp; Engineering (CSE)</li><li>Electronics &amp; Communication Engineering (ECE)</li><li>Master of Business Administration (MBA)</li></ul>
<p><strong>Required Qualifications for Sample Recruitment:</strong> Candidates should have</p>
<ul><li>Qualification as per AICTE &amp; UGC Norms</li><li>Ph.D. for Professor posts</li></ul>
<p><strong>Candidate Profile:</strong> The institution is looking for candidates who</p>
<ul><li>Listing-site wording that must not be copied</li></ul>
<p><strong>Responsibilities:</strong> Selected candidates will be expected to</p>
<ul><li>More listing-site wording</li></ul>
<p><strong>Salary Details:</strong> As per AICTE Norms</p>
<p><strong>Job Location:</strong> Testpur, Andhra Pradesh</p>
<p><strong>Important Dates:</strong></p>
<table><thead><tr><th><strong>Activity</strong></th><th><strong>Date</strong></th></tr></thead><tbody>
<tr><td><strong>Notification Date</strong></td><td>9 November 2026</td></tr>
<tr><td><strong>Application Start Date</strong></td><td>9 November 2026</td></tr>
<tr><td><strong>Last Date to Apply</strong></td><td>20 November 2026</td></tr>
<tr><td><strong>Walk-in/Interview Date</strong></td><td>Not Applicable</td></tr>
</tbody></table>
<p><strong>Apply Mode:</strong> Email / In Person</p>
<p><strong>How to Apply for this Position?</strong><br>Apply by email to <a href="/cdn-cgi/l/email-protection#422f232b2e0231232f322e276f272c25256c23216c2b2c">[email&#160;protected]</a> before the last date.</p>
<p><strong>Application Procedure:</strong> Candidates need to</p>
<ul><li>Listing-site steps</li></ul>
<p><strong>Important Links:</strong></p>
<table><thead><tr><th><strong>Link Type</strong></th><th><strong>Details</strong></th></tr></thead><tbody>
<tr><td><strong>Official Notification</strong></td><td><a href="https://www.facultyplus.com/wp-content/uploads/2026/11/ADVERT.pdf"><strong>Notification</strong></a> <em>(provided directly by the institution)</em></td></tr>
<tr><td><strong>Official Website</strong></td><td><strong><a href="http://www.sample-engg.ac.in/">www.sample-engg.ac.in</a></strong></td></tr>
<tr><td><strong>Application Link</strong></td><td>Not Applicable</td></tr>
<tr><td><strong>Email Address to Apply</strong></td><td><strong><a href="mailto:jobs@sample-engg.ac.in">jobs@sample-engg.ac.in</a></strong></td></tr>
</tbody></table>
<p><strong>Organization address:</strong><br>Sample Engineering College,<br>Testpur,<br>Andhra Pradesh &#8211; 517000.</p>
<p><strong>Reference Source:</strong> Received directly from the institution.</p>
<hr>
<p><strong>Frequently Asked Questions</strong></p>
<ol><li><strong>Which posts are open?</strong><br>Assistant Professor.</li></ol>
<p><strong>Copyright Disclaimer:</strong> This content is the property of the listing site.</p>`);

// ---- Layout B (posts table, advertisement number, pay level, official notification on the institution's site)
const B = post(900002, 'Assistant Professor Vacancy Sample University of Agriculture &#038; Technology, Demonagar', `
<p>Intro written by the listing site.</p>
<p><strong>Institution Name:</strong> Sample University of Agriculture &amp; Technology (SUAT), Demonagar</p>
<p><strong>Advertisement/Notification No.:</strong> E-II/2026/123, dated 30 October 2026</p>
<div><p><span><strong>Institution Profile: </strong></span>Profile text that must not be copied.</p></div>
<p><strong>Employment Type:</strong> Regular</p>
<p><strong>Post Name/Designation:</strong> The University is hiring for the following posts</p>
<table><thead><tr><th><strong>Department/School</strong></th><th><strong>Subject/Specialization</strong></th><th><strong>No. of Posts</strong></th></tr></thead><tbody>
<tr><td><a href="https://www.facultyplus.com/category/x/"><strong>Assistant Professor</strong></a></td><td>Agronomy</td><td>03</td></tr>
<tr><td><strong>Assistant Professor</strong></td><td>Entomology</td><td>01</td></tr>
<tr><td><strong>Associate Professor</strong></td><td>Agronomy</td><td>01</td></tr>
<tr><td><strong>Total</strong></td><td></td><td><strong>5</strong></td></tr>
</tbody></table>
<p><strong>Total Vacancies:</strong> 5</p>
<p><strong>Required Educational Qualifications for Assistant Professor:</strong> Candidates should have</p>
<ul><li>Master's degree in the concerned subject with 55% marks</li><li>NET in a related subject</li></ul>
<p><strong>Age Limit:</strong> 42 years for Assistant Professor.</p>
<p><strong>Required Experience:</strong> Experience is required for the Associate Professor post only</p>
<ul><li>A minimum of 8 years of teaching or research experience</li></ul>
<p><strong>Pay Scale/Pay Level:</strong><br>Assistant Professor: Level-10, Rs. 57,700. Associate Professor: Level-13A, Rs. 1,31,400.</p>
<p><strong>Selection Process:</strong> Candidates will be selected through</p><ul><li>Listing-site wording</li></ul>
<p><strong>Job Location:</strong> Demonagar, Odisha</p>
<p><strong>Important Dates:</strong></p>
<table><tbody>
<tr><td><strong>Notification Date</strong></td><td>30 October 2026</td></tr>
<tr><td><strong>Last Date to Apply</strong></td><td>25 November 2026, 5:00 PM</td></tr>
</tbody></table>
<p><strong>Apply Mode:</strong> Speed Post / Registered Post</p>
<p><strong>Important Links:</strong></p>
<table><tbody>
<tr><td><strong>Official Notification</strong></td><td><a href="https://suat.example.ac.in/notices/advt-123.pdf">Download</a></td></tr>
<tr><td><strong>Official Website</strong></td><td><a href="https://www.facultyplus.com/www.suat.example.ac.in">www.suat.example.ac.in</a></td></tr>
</tbody></table>
<p><strong>Institution address:</strong> Registrar, SUAT, Demonagar &#8211; 751003, Odisha.</p>`);

// ---- Older layout, walk-in only
const C = post(900003, 'Sample Ramanand University, Testabad Wanted Assistant Professor', `
<p><strong>Job Title:</strong> Assistant Professor</p>
<p><strong>Hiring Organization:</strong> Sample Ramanand University, Testabad</p>
<p><strong>Job Location:</strong> Testabad, Maharashtra</p>
<p><strong>Departments that have Faculty Vacancy:</strong></p><ul><li>School of Chemical Sciences</li></ul>
<p><strong>Pay Scale:</strong> Rs.36000/-</p>
<p><strong>Apply Mode:</strong> Walk-in</p>
<p><strong>Date, Time and Venue of Interview:</strong> 16/09/2026 at 11:30 am, Dean Office</p>
<p><strong>Detailed Advertisement:</strong> <a href="https://srtu.example.ac.in/adv">Click here</a></p>`, '2026-09-11T08:00:00');

// ---- Not a vacancy (a workshop advertisement)
const D = post(900004, 'Models to Manuscripts: a writing workshop', '<p>Join our online workshop on writing papers.</p><p><strong>Date:</strong> 20 November 2026</p>');

// ---------------------------------------------------------------- parser
{
  const a = parseFacultyPlusPost(A, { today: TODAY });
  assert.equal(a.isVacancy, true);
  assert.equal(a.job.id, 'fp-900001');
  assert.equal(a.job.instituteName, 'Sample Engineering College (Autonomous), Testpur');
  assert.equal(a.job.title, 'Assistant Professor, Associate Professor and Professor');
  assert.deepEqual(a.job.details?.departmentGroups?.[0].items, ['Computer Science & Engineering (CSE)', 'Electronics & Communication Engineering (ECE)', 'Master of Business Administration (MBA)']);
  assert.equal(a.job.applicationDeadline, '2026-11-20');
  assert.equal(a.job.details?.notificationDate, '2026-11-09');
  assert.equal(a.job.payScale.cpcBand, 'As per AICTE Norms');
  assert.deepEqual(a.job.location, { city: 'Testpur', state: 'Andhra Pradesh' });
  assert.equal(a.job.details?.officialWebsite, 'http://www.sample-engg.ac.in');
  assert.deepEqual(a.job.details?.applyEmails?.map(e => e.email).sort(), ['jobs@sample-engg.ac.in', 'mail@sample-engg.ac.in'], 'e-mails, including one hidden by Cloudflare');
  assert.deepEqual(a.job.details?.qualifications?.map(q => q.text), ['Qualification as per AICTE & UGC Norms', 'Ph.D. for Professor posts']);
  assert(a.job.details?.organizationAddress?.startsWith('Sample Engineering College'));
  // FacultyPlus's own links, files and writing are not in the published vacancy
  const published = JSON.stringify(a.job);
  assert(!/facultyplus/i.test(published), 'no FacultyPlus link or name in the vacancy');
  for (const s of ['listing site', 'must not be copied', 'Listing-site', 'Copyright']) assert(!published.includes(s), `copied: ${s}`);
  assert.equal(a.job.details?.notificationLink, null);
  assert(a.issues.some(i => /notification file is on FacultyPlus/.test(i)));
  assert.equal(a.job.externalApplyUrl, 'http://www.sample-engg.ac.in');
  assert.equal(a.job.source?.url, 'http://www.sample-engg.ac.in');
  assert.equal(a.job.source?.siteName, null);
  assert.equal(a.expired, false);
}
{
  const b = parseFacultyPlusPost(B, { today: TODAY });
  assert.equal(b.job.instituteName, 'Sample University of Agriculture & Technology (SUAT), Demonagar');
  assert.equal(b.job.instituteShortName, 'SUAT');
  assert.deepEqual(b.posts, ['Assistant Professor', 'Associate Professor']);
  assert.deepEqual(b.job.details?.departmentGroups?.[0].items, ['Agronomy', 'Entomology']);
  assert.equal(b.job.details?.numberOfPosts, '5');
  assert.equal(b.job.advertisementNumber, 'E-II/2026/123, dated 30 October 2026');
  assert.equal(b.job.details?.employmentType, 'Regular');
  assert.equal(b.job.applicationDeadline, '2026-11-25');
  assert.equal(b.job.details?.notificationLink, 'https://suat.example.ac.in/notices/advt-123.pdf');
  assert.equal(b.job.details?.officialWebsite, 'https://www.suat.example.ac.in', 'website written as a FacultyPlus-prefixed link is recovered');
  assert.equal(b.job.details?.qualifications?.[0].post, 'Assistant Professor');
  assert.equal(b.job.requiredQualifications.minExperienceYears, 8);
  assert.equal(b.job.location.state, 'Odisha');
  assert(b.job.details?.applyModes?.includes('post'));
  assert(!/facultyplus/i.test(JSON.stringify(b.job)));
  assert(!JSON.stringify(b.job).includes('must not be copied'));
}
{
  const c = parseFacultyPlusPost(C, { today: TODAY });
  assert.equal(c.isVacancy, true);
  assert.equal(c.job.instituteName, 'Sample Ramanand University, Testabad');
  assert.equal(c.job.title, 'Assistant Professor');
  assert.equal(c.job.applicationDeadline, '2026-09-16', 'walk-in: the interview date closes it');
  assert(c.issues.some(i => /Walk-in/.test(i)));
  assert.equal(c.expired, true);
  assert.equal(c.job.details?.notificationLink, 'https://srtu.example.ac.in/adv');
  assert(c.job.details?.applyModes?.includes('walk-in'));
}
{
  const d = parseFacultyPlusPost(D, { today: TODAY });
  assert.equal(d.isVacancy, false, 'a workshop post is not a vacancy');
}
{
  // Department table without a post column; the post is named in the sentence above it.
  const e = parseFacultyPlusPost(post(900005, 'Adjunct Faculty Recruitment Sample Institute of Technology, Testgarh', `
<p><strong>Institution Name:</strong> Sample Institute of Technology, Testgarh</p>
<p><strong>Post Name/Designation:</strong> The Institute is engaging <a href="https://www.facultyplus.com/category/a/">Adjunct Faculty</a> in the following departments</p>
<table><thead><tr><th><strong>Department/School</strong></th><th><strong>Subject/Specialization</strong></th><th><strong>No. of Posts</strong></th></tr></thead><tbody>
<tr><td><strong>Civil Engineering</strong></td><td>Structural, Geotechnical</td><td>Not Specified</td></tr>
<tr><td><strong>Mechanical Engineering</strong></td><td>Design, Thermal</td><td>Not Specified</td></tr></tbody></table>
<p><strong>Job Location:</strong> Not Specified</p>
<p><strong>Important Dates:</strong></p><table><tbody><tr><td><strong>Last Date for Submission of Hard Copy</strong></td><td>30 November 2026</td></tr></tbody></table>`), { today: TODAY });
  assert.deepEqual(e.posts, ['Adjunct Faculty']);
  assert.deepEqual(e.job.details?.departmentGroups?.[0].items, ['Civil Engineering', 'Mechanical Engineering']);
  assert.equal(e.job.applicationDeadline, '2026-11-30');
  assert.equal(e.job.details?.importantDates?.length, 1, 'hard-copy date not listed twice');
  assert.equal(e.job.details?.locationText ?? null, null, '"Not Specified" is not a place');
  // One centre in every row: the subjects are the departments; the post comes from the sentence.
  const f = parseFacultyPlusPost(post(900006, 'Assistant Professor Vacancy 2026 at Sample Central University, Testnagar', `
<p><strong>Institution Name:</strong> Sample Central University, Testnagar</p>
<p><strong>Post Name/Designation:</strong> The University is hiring <a href="https://www.facultyplus.com/c/">Assistant Professors</a> on a contractual basis for the following subjects</p>
<table><thead><tr><th>Department/School</th><th>Subject/Specialization</th><th>No. of Posts</th></tr></thead><tbody>
<tr><td>Centre for Online Education</td><td>Management</td><td>02</td></tr><tr><td>Centre for Online Education</td><td>Social Work</td><td>01</td></tr>
<tr><td><strong>Total</strong></td><td></td><td>03</td></tr></tbody></table>
<p><strong>Important Dates:</strong></p><table><tbody><tr><td><strong>Walk-in/Interview Date</strong></td><td>12 November 2026 at 9:30 AM</td></tr></tbody></table>`), { today: TODAY });
  assert.deepEqual(f.posts, ['Assistant Professor']);
  assert.deepEqual(f.job.details?.departmentGroups?.[0].items, ['Management', 'Social Work']);
  assert.equal(f.job.details?.numberOfPosts, '03');
  assert.equal(f.job.applicationDeadline, '2026-11-12');
  // A post table that mixes teaching and other posts; list items with "(1 post)" and ", to teach …".
  const g = parseFacultyPlusPost(post(900007, 'Recruitment Sample University, Testpur', `
<p><strong>Institution Name:</strong> Sample University, Testpur</p>
<p><strong>Post Name/Designation:</strong> The University is hiring for the following posts</p>
<table><thead><tr><th>Department/School</th><th>Subject/Specialization</th><th>No. of Posts</th></tr></thead><tbody>
<tr><td><strong>Assistant Professor</strong></td><td>Department of History</td><td>01</td></tr><tr><td><strong>Internal Auditor</strong></td><td>Finance</td><td>01</td></tr></tbody></table>`), { today: TODAY });
  assert.deepEqual(g.posts, ['Assistant Professor', 'Internal Auditor']);
  assert.deepEqual(g.job.details?.departmentGroups?.[0].items, ['Department of History', 'Finance']);
  const h = parseFacultyPlusPost(post(900008, 'Guest Teacher Recruitment Sample College of Agriculture, Testgaon', `
<p><strong>Institution Name:</strong> Sample College of Agriculture, Testgaon</p>
<p><strong>Post Name/Designation:</strong> The College is hiring for the following position</p>
<ul><li><a href="https://www.facultyplus.com/x/">Guest Teacher</a> in Plant Pathology, to teach the B.Sc. programme (1 post)</li></ul>
<p><strong>Vacancy available in departments:</strong> Openings are available in</p>
<ul><li>Technical Trainer<ul><li>Computing Sciences</li><li>Embedded Systems</li></ul></li><li>Soft Skill Trainer<ul><li>Training and Placements</li></ul></li></ul>`), { today: TODAY });
  assert.deepEqual(h.posts, ['Guest Teacher in Plant Pathology']);
  assert.deepEqual(h.job.details?.departmentGroups?.[0].items, ['Computing Sciences', 'Embedded Systems', 'Training and Placements'], 'nested lists: the inner items');
}
assert.equal(cfDecode('422f232b2e0231232f322e276f272c25256c23216c2b2c'), 'mail@sample-engg.ac.in');
assert.equal(institutionFromTitle('Faculty Recruitment 2026 at Providence College of Engineering, Alappuzha'), 'Providence College of Engineering, Alappuzha');
assert.equal(institutionFromTitle('Cochin University of Science and Technology, Kochi Wanted Course in Charge'), 'Cochin University of Science and Technology, Kochi');
assert.equal(institutionFromTitle('St. Joseph University, Tamil Nadu 2026 – Assistant Professor/Physical Director'), 'St. Joseph University, Tamil Nadu');
assert.equal(institutionFromTitle('Academic Jobs at TKR College of Engineering and Technology, Hyderabad (Walk-in)'), 'TKR College of Engineering and Technology, Hyderabad');

// ---------------------------------------------------------------- duplicates
assert.equal(institutionKey('Viswam Engineering College (Autonomous), Madanapalle'), 'viswam engineering madanapalle');
assert.deepEqual([...postKinds('Assistant Professor, Associate Professor and Professor')].sort(), ['assistant professor', 'associate professor', 'professor']);
{
  const base = { id: 'a', title: 'Assistant Professor and Associate Professor', instituteName: 'Sample Engineering College (Autonomous), Testpur', applicationDeadline: '2026-11-20', postedAt: '2026-11-09' };
  assert(isDuplicate(base, { ...base, id: 'b', title: 'Assistant Professor (CSE)', instituteName: 'Sample Engineering College, Testpur', applicationDeadline: '2026-11-21' }), 'same college, same post, close dates');
  assert(isDuplicate(base, { ...base, id: 'c', title: 'Faculty Recruitment 2026', applicationDeadline: null, postedAt: '2026-11-01' }), 'generic "faculty" overlaps a teaching post');
  assert(!isDuplicate(base, { ...base, id: 'd', title: 'Lab Instructor' }), 'different post');
  assert(!isDuplicate(base, { ...base, id: 'e', instituteName: 'Other Engineering College, Testpur' }), 'different college');
  assert(!isDuplicate(base, { ...base, id: 'f', applicationDeadline: '2026-06-01' }), 'an older advertisement with another last date');
  assert(isDuplicate({ ...base, officialWebsite: 'https://www.x.ac.in' }, { ...base, id: 'g', instituteName: 'X College of Technology', officialWebsite: 'http://x.ac.in/careers' }), 'same website');
  assert.equal(findDuplicate(base, [{ ...base, id: 'z', title: 'Lab Instructor' }, { ...base, id: 'y' }])?.id, 'y');
  const groups = duplicateGroups([
    { ...base, id: '1', applicantCount: 0, postedAt: '2026-11-08' },
    { ...base, id: '2', applicantCount: 3, postedAt: '2026-11-09' },
    { ...base, id: '3', title: 'Lab Instructor' },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(j => j.id), ['2', '1'], 'keeps the copy with applications');
}

// ---------------------------------------------------------------- engine (stand-in server)
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-fp-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST;
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url || '');
    assert.match(String(req.headers['user-agent']), /AcadeXMatchBot/);
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    if (req.url?.startsWith('/wp-json/wp/v2/posts?include=900002') || req.url?.includes('slug=sample-900002')) { res.end(JSON.stringify([B])); return; }
    if (req.url?.startsWith('/wp-json/wp/v2/posts')) { res.setHeader('X-WP-TotalPages', '1'); res.end(JSON.stringify([A, C, D])); return; }
    res.statusCode = 404; res.end('[]');
  });
  await new Promise<void>(r => server.listen(0, r));
  process.env.FACULTYPLUS_API_ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  // A vacancy already on the job board, same college and post as A.
  const boardJob = { ...parseFacultyPlusPost(A, { today: TODAY }).job, id: 'job-existing', title: 'Assistant Professor (CSE)', status: 'published', details: {} };
  fs.writeFileSync(path.join(dir, 'data', 'db.json'), JSON.stringify({ acad_jobs_v3: [boardJob] }));

  const e = await import('../lib/server/facultyplusEngine');
  const run = await e.runFacultyPlus('manual');
  assert.equal(run.error, undefined, run.error);
  assert.equal(run.read, 3);
  assert.equal(run.added, 1, 'A only: C is past its date, D is not a vacancy');
  assert.equal(run.skippedExpired, 1);
  assert.equal(run.skippedNotVacancy, 1);
  assert(requests[0].includes('categories=1459,518') && requests[0].includes('categories_exclude=1899'), requests[0]);
  let s = await e.getFpStore();
  assert.equal(s.queue[0].status, 'pending');
  assert.equal(s.queue[0].link, A.link, 'FacultyPlus address kept for the admin');
  const dups = await e.duplicatesFor(s);
  assert.equal(dups[s.queue[0].id]?.where, 'board');
  assert.equal(dups[s.queue[0].id]?.id, 'job-existing');

  // A second run sees nothing new.
  const again = await e.runFacultyPlus('manual');
  assert.equal(again.added, 0);
  assert.equal(again.skippedSeen, 3);

  // Add by address (?p=id), then the same again is refused.
  const added = await e.addFacultyPlusLink('https://www.facultyplus.com/?p=900002');
  assert.equal(added.ok, true);
  const twice = await e.addFacultyPlusLink('https://www.facultyplus.com/sample-900002/');
  assert.equal(twice.ok, false);
  assert.equal((await e.addFacultyPlusLink('https://example.com/x')).ok, false);
  s = await e.getFpStore();
  assert.equal(s.queue.filter(q => q.status === 'pending').length, 2);

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('facultyplus: all checks passed');
})().catch(err => { console.error(err); process.exit(1); });
