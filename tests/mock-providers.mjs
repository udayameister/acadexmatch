// Local stand-ins for the external providers, for automated tests only (never used in production):
//   MSG91 SMS API        → set MSG91_API_URL=http://127.0.0.1:3400
//   Resend email API     → set EMAIL_API=resend EMAIL_API_URL=http://127.0.0.1:3400
//   Google OpenID Connect → set GOOGLE_DISCOVERY_URL=http://127.0.0.1:3400/.well-known/openid-configuration
// The app still runs its real code paths (HTTP calls, PKCE, RS256 signature and claim checks).
// Inspect what was "sent": GET /_sms?to=+91…  GET /_mail?to=a@b.c   Choose the next Google user: POST /_identity
import http from 'node:http';
import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 3400);
const BASE = `http://127.0.0.1:${PORT}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', use: 'sig', alg: 'RS256' };
const sms = [], mail = [], codes = new Map();
let nextIdentity = { sub: 'google-sub-1', email: 'oidc.user@example.com', email_verified: true, name: 'OIDC Test User' };
let tokenOverrides = {};
let failNext = 0, failStatus = 500;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims) {
  const head = b64({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' });
  const body = b64(claims);
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => r(d)); });
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const body = req.method === 'POST' ? await readBody(req) : '';
  // MSG91 flow API
  if (u.pathname === '/api/v5/flow' && req.method === 'POST') {
    if (!req.headers.authkey) return json(res, 401, { type: 'error', message: 'no authkey' });
    const d = JSON.parse(body || '{}');
    for (const r of d.recipients || []) sms.push({ to: `+${r.mobiles}`, code: r.OTP || r[process.env.MSG91_OTP_VAR || 'OTP'], template: d.template_id, at: Date.now() });
    return json(res, 200, { type: 'success', message: 'queued' });
  }
  // Resend email API
  if (u.pathname === '/emails' && req.method === 'POST') {
    if (failNext > 0) { failNext--; return json(res, failStatus, { message: 'simulated provider outage' }); }
    const d = JSON.parse(body || '{}');
    const id = `mock-${randomBytes(6).toString('hex')}`;
    mail.push({ id, to: d.to?.[0], subject: d.subject, html: d.html, text: d.text, headers: d.headers || {}, at: Date.now() });
    return json(res, 200, { id });
  }
  if (u.pathname === '/_sms') return json(res, 200, sms.filter(m => !u.searchParams.get('to') || m.to === u.searchParams.get('to')));
  if (u.pathname === '/_mail') return json(res, 200, mail.filter(m => !u.searchParams.get('to') || m.to === u.searchParams.get('to')));
  if (u.pathname === '/_fail' && req.method === 'POST') { const d = JSON.parse(body || '{}'); failNext = Number(d.count || 0); failStatus = Number(d.status || 500); return json(res, 200, { ok: true }); }
  if (u.pathname === '/_identity' && req.method === 'POST') { const d = JSON.parse(body || '{}'); nextIdentity = d.identity || nextIdentity; tokenOverrides = d.overrides || {}; return json(res, 200, { ok: true }); }
  // OpenID Connect (Google-like)
  if (u.pathname === '/.well-known/openid-configuration') return json(res, 200, { issuer: 'https://accounts.google.com', authorization_endpoint: `${BASE}/authorize`, token_endpoint: `${BASE}/token`, jwks_uri: `${BASE}/jwks` });
  if (u.pathname === '/jwks') return json(res, 200, { keys: [jwk] });
  if (u.pathname === '/authorize') {
    const p = u.searchParams;
    if (p.get('code_challenge_method') !== 'S256' || !p.get('nonce') || !p.get('state')) return json(res, 400, { error: 'invalid_request' });
    const code = randomBytes(12).toString('hex');
    codes.set(code, { nonce: p.get('nonce'), challenge: p.get('code_challenge'), clientId: p.get('client_id'), redirect: p.get('redirect_uri'), identity: nextIdentity, overrides: tokenOverrides });
    const back = new URL(p.get('redirect_uri'));
    back.searchParams.set('code', code); back.searchParams.set('state', p.get('state'));
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (u.pathname === '/token' && req.method === 'POST') {
    const p = new URLSearchParams(body);
    const c = codes.get(p.get('code'));
    codes.delete(p.get('code'));
    if (!c) return json(res, 400, { error: 'invalid_grant' });
    if (createHash('sha256').update(p.get('code_verifier') || '').digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE' });
    if (p.get('redirect_uri') !== c.redirect || p.get('client_id') !== c.clientId) return json(res, 400, { error: 'invalid_grant' });
    const now = Math.floor(Date.now() / 1000);
    return json(res, 200, { id_token: idToken({ iss: 'https://accounts.google.com', aud: c.clientId, iat: now, exp: now + 300, nonce: c.nonce, ...c.identity, ...c.overrides }), token_type: 'Bearer' });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`mock providers on ${BASE}`));
