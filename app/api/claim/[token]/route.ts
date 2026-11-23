import { NextRequest, NextResponse } from 'next/server';
import { claimInfo, recordClaimClick } from '@/lib/server/claimOutreach';
import { allow, clientIp } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: the vacancies behind a claim link (signed token; no contact data). Counts the visit. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!allow(`claim:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const { token } = await params;
  const info = await claimInfo(token).catch(() => null);
  if (!info) return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 });
  if (req.nextUrl.searchParams.get('visit') === '1') await recordClaimClick(token).catch(() => undefined);
  return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } });
}
