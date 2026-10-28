// Unit tests for sign-in security helpers. Run: npx tsx tests/auth-unit.ts
import { generateKeyPairSync, sign } from 'crypto';

process.env.GOOGLE_CLIENT_ID = 'unit-client';
process.env.GOOGLE_CLIENT_SECRET = 'unit-secret';
process.env.MICROSOFT_CLIENT_ID = 'ms-client';
process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret';
process.env.AUTH_SECRET = 'unit-test-secret-0123456789abcdefghij';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) { failed++; if (extra !== undefined) console.log('      got:', JSON.stringify(extra)); } };
const throws = async (fn: () => unknown | Promise<unknown>, re?: RegExp) => { try { await fn(); return false; } catch (e) { return !re || re.test((e as Error).message); } };

(async () => {
  const { checkClaims, verifyIdToken, encodeState, decodeState, configuredProviders } = await import('../lib/server/oidc');
  const { hashPasswordStrong, verifyPasswordStrong, keyedDigest, safeNext, randomDigits } = await import('../lib/server/security');
  const { normalisePhone, maskPhone } = await import('../lib/phone');
  const { passwordProblem } = await import('../lib/passwordPolicy');
  const { interviewStart } = await import('../lib/server/notify');

  // ---------- passwords ----------
  const h = await hashPasswordStrong('Correct horse 9');
  ok('scrypt hash verifies the right password', await verifyPasswordStrong('Correct horse 9', h));
  ok('scrypt hash rejects a wrong password', !(await verifyPasswordStrong('Correct horse 8', h)));
  ok('two hashes of the same password differ (salted)', h !== (await hashPasswordStrong('Correct horse 9')));
  ok('password policy: too short / common / letters+digits / email in password', !!passwordProblem('ab1') && !!passwordProblem('password123') && !!passwordProblem('onlyletters') && !!passwordProblem('priya2026x', { email: 'priya2026x@x.in' }) && passwordProblem('Lecturer2026x') === null);

  // ---------- OTP helpers ----------
  const codes = new Set(Array.from({ length: 200 }, () => randomDigits(6)));
  ok('codes are 6 digits and vary', [...codes].every(c => /^\d{6}$/.test(c)) && codes.size > 190);
  ok('keyed digest depends on the purpose (codes cannot be reused across challenges)', keyedDigest('123456', 'otp:a') !== keyedDigest('123456', 'otp:b'));

  // ---------- redirects and phones ----------
  ok('safeNext allows same-site paths only', safeNext('/candidate/profile') === '/candidate/profile' && safeNext('//evil.com') === null && safeNext('https://evil.com') === null && safeNext('/\\evil.com') === null);
  const p = normalisePhone('98765 43210', 'IN');
  ok('Indian mobile normalised to E.164', p.ok && p.e164 === '+919876543210', p);
  ok('invalid and landline-only numbers refused', !normalisePhone('12345', 'IN').ok && !normalisePhone('', 'IN').ok);
  ok('phone masked for messages', maskPhone('+919876543210').endsWith('210') && !maskPhone('+919876543210').includes('98765'));

  // ---------- OAuth state cookie ----------
  const st = { p: 'google' as const, state: 's1', nonce: 'n1', verifier: 'v1', next: null, mode: 'login' as const, t: Date.now() };
  const enc = encodeState(st);
  ok('signed state round-trips', decodeState(enc)?.state === 's1');
  ok('tampered state is rejected', decodeState(enc.replace(/^./, c => (c === 'a' ? 'b' : 'a'))) === null);
  ok('state older than 10 minutes is rejected', decodeState(encodeState({ ...st, t: Date.now() - 11 * 60_000 })) === null);
  ok('configured providers listed', JSON.stringify(configuredProviders()) === '["google","microsoft"]');

  // ---------- ID token claims ----------
  const now = Date.now(), sec = Math.floor(now / 1000);
  const g = { iss: 'https://accounts.google.com', aud: 'unit-client', exp: sec + 300, iat: sec, nonce: 'n1', sub: '123' };
  ok('valid Google claims pass', !(await throws(() => checkClaims('google', g, 'n1', now))));
  ok('wrong issuer fails', await throws(() => checkClaims('google', { ...g, iss: 'https://evil.example' }, 'n1', now), /issuer/));
  ok('wrong audience fails', await throws(() => checkClaims('google', { ...g, aud: 'other' }, 'n1', now), /audience/));
  ok('expired token fails', await throws(() => checkClaims('google', { ...g, exp: sec - 3600 }, 'n1', now), /expired/));
  ok('nonce mismatch fails', await throws(() => checkClaims('google', g, 'n2', now), /nonce/));
  ok('missing subject fails', await throws(() => checkClaims('google', { ...g, sub: '' }, 'n1', now), /subject/));
  const tid = '11111111-2222-3333-4444-555555555555';
  const ms = { iss: `https://login.microsoftonline.com/${tid}/v2.0`, tid, aud: 'ms-client', exp: sec + 300, iat: sec, nonce: 'n1', sub: 'abc' };
  ok('Microsoft: issuer must match the token tenant', !(await throws(() => checkClaims('microsoft', ms, 'n1', now))) && await throws(() => checkClaims('microsoft', { ...ms, iss: 'https://login.microsoftonline.com/99999999-2222-3333-4444-555555555555/v2.0' }, 'n1', now), /issuer/));
  process.env.MICROSOFT_TENANT = 'consumers';
  ok('Microsoft "consumers" refuses work accounts', await throws(() => checkClaims('microsoft', ms, 'n1', now), /issuer/));
  process.env.MICROSOFT_TENANT = 'common';

  // ---------- ID token signature (keys from a mocked provider) ----------
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const body = String(url).includes('openid-configuration') ? { authorization_endpoint: 'https://a', token_endpoint: 'https://t', jwks_uri: 'https://keys.example/jwks' } : { keys: [jwk] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const make = (claims: object, key = privateKey, header: object = { alg: 'RS256', kid: 'k1' }) => {
    const hp = `${b64(header)}.${b64(claims)}`;
    return `${hp}.${sign('RSA-SHA256', Buffer.from(hp), key).toString('base64url')}`;
  };
  ok('a correctly signed ID token is accepted', (await verifyIdToken('google', make(g), 'n1', now)).sub === '123');
  ok('a token signed with another key is refused', await throws(() => verifyIdToken('google', make(g, other.privateKey), 'n1', now), /signature/));
  ok('"alg: none" / HS256 tokens are refused', await throws(() => verifyIdToken('google', make(g, privateKey, { alg: 'HS256', kid: 'k1' }), 'n1', now), /algorithm/));
  ok('a token with a modified payload is refused', await throws(() => { const t = make(g).split('.'); return verifyIdToken('google', [t[0], b64({ ...g, sub: 'attacker' }), t[2]].join('.'), 'n1', now); }, /signature/));
  ok('an unknown key id is refused', await throws(() => verifyIdToken('google', make(g, privateKey, { alg: 'RS256', kid: 'nope' }), 'n1', now), /key/));
  globalThis.fetch = realFetch;

  // ---------- interview reminder times ----------
  ok('interview times are read in IST', interviewStart('2026-11-05', '10:30 AM IST') === Date.parse('2026-11-05T10:30:00+05:30') && interviewStart('2026-11-05', '2:15 pm') === Date.parse('2026-11-05T14:15:00+05:30') && interviewStart('2026-11-05', '12:00 AM') === Date.parse('2026-11-05T00:00:00+05:30'));
  ok('unreadable times give no reminder', interviewStart('2026-11-05', 'TBD') === null && interviewStart('soon', '10:00') === null);

  console.log(failed ? `\n${failed} AUTH UNIT TEST(S) FAILED` : '\nALL AUTH UNIT TESTS PASSED');
  process.exit(failed ? 1 : 0);
})();
