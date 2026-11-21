/*
 * Teacher invitations: extraction from faculty pages, crawling rules, and sending (once per person, unsubscribes,
 * daily limit, refused addresses, refused login) against a stand-in SMTP server. Needs the local MySQL.
 * Run: npx tsx tests/teacher-outreach.ts
 */
import assert from 'assert';
import net from 'net';
import { extractTeachers, facultyLinks } from '../lib/outreach/faculty';

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
