/* FacultyTick parser: npx tsx tests/facultytick.ts */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { lastDateFrom, parseFacultyTickPost, relativeDays, splitLocation, splitTitle, type WpPost } from '../lib/facultytick';

const posts: WpPost[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/facultytick-posts.json'), 'utf8'));
const today = '2026-11-03';
const [nitc, shailabala, allahabad] = posts.map(p => parseFacultyTickPost(p, { today }));
const noFacultyTickText = (r: ReturnType<typeof parseFacultyTickPost>) =>
  assert(!/WRITTEN-BY-FACULTYTICK/.test(JSON.stringify(r.job)), `FacultyTick's own text leaked into ${r.job.title}`);

// ---- sample record (NIT Calicut, Research Associate-I)
{
  const { job, issues, layout } = nitc;
  assert.equal(layout, 'template');
  assert.equal(job.instituteName, 'National Institute of Technology Calicut (NITC)');
  assert.equal(job.instituteShortName, 'NITC');
  assert.equal(job.title, 'Research Associate-I');
  assert.equal(job.applicationDeadline, '2026-11-13');
  assert.equal(job.location.state, 'Kerala');
  assert.equal(job.payScale.cpcBand, 'Rs. 65,000 /-');
  assert.match(job.requiredQualifications.minDegree!, /^Essential qualifications include a PhD/);
  assert.equal(job.requiredQualifications.minExperienceYears, 3);
  assert.equal(job.details!.notificationLink, 'https://nitc.ac.in/imgserver/uploads/attachments/Ed__525a1a72-a910-419b-a5f3-29b34d27eb84_.pdf');
  assert.equal(job.details!.officialWebsite, 'https://www.nitc.ac.in');
  assert.equal(job.externalApplyUrl, job.details!.notificationLink, 'apply via the official notification, not FacultyTick');
  assert.deepEqual(job.details!.applyEmails!.map(e => e.email), ['rescsed@nitc.ac.in', 'chandramanic@nitc.ac.in']);
  assert.deepEqual(job.details!.applyModes, ['email']);
  assert.match(job.description!, /MoSPI/);
  assert.match(job.details!.howToApply!, /consolidated into a single PDF/);
  assert(!/Interested and eligible candidates are invited to submit/.test(job.details!.howToApply!), 'stock sentence dropped');
  assert(!job.details!.qualifications!.some(q => /available on the Institute Website/.test(q.text)), 'stock sentence dropped');
  assert.equal(job.details!.organizationAddress, 'NIT Campus [P.O], Kerala-673601, India');
  assert.equal(job.source!.kind, 'aggregator');
  assert.equal(job.source!.siteName, 'FacultyTick');
  assert.equal(job.postedAt, '2026-11-03');
  assert.deepEqual(issues, []);
  noFacultyTickText(nitc);
}

// ---- several posts and departments; "open from … to …" window; FacultyTick's own link ignored
{
  const { job, issues, posts: list } = shailabala;
  assert.equal(job.instituteName, 'Shailabala Women’s (Auto) College, Kataka');
  assert.deepEqual(list, ['Assistant Professor', 'Physical Education Instructor', 'Fine Art Instructor']);
  assert.equal(job.title, 'Assistant Professor, Physical Education Instructor and Fine Art Instructor');
  assert.equal(job.applicationDeadline, '2026-11-04');
  assert.match(job.details!.interviewText!, /06\.11\.2026/);
  assert.deepEqual(job.location, { city: 'Kataka', state: 'Odisha' });
  assert.equal(job.details!.departmentGroups![0].items.length, 5);
  assert(job.specializationTags.includes('Mathematics'));
  assert.equal(job.details!.notificationLink, 'https://www.shailabalawomenscollege.ac.in/wp-content/uploads/2026/10/Guest-Faculty-Recruitment-for-Teacher-Education-2026.pdf');
  assert(job.details!.applyModes!.includes('online'));
  assert(issues.includes('Includes non-teaching posts'));
  noFacultyTickText(shailabala);
}

// ---- post outside the template
{
  const { job, issues, layout } = allahabad;
  assert.equal(layout, 'freeform');
  assert.equal(job.instituteName, 'University of Allahabad');
  assert.equal(job.title, 'Postdoctoral Fellowship (PDF)');
  assert.equal(job.applicationDeadline, '2026-11-18');
  assert.equal(job.payScale.cpcBand, '₹1,08,393/month');
  assert.equal(job.location.state, 'Uttar Pradesh');
  assert.match(job.details!.notificationLink!, /allduniv\.ac\.in\/upload/);
  assert.deepEqual(job.details!.applyEmails!.map(e => e.email), ['nodal_visphd@allduniv.ac.in']);
  assert(job.details!.applyModes!.includes('post') && job.details!.applyModes!.includes('email'));
  assert.equal(job.selectionProcess.length, 2);
  assert(issues.some(i => /usual layout/.test(i)));
  noFacultyTickText(allahabad);
}

// ---- expiry
assert.equal(parseFacultyTickPost(posts[1], { today: '2026-11-05' }).expired, true);
assert.equal(parseFacultyTickPost(posts[0], { today }).expired, false);

// ---- helpers
assert.equal(lastDateFrom('The last date for receiving applications is On or Before 11.11.2026 Date for Online Interview - 13.11.2026'), '2026-11-11');
assert.equal(lastDateFrom('Last Date: Within 7 days from 01-11-2026. The last date for receiving applications is On or Before 08-11-2026.'), '2026-11-08');
assert.equal(lastDateFrom('On or Before 2nd November, 2026 (Monday) up to 05:00 PM'), '2026-11-02');
assert.equal(lastDateFrom('On or Before 12-Nov-2026, 5 PM'), '2026-11-12');
assert.equal(lastDateFrom('On or Before November 16, 2026.'), '2026-11-16');
assert.equal(lastDateFrom('On or Before 6 -11-2026 Date of Interview 12-11-2026'), '2026-11-06');
assert.equal(lastDateFrom('On or Before 31.02.2026'), null, 'impossible dates are rejected');
assert.equal(lastDateFrom('Walk-in interview on 12.11.2026'), null, 'an interview date is not a last date');
assert.equal(lastDateFrom('ROLLING ADVERTISEMENT'), null);
assert.equal(relativeDays('On or Before within 21 days from the date of publication of this advertisement'), 21);
assert.equal(relativeDays('On or Before seven days from the date of advertisement'), 7);
assert.equal(relativeDays('10 working days from the date of publication'), 14);
assert.equal(relativeDays('On or Before 24 months from now'), null);
assert.deepEqual(splitLocation('NIT Campus [P.O], Kerala-673601, India'), { city: null, state: 'Kerala' });
assert.deepEqual(splitLocation('Bhilai, Chhattisgarh, India'), { city: 'Bhilai', state: 'Chhattisgarh' });
assert.deepEqual(splitTitle('Indian Institute of Technology Ropar (IIT Ropar) Applications from eligible candidates for the following Post of Junior Research Fellow (JRF) Job Vacancy 2026'),
  { institution: 'Indian Institute of Technology Ropar (IIT Ropar)', post: 'Junior Research Fellow (JRF)' });

// Relative last date → estimated from the post date and flagged
{
  const p = JSON.parse(JSON.stringify(posts[0])) as WpPost;
  p.content.rendered = p.content.rendered.replace('On or Before 13th November 2026', 'On or Before within 21 days from the date of publication of this advertisement');
  const r = parseFacultyTickPost(p, { today });
  assert.equal(r.job.applicationDeadline, '2026-11-24');
  assert.equal(r.job.details!.deadlineEstimated, true);
  assert(r.issues.some(i => /estimated/.test(i)));
}

console.log('facultytick: all checks passed');
