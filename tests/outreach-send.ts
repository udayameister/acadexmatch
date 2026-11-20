/*
 * Outreach sending against a stand-in Brevo: refusals pause without losing anyone, the paused campaign resumes by
 * itself once Brevo accepts again, rate limits and outages are retried, nobody is emailed twice.
 * Needs the local MySQL (DB_HOST). Run: npx tsx tests/outreach-send.ts
 */
import assert from 'assert';
import http from 'http';

type Mode = 'ok' | 'ip' | '429' | '500';
(async () => {
  let mode: Mode = 'ip', ip = '92.204.27.108';
  const delivered: string[] = [];
  let accountChecks = 0;
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.headers['api-key'] !== 'outreach-test-key') { res.statusCode = 401; return res.end(JSON.stringify({ message: 'Key not found' })); }
      if (mode === 'ip') { res.statusCode = 401; return res.end(JSON.stringify({ message: `We have detected you are using an unrecognised IP address ${ip}. If you performed this action make sure to add the new IP address` })); }
      if (req.url === '/v3/account') { accountChecks++; return res.end(JSON.stringify({ email: 'x@y' })); }
      if (mode === '429') { res.statusCode = 429; return res.end(JSON.stringify({ message: 'Too many requests' })); }
      if (mode === '500') { res.statusCode = 502; return res.end('{}'); }
      delivered.push(JSON.parse(b).to[0].email);
      res.end(JSON.stringify({ messageId: `<m${delivered.length}@brevo>` }));
    });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  Object.assign(process.env, {
    DB_HOST: process.env.DB_HOST || '127.0.0.1', DB_PORT: '3306', DB_NAME: process.env.DB_NAME || 'acx', DB_USER: process.env.DB_USER || 'acx', DB_PASSWORD: process.env.DB_PASSWORD || 'acxpass',
    OUTREACH_EMAIL_API_KEY: 'outreach-test-key', OUTREACH_EMAIL_API_URL: `http://127.0.0.1:${port}`, OUTREACH_MAIL_FROM: 'AcadeXMatch <hello@outreach.acadexmatch.com>',
    AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnop', SITE_URL: 'https://acadexmatch.com', ACAD_STORAGE: '',
  });
  const persist = await import('../lib/server/persist');
  const o = await import('../lib/server/outreach');
  const p = await persist.sqlPool();
  await o.outreachSummary(); // creates the tables
  await p.query("DELETE FROM acx_outreach_contacts WHERE email LIKE '%.sendtest.ac.in'");
  await persist.writeJson('outreach-state', null);
  for (let i = 0; i < 25; i++) {
    await p.query('INSERT INTO acx_outreach_contacts (email, aishe_code, college, state, category, score) VALUES (?,?,?,?,?,?)', [`principal${i}@c${i}.sendtest.ac.in`, `C-9${String(i).padStart(4, '0')}`, `Test College ${i}`, 'Testland', 'College', 10]);
  }
  await o.saveSettings({ dailyLimit: 100 });
  const camp = await o.saveCampaign({ name: 'Test', subject: 'Hello {{college}}', body: 'Dear Principal,\n\nA test message about faculty recruitment for {{college}}.', audience: { state: 'Testland' }, perCollege: 1 });
  // startCampaign sends in the background: wait until that run is over.
  const idle = async () => { for (let i = 0; i < 200 && (globalThis as { __sender?: boolean }).__sender; i++) await new Promise(r => setTimeout(r, 50)); };
  const state = async () => (await o.outreachSummary());
  const c = async () => (await state()).campaigns.find(x => x.id === camp.id)!;

  // 1. Brevo refuses the server's address: paused by the sender, nobody lost, address recorded.
  await o.startCampaign(camp.id);
  await idle(); await o.sendDue(); await idle();
  let x = await c();
  assert.equal(x.status, 'paused');
  assert.equal(x.pausedBy, 'sender');
  assert.equal(x.queued, 25, 'nobody dropped');
  assert.equal(delivered.length, 0);
  let s = await state();
  assert.match(s.senderProblem!, /unrecognised IP/);
  assert.deepEqual(s.senderHealth.refusedIps, ['92.204.27.108']);
  assert.equal(s.senderHealth.range, '92.204.27.108/32');

  // 2. The address changes; while still refused, automatic checks back off and nothing is sent.
  ip = '92.204.31.155';
  assert.equal(await o.resumeIfSenderFixed({ force: true }), false);
  s = await state();
  assert.deepEqual(s.senderHealth.refusedIps, ['92.204.27.108', '92.204.31.155']);
  assert.equal(s.senderHealth.range, '92.204.0.0/16', 'range covering the hosting block');
  assert(Date.parse(s.senderHealth.nextCheckAt!) > Date.now(), 'next automatic check scheduled later');
  assert.equal(await o.resumeIfSenderFixed(), false, 'waits for the back-off');
  assert.equal(accountChecks, 0);

  // 3. The administrator fixes Brevo: the next run resumes by itself and sends.
  mode = 'ok';
  assert.equal(await o.resumeIfSenderFixed({ force: true }), true);
  assert.equal(accountChecks, 1, 'checked without sending');
  await idle(); await o.sendDue(); await idle();
  x = await c();
  assert.equal(delivered.length, 25);
  assert.equal(new Set(delivered).size, 25, 'nobody twice');
  assert.equal(x.status, 'done');
  assert.equal(x.sent, 25);
  s = await state();
  assert.equal(s.senderProblem, null);
  assert.equal(s.senderHealth.ok, true);

  // 4. Rate limit / outage: the address goes back in the queue and is retried, not marked failed.
  await p.query("UPDATE acx_outreach_contacts SET status = 'new', last_sent_at = NULL WHERE email LIKE '%.sendtest.ac.in'");
  await o.saveSettings({ gapDays: 1 });
  delivered.length = 0;
  const c2 = await o.saveCampaign({ name: 'Second', subject: 'Hi {{college}}', body: 'Dear Principal,\n\nAnother test message about faculty recruitment.', audience: { state: 'Testland' }, perCollege: 1 });
  mode = '429';
  await o.startCampaign(c2.id);
  await idle(); await o.sendDue(); await idle();
  x = (await state()).campaigns.find(y => y.id === c2.id)!;
  assert.equal(x.status, 'sending', 'keeps going on the next run');
  assert.equal(x.queued, 25);
  assert.equal(x.failed, 0);
  assert.equal((await state()).sentToday, 25, 'nothing counted against today (25 from step 3)');
  mode = '500';
  await idle(); await o.sendDue(); await idle();
  assert.equal((await state()).campaigns.find(y => y.id === c2.id)!.queued, 25);
  mode = 'ok';
  // 5. A campaign the administrator paused is not resumed automatically.
  await o.pauseCampaign(c2.id);
  await idle();
  assert.equal(await o.resumeIfSenderFixed({ force: true }), false, 'administrator pause respected');
  await o.startCampaign(c2.id);
  await idle(); await o.sendDue(); await idle();
  x = (await state()).campaigns.find(y => y.id === c2.id)!;
  assert.equal(x.status, 'done');
  assert.equal(delivered.length, 25);

  await p.query("DELETE FROM acx_outreach_contacts WHERE email LIKE '%.sendtest.ac.in'");
  await persist.writeJson('outreach-state', null);
  srv.close();
  console.log('outreach sending: all checks passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
