/*
 * "Claim your listing": who gets emailed and when, the real-views sentence, sending limits, claim links,
 * registration and attaching vacancies. Stand-in Brevo; needs the local MySQL.
 * Run: npx tsx tests/claim-outreach.ts
 */
import assert from 'assert';
import http from 'http';

(async () => {
  const got: { to: string; subject: string; text: string }[] = [];
  const brevo = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; });
    req.on('end', () => { const d = JSON.parse(b || '{}'); got.push({ to: d.to?.[0]?.email, subject: d.subject, text: d.textContent }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ messageId: `<m${got.length}@brevo>` })); });
  });
  await new Promise<void>(r => brevo.listen(0, '127.0.0.1', () => r()));
  Object.assign(process.env, {
    DB_HOST: process.env.DB_HOST || '127.0.0.1', DB_PORT: '3306', DB_NAME: process.env.DB_NAME || 'acx', DB_USER: process.env.DB_USER || 'acx', DB_PASSWORD: process.env.DB_PASSWORD || 'acxpass',
    OUTREACH_EMAIL_API_KEY: 'k', OUTREACH_EMAIL_API_URL: `http://127.0.0.1:${(brevo.address() as { port: number }).port}`, OUTREACH_MAIL_FROM: 'AcadeXMatch <hello@outreach.acadexmatch.com>',
    AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnop', SITE_URL: 'https://acadexmatch.com', APP_URL: 'https://acadexmatch.com', ACAD_STORAGE: '',
  });
  const persist = await import('../lib/server/persist');
  const { withDb } = await import('../lib/server/db');
  const { STORAGE_KEYS } = await import('../lib/storage');
  const o = await import('../lib/server/outreach');
  const views = await import('../lib/server/jobViews');
  const c = await import('../lib/server/claimOutreach');

  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const job = (id: string, inst: string, name: string, posted: number, extra: Record<string, unknown> = {}) => ({
    id, instituteId: inst, instituteName: name, instituteShortName: name, instituteLogo: '', title: 'Assistant Professor – Computer Science', status: 'published',
    isClaimedByInstitute: false, postedAt: day(-posted), applicationDeadline: day(20), location: { city: 'Testpur', state: 'Testland' }, department: 'CSE',
    payScale: {}, requiredQualifications: {}, specializationTags: [], responsibilities: [], benefits: [], screeningQuestions: [], selectionProcess: [], applicantCount: 0, description: 'x', ...extra,
  });
  const jobs = [
    job('ct-a1', 'inst-ctalpha', 'Alpha College of Engineering', 6, { details: { applyEmails: [{ email: 'recruit@ctalpha.ac.in' }], officialWebsite: 'https://www.ctalpha.ac.in' } }),
    job('ct-a2', 'inst-ctalpha', 'Alpha College of Engineering', 5, { title: 'Associate Professor – Mathematics', details: { applyEmails: [{ email: 'recruit@ctalpha.ac.in' }] } }),
    job('ct-b1', 'inst-ctbeta', 'Beta Arts College', 0, { details: { applyEmails: [{ email: 'principal.beta@gmail.com' }] } }),
    job('ct-c1', 'inst-ctgamma', 'Gamma Institute', 8, { details: { contactPhones: ['+91 98765 43210'] } }),
    job('ct-d1', 'inst-ctdelta', 'Delta University', 8, { details: { applyEmails: [{ email: 'hr@ctdelta.edu.in' }], officialWebsite: 'https://ctdelta.edu.in' } }),
    job('ct-e1', 'inst-cteps', 'Epsilon College', 9, { details: { applyEmails: [{ email: 'jobs@cteps.ac.in' }] } }),
  ];
  await withDb(null, d => {
    d[STORAGE_KEYS.JOBS] = [...((d[STORAGE_KEYS.JOBS] as { id: string }[]) || []).filter(j => !j.id.startsWith('ct-')), ...jobs];
    d[STORAGE_KEYS.INSTITUTES] = [...((d[STORAGE_KEYS.INSTITUTES] as { id: string }[]) || []).filter(i => !i.id.startsWith('ct-')),
      { id: 'ct-inst-delta', name: 'Delta University (registered)', shortName: 'Delta', website: 'https://ctdelta.edu.in', aisheCode: '', verificationStatus: 'verified', location: { city: 'Testpur', state: 'Testland' } }];
  }, { write: true });
  await persist.writeJson('claim-outreach', null);
  await o.suppress('jobs@cteps.ac.in', 'test');
  for (let i = 0; i < 7; i++) await views.recordJobView('ct-a1', { ip: `10.1.0.${i}`, ua: 'Mozilla/5.0 Chrome/130' });
  await views.recordJobView('ct-c1', { ip: '10.2.0.1', ua: 'Mozilla/5.0 Chrome/130' });

  // ---- who is ready
  let { groups } = await c.claimGroups();
  const G = (k: string) => groups.find(g => g.key === k)!;
  assert.equal(G('inst-ctalpha').hold, '', 'Alpha ready');
  assert.equal(G('inst-ctalpha').jobs.length, 2);
  assert.equal(G('inst-ctalpha').views, 7);
  assert.equal(G('inst-ctalpha').emails[0].email, 'recruit@ctalpha.ac.in');
  assert.match(G('inst-ctbeta').hold, /^Waiting/, 'posted today: waits');
  assert.equal(G('inst-ctgamma').hold, 'No email — call instead');
  assert.deepEqual(G('inst-ctgamma').phones, ['+91 98765 43210']);
  assert.equal(G('inst-ctdelta').hold, 'Already registered on AcadeXMatch');
  assert.equal(G('inst-cteps').emails.length, 0, 'unsubscribed address dropped');

  // ---- the email: real views only
  const s0 = await c.claimSummary();
  const m = c.renderClaim(s0.template, G('inst-ctalpha'), 'recruit@ctalpha.ac.in', 5);
  assert.equal(m.subject, 'Your Assistant Professor – Computer Science (and 1 more) vacancy is already live on AcadeXMatch');
  assert.match(m.text, /Candidates have viewed your vacancies 7 times since/);
  assert.match(m.text, /https:\/\/acadexmatch\.com\/claim\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  assert.match(m.text, /https:\/\/acadexmatch\.com\/jobs\/ct-a1/, 'most viewed vacancy linked');
  assert.match(m.text, /unsubscribe/i);
  const few = c.renderClaim(s0.template, G('inst-ctgamma'), 'x@y.in', 5);
  assert.match(few.text, /Candidates across India can already see it\./, 'no views claim below the threshold');
  assert.doesNotMatch(few.text, /viewed/);

  // ---- automatic sending: only ready colleges, only in working hours, then the gap applies
  await c.saveClaimSettings({ auto: true });
  const night = new Date(Date.UTC(2026, 10, 23, 17, 0)); // 22:30 IST
  assert.equal((await c.claimSendDue({ now: night })).sent, 0, 'not at night');
  assert.equal(got.length, 0);
  const morning = new Date(Date.UTC(2026, 10, 23, 5, 0)); // 10:30 IST
  await c.claimSendDue({ now: morning });
  const mine = () => got.filter(g => /ct[a-z]+\.(ac|edu)\.in$|beta@gmail/.test(g.to)).map(g => g.to);
  assert.deepEqual(mine(), ['recruit@ctalpha.ac.in'], 'only the ready college (other local data aside)');
  ({ groups } = await c.claimGroups());
  assert.match(G('inst-ctalpha').hold, /^Emailed/);
  await assert.rejects(c.sendClaim('inst-ctalpha'), /Not sent: Emailed/);
  await c.claimSendDue({ now: morning });
  assert.deepEqual(mine(), ['recruit@ctalpha.ac.in'], 'nobody else ready');

  // ---- claim link: signed, shows the vacancies, counts visits
  const token = c.claimToken('inst-ctalpha');
  assert.equal(c.readClaimToken(token), 'inst-ctalpha');
  assert.equal(c.readClaimToken(token.replace(/.$/, ch => (ch === 'A' ? 'B' : 'A'))), null, 'tampered link refused');
  assert.equal(c.readClaimToken(`${Buffer.from('inst-ctgamma').toString('base64url')}.${token.split('.')[1]}`), null, 'cannot reuse a signature for another college');
  const info = await c.claimInfo(token);
  assert.equal(info!.college, 'Alpha College of Engineering');
  assert.equal(info!.jobs.length, 2);
  assert(!JSON.stringify(info).includes('recruit@'), 'no contact data on the public page');
  await c.recordClaimClick(token);

  // ---- registration from the link, then the administrator attaches the vacancies
  await withDb(null, d => { (d[STORAGE_KEYS.INSTITUTES] as unknown[]).push({ id: 'ct-inst-alpha-new', name: 'Alpha College of Engineering', shortName: 'ACE', website: '', aisheCode: '', verificationStatus: 'pending', location: { city: 'Testpur', state: 'Testland' } }); }, { write: true });
  await c.recordClaimRegistration(token, { id: 'ct-user-1', name: 'Dr. HR Alpha', email: 'hr@ctalpha.ac.in', instituteId: 'ct-inst-alpha-new' });
  ({ groups } = await c.claimGroups());
  assert.equal(G('inst-ctalpha').hold, 'Registered — attach the vacancies');
  assert.equal(G('inst-ctalpha').record.clicks, 1);
  const r = await c.attachClaim('inst-ctalpha', 'ct-inst-alpha-new');
  assert.equal(r.attached, 2);
  const moved = await withDb(null, d => (d[STORAGE_KEYS.JOBS] as { id: string; instituteId: string; isClaimedByInstitute: boolean }[]).filter(j => j.id.startsWith('ct-a')));
  assert(moved.every(j => j.instituteId === 'ct-inst-alpha-new' && j.isClaimedByInstitute === true));
  ({ groups } = await c.claimGroups());
  assert(!groups.some(g => g.key === 'inst-ctalpha'), 'claimed college leaves the list');
  const sum = await c.claimSummary();
  assert.equal(sum.totals.claimed, 1);
  assert.equal(sum.totals.registered, 1);

  // ---- template must keep the claim link
  await assert.rejects(c.saveClaimTemplate({ subject: 'Hello there', body: 'No link here at all, which would be pointless for the college.' }), /claim_link/);

  // cleanup
  await withDb(null, d => {
    d[STORAGE_KEYS.JOBS] = ((d[STORAGE_KEYS.JOBS] as { id: string }[]) || []).filter(j => !j.id.startsWith('ct-'));
    d[STORAGE_KEYS.INSTITUTES] = ((d[STORAGE_KEYS.INSTITUTES] as { id: string }[]) || []).filter(i => !i.id.startsWith('ct-'));
  }, { write: true });
  const p = await persist.sqlPool();
  await p.query("DELETE FROM acx_outreach_suppress WHERE value = 'jobs@cteps.ac.in'");
  await persist.writeJson('claim-outreach', null);
  brevo.close();
  console.log('claim-outreach: all checks passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
