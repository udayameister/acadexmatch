import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/server/auth';
import { isProvider, providerConfigured, startFlow, STATE_COOKIE } from '@/lib/server/oidc';
import { allow, clientIp, publicOrigin, safeNext, sharedCookieDomain } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends the browser to Google/Microsoft. ?mode=link (signed in) adds the provider to the current account. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const origin = publicOrigin(req);
  const back = (code: string) => NextResponse.redirect(new URL(`/login?oauth_error=${code}`, origin));
  if (!isProvider(provider) || !providerConfigured(provider)) return back('unavailable');
  if (!allow(`oauth-start:${clientIp(req)}`, 30, 15 * 60_000)) return back('busy');
  const mode = req.nextUrl.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const uid = mode === 'link' ? await currentUserId(req) : null;
  if (mode === 'link' && !uid) return back('signin');
  try {
    const { url, cookie } = await startFlow(provider, { next: safeNext(req.nextUrl.searchParams.get('next')), mode, uid: uid || undefined, origin });
    const res = NextResponse.redirect(url);
    // Shared by acadexmatch.com and www.acadexmatch.com, so the callback finds it whichever host Google returns to.
    const domain = sharedCookieDomain(origin);
    res.cookies.set(STATE_COOKIE, cookie, { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path: '/api/auth/oauth', maxAge: 600, ...(domain ? { domain } : {}) });
    return res;
  } catch (e) {
    console.error(`[AcadeXMatch] ${provider} sign-in could not start:`, (e as Error).message);
    return back('provider');
  }
}
