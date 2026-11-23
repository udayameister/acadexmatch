/*
 * Teacher invitations: extraction from faculty pages, crawling rules, and sending (once per person, unsubscribes,
 * daily limit, refused addresses, refused login) against a stand-in SMTP server. Needs the local MySQL.
 * Run: npx tsx tests/teacher-outreach.ts
 */
import assert from 'assert';
import net from 'net';
import { extractTeachers, facultyLinks, type Rejected } from '../lib/outreach/faculty';

const FACULTY = `<html><head><title>Faculty | Department of Computer Science and Engineering</title></head><body>
<h2>Department of Computer Science and Engineering</h2>
<table><tr><th>Name</th><th>Designation</th><th>Email</th></tr>
<tr><td>Dr. R. Lawrence Kumar</td><td>Professor &amp; Head</td><td><a href="mailto:lawrence.cse@abc.ac.in">Email</a></td></tr>
<tr><td>Mrs. S. Ithaya Rani</td><td>Assistant Professor</td><td>ithaya [at] abc [dot] ac [dot] in</td></tr>
<tr><td>Mr. K. Raman</td><td>Office Assistant</td><td>raman@abc.ac.in</td></tr>
<tr><td>Dr. P. Meena</td><td>Associate Professor</td><td>meena.p@gmail.com</td></tr>
</table>
<div class="card"><h4>Prof. A. Venkat</h4><p>Asst. Prof.</p><p>venkat.a@abc.ac.in</p></div>
<p>Department office: hodcse@abc.ac.in, cse.office@abc.ac.in, principal@abc.ac.in, design@webstudio.com</p>
<a href="/ece/faculty">ECE Faculty</a> <a href="/students">Students</a> <a href="/about">About</a> <a href="https://other.com/faculty">x</a>
</body></html>`;

(async () => {
  // ---- extraction
  const t = extractTeachers(FACULTY, 'https://www.abc.ac.in/cse/faculty');
  const by = Object.fromEntries(t.map(x => [x.email, x]));
  assert.deepEqual(Object.keys(by).sort(), ['ithaya@abc.ac.in', 'lawrence.cse@abc.ac.in', 'venkat.a@abc.ac.in']);
  assert.equal(by['lawrence.cse@abc.ac.in'].name, 'Dr. R. Lawrence Kumar');
  assert.equal(by['lawrence.cse@abc.ac.in'].designation, 'Professor & Head');
  assert.equal(by['lawrence.cse@abc.ac.in'].department, 'Computer Science and Engineering');
  assert.equal(by['ithaya@abc.ac.in'].designation, 'Assistant Professor', 'obfuscated address found with its row');
  assert.equal(by['venkat.a@abc.ac.in'].name, 'Prof. A. Venkat');
  assert.equal(by['venkat.a@abc.ac.in'].designation, 'Assistant Professor');
  assert(!by['raman@abc.ac.in'], 'non-teaching staff skipped');
  assert(!by['hodcse@abc.ac.in'] && !by['cse.office@abc.ac.in'] && !by['principal@abc.ac.in'], 'role addresses skipped');
  assert(!by['meena.p@gmail.com'], 'Gmail off by default');
  assert(extractTeachers(FACULTY, 'https://www.abc.ac.in/cse/faculty', { includeFreeMail: true }).some(x => x.email === 'meena.p@gmail.com'), 'Gmail next to a designation when allowed');
  assert.deepEqual(facultyLinks(FACULTY, 'https://www.abc.ac.in/'), ['https://www.abc.ac.in/ece/faculty']);
  // Cloudflare-protected addresses are decoded; staff mail on another domain is accepted when 3+ teachers use it.
  const { cfDecode } = await import('../lib/outreach/extract');
  const enc = (e: string, key = 0x5a) => key.toString(16).padStart(2, '0') + [...e].map(ch => (ch.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  assert.equal(cfDecode(enc('kavitha.r@xyz.ac.in')), 'kavitha.r@xyz.ac.in');
  const cf = `<h2>Faculty – Department of Physics</h2><table>
<tr><td>Dr. R. Kavitha</td><td>Assistant Professor</td><td><a href="/cdn-cgi/l/email-protection#${enc('kavitha.r@xyz.ac.in')}">[email&#160;protected]</a></td></tr>
<tr><td>Dr. S. Mani</td><td>Associate Professor</td><td><span class="__cf_email__" data-cfemail="${enc('mani.s@xyz.ac.in', 0x21)}">[email&#160;protected]</span></td></tr>
<tr><td>Mr. P. Arun</td><td>Assistant Professor</td><td>arun.p@xyzmail.edu.in</td></tr>
<tr><td>Ms. K. Devi</td><td>Assistant Professor</td><td>devi.k@xyzmail.edu.in</td></tr>
<tr><td>Dr. T. Raj</td><td>Professor</td><td>raj.t@xyzmail.edu.in</td></tr>
<tr><td>Mr. Q. Lone</td><td>Assistant Professor</td><td>lone@other.org</td></tr></table>`;
  const rejects: Rejected[] = [];
  const got2 = extractTeachers(cf, 'https://www.xyz.ac.in/physics/faculty', { rejects }).map(x => x.email).sort();
  assert.deepEqual(got2, ['arun.p@xyzmail.edu.in', 'devi.k@xyzmail.edu.in', 'kavitha.r@xyz.ac.in', 'mani.s@xyz.ac.in', 'raj.t@xyzmail.edu.in']);
  assert.deepEqual(rejects, [{ email: 'lone@other.org', reason: 'other domain' }], 'a lone outside address is still skipped, with the reason');
  const r2: Rejected[] = [];
  extractTeachers(FACULTY, 'https://www.abc.ac.in/cse/faculty', { rejects: r2 });
  assert(r2.some(x => x.email === 'meena.p@gmail.com' && /Gmail/.test(x.reason)));
  assert(r2.some(x => x.email === 'raman@abc.ac.in' && x.reason === 'non-teaching staff'));
  assert(r2.some(x => x.email === 'hodcse@abc.ac.in' && /office/.test(x.reason)));

  // MCC-style cards: a plain name above the address, no title or designation, on a teachers' list.
  const mcc = `<h1>English Faculty (Aided)</h1><div class="personnel"><h3><a href="/personnel/g-udhayaraj/">G. Udhayaraj</a></h3><div><i class="fa fa-envelope"></i>udhayaraj@mcc.edu.in</div><a href="/personnel/g-udhayaraj/">More Detail</a></div>
<div class="personnel"><h3><a href="/personnel/a-deepa/">A. Deepa Priyadarsini</a></h3><div>deepapriyadarshini@mcc.edu.in</div><a>More Detail</a></div>
<div class="personnel"><h3>Kavitha Ramesh</h3><div>kavitharamesh84@gmail.com</div></div>
<div class="personnel"><h3>Office</h3><div>random123@gmail.com</div></div>`;
  const mt = extractTeachers(mcc, 'https://mcc.edu.in/english-faculty/', { includeFreeMail: true });
  assert.deepEqual(mt.map(x => [x.email, x.name]), [['udhayaraj@mcc.edu.in', 'G. Udhayaraj'], ['deepapriyadarshini@mcc.edu.in', 'A. Deepa Priyadarsini'], ['kavitharamesh84@gmail.com', 'Kavitha Ramesh']]);
  assert.equal(extractTeachers(mcc, 'https://mcc.edu.in/english-faculty/').length, 2, 'Gmail only when switched on');
  // Report pages rank below teachers' lists.
  const { facultyLinksScored } = await import('../lib/outreach/faculty');
  const ranked = facultyLinksScored('<a href="/iqac-members.php">IQAC Members</a><a href="/academics-annualreports.php">Annual reports</a><a href="/dept-maths-faculty.php">Maths faculty</a><a href="/departments/">Departments</a>', 'https://www.x.ac.in/').map(l => l.url);
  assert.equal(ranked[0], 'https://www.x.ac.in/dept-maths-faculty.php');
  assert(ranked.indexOf('https://www.x.ac.in/departments/') < ranked.indexOf('https://www.x.ac.in/iqac-members.php'));

  // A page with no teaching context: addresses alone are not enough.
  assert.equal(extractTeachers('<p>Write to ramesh@abc.ac.in for the fest.</p>', 'https://www.abc.ac.in/events').length, 0);

  // ---- stand-in SMTP server
  let smtpMode: 'ok' | 'auth' = 'ok';
  const got: { to: string; data: string }[] = [];
  const smtp = net.createServer(sock => {
    let rcpt = '', inData = false, buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', chunk => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; got.push({ to: rcpt, data: (sock as unknown as { _d: string })._d.replace(/=\n/g, '').replace(/=3D/g, '=') }); sock.write('250 OK queued\r\n'); }
          else (sock as unknown as { _d: string })._d += line + '\n';
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO')) sock.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (cmd.startsWith('AUTH')) sock.write(smtpMode === 'auth' ? '535 5.7.8 Authentication failed\r\n' : '235 Authenticated\r\n');
        else if (cmd.startsWith('MAIL')) sock.write('250 OK\r\n');
        else if (cmd.startsWith('RCPT')) { rcpt = line.match(/<([^>]+)>/)?.[1] || ''; sock.write(/^bounce/.test(rcpt) ? '550 5.1.1 No such user\r\n' : '250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; (sock as unknown as { _d: string })._d = ''; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else if (cmd === 'RSET' || cmd === 'NOOP') sock.write('250 OK\r\n');
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>(r => smtp.listen(0, '127.0.0.1', () => r()));
  Object.assign(process.env, {
    DB_HOST: process.env.DB_HOST || '127.0.0.1', DB_PORT: '3306', DB_NAME: process.env.DB_NAME || 'acx', DB_USER: process.env.DB_USER || 'acx', DB_PASSWORD: process.env.DB_PASSWORD || 'acxpass',
    CANDIDATE_SMTP_HOST: '127.0.0.1', CANDIDATE_SMTP_PORT: String((smtp.address() as net.AddressInfo).port), CANDIDATE_SMTP_SECURE: 'false',
    CANDIDATE_SMTP_USER: 'invite', CANDIDATE_SMTP_PASS: 'test-password', CANDIDATE_MAIL_FROM: 'Udayakumar from AcadeXMatch <udaya@invite.acadexmatch.com>',
    AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnop', SITE_URL: 'https://acadexmatch.com', APP_URL: 'https://acadexmatch.com', ACAD_STORAGE: '',
  });
  const persist = await import('../lib/server/persist');
  const o = await import('../lib/server/outreach');
  const to = await import('../lib/server/teacherOutreach');

  // ---- crawling: robots.txt, depth, only the college's own pages
  const site: Record<string, string> = {
    'https://www.abc.ac.in/robots.txt': 'User-agent: *\nDisallow: /private/',
    'https://www.abc.ac.in/': '<a href="/cse/faculty">CSE Faculty</a><a href="/private/staff">Staff</a><a href="https://elsewhere.org/faculty">Other</a>',
    'https://www.abc.ac.in/cse/faculty': FACULTY,
    'https://www.abc.ac.in/ece/faculty': '<h2>Department of Electronics and Communication Engineering</h2><ul><li>Dr. N. Priya, Associate Professor, priya.n@abc.ac.in</li></ul>',
  };
  const visited: string[] = [];
  const fetcher = async (url: string) => { visited.push(url); const text = site[url]; return { ok: !!text, status: text ? 200 : 404, text: text || '', url }; };
  const rec = { code: 'C-TEST-1', name: 'ABC College of Engineering', state: 'Testland', website: 'https://www.abc.ac.in/', category: 'College' } as never;
  const r = await to.findTeachersFor(rec, { fetcher, delayMs: 0 });
  assert.deepEqual(r.teachers.map(x => x.email).sort(), ['ithaya@abc.ac.in', 'lawrence.cse@abc.ac.in', 'priya.n@abc.ac.in', 'venkat.a@abc.ac.in']);
  assert.equal(r.teachers.find(x => x.email === 'priya.n@abc.ac.in')!.department, 'Electronics and Communication Engineering');
  assert(!visited.some(u => u.includes('/private/')), 'robots.txt respected');
  assert(!visited.some(u => u.includes('elsewhere.org')), 'other sites not visited');
  const blocked = await to.findTeachersFor(rec, { fetcher: async (url: string) => url.endsWith('robots.txt') ? { ok: true, status: 200, text: 'User-agent: *\nDisallow: /', url } : fetcher(url), delayMs: 0 });
  assert.equal(blocked.teachers.length, 0);
  assert.match(blocked.note, /robots/);

  // ---- the site's own mailbox, only when the administrator chooses it
  {
    const keep = { ...process.env };
    for (const k of ['CANDIDATE_SMTP_HOST', 'CANDIDATE_SMTP_USER', 'CANDIDATE_SMTP_PASS', 'CANDIDATE_MAIL_FROM']) delete process.env[k];
    Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: keep.CANDIDATE_SMTP_PORT, SMTP_SECURE: 'false', SMTP_USER: 'info@acadexmatch.com', SMTP_PASS: 'x' });
    await persist.writeJson('teacher-outreach-state', null);
    assert.equal((await to.teacherSummary()).senderConfigured, false, 'not without consent');
    await assert.rejects(to.setTeacherSending(true), /Choose the mailbox/);
    await to.saveTeacherSettings({ useMainSmtp: true });
    const sm = await to.teacherSummary();
    assert.equal(sm.senderConfigured, true);
    assert.equal(sm.sender, 'Udayakumar from AcadeXMatch <info@acadexmatch.com>');
    assert.equal(sm.senderKind, 'main');
    const before = got.length;
    await to.sendTeacherTest('me@example.com');
    assert.equal(got.length, before + 1);
    assert.match(got[got.length - 1].data, /From: Udayakumar from AcadeXMatch <info@acadexmatch\.com>/);
    got.length = before;
    Object.assign(process.env, keep);
    await persist.writeJson('teacher-outreach-state', null);
  }

  // ---- email web API (GoDaddy blocks SMTP): a separate account, or the outreach account when chosen
  {
    const http = await import('http');
    const apiGot: { key: string; body: { sender: { email: string }; to: { email: string }[]; subject: string; tags: string[] } }[] = [];
    const api = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { apiGot.push({ key: String(req.headers['api-key']), body: JSON.parse(b) }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ messageId: '<x@brevo>' })); }); });
    await new Promise<void>(r => api.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
    const keep = { ...process.env };
    for (const k of ['CANDIDATE_SMTP_HOST', 'CANDIDATE_SMTP_USER', 'CANDIDATE_SMTP_PASS', 'CANDIDATE_MAIL_FROM', 'SMTP_HOST']) delete process.env[k];
    Object.assign(process.env, { OUTREACH_EMAIL_API_KEY: 'outreach-key', OUTREACH_EMAIL_API_URL: url, OUTREACH_MAIL_FROM: 'AcadeXMatch <hello@outreach.acadexmatch.com>' });
    await persist.writeJson('teacher-outreach-state', null);
    assert.equal((await to.teacherSummary()).senderConfigured, false, 'outreach account only when chosen');
    await to.saveTeacherSettings({ useOutreachApi: true });
    assert.equal((await to.teacherSummary()).senderKind, 'outreach-api');
    await to.sendTeacherTest('me@example.com');
    assert.equal(apiGot[0].key, 'outreach-key');
    assert.equal(apiGot[0].body.sender.email, 'hello@outreach.acadexmatch.com');
    assert.deepEqual(apiGot[0].body.tags, ['teacher-invite']);
    // A separate teacher account takes precedence.
    Object.assign(process.env, { TEACHER_EMAIL_API_KEY: 'teacher-key', TEACHER_EMAIL_API_URL: url, TEACHER_MAIL_FROM: 'Udayakumar from AcadeXMatch <invite@acadexmatch.com>' });
    assert.equal((await to.teacherSummary()).senderKind, 'api');
    await to.sendTeacherTest('me@example.com');
    assert.equal(apiGot[1].key, 'teacher-key');
    assert.equal(apiGot[1].body.sender.email, 'invite@acadexmatch.com');
    for (const k of ['TEACHER_EMAIL_API_KEY', 'TEACHER_EMAIL_API_URL', 'TEACHER_MAIL_FROM', 'OUTREACH_EMAIL_API_KEY', 'OUTREACH_EMAIL_API_URL', 'OUTREACH_MAIL_FROM']) delete process.env[k];
    Object.assign(process.env, keep);
    await persist.writeJson('teacher-outreach-state', null);
    api.close();
  }

  // ---- sending
  const p = await persist.sqlPool();
  await to.teacherSummary(); // creates the tables
  await p.query("DELETE FROM acx_teacher_contacts WHERE email LIKE '%.teachtest.ac.in'");
  await p.query("DELETE FROM acx_outreach_suppress WHERE value LIKE '%.teachtest.ac.in'");
  await persist.writeJson('teacher-outreach-state', null);
  const people = ['a1', 'a2', 'a3', 'a4', 'bounce5', 'a6'];
  for (const [i, u] of people.entries()) {
    await p.query('INSERT INTO acx_teacher_contacts (email, name, designation, department, aishe_code, college, state, source_url, found_at) VALUES (?,?,?,?,?,?,?,?, NOW() - INTERVAL ? MINUTE)',
      [`${u}@x.teachtest.ac.in`, i === 0 ? 'Dr. A. One' : null, 'Assistant Professor', 'Physics', 'C-TT-1', 'Test College', 'Testland', 'https://x.teachtest.ac.in/faculty', 60 - i]);
  }
  await o.suppress('a2@x.teachtest.ac.in', 'test');
  await to.saveTeacherSettings({ dailyLimit: 3 });
  await to.setTeacherSending(true);
  await new Promise(r => setTimeout(r, 200));
  for (let i = 0; i < 40 && (globalThis as { __teacherSender?: boolean }).__teacherSender; i++) await new Promise(r => setTimeout(r, 250));
  await to.teacherSendDue();
  let s = await to.teacherSummary();
  assert.equal(got.length, 3, `daily limit of 3 (sent ${got.length})`);
  assert.deepEqual(got.map(g => g.to), ['a1@x.teachtest.ac.in', 'a3@x.teachtest.ac.in', 'a4@x.teachtest.ac.in'], 'suppressed address skipped, oldest first');
  assert.match(got[0].data, /Dear Dr\. A\. One/);
  assert.match(got[1].data, /Dear Sir \/ Madam/);
  assert.match(got[0].data, /api\/outreach\/unsubscribe\?e=a1%40x\.teachtest\.ac\.in/);
  assert.match(got[0].data, /List-Unsubscribe/);
  assert.match(got[0].data, /x\.teachtest\.ac\.in\/faculty/, 'says where the address was found');
  assert.equal(s.counts.unsubscribed, 1);
  assert.equal(s.sentToday, 3);
  await to.teacherSendDue();
  assert.equal(got.length, 3, 'nothing more today');

  // A refused address is marked and skipped; the rest continue.
  await to.saveTeacherSettings({ dailyLimit: 10 });
  await to.teacherSendDue();
  s = await to.teacherSummary();
  assert.deepEqual(got.slice(3).map(g => g.to), ['a6@x.teachtest.ac.in']);
  const [[bounce]] = await p.query("SELECT status FROM acx_teacher_contacts WHERE email = 'bounce5@x.teachtest.ac.in'") as unknown as [[{ status: string }]];
  assert.equal(bounce.status, 'failed');
  assert.equal(new Set(got.map(g => g.to)).size, got.length, 'nobody twice');

  // A refused login pauses sending and keeps the address waiting.
  await p.query("INSERT INTO acx_teacher_contacts (email, aishe_code, college, state) VALUES ('a7@x.teachtest.ac.in','C-TT-1','Test College','Testland')");
  smtpMode = 'auth';
  (globalThis as { __teacherTransport?: unknown }).__teacherTransport = null;
  await to.teacherSendDue();
  s = await to.teacherSummary();
  assert.equal(s.sending, false, 'paused');
  assert.match(s.lastError || '', /refused the login/);
  const [[a7]] = await p.query("SELECT status FROM acx_teacher_contacts WHERE email = 'a7@x.teachtest.ac.in'") as unknown as [[{ status: string }]];
  assert.equal(a7.status, 'new');

  // Unsubscribing through the shared link marks the teacher too.
  await o.suppress('a7@x.teachtest.ac.in', 'unsubscribe link');
  const [[a7b]] = await p.query("SELECT status FROM acx_teacher_contacts WHERE email = 'a7@x.teachtest.ac.in'") as unknown as [[{ status: string }]];
  assert.equal(a7b.status, 'unsubscribed');

  await p.query("DELETE FROM acx_teacher_contacts WHERE email LIKE '%.teachtest.ac.in'");
  await p.query("DELETE FROM acx_outreach_suppress WHERE value LIKE '%.teachtest.ac.in'");
  await persist.writeJson('teacher-outreach-state', null);
  smtp.close();
  console.log('teacher-outreach: all checks passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
