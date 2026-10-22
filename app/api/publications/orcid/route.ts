import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, tooManyAttempts } from '@/lib/server/auth';
import { fetchOrcidWorks, normaliseOrcid } from '@/lib/server/scholarly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const uid = await currentUserId(req);
  if (!uid) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (tooManyAttempts(`orcid:${uid}`)) return NextResponse.json({ error: 'Too many lookups. Try again in a few minutes.' }, { status: 429 });
  const orcid = normaliseOrcid(req.nextUrl.searchParams.get('id') || '');
  if (!orcid) return NextResponse.json({ error: 'That is not a valid ORCID iD (format 0000-0002-1825-0097).' }, { status: 400 });
  try {
    const r = await fetchOrcidWorks(orcid);
    if (!r) return NextResponse.json({ error: 'No public ORCID record found for this iD.' }, { status: 404 });
    return NextResponse.json({ orcid, ...r });
  } catch {
    return NextResponse.json({ error: 'Could not reach ORCID. Please try again later.' }, { status: 502 });
  }
}
