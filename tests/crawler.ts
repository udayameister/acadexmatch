// Tests for the Node.js crawler (port of test_engine.py plus an offline crawl against a local site).
import http from 'http';
import { isFacultyRequirement, extractFacultyDetails, parseDeadlineIso, scoreLink, crawlCollege } from '../lib/server/crawler';

let failures = 0;
function check(label: string, cond: unknown, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
}

const cases: [string, boolean][] = [
  ['Assistant Professor (Computer Science)', true], ['Associate Professor in ECE', true], ['Dean - School of Computing', true],
  ['Professor (Level 14 - 7th CPC)', true], ['Postdoctoral Research Fellow', true], ['Senior Assistant Professor', true],
  ['Driver / Attendant Grade IV', false], ['Bus Conductor', false], ['Faculty Development Programme on AI', false],
  ['Apply Online', false], ['Campus Life & Hostel Facilities', false], ['Electrician / Plumber Maintenance', false],
];
for (const [t, e] of cases) check(`classify "${t}"`, isFacultyRequirement(t) === e);

const d = extractFacultyDetails('Professor of Computer Science', `
    Qualifications: Ph.D. in Computer Science and Engineering with First Class at UG and PG.
    Experience: Minimum 10 years of post-doctoral teaching and research experience.
    Salary: AICTE Pay scale Level 14 with 50% DA and standard allowances.
    Department: Department of Computer Science and Engineering.
    Last Date: 31/12/2026.
    `);
check('qualification', d.qualification?.toLowerCase().includes('ph.d'), d);
check('experience', d.experience?.includes('10'), d);
check('department', d.department?.includes('Computer Science'), d);
check('deadline', d.deadline === '31/12/2026', d);
check('pay level', (d.pay_level || '').includes('Level 14'), d);

const bare = extractFacultyDetails('Assistant Professor in Mathematics', 'Interested candidates may send CV to hr@college.edu');
check('nothing invented', Object.values(bare).every(v => v === null), bare);
const exact = extractFacultyDetails('Professor', 'Qualification: Ph.D. in appropriate discipline from IIT / NIT | Salary: As per the revised AICTE Pay scale | No. of Posts: 3 | Advt. No: MITS/2026/07');
check('exact qualification', exact.qualification === 'Ph.D. in appropriate discipline from IIT / NIT', exact);
check('exact salary', exact.salary === 'As per the revised AICTE Pay scale', exact);
check('no invented pay level', exact.pay_level === null, exact);
check('posts and advt', exact.number_of_posts === '3' && exact.advt_no === 'MITS/2026/07', exact);
check('deadline iso', parseDeadlineIso('31/12/2026') === '2026-12-31' && parseDeadlineIso('15 January 2027') === '2027-01-15' && parseDeadlineIso('Rolling advertisement') === null);
check('score high', scoreLink('https://college.edu/faculty-recruitment', 'Faculty Recruitment Openings', 'https://college.edu') > 100);
check('score careers', scoreLink('https://college.edu/careers', 'Careers', 'https://college.edu') > 0);
check('domain words do not discard', scoreLink('https://examcollege.edu/careers', 'Careers', 'https://examcollege.edu') > 0);
check('score discard', scoreLink('https://college.edu/login.php', 'Student Login', 'https://college.edu') < 0);

// Offline crawl: home page -> careers page with a table and a job card, plus a PDF notice.
function pdfWith(lines: string[]): Buffer {
  const content = 'BT /F1 12 Tf 50 750 Td 14 TL ' + lines.map(l => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const pages: Record<string, [string, string | Buffer]> = {
  '/': ['text/html', '<html><head><title>Test College of Engineering</title></head><body><a href="/careers">Careers</a> <a href="/news">News</a></body></html>'],
  '/careers': ['text/html', `<html><body>
    <table><tr><th>Department</th><th>Post</th><th>Qualification</th><th>Last Date</th></tr>
    <tr><td>Computer Science</td><td>Assistant Professor</td><td>Ph.D. in CSE</td><td>15/12/2026</td></tr>
    <tr><td>Electrical</td><td>Lab Attendant</td><td>ITI</td><td>15/12/2026</td></tr></table>
    <div class="job-card"><h3>Associate Professor in Mathematics</h3><p>Salary: Pay Level 13A (Rs. 1,31,400) | Experience: 8 years of teaching experience</p></div>
    <a href="/notice.pdf">Advertisement</a>
  </body></html>`],
  '/notice.pdf': ['application/pdf', pdfWith(['Recruitment of Teaching Faculty', 'Professor - Civil Engineering', 'Qualification: Ph.D. in Civil Engineering', 'Last Date: 20/12/2026', 'Advt. No: TCE/2026/11'])],
};
const server = http.createServer((req, res) => {
  const p = pages[(req.url || '/').split('?')[0]];
  if (!p) { res.statusCode = 404; res.end('nf'); return; }
  res.setHeader('Content-Type', p[0]); res.end(p[1]);
});

server.listen(0, async () => {
  const port = (server.address() as { port: number }).port;
  // Local addresses are blocked by the API; the crawler itself is called directly here.
  const r = await crawlCollege(`http://127.0.0.1:${port}/`, 12, 2, 20000);
  const titles = r.openings.map(o => o.position);
  check('institution title', r.institution_title === 'Test College of Engineering', r.institution_title);
  check('table opening', titles.includes('Assistant Professor'), titles);
  check('non-faculty row skipped', !titles.includes('Lab Attendant'), titles);
  const ap = r.openings.find(o => o.position === 'Assistant Professor');
  check('table values', ap?.qualification === 'Ph.D. in CSE' && ap?.deadline_iso === '2026-12-15' && ap?.department === 'Computer Science', ap);
  const card = r.openings.find(o => o.position === 'Associate Professor in Mathematics');
  check('job card pay level', card?.pay_level?.startsWith('Pay Level 13A'), card);
  const pdf = r.openings.find(o => /Professor - Civil|Recruitment of Teaching Faculty/.test(o.position));
  check('PDF notice read', !!pdf && pdf.deadline === '20/12/2026' && pdf.advt_no === 'TCE/2026/11' && pdf.details_from_pdf, pdf);
  check('news page not crawled', r.pages_crawled === 2, r.pages_crawled);
  server.close();
  console.log(failures === 0 ? '\nALL CRAWLER TESTS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
});
