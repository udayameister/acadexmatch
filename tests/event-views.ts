/* Event visit counts (admin-only): de-duplication, bots, link clicks. Run: npx tsx tests/event-views.ts */
import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acx-eventviews-'));
  process.chdir(dir);
  process.env.ACAD_STORAGE = 'file';
  delete process.env.DB_HOST;
  const ev = await import('../lib/server/eventViews');
  const a = { ip: '10.0.0.1', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' };
  const b = { ip: '10.0.0.2', ua: 'Mozilla/5.0 (iPhone) Safari/604.1' };

  assert.equal(await ev.recordEventAction('fdp-1', 'view', a), true);
  assert.equal(await ev.recordEventAction('fdp-1', 'view', a), false, 'same visitor, same day: counted once');
  assert.equal(await ev.recordEventAction('fdp-1', 'view', b), true);
  assert.equal(await ev.recordEventAction('conf-1', 'view', a), true, 'separate per event');
  assert.equal(await ev.recordEventAction('fdp-1', 'view', { ip: '1.2.3.4', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), false, 'bots skipped');
  assert.equal(await ev.recordEventAction('../x', 'view', a), false, 'bad id refused');
  assert.equal(await ev.recordEventAction('fdp-1', 'register', a), true);
  assert.equal(await ev.recordEventAction('fdp-1', 'register', a), false);
  assert.equal(await ev.recordEventAction('fdp-1', 'brochure', b), true);

  const c = await ev.eventViewCounts();
  assert.deepEqual({ ...c.events['fdp-1'], last: undefined }, { total: 2, today: 2, last7: 2, register: 1, brochure: 1, last: undefined });
  assert.equal(c.events['conf-1'].total, 1);
  const s = await ev.eventViewSeries('fdp-1', 30);
  assert.equal(s.length, 30);
  assert.equal(s[s.length - 1].count, 2);

  // Nothing identifying is stored.
  const raw = fs.readdirSync(dir, { recursive: true }).map(f => { const p = path.join(dir, String(f)); return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : ''; }).join('');
  assert(!raw.includes('10.0.0.1') && !raw.includes('iPhone'), 'no IPs or browsers stored');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('event-views: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
