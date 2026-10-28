import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb, createSession } from '@/lib/server/db';
import { currentUserId, setSessionCookie } from '@/lib/server/auth';
import { decodeState, finishFlow, isProvider, providerConfigured, STATE_COOKIE } from '@/lib/server/oidc';
import { allow, clientIp, deviceLabel, safeEqual } from '@/lib/server/security';
import { sendIdentityLinked, sendNewSignIn, sendSocialWelcome, sendVerificationEmail } from '@/lib/server/authEmails';
import { prefsOf } from '@/lib/server/notifications';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Return from Google/Microsoft. Rules:
 *  - an account already linked to this provider subject is signed in;
 *  - mode=link adds the identity to the signed-in account (if no other account uses it);
 *  - otherwise, if an account already has the same email, nothing is merged: the person must sign in
 *    the usual way and link the provider from Account → Security (proves they own both);
 *  - otherwise a new candidate account is created (institution accounts register with the form).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = req.nextUrl.origin;
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin));
    res.cookies.set(STATE_COOKIE, '', { path: '/api/auth/oauth', maxAge: 0 });
    return res;
  };
  if (!isProvider(provider) || !providerConfigured(provider)) return go('/login?oauth_error=unavailable');
  if (!allow(`oauth-cb:${clientIp(req)}`, 30, 15 * 60_000)) return go('/login?oauth_error=busy');
  const q = req.nextUrl.searchParams;
  if (q.get('error')) return go(`/login?oauth_error=${q.get('error') === 'access_denied' ? 'cancelled' : 'provider'}`);
  const st = decodeState(req.cookies.get(STATE_COOKIE)?.value);
  const code = q.get('code');
  if (!st || st.p !== provider || !code || !safeEqual(String(q.get('state') || ''), st.state)) return go('/login?oauth_error=state');

  let id;
  try {
    id = await finishFlow(provider, code, st, origin);
  } catch (e) {
    console.error(`[AcadeXMatch] ${provider} sign-in failed:`, (e as Error).message);
    return go('/login?oauth_error=provider');
  }
  const identity = { provider, subject: id.subject, ...(id.tenant ? { tenant: id.tenant } : {}), ...(id.email ? { email: id.email } : {}), linkedAt: new Date().toISOString() };

  // Link to the signed-in account.
  if (st.mode === 'link') {
    const me = await currentUserId(req);
    if (!me || me !== st.uid) return go('/login?oauth_error=signin');
    const r = await withDb(me, (db, c) => {
      const users = db[STORAGE_KEYS.USERS] as UserAccount[];
      if (users.some(u => u.id !== me && u.identities?.some(i => i.provider === provider && i.subject === id.subject))) return 'taken';
      const next = users.map(u => (u.id === me ? { ...u, identities: [...(u.identities || []).filter(i => i.provider !== provider), identity] } : u));
      c.set(STORAGE_KEYS.USERS, next);
      StorageService.addAuditLog(`Linked ${provider} sign-in`, me, 'AUTHENTICATION');
      return next.find(u => u.id === me)!;
    });
    if (r === 'taken') return go('/account?linked=taken#security');
    sendIdentityLinked(r, provider, true).catch(() => undefined);
    return go(`/account?linked=${provider}#security`);
  }

  // Sign in or sign up.
  const found = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.identities?.some(i => i.provider === provider && i.subject === id.subject)));
  let userId = found?.id;
  let created: UserAccount | undefined;
  if (!userId) {
    if (!id.email) return go('/login?oauth_error=noemail');
    const exists = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).some(u => u.email === id.email));
    if (exists) return go(`/login?oauth_error=exists&provider=${provider}`);
    const r = await withDb(null, () => StorageService.registerWithIdentity({ name: id.name, email: id.email!, emailVerified: id.emailVerified, identity }));
    if (!r.success) return go(`/login?oauth_error=${r.error === 'exists' ? 'exists' : 'provider'}&provider=${provider}`);
    userId = r.user.id;
    created = await withDb(null, db => (db[STORAGE_KEYS.USERS] as UserAccount[]).find(u => u.id === userId));
  }

  const device = deviceLabel(req.headers.get('user-agent'));
  const { token, maxAge, isNewDevice } = await createSession(userId!, { remember: true, device, ip: clientIp(req), method: provider === 'google' ? 'Google' : 'Microsoft' });
  await withDb(userId!, () => StorageService.addAuditLog(`Signed in (${provider})`, userId!, 'AUTHENTICATION'));
  if (created) {
    sendSocialWelcome(created, provider).catch(() => undefined);
    if (!created.emailVerified) sendVerificationEmail(created, origin).catch(() => undefined);
  } else if (found && isNewDevice && prefsOf(found).loginAlerts) {
    sendNewSignIn(found, device, provider === 'google' ? 'Google' : 'Microsoft').catch(() => undefined);
  }
  const res = go(st.next || (created ? '/candidate/profile?welcome=1' : '/login?oauth=ok'));
  setSessionCookie(res, req, token, maxAge);
  return res;
}
