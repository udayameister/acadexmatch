// Tests for the advertisement-page parser (lib/server/noticeParser.ts). Run: npx tsx tests/notice-parser.ts
import { readFileSync } from 'fs';
import path from 'path';
import { parseNotice, decodeCfEmail } from '../lib/server/noticeParser';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) { failed++; if (extra !== undefined) console.log('      got:', JSON.stringify(extra)); } };

const html = readFileSync(path.join(__dirname, 'fixtures', 'notice-aggregator.html'), 'utf8');
const r = parseNotice(html, 'https://jobs.example/faculty-and-staff-recruitment-2026/');
const d = r.details;

ok('decodes Cloudflare e-mail', decodeCfEmail('4b' + [...'a@b.in'].map(c => (c.charCodeAt(0) ^ 0x4b).toString(16).padStart(2, '0')).join('')) === 'a@b.in');
ok('title from h1', r.title === 'Faculty and Staff Recruitment 2026 at Example National University, Pune', r.title);
ok('date posted', r.datePosted === '2026-10-20', r.datePosted);
ok('hiring organisation (page text wins over JSON-LD)', d.hiringOrganization === 'Example National University', d.hiringOrganization);
ok('summary paragraph', !!d.summary?.startsWith('Example National University in Pune invites'), d.summary);
ok('post groups', JSON.stringify(d.postGroups) === JSON.stringify([
  { group: 'Academic Posts', items: ['Professor', 'Associate Professor', 'Assistant Professor'] },
  { group: 'Non-Teaching Posts', items: ['Assistant Registrar', 'Lab Assistants (Graduate / Diploma holders)'] },
]), d.postGroups);
ok('department groups with parent heading', JSON.stringify(d.departmentGroups?.map(g => g.group)) === JSON.stringify([
  'Heads of Departments',
  'Professors / Associate Professors / Assistant Professors › Engineering and Technology',
  'Professors / Associate Professors / Assistant Professors › Pharmaceutical Sciences',
  'Medical College and Hospital: Senior Resident',
]), d.departmentGroups?.map(g => g.group));
ok('department items', d.departmentGroups?.[1].items.join('|') === 'Artificial Intelligence and Machine Learning|Data Science', d.departmentGroups?.[1]);
ok('qualifications per post', d.qualifications?.[1]?.post === 'Assistant Registrar' && d.qualifications?.[1]?.text === 'Postgraduate degree' && d.qualifications?.length === 2, d.qualifications);
ok('preferred qualifications', d.preferredQualifications?.[0]?.post === 'Assistant Professor', d.preferredQualifications);
ok('experience per post', d.experience?.length === 2 && d.experience[0].text.startsWith('10 years'), d.experience);
ok('candidate profile', d.candidateProfile?.[0] === 'Good teaching and communication skills', d.candidateProfile);
ok('responsibilities', d.responsibilities?.length === 2, d.responsibilities);
ok('salary text', d.salaryText === 'As per Norms', d.salaryText);
ok('location', d.locationText === 'Pune, Maharashtra' && r.city === 'Pune' && r.state === 'Maharashtra', [d.locationText, r.city, r.state]);
ok('important dates table', d.importantDates?.length === 3 && d.importantDates[1].label === 'Last Date to Apply', d.importantDates);
ok('"Not Specified" notification date is left empty', !d.notificationDate, d.notificationDate);
ok('last date text kept as stated', d.lastDateText === 'Within 10 days from the date of this advertisement', d.lastDateText);
ok('deadline worked out from "within 10 days" and flagged', r.deadlineIso === '2026-10-30' && d.deadlineEstimated === true, [r.deadlineIso, d.deadlineEstimated]);
ok('interview text', d.interviewText === 'Shortlisted candidates will be informed by email', d.interviewText);
ok('apply mode', JSON.stringify(d.applyModes) === '["email"]', d.applyModes);
ok('how to apply', d.howToApply === 'Email your detailed CV within 10 days.', d.howToApply);
ok('application procedure', d.applicationProcedure?.length === 3 && d.applicationProcedure[1].includes('careers@exampleuniversity.ac.in'), d.applicationProcedure);
ok('apply e-mails with notes', JSON.stringify(d.applyEmails) === JSON.stringify([{ email: 'careers@exampleuniversity.ac.in', note: 'university posts' }, { email: 'hospital.hr@exampleuniversity.ac.in', note: 'hospital posts' }]), d.applyEmails);
ok('documents required', d.documentsRequired?.join('|') === 'Detailed CV|Recent photograph', d.documentsRequired);
ok('official website', d.officialWebsite === 'https://www.exampleuniversity.ac.in/', d.officialWebsite);
ok('notification link', d.notificationLink === 'https://jobs.example/uploads/notice.jpg', d.notificationLink);
ok('no application link when "Not Applicable"', !d.applicationLink, d.applicationLink);
ok('organisation address', d.organizationAddress === 'Example National University, Pune, Maharashtra', d.organizationAddress);
ok('benefits', d.benefits?.length === 2, d.benefits);
ok('FAQ and disclaimer are not read as data', !JSON.stringify(d).includes('How can I apply') && !JSON.stringify(d).includes('information only'));
ok('contact phone', d.contactPhones?.[0] === '9876543210', d.contactPhones);
ok('employment type from JSON-LD', d.employmentType === 'FULL_TIME', d.employmentType);
ok('JSON-LD validThrough does not override the stated last date', r.deadlineIso !== '2026-12-31');
ok('recognises a full advertisement', r.sectionsFound >= 10, r.sectionsFound);
ok('navigation menu is not read as posts', !r.allPosts.includes('Jobs by Designation'), r.allPosts);

// A plain institution page without labels is not mistaken for an advertisement.
const plain = parseNotice('<html><body><h1>About us</h1><p>Founded in 1990, the college offers B.Tech and MBA programmes with a strong placement record and many clubs.</p></body></html>', 'https://college.example/about');
ok('plain page has few sections', plain.sectionsFound < 3, plain.sectionsFound);

console.log(failed ? `\n${failed} NOTICE PARSER TEST(S) FAILED` : '\nALL NOTICE PARSER TESTS PASSED');
process.exit(failed ? 1 : 0);
