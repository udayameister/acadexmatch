import { NextRequest, NextResponse } from 'next/server';
import { allow, clientIp } from '@/lib/server/security';
import { getAishe, searchAishe } from '@/lib/server/aishe';
import type { AisheRecord } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public AISHE directory fields (published government data). */
const pub = (r: AisheRecord) => ({
  code: r.code, name: r.name, category: r.category, university: r.university, type: r.type,
  state: r.state, district: r.district, status: r.status, website: r.website,
});

/** Institution look-up for the sign-up form: ?q=name or code (&state=), or ?code= for one entry. */
export async function GET(req: NextRequest) {
  if (!allow(`aishe:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: 'Too many searches. Please wait a minute.' }, { status: 429 });
  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  if (code) {
    const rec = await getAishe(code.slice(0, 20));
    return NextResponse.json({ result: rec ? pub(rec) : null });
  }
  const q = (sp.get('q') || '').slice(0, 120);
  const results = await searchAishe(q, { state: (sp.get('state') || '').slice(0, 60) || undefined, limit: 8 });
  return NextResponse.json({ results: results.map(pub) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
