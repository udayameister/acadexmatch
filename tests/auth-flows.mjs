// Integration tests for sign-up, sign-in (password, SMS code, Google), recovery, account security and
// notifications. Runs against a local server wired to tests/mock-providers.mjs — see docs/AUTH_AND_NOTIFICATIONS.md.
//   node tests/mock-providers.mjs &   then start the app with the test settings, then:
//   BASE_URL=http://localhost:3500 MOCK_URL=http://127.0.0.1:3400 node tests/auth-flows.mjs
// Needs the mysql CLI for a few database checks (DB_* variables, same as the app).
import { execSync } from 'node:child_process';

const B = (process.env.BASE_URL || 'http://localhost:3500').replace(/\/$/, '');
const M = (process.env.MOCK_URL || 'http://127.0.0.1:3400').replace(/\/$/, '');
const T = Date.now().toString().slice(-6);
const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra && !cond ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 300)}` : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = q => execSync(`mysql -u${process.env.DB_USER || 'acx'} -p${process.env.DB_PASSWORD || 'acxpass'} -h${process.env.DB_HOST || '127.0.0.1'} ${process.env.DB_NAME || 'acx'} --default-character-set=utf8mb4 -N -r`, { input: q, maxBuffer: 1 << 28 }).toString();
const dbKey = k => JSON.parse(sql(`select v from acx_kv where k='db:${k}'`) || 'null');

/** A browser-like client with its own cookies. */
function client(ip, ua = `Mozilla/5.0 (Windows NT 10.0) Chrome/120 test-${ip}`) {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const store = res => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
  };
  const headers = extra => ({ 'User-Agent': ua, 'X-Forwarded-For': ip, ...(jar.size ? { Cookie: cookieHeader() } : {}), ...extra });
  return {
    jar,
    async post(path, body, extra = {}) {
      const r = await fetch(B + path, { method: 'POST', redirect: 'manual', headers: headers({ 'Content-Type': 'application/json', Origin: B, ...extra }), body: JSON.stringify(body) });
      store(r);
      return { status: r.status, data: await r.json().catch(() => ({})) };
    },
    async get(path) {
      const r = await fetch(B + path, { redirect: 'manual', headers: headers() });
      store(r);
      const text = await r.text();
      let data = {}; try { data = JSON.parse(text); } catch { /* html */ }
      return { status: r.status, data, location: r.headers.get('location'), text };
    },
    /** Follows redirects across the app and the mock provider, keeping app cookies. */
    async follow(path, max = 6) {
      let url = path.startsWith('http') ? path : B + path;
      for (let i = 0; i < max; i++) {
        const own = url.startsWith(B);
        const r = await fetch(url, { redirect: 'manual', headers: own ? headers() : {} });
        if (own) store(r);
        const loc = r.headers.get('location');
        if (!loc || r.status < 300 || r.status >= 400) return { status: r.status, url };
        url = new URL(loc, url).toString();
      }
      return { status: 0, url };
    },
  };
}
const mail = async to => (await (await fetch(`${M}/_mail?to=${encodeURIComponent(to)}`)).json());
const lastMail = async (to, re) => { for (let i = 0; i < 20; i++) { const m = (await mail(to)).filter(x => !re || re.test(x.subject)); if (m.length) return m[m.length - 1]; await sleep(250); } return null; };
const smsTo = async to => (await (await fetch(`${M}/_sms?to=${encodeURIComponent(to)}`)).json());
const lastSms = async to => { const s = await smsTo(to); return s[s.length - 1]; };
const linkIn = (m, path) => { const x = (m?.html || '').match(new RegExp(`${B.replace(/[/.:]/g, c => `\\${c}`)}${path}\\?[^"\\s<]+`)) || (m?.text || '').match(new RegExp(`https?://[^\\s"]*${path}\\?[^\\s"<]+`)); return x ? x[0].replace(/&amp;/g, '&') : null; };
const tokenOf = (url, p = 'token') => (url ? new URL(url).searchParams.get(p) : null);

(async () => {
  const anon = client(`10.1.${T % 200}.1`);
  // ---------- available methods ----------
  const m = await anon.get('/api/auth/methods');
  ok('methods: SMS and Google are switched on, Microsoft (not configured) is hidden', m.data.sms === true && JSON.stringify(m.data.providers) === '["google"]', m.data);

  // ---------- registration ----------
  const email = `auth${T}@example.com`, phone = `+9198${T}11`.slice(0, 13), pw = `Lecturer${T}x`;
  const a = client(`10.2.${T % 200}.2`);
  const base = { name: 'Dr. Auth Test', email, password: pw, role: 'candidate', phone, country: 'IN', termsAccepted: true };
  ok('registration refuses an invalid mobile number', (await a.post('/api/auth/register', { ...base, phone: '12345' })).status === 400);
  ok('registration refuses a weak password', (await a.post('/api/auth/register', { ...base, password: 'password1' })).status === 400);
  ok('registration requires accepting the terms', (await a.post('/api/auth/register', { ...base, termsAccepted: false })).status === 400);
  ok('registration refuses an invalid email', (await a.post('/api/auth/register', { ...base, email: 'not-an-email' })).status === 400);
  const reg = await a.post('/api/auth/register', base);
  ok('registration succeeds and signs in', reg.status === 200 && reg.data.success && a.jar.has('acad_session'), reg.data);
  const users1 = dbKey('acad_users_v3');
  const me = users1.find(u => u.email === email);
  ok('account saved with E.164 phone, unconfirmed email and phone, terms time, marketing off', me && me.phone === phone && me.emailVerified === false && me.phoneVerified === false && !!me.termsAcceptedAt && me.marketingConsent === false, me);
  ok('password stored as a scrypt hash only', me && /^scrypt\$/.test(me.passwordHash) && !JSON.stringify(me).includes(pw));
  ok('duplicate registration is refused', (await client('10.9.9.9').post('/api/auth/register', base)).status === 400);
  const welcome = await lastMail(email, /Welcome to AcadexMatch|Welcome to AcadeXMatch/i);
  ok('welcome + verification email sent', !!welcome && /Verify Your Email/i.test(welcome.subject), welcome?.subject);
  const verifyUrl = linkIn(welcome, '/verify-email');
  ok('verification email has a link to the production page', !!verifyUrl, welcome?.html?.slice(0, 200));

  // ---------- unverified restrictions ----------
  const job = (dbKey('acad_jobs_v3') || []).find(j => j.status === 'published' && (!j.applicationDeadline || j.applicationDeadline >= new Date().toISOString().slice(0, 10)));
  const apply = await a.post('/api/rpc', { method: 'applyToJob', args: [job?.id, []] });
  ok('an unconfirmed email cannot apply', apply.status >= 400 && /confirm your email/i.test(apply.data.error || ''), apply.data);

  // ---------- email verification ----------
  const v1 = await anon.post('/api/auth/verify', { token: tokenOf(verifyUrl) });
  ok('verification link confirms the email', v1.status === 200 && dbKey('acad_users_v3').find(u => u.email === email)?.emailVerified === true, v1.data);
  ok('verification link works only once', (await anon.post('/api/auth/verify', { token: tokenOf(verifyUrl) })).status === 400);
  ok('confirmation email sent after verification', !!(await lastMail(email, /email is confirmed/i)));

  // ---------- mobile confirmation by SMS ----------
  const r1 = await a.post('/api/auth/otp/request', { purpose: 'verify-phone', phone, country: 'IN' });
  ok('SMS code requested for the phone', r1.status === 200 && !!r1.data.challengeId && !JSON.stringify(r1.data).match(/\b\d{6}\b/), r1.data);
  const s1 = await lastSms(phone);
  ok('SMS sent through the provider with a 6-digit code', s1 && /^\d{6}$/.test(s1.code), s1);
  ok('the code is not stored in plain text', !sql("select v from acx_kv where k='db:_otp'").includes(s1?.code));
  const bad = await a.post('/api/auth/otp/verify', { purpose: 'verify-phone', challengeId: r1.data.challengeId, code: s1.code === '000000' ? '111111' : '000000' });
  ok('a wrong code is refused and tries are counted', bad.status === 400 && /tries? left/.test(bad.data.error || ''), bad.data);
  const resendSoon = await a.post('/api/auth/otp/request', { purpose: 'verify-phone', phone, country: 'IN' });
  ok('resend within the cooldown is refused with a countdown', resendSoon.status === 429 && resendSoon.data.resendIn > 0, resendSoon.data);
  const good = await a.post('/api/auth/otp/verify', { purpose: 'verify-phone', challengeId: r1.data.challengeId, code: s1.code });
  ok('the right code confirms the number', good.status === 200 && dbKey('acad_users_v3').find(u => u.email === email)?.phoneVerified === true, good.data);
  ok('a used code cannot be reused', (await a.post('/api/auth/otp/verify', { purpose: 'verify-phone', challengeId: r1.data.challengeId, code: s1.code })).status === 400);

  // ---------- account security page data ----------
  const sec = await a.get('/api/account/security');
  ok('security page lists methods and this session (no secrets)', sec.status === 200 && sec.data.phoneVerified && sec.data.hasPassword && sec.data.sessions.some(s => s.current) && !JSON.stringify(sec.data).includes('passwordHash'), sec.data);

  // ---------- application confirmation (only after the application is saved) ----------
  const snap = await a.get('/api/data');
  const prof = snap.data?.data?.acad_candidate_profiles_v3?.[me.id];
  if (prof) {
    await a.post('/api/rpc', { method: 'updateCandidateProfile', args: [{ ...prof, phone, highestDegree: 'Ph.D. in Computer Science' }] });
    const ap = await a.post('/api/rpc', { method: 'applyToJob', args: [job.id, []] });
    ok('a confirmed candidate can apply', ap.status === 200 && ap.data.ok && ap.data.result?.success, ap.data);
    const conf = await lastMail(email, /Application Submitted Successfully/);
    ok('application confirmation emailed with job title and reference', !!conf && conf.subject.includes(job.title.slice(0, 20)) && /app-/.test(conf.text || ''), conf?.subject);
    const dup = await a.post('/api/rpc', { method: 'applyToJob', args: [job.id, []] });
    await sleep(800);
    const confirmations = (await mail(email)).filter(x => /Application Submitted Successfully/.test(x.subject)).length;
    ok('a duplicate application is refused and sends no second email', (dup.status >= 400 || dup.data.result?.success === false) && confirmations === 1, [dup.status, dup.data.result, confirmations]);
    const q = dbKey('_notify_queue') || [];
    const recruiterIds = new Set((dbKey('acad_users_v3') || []).filter(u => ['institute_admin', 'recruiter'].includes(u.role) && u.instituteId === job.instituteId).map(u => u.id));
    ok('recruiters of the institution get an application notification', !recruiterIds.size || q.some(x => x.kind === 'application-received' && recruiterIds.has(x.userId)), [...recruiterIds]);
  } else ok('candidate profile available for the application test', false, Object.keys(snap.data?.data || {}));

  // ---------- sign-in with SMS code ----------
  const b = client(`10.3.${T % 200}.3`, 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0');
  const unknown = await b.post('/api/auth/otp/request', { purpose: 'login', phone: `+9197${T}22`.slice(0, 13), country: 'IN' });
  const known = await b.post('/api/auth/otp/request', { purpose: 'login', phone, country: 'IN' });
  ok('same answer for unknown and known numbers (no account discovery)', unknown.status === 200 && known.status === 200 && Object.keys(unknown.data).sort().join() === Object.keys(known.data).sort().join(), [unknown.data, known.data]);
  ok('no SMS is sent to an unknown number', (await smsTo(`+9197${T}22`.slice(0, 13))).length === 0);
  const s2 = await lastSms(phone);
  ok('a fresh code was sent to the known number', s2 && s2.code && s2.at > s1.at);
  const decoyCode = await b.post('/api/auth/otp/verify', { purpose: 'login', challengeId: unknown.data.challengeId, code: s2.code });
  ok('the unknown-number challenge can never be verified', decoyCode.status === 400);
  const smsLogin = await b.post('/api/auth/otp/verify', { purpose: 'login', challengeId: known.data.challengeId, code: s2.code });
  ok('SMS code signs in', smsLogin.status === 200 && smsLogin.data.success && b.jar.has('acad_session'), smsLogin.data);
  ok('a new-device sign-in alert was emailed', !!(await lastMail(email, /New sign-in/i)));

  // expired code
  await sleep(200);
  const c3 = client(`10.4.${T % 200}.4`);
  const otpStore = JSON.parse(sql("select v from acx_kv where k='db:_otp'") || '{}');
  for (const ch of Object.values(otpStore)) { ch.createdAt -= 120_000; }
  const esc = JSON.stringify(otpStore).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  sql(`update acx_kv set v='${esc}' where k='db:_otp'; update acx_meta set version=version+1;`);
  const k3 = await c3.post('/api/auth/otp/request', { purpose: 'login', phone, country: 'IN' });
  const s3 = await lastSms(phone);
  const st = JSON.parse(sql("select v from acx_kv where k='db:_otp'") || '{}');
  if (st[k3.data.challengeId]) st[k3.data.challengeId].expiresAt = Date.now() - 1000;
  sql(`update acx_kv set v='${JSON.stringify(st).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' where k='db:_otp'; update acx_meta set version=version+1;`);
  const exp = await c3.post('/api/auth/otp/verify', { purpose: 'login', challengeId: k3.data.challengeId, code: s3?.code });
  ok('an expired code is refused', k3.status === 200 && exp.status === 400 && /expired/i.test(exp.data.error || ''), [k3.data, exp.data]);

  // ---------- password sign-in, enumeration and limits ----------
  const d = client(`10.5.${T % 200}.5`);
  const w1 = await d.post('/api/auth/login', { email, password: 'Wrong-pass-1' });
  const w2 = await d.post('/api/auth/login', { email: `nobody${T}@example.com`, password: 'Wrong-pass-1' });
  ok('wrong password and unknown email give the same message', w1.status === 401 && w2.status === 401 && w1.data.error === w2.data.error, [w1.data, w2.data]);
  const csrf = await d.post('/api/auth/login', { email, password: pw }, { Origin: 'https://evil.example' });
  ok('cross-site sign-in requests are refused', csrf.status === 403);
  const lim = client(`10.6.${T % 200}.6`);
  let last;
  for (let i = 0; i < 11; i++) last = await lim.post('/api/auth/login', { email: `limit${T}@example.com`, password: 'Wrong-pass-1' });
  ok('repeated wrong passwords are rate-limited', last.status === 429, last.status);
  const pwLogin = await d.post('/api/auth/login', { email, password: pw, remember: false });
  ok('email and password sign in', pwLogin.status === 200 && pwLogin.data.success, pwLogin.data);

  // ---------- forgot password by email ----------
  const e = client(`10.7.${T % 200}.7`);
  const f0 = await e.post('/api/auth/forgot', { email: `nobody${T}@example.com` });
  const f1 = await e.post('/api/auth/forgot', { email });
  ok('forgot-password answers the same for unknown and known emails', f0.status === 200 && f1.status === 200 && JSON.stringify(f0.data) === JSON.stringify(f1.data));
  ok('no email to an unknown address', (await mail(`nobody${T}@example.com`)).length === 0);
  const resetMail = await lastMail(email, /Password Reset Request/i);
  const resetUrl = linkIn(resetMail, '/reset-password');
  ok('reset email has a single-use link', !!resetUrl, resetMail?.subject);
  const weak = await e.post('/api/auth/reset', { token: tokenOf(resetUrl), password: '12345678' });
  ok('a weak new password is refused (link stays valid)', weak.status === 400 && !/expired/i.test(weak.data.error || ''), weak.data);
  const newPw = `Professor${T}y`;
  const rs = await e.post('/api/auth/reset', { token: tokenOf(resetUrl), password: newPw });
  ok('password reset succeeds', rs.status === 200, rs.data);
  ok('reset link cannot be used twice', (await e.post('/api/auth/reset', { token: tokenOf(resetUrl), password: `Another${T}z` })).status === 400);
  ok('reset signs out all existing sessions', (await a.get('/api/account/security')).status === 401 && (await b.get('/api/account/security')).status === 401);
  ok('"password changed" email sent', !!(await lastMail(email, /Password Has Been Changed/i)));
  ok('old password no longer works, new one does', (await e.post('/api/auth/login', { email, password: pw })).status === 401 && (await e.post('/api/auth/login', { email, password: newPw })).status === 200);

  // ---------- forgot password by SMS ----------
  sql(`update acx_kv set v='{}' where k='db:_otp'; update acx_meta set version=version+1;`); // skip the cooldown
  const f = client(`10.8.${T % 200}.8`);
  const rq = await f.post('/api/auth/otp/request', { purpose: 'reset', phone, country: 'IN' });
  const s4 = await lastSms(phone);
  const vr = await f.post('/api/auth/otp/verify', { purpose: 'reset', challengeId: rq.data.challengeId, code: s4?.code });
  ok('SMS recovery gives a short-lived reset authorisation (no password change yet)', vr.status === 200 && !!vr.data.resetToken && (await f.post('/api/auth/login', { email, password: newPw })).status === 200, vr.data);
  const pw3 = `Scholar${T}w`;
  const rs2 = await f.post('/api/auth/reset', { token: vr.data.resetToken, password: pw3, via: 'phone' });
  ok('SMS recovery sets the new password', rs2.status === 200 && (await f.post('/api/auth/login', { email, password: pw3 })).status === 200, rs2.data);
  ok('the SMS reset authorisation is single-use', (await f.post('/api/auth/reset', { token: vr.data.resetToken, password: `Again${T}q`, via: 'phone' })).status === 400);

  // ---------- Google sign-in ----------
  const g = client(`10.10.${T % 200}.10`);
  const gEmail = `google${T}@example.com`;
  await fetch(`${M}/_identity`, { method: 'POST', body: JSON.stringify({ identity: { sub: `g-${T}`, email: gEmail, email_verified: true, name: 'Google Person' } }) });
  const start = await g.get('/api/auth/oauth/google/start?next=//evil.example/x');
  const authUrl = start.location ? new URL(start.location) : null;
  ok('Google sign-in starts with PKCE S256, state and nonce', authUrl && authUrl.searchParams.get('code_challenge_method') === 'S256' && authUrl.searchParams.get('state') && authUrl.searchParams.get('nonce') && authUrl.searchParams.get('scope') === 'openid email profile', start.location);
  const done = await g.follow(start.location);
  ok('Google sign-up creates a candidate account and signs in (open redirect ignored)', new URL(done.url).pathname === '/candidate/profile' && g.jar.has('acad_session'), done.url);
  const gu = dbKey('acad_users_v3').find(u => u.email === gEmail);
  ok('identity stored by provider subject, no password', gu && gu.identities?.[0]?.subject === `g-${T}` && gu.hasPassword === false && gu.emailVerified === true, gu);
  ok('social welcome email sent', !!(await lastMail(gEmail, /Welcome/i)));
  const g2 = client(`10.11.${T % 200}.11`);
  const again = await g2.follow((await g2.get('/api/auth/oauth/google/start')).location);
  ok('the same Google account signs in to the same AcadeXMatch account', new URL(again.url).searchParams.get('oauth') === 'ok' && dbKey('acad_users_v3').filter(u => u.email === gEmail).length === 1, again.url);
  // state tampering
  const g3 = client(`10.12.${T % 200}.12`);
  const st3 = await g3.get('/api/auth/oauth/google/start');
  const au3 = new URL(st3.location);
  const cb = await g3.get(`/api/auth/oauth/google/callback?code=abc&state=${au3.searchParams.get('state')}x`);
  ok('a callback with the wrong state is refused', /oauth_error=state/.test(cb.location || ''), cb.location);
  // existing email must not be merged
  const g4 = client(`10.13.${T % 200}.13`);
  await fetch(`${M}/_identity`, { method: 'POST', body: JSON.stringify({ identity: { sub: `g2-${T}`, email, email_verified: true, name: 'Same Email' } }) });
  const merged = await g4.follow((await g4.get('/api/auth/oauth/google/start')).location);
  ok('Google account with an existing email is NOT merged automatically', /oauth_error=exists/.test(merged.url) && !dbKey('acad_users_v3').find(u => u.email === email).identities?.length, merged.url);
  // wrong audience
  const g5 = client(`10.14.${T % 200}.14`);
  await fetch(`${M}/_identity`, { method: 'POST', body: JSON.stringify({ identity: { sub: `g3-${T}`, email: `aud${T}@example.com`, email_verified: true }, overrides: { aud: 'someone-else' } }) });
  const aud = await g5.follow((await g5.get('/api/auth/oauth/google/start')).location);
  ok('an ID token for another app (wrong audience) is refused', /oauth_error=provider/.test(aud.url) && !dbKey('acad_users_v3').find(u => u.email === `aud${T}@example.com`), aud.url);
  // linking from a signed-in password account
  await fetch(`${M}/_identity`, { method: 'POST', body: JSON.stringify({ identity: { sub: `g2-${T}`, email, email_verified: true, name: 'Same Email' }, overrides: {} }) });
  const h = client(`10.15.${T % 200}.15`);
  await h.post('/api/auth/login', { email, password: pw3 });
  const link = await h.follow((await h.get('/api/auth/oauth/google/start?mode=link')).location);
  const linkedNow = dbKey('acad_users_v3').find(u => u.email === email);
  ok('a signed-in user can link Google', /linked=google/.test(link.url) && linkedNow.identities?.some(i => i.subject === `g2-${T}`), link.url);
  ok('"sign-in added" security email sent', !!(await lastMail(email, /sign-in added/i)));
  const unlinkSocialOnly = await g.post('/api/account/identities', { action: 'unlink', provider: 'google' });
  ok('a Google-only account cannot remove its only sign-in method', unlinkSocialOnly.status === 400, unlinkSocialOnly.data);
  ok('forgot-password for a Google-only account sends guidance, not a reset link', (await anon.post('/api/auth/forgot', { email: gEmail })).status === 200 && !!(await lastMail(gEmail, /Signing in to AcadeXMatch/i)));

  // ---------- notification preferences, unsubscribe, history ----------
  const np = await h.get('/api/account/notifications');
  ok('notification settings load with defaults (marketing off)', np.status === 200 && np.data.prefs.applications === true && np.data.prefs.marketing === false, np.data.prefs);
  ok('history shows only own messages without bodies', np.data.history.length > 0 && np.data.history.every(x => !('html' in x) && !('text' in x) && !('to' in x)), np.data.history?.[0]);
  const save = await h.post('/api/account/notifications', { prefs: { jobAlerts: false, marketing: true, bogus: true } });
  ok('preferences are saved (unknown keys ignored)', save.status === 200 && save.data.prefs.jobAlerts === false && save.data.prefs.marketing === true && !('bogus' in save.data.prefs), save.data);
  const uid = dbKey('acad_users_v3').find(u => u.email === email).id;
  ok('unsubscribe with a forged signature is refused', (await anon.post('/api/unsubscribe', { u: uid, c: 'marketing', s: 'forged' })).status === 400);
  const anyOptional = (await mail(email)).find(x => x.headers?.['List-Unsubscribe']);
  ok('optional emails carry a one-click List-Unsubscribe header', !anyOptional || /\/api\/unsubscribe\?/.test(anyOptional.headers['List-Unsubscribe']));

  // ---------- email change ----------
  const newEmail = `moved${T}@example.com`;
  const ec = await h.post('/api/auth/email-change', { newEmail, password: pw3 });
  ok('email change needs confirmation from the new address', ec.status === 200 && dbKey('acad_users_v3').find(u => u.id === uid).email === email, ec.data);
  const ecMail = await lastMail(newEmail, /Confirm your new/i);
  const ecTok = tokenOf(linkIn(ecMail, '/verify-email'), 'change');
  ok('old address is told about the request', !!(await lastMail(email, /change of email address was requested/i)));
  const ecDone = await anon.post('/api/auth/email-change/confirm', { token: ecTok });
  ok('confirming the link changes the address', ecDone.status === 200 && dbKey('acad_users_v3').find(u => u.id === uid).email === newEmail, ecDone.data);

  // ---------- sessions ----------
  const s5 = client(`10.16.${T % 200}.16`);
  await s5.post('/api/auth/login', { email: newEmail, password: pw3 });
  const before = await h.get('/api/account/security');
  const others = await h.post('/api/account/security', { action: 'revoke-others' });
  ok('"sign out other devices" ends the other sessions only', others.status === 200 && others.data.revoked >= 1 && (await s5.get('/api/account/security')).status === 401 && (await h.get('/api/account/security')).status === 200, [before.data.sessions?.length, others.data]);
  const out = await h.post('/api/auth/logout', {});
  ok('logout ends the session', out.status === 200 && (await h.get('/api/account/security')).status === 401);

  // ---------- administrator extra step ----------
  const ad = client(`10.17.${T % 200}.17`);
  const adm = await ad.post('/api/auth/login', { email: 'admin@acadexmatch.in', password: 'Admin@12345' });
  ok('administrator sign-in asks for an emailed code', adm.status === 200 && adm.data.mfa?.challengeId && !ad.jar.has('acad_session'), adm.data);
  const admMail = await lastMail('admin@acadexmatch.in', /sign-in code/i);
  const admCode = (admMail?.text || '').match(/\b(\d{6})\b/)?.[1];
  const admOk = await ad.post('/api/auth/otp/verify', { purpose: 'admin-mfa', challengeId: adm.data.mfa?.challengeId, code: admCode });
  ok('administrator signs in after the emailed code', admOk.status === 200 && ad.jar.has('acad_session'), admOk.data);
  const sensitive = JSON.stringify(dbKey('_outbox') || []);
  ok('codes and sign-in links are not stored in the outbox', !sensitive.includes(admCode || 'zzzzzz') && !sensitive.includes(tokenOf(resetUrl) || 'zzzzzz'));

  // ---------- email provider outage: retry with backoff, no duplicates ----------
  const outageUser = `outage${T}@example.com`;
  await client(`10.18.${T % 200}.18`).post('/api/auth/register', { ...base, email: outageUser, phone: `+9196${T}33`.slice(0, 13) });
  await sleep(1000);
  await fetch(`${M}/_fail`, { method: 'POST', body: JSON.stringify({ count: 1, status: 503 }) });
  await anon.post('/api/auth/forgot', { email: outageUser });
  await sleep(800);
  let qi = (dbKey('_notify_queue') || []).find(x => x.kind === 'reset' && x.to === outageUser);
  ok('a failed send is kept for retry with a backoff (registration and request still succeed)', qi && qi.status === 'queued' && qi.attempts === 1 && qi.nextAt > Date.now() && /simulated/.test(qi.error || ''), qi);
  const qAll = dbKey('_notify_queue');
  for (const x of qAll) if (x.id === qi?.id) x.nextAt = 0;
  sql(`update acx_kv set v='${JSON.stringify(qAll).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' where k='db:_notify_queue'; update acx_meta set version=version+1;`);
  await anon.post('/api/auth/forgot', { email: `nobody2${T}@example.com` }); // any request that runs the worker
  await client(`10.19.${T % 200}.19`).post('/api/auth/register', { ...base, email: `kick${T}@example.com`, phone: `+9195${T}44`.slice(0, 13) });
  await sleep(1500);
  qi = (dbKey('_notify_queue') || []).find(x => x.id === qi?.id);
  ok('the retry delivers the message exactly once', qi?.status === 'sent' && (await mail(outageUser)).filter(x => /Password Reset/.test(x.subject)).length === 1, qi);
  await fetch(`${M}/_fail`, { method: 'POST', body: JSON.stringify({ count: 1, status: 422 }) });
  await anon.post('/api/auth/forgot', { email: email === newEmail ? email : newEmail });
  await sleep(800);
  const perm = (dbKey('_notify_queue') || []).filter(x => x.kind === 'reset' && x.to === newEmail)[0];
  ok('a permanent provider error (4xx) is not retried and its content is dropped', perm?.status === 'failed' && !perm.html && !perm.text, perm);

  // ---------- email provider webhooks ----------
  ok('webhook without the secret is refused', (await anon.post('/api/email-events', { type: 'email.bounced', data: { to: ['x@y.z'] } })).status === 401);
  const bounce = await anon.post(`/api/email-events?key=${process.env.EMAIL_WEBHOOK_SECRET || ''}`, { type: 'email.bounced', data: { email_id: 'none', to: [`bounce${T}@example.com`] } });
  ok('bounce webhook suppresses the address', bounce.status === 200 && JSON.stringify(dbKey('_email_suppressed') || {}).includes(`bounce${T}@example.com`), bounce.data);

  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} auth and notification checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
