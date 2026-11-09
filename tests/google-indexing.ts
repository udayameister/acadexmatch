/* Google Indexing API sync against a local mock of Google: npx tsx tests/google-indexing.ts */
import assert from 'assert';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { generateKeyPairSync, createVerify } from 'crypto';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-gindex-'));
process.chdir(dir);
process.env.ACAD_STORAGE = 'file';
delete process.env.DB_HOST;
delete process.env.INDEXNOW_KEY;

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const sent: { url: string; type: string }[] = [];
let failWith = 0;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    if (req.url === '/token') {
      const assertion = new URLSearchParams(body).get('assertion') || '';
      const [h, p, s] = assertion.split('.');
      const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'));
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      assert(ok, 'JWT is signed with the service-account key');
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/indexing');
      res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      return;
    }
    assert.equal(req.headers.authorization, 'Bearer tok');
    if (failWith) { res.statusCode = failWith; res.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } })); return; }
    sent.push(JSON.parse(body));
    res.end('{}');
  });
});

const job = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Assistant Professor ${id}`, status: 'published', postedAt: `2026-11-0${id.slice(-1)}T00:00:00Z`,
  applicationDeadline: '2099-01-01', location: { city: 'Chennai', state: 'Tamil Nadu' }, description: 'x', ...extra,
});

(async () => {
  await new Promise<void>(r => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.GOOGLE_INDEXING_TOKEN_URL = `http://127.0.0.1:${port}/token`;
  process.env.GOOGLE_INDEXING_API_URL = `http://127.0.0.1:${port}/publish`;
  process.env.GOOGLE_INDEXING_DAILY_LIMIT = '3';

  const jobsKey = 'acad_jobs_v3';
  const writeJobs = (jobs: unknown[]) => fs.writeFileSync(path.join(dir, 'data', 'db.json'), JSON.stringify({ [jobsKey]: jobs }));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  writeJobs([job('t1'), job('t2'), job('t3'), job('t4'), job('g5', { title: 'Job Openings' }), job('c6', { status: 'closed' })]);

  const m = await import('../lib/server/googleIndexing');

  // Not configured: nothing is sent.
  delete process.env.GOOGLE_INDEXING_CREDENTIALS;
  let r = await m.syncGoogleIndexing();
  assert.equal(r.configured, false);
  assert.equal(sent.length, 0);

  // Base64 key works; the daily limit (3) caps the first run; newest first; generic/closed jobs never sent.
  process.env.GOOGLE_INDEXING_CREDENTIALS = Buffer.from(JSON.stringify({ client_email: 'idx@p.iam.gserviceaccount.com', private_key: pem })).toString('base64');
  r = await m.syncGoogleIndexing();
  assert.equal(r.sent, 3);
  const ours = (u: string) => u.split('/jobs/')[1];
  assert.deepEqual(sent.map(s => ours(s.url)).filter(id => /^t\d$/.test(id)).slice(0, 3), ['t4', 't3', 't2']);
  assert(sent.every(s => s.type === 'URL_UPDATED'));
  assert(!sent.some(s => /\/(g5|c6)$/.test(s.url)), 'only JobPosting pages are sent');

  // Same day, quota used: nothing more.
  r = await m.syncGoogleIndexing();
  assert.equal(r.sent, 0);

  // Next day: remaining jobs go out; unchanged ones are not re-sent.
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'google-indexing.json'), 'utf8'));
  state.day = { date: '2000-01-01', count: 0 };
  fs.writeFileSync(path.join(dir, 'data', 'google-indexing.json'), JSON.stringify(state));
  process.env.GOOGLE_INDEXING_DAILY_LIMIT = '100';
  sent.length = 0;
  r = await m.syncGoogleIndexing();
  assert(sent.some(s => s.url.endsWith('/t1')));
  assert(!sent.some(s => /\/t[234]$/.test(s.url)), 'unchanged vacancies are not re-sent');

  // t2 closes and t3 changes → URL_DELETED for t2, URL_UPDATED for t3.
  writeJobs([job('t1'), job('t2', { status: 'closed' }), job('t3', { applicationDeadline: '2099-02-01' }), job('t4')]);
  sent.length = 0;
  r = await m.syncGoogleIndexing();
  const t = (id: string) => sent.find(s => s.url.endsWith(`/${id}`))?.type;
  assert.equal(t('t3'), 'URL_UPDATED');
  assert.equal(t('t2'), 'URL_DELETED');
  assert.equal(t('t1'), undefined);

  // 429 from Google: stops, records the error, keeps the work pending.
  writeJobs([job('t1', { title: 'Professor (changed)' }), job('t3', { applicationDeadline: '2099-02-01' }), job('t4')]);
  failWith = 429; sent.length = 0;
  r = await m.syncGoogleIndexing();
  assert.equal(r.sent, 0);
  assert(r.error && r.error.includes('429'));
  const st = await m.googleIndexingStatus();
  assert(st.pendingUpdates >= 1);
  assert.equal(st.configured, true);
  assert.equal(st.serviceAccount, 'idx@p.iam.gserviceaccount.com');

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('google-indexing: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
