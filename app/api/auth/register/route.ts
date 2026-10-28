import { NextRequest, NextResponse } from 'next/server';
import { StorageService, RegisterInput } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { badOrigin, completeSignIn, notAllowed, tooMany } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { sendVerificationEmail } from '@/lib/server/authEmails';
import { normalisePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  if (!allow(`register:${clientIp(req)}`, 10, 60 * 60_000)) return tooMany('Too many sign-ups from this network. Please try again later.');
  const body = (await req.json().catch(() => ({}))) as Partial<RegisterInput> & { country?: string };
  if (body.termsAccepted !== true) return NextResponse.json({ success: false, error: 'Please accept the Terms of Service and Privacy Policy.' }, { status: 400 });
  const phone = normalisePhone(String(body.phone || ''), (body.country as 'IN') || 'IN');
  if (!phone.ok) return NextResponse.json({ success: false, error: phone.error }, { status: 400 });
  // Public sign-up may create candidate and institution accounts only.
  const role = body.role === 'institute_admin' ? 'institute_admin' : 'candidate';
  const input: RegisterInput = {
    name: String(body.name || '').slice(0, 120),
    email: String(body.email || '').slice(0, 254),
    password: String(body.password || '').slice(0, 256),
    role,
    phone: phone.e164,
    termsAccepted: true,
    marketingConsent: body.marketingConsent === true,
    instituteId: role === 'institute_admin' && body.instituteId ? String(body.instituteId) : undefined,
    newInstitute: role === 'institute_admin' && body.newInstitute ? {
      name: String(body.newInstitute.name || ''), aisheCode: String(body.newInstitute.aisheCode || ''),
      city: String(body.newInstitute.city || ''), state: String(body.newInstitute.state || ''),
      website: body.newInstitute.website ? String(body.newInstitute.website) : undefined,
    } : undefined,
  };
  const result = await withDb(null, () => StorageService.register(input));
  if (!result.success) return NextResponse.json(result, { status: 400 });
  // The account is saved first; the email is queued and retried, so sign-up never depends on it.
  await sendVerificationEmail({ ...result.user, emailVerified: false }, req.nextUrl.origin, { welcome: true }).catch(() => undefined);
  return completeSignIn(req, result.user.id, 'new account', true);
}
