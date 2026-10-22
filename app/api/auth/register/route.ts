import { NextRequest, NextResponse } from 'next/server';
import { StorageService, RegisterInput } from '@/lib/storage';
import { withDb, createSession } from '@/lib/server/db';
import { setSessionCookie, sameOrigin } from '@/lib/server/auth';
import { sendVerificationEmail } from '@/lib/server/authEmails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, error: 'Not allowed' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Partial<RegisterInput>;
  // Public sign-up may create candidate and institution accounts only.
  const role = body.role === 'institute_admin' ? 'institute_admin' : 'candidate';
  const input: RegisterInput = {
    name: String(body.name || ''),
    email: String(body.email || ''),
    password: String(body.password || ''),
    role,
    instituteId: role === 'institute_admin' && body.instituteId ? String(body.instituteId) : undefined,
    newInstitute: role === 'institute_admin' && body.newInstitute ? {
      name: String(body.newInstitute.name || ''), aisheCode: String(body.newInstitute.aisheCode || ''),
      city: String(body.newInstitute.city || ''), state: String(body.newInstitute.state || ''),
      website: body.newInstitute.website ? String(body.newInstitute.website) : undefined,
    } : undefined,
  };
  const result = await withDb(null, () => StorageService.register(input));
  if (!result.success) return NextResponse.json(result, { status: 400 });
  await sendVerificationEmail(result.user, req.nextUrl.origin);
  const { token, maxAge } = await createSession(result.user.id);
  const res = NextResponse.json(result);
  setSessionCookie(res, req, token, maxAge);
  return res;
}
