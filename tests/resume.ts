/* Resume Intelligence engine (synthetic resumes and job descriptions only): npx tsx tests/resume.ts */
import assert from 'assert';
import { readFileSync } from 'fs';
import { findSkills } from '../lib/resume/skills';
import { parseResume } from '../lib/resume/parse';
import { parseJobDescription } from '../lib/resume/jd';
import { analyzeResume, bandFor, DEFAULT_WEIGHTS } from '../lib/resume/score';
import { analyzeAcademic } from '../lib/resume/academic';
import { recommendJobs } from '../lib/resume/match';
import { builderFromParsed, builderText, cleanBuilderData, renderSections } from '../lib/resume/builder';
import { builderDocx } from '../lib/server/docx';
import { extractResume } from '../lib/server/resumeExtract';

const F = `${__dirname}/fixtures`;
const now = new Date('2026-11-03');
const sig = { tables: 0, textBoxes: 0, images: 0, multiColumn: false, contactInHeader: false, scanned: false };
const academicText = readFileSync(`${F}/resumes/academic.txt`, 'utf8');
const softwareText = readFileSync(`${F}/resumes/software.txt`, 'utf8');
const profJd = parseJobDescription(readFileSync(`${F}/jobs/assistant-professor-cse.txt`, 'utf8'));
const beJd = parseJobDescription(readFileSync(`${F}/jobs/backend-engineer.txt`, 'utf8'));
const academic = parseResume(academicText, now);
const software = parseResume(softwareText, now);

(async () => {
  // Skills dictionary: aliases, case-sensitive short forms, no false hits inside other words
  const names = (t: string) => findSkills(t).map(f => f.skill.name);
  assert(names('Built services in Node.js and React').includes('Node.js'));
  assert(!names('Built services in Node.js').includes('JavaScript'), '"js" inside Node.js is not JavaScript');
  assert(!names('Read the os module docs').some(n => /operating/i.test(n)), 'lower-case "os" is not a skill');
  assert(names('Trained GNNs on molecule data').length > 0, 'plural acronym recognised');

  // Job description reader
  assert.equal(profJd.degreeLevel, 'doctorate');
  assert.equal(profJd.netRequired, true);
  assert.equal(profJd.minExperienceYears, 2);
  assert(profJd.isAcademic);
  assert(profJd.preferredSkills.some(s => s.name === 'Python'), 'Python is only "preferred" in the professor posting');
  assert.equal(beJd.minExperienceYears, 5);
  assert.equal(beJd.degreeLevel, 'bachelors');
  assert(beJd.requiredSkills.some(s => s.name === 'Kubernetes'));
  assert(['GraphQL', 'Kafka', 'Terraform'].every(n => beJd.preferredSkills.some(s => s.name === n)), 'nice-to-have skills are preferred');
  assert.deepEqual(beJd.certifications, ['AWS CERTIFIED SOLUTIONS ARCHITECT'], 'certificate name trimmed');
  assert.equal(beJd.title, 'Senior Backend Engineer');

  // Scoring
  assert.equal(bandFor(92).tone, 'excellent');
  assert.equal(bandFor(75).tone, 'strong');
  assert.equal(bandFor(59).tone, 'significant');
  assert.equal(bandFor(10).tone, 'major');
  const good = analyzeResume(academic, sig, profJd, DEFAULT_WEIGHTS, academicText);
  const mismatch = analyzeResume(academic, sig, beJd, DEFAULT_WEIGHTS, academicText);
  const weak = analyzeResume(software, sig, beJd, DEFAULT_WEIGHTS, softwareText);
  assert(good.overall >= 75, `matching academic CV scores well (${good.overall})`);
  assert(good.job!.matchPercent > mismatch.job!.matchPercent + 30, 'the right job matches far better than the wrong one');
  assert(mismatch.overall < good.overall);
  assert(weak.weakBullets.length >= 3, 'weak bullet points detected');
  assert(weak.weakBullets.some(b => b.suggestion.startsWith('Built REST APIs')), 'acronyms kept in suggestions');
  assert(weak.findings.some(f => /hard-working/.test(f.text)), 'generic summary flagged');
  assert(weak.findings.every(f => !/\b\d+%\s+(improvement|faster)/.test(f.text)), 'no invented figures');
  assert(weak.skillGaps.some(g => g.name === 'Python' && g.required));
  for (const v of Object.values(good.dimensions)) assert(v >= 0 && v <= 100);
  // Weights are configurable: putting all weight on formatting makes the overall equal that dimension
  const fmtOnly = analyzeResume(academic, sig, profJd, { keywords: 0, skills: 0, experience: 0, formatting: 100, education: 0, summary: 0 }, academicText);
  assert.equal(fmtOnly.overall, fmtOnly.dimensions.formatting);
  // Layout problems lower the formatting score
  const messy = analyzeResume(academic, { ...sig, tables: 2, multiColumn: true, contactInHeader: true }, null, DEFAULT_WEIGHTS, academicText);
  assert(messy.dimensions.formatting <= good.dimensions.formatting - 25);
  assert(messy.formatting.filter(f => !f.ok).length >= 3);
  // General check without a job description still works
  const general = analyzeResume(software, sig, null, DEFAULT_WEIGHTS, softwareText);
  assert.equal(general.job, undefined);
  assert(general.findings.some(f => /target job description/.test(f.text)));

  // Academic analyzer
  const ap = analyzeAcademic(academic, academicText);
  assert(ap.isAcademic);
  assert.equal(ap.phd, 'awarded');
  assert(ap.netSet.includes('UGC-NET'));
  assert(ap.teachingYears > 10);
  assert.equal(ap.eligibility[0].post, 'Assistant Professor');
  assert.equal(ap.eligibility[0].status, 'meets');
  assert.equal(ap.eligibility[1].status, 'not_yet', 'too few publications for Associate Professor');
  assert(ap.eligibility[1].missing.some(m => /7 peer-reviewed/.test(m)));
  assert(!analyzeAcademic(software, softwareText).isAcademic);

  // Vacancy recommendations
  const job = (id: string, title: string, dept: string, tags: string[], minDegree: string, net: boolean, exp: number | null, status = 'published', deadline = '2026-12-31'): any => ({
    id, title, instituteName: 'Test Institute', location: { city: 'Chennai', state: 'Tamil Nadu' }, department: dept, specializationTags: tags, status,
    applicationDeadline: deadline, requiredQualifications: { minDegree, netSletMandatory: net, minExperienceYears: exp, specializationRequirements: [] },
  });
  const jobs = [
    job('cse', 'Assistant Professor - CSE', 'Computer Science and Engineering', ['Machine Learning', 'Data Structures'], 'M.E./M.Tech', true, null),
    job('chem', 'Assistant Professor - Chemistry', 'Chemistry', ['Organic Chemistry'], 'M.Sc', true, null),
    job('closed', 'Assistant Professor - CSE (closed)', 'Computer Science and Engineering', ['Machine Learning'], 'M.Tech', false, null, 'closed'),
    job('expired', 'Assistant Professor - CSE (old)', 'Computer Science and Engineering', ['Machine Learning'], 'M.Tech', false, null, 'published', '2026-01-01'),
    job('be', 'Backend Developer', 'Engineering', ['Java', 'Spring Boot', 'Microservices'], 'B.Tech', false, 3),
  ];
  const recA = recommendJobs(academic, academicText, jobs, '2026-11-03');
  assert.equal(recA[0].jobId, 'cse');
  assert(!recA.some(r => ['chem', 'closed', 'expired'].includes(r.jobId)), 'other subjects, closed and expired vacancies are not recommended');
  assert.equal(recommendJobs(software, softwareText, jobs, '2026-11-03')[0].jobId, 'be');

  // Builder: import keeps only stated facts; templates order sections; text and DOCX round-trip
  const draft = builderFromParsed(academic);
  assert.equal(draft.email, academic.email);
  assert(draft.publications.length === academic.publications.items.length);
  assert.equal(renderSections(draft, 'academic')[1].heading, 'Research Interests');
  assert.equal(renderSections(draft, 'fresher').find(s => s.heading !== 'Career Objective')!.heading, 'Education');
  const cleaned = cleanBuilderData({ fullName: '  A\u0000B ', experience: [{ title: '', organization: '' }, { title: 'X', bullets: ['a', '', 7] }], skills: 'not-a-list' });
  assert.equal(cleaned.fullName, 'AB');
  assert.equal(cleaned.experience.length, 1);
  assert.deepEqual(cleaned.experience[0].bullets, ['a']);
  assert.deepEqual(cleaned.skills, []);
  const docx = builderDocx(draft, 'academic');
  assert.equal(docx.subarray(0, 2).toString(), 'PK');
  const back = await extractResume(docx, 'resume.docx');
  assert(back.ok, 'generated DOCX can be read back');
  if (back.ok) {
    assert.equal(back.value.signals.tables, 0);
    assert.equal(back.value.signals.multiColumn, false);
    const reparsed = parseResume(back.value.text, now);
    assert.equal(reparsed.email, academic.email);
    assert(reparsed.skills.length >= academic.skills.length - 3, 'skills survive the DOCX round trip');
    const rescored = analyzeResume(reparsed, back.value.signals, profJd, DEFAULT_WEIGHTS, back.value.text);
    assert(rescored.overall >= good.overall - 5, `builder output scores at least as well (${rescored.overall} vs ${good.overall})`);
  }
  assert(builderText(draft, 'ats-classic').includes('PROFESSIONAL SUMMARY'));

  // Upload safety
  const doc = await extractResume(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'old.doc');
  assert(!doc.ok && /docx/i.test(doc.error), 'old .doc files get a "save as DOCX" message');
  const fake = await extractResume(Buffer.from('MZ\x90\x00 not a resume'), 'resume.pdf');
  assert(!fake.ok, 'a file that is not really a PDF is refused');
  const txt = await extractResume(Buffer.from(softwareText), 'resume.txt');
  assert(txt.ok && txt.value.format === 'txt');

  console.log('Resume Intelligence: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
