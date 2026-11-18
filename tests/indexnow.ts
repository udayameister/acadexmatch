/* IndexNow submissions to search engines, against a stand-in endpoint. Run: npx tsx tests/indexnow.ts */
import assert from 'assert';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';

type Got = { host: string; key: string; keyLocation: string; urlList: string[] };

(async () => {
  const got: Got[] = [];
  let answer = 200;
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => { got.push(JSON.parse(b)); res.statusCode = answer; res.end(); });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-indexnow-'));
  process.chdir(dir);
  Object.assign(process.env, { ACAD_STORAGE: 'file', INDEXNOW_ENDPOINT: `http://127.0.0.1:${port}/indexnow`, SITE_URL: 'https://acadexmatch.com' });
  delete process.env.DB_HOST;
  delete process.env.INDEXNOW_KEY;

  const ix = await import('../lib/server/indexnow');

  // Only the live site submits.
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = 'development';
  assert.equal(ix.enabled().on, false, 'not on a development server');
  env.NODE_ENV = 'production';
  env.APP_URL = 'https://guu1b47s90.preview.c35.airoapp.ai';
  assert.equal(ix.enabled().on, false, 'not on a preview copy');
  env.APP_URL = 'https://acadexmatch.com';
  assert.equal(ix.enabled().on, true);
  env.INDEXNOW = 'off';
  assert.equal(ix.enabled().on, false, 'can be switched off');
  delete env.INDEXNOW;
  got.length = 0;

  // Key: created once, stable, safe characters, published at /<key>.txt.
  const key = await ix.getKey();
  assert.match(key, /^[a-f0-9]{32}$/);
  assert.equal(await ix.getKey(), key, 'same key every time');
  assert.equal(ix.keyLocation(key), `https://acadexmatch.com/${key}.txt`);

  // First run submits every public page from the sitemap, in the IndexNow format.
  const first = await ix.sync();
  assert(first.submitted > 5, `submitted ${first.submitted}`);
  assert.equal(got.length, 1);
  assert.equal(got[0].host, 'acadexmatch.com');
  assert.equal(got[0].key, key);
  assert.equal(got[0].keyLocation, `https://acadexmatch.com/${key}.txt`);
  assert(got[0].urlList.includes('https://acadexmatch.com/'));
  assert(got[0].urlList.includes('https://acadexmatch.com/blog'));
  assert(got[0].urlList.every(u => u.startsWith('https://acadexmatch.com/')));

  // Nothing changed -> nothing sent.
  got.length = 0;
  assert.equal((await ix.sync()).submitted, 0);
  assert.equal(got.length, 0);

  // A newly published blog post is sent on the next run, and only that page (plus the blog list whose date changed).
  const blog = await import('../lib/server/blog');
  const post = await blog.savePost({ title: 'Why NET matters in 2026', body: 'A short guide to the National Eligibility Test for assistant professor posts in India. '.repeat(3), type: 'guide', status: 'published' });
  const r = await ix.sync();
  assert.equal(got.length, 1);
  assert(got[0].urlList.includes(`https://acadexmatch.com/blog/${post.slug}`), 'new post submitted');
  assert(got[0].urlList.length <= 3, `only changed pages: ${got[0].urlList.join(', ')}`);
  assert.equal(r.submitted, got[0].urlList.length);

  // A scheduled post is not sent until it goes live.
  got.length = 0;
  await blog.savePost({ title: 'Next month', body: 'Scheduled text about faculty recruitment in Indian universities. '.repeat(3), status: 'published', publishAt: new Date(Date.now() + 86400_000).toISOString() });
  await ix.sync();
  assert(!got.some(g => g.urlList.some(u => u.includes('next-month'))), 'scheduled post not submitted');

  // If IndexNow refuses (e.g. key not reachable yet), nothing is marked as sent, so it is retried next time.
  got.length = 0;
  answer = 403;
  const post2 = await blog.savePost({ title: 'Refused once', body: 'Text about academic careers and recruitment in Indian higher education. '.repeat(3), status: 'published' });
  const bad = await ix.sync();
  assert.equal(bad.submitted, 0);
  assert.equal(bad.results[0].ok, false);
  assert.match(bad.results[0].note, /Key not valid/);
  answer = 200;
  got.length = 0;
  await ix.sync();
  assert(got[0].urlList.includes(`https://acadexmatch.com/blog/${post2.slug}`), 'retried after a refusal');

  // pingIndexNow (used when a vacancy or institution changes) sends exactly those pages, only for this site.
  got.length = 0;
  await ix.pingIndexNow(['/jobs/abc', '/jobs', '/jobs/abc', 'https://evil.example/x']);
  assert.deepEqual(got[0].urlList, ['https://acadexmatch.com/jobs/abc', 'https://acadexmatch.com/jobs']);

  // "Re-submit everything" sends every page again.
  got.length = 0;
  const all = await ix.sync({ force: true });
  assert.equal(all.submitted, got[0].urlList.length);
  assert(all.submitted > 5);

  // Status for the admin panel.
  const st = await ix.status();
  assert.equal(st.enabled.on, true);
  assert.equal(st.waiting, 0);
  assert.equal(st.submittedPages, st.totalPages);
  assert(st.log.length >= 3 && st.log.some(l => !l.ok));

  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('indexnow: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
