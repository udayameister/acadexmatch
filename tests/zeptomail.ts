/* ZeptoMail sending path, against a local stand-in for api.zeptomail.in. Run: npx tsx tests/zeptomail.ts */
import assert from 'assert';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';

const seen: { auth?: string; body: Record<string, unknown> }[] = [];
let refuseHeaders = false;
const server = http.createServer((req, res) => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
    const body = JSON.parse(b);
    seen.push({ auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url !== '/v1.1/email') { res.statusCode = 404; res.end('{}'); return; }
    if (refuseHeaders && body.mime_headers) { res.statusCode = 400; res.end(JSON.stringify({ error: { code: 'TM_3201', message: 'Invalid mime header', details: [{ message: 'mime_headers not allowed', target: 'mime_headers' }] } })); return; }
    if (body.to[0].email_address.address === 'bad@example.com') { res.statusCode = 401; res.end(JSON.stringify({ error: { code: 'TM_3501', details: [{ message: 'Invalid API Token found' }] } })); return; }
    res.statusCode = 201; res.end(JSON.stringify({ data: [{ code: 'EM_104', message: 'Email request received' }], request_id: 'req-123' }));
  });
});

(async () => {
  await new Promise<void>(r => server.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-zepto-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST; delete process.env.SMTP_HOST; delete process.env.EMAIL_REDIRECT_TO;
  process.env.EMAIL_API = 'zeptomail';
  process.env.EMAIL_API_KEY = 'Zoho-enczapikey test-token';
  process.env.EMAIL_API_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.MAIL_FROM = 'AcadeXMatch <noreply@acadexmatch.com>';
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const m = await import('../lib/server/mailer');
  assert.equal(m.emailConfigured(), true);
  assert.equal(m.mailSettingsSummary().host, 'ZeptoMail email API');
  let r = await m.sendMail({ to: 'cand@example.com', subject: 'Test', text: 'Hello', html: '<p>Hello</p>', kind: 'test', headers: { 'List-Unsubscribe': '<https://acadexmatch.com/u>' } });
  assert.equal(r.status, 'sent', JSON.stringify(r));
  const last = seen[seen.length - 1];
  assert.equal(last.auth, 'Zoho-enczapikey test-token', 'prefix not doubled');
  assert.deepEqual(last.body.from, { address: 'noreply@acadexmatch.com', name: 'AcadeXMatch' });
  assert.deepEqual(last.body.to, [{ email_address: { address: 'cand@example.com' } }]);
  assert.equal(last.body.htmlbody, '<p>Hello</p>'); assert.equal(last.body.textbody, 'Hello');
  assert.deepEqual(last.body.mime_headers, { 'List-Unsubscribe': '<https://acadexmatch.com/u>' });
  // A refused extra header: sent again without it.
  refuseHeaders = true; seen.length = 0;
  r = await m.sendMail({ to: 'cand@example.com', subject: 'Test 2', text: 'Hi', kind: 'test', headers: { 'X-A': '1' } });
  assert.equal(r.status, 'sent'); assert.equal(seen.length, 2); assert.equal(seen[1].body.mime_headers, undefined);
  refuseHeaders = false;
  // A bad token is reported plainly.
  r = await m.sendMail({ to: 'bad@example.com', subject: 'Test 3', text: 'Hi', kind: 'test' });
  assert.notEqual(r.status, 'sent');
  assert.match(String(r.error), /ZeptoMail 401: Invalid API Token/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('zeptomail: all checks passed');
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
