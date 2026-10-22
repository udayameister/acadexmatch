import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, tooManyAttempts } from '@/lib/server/auth';
import { fetchDoi, normaliseDoi, FoundPublication } from '@/lib/server/scholarly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ?doi=one or several DOIs separated by spaces, commas or new lines (up to 20). */
export async function GET(req: NextRequest) {
  const uid = await currentUserId(req);
  if (!uid) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (tooManyAttempts(`doi:${uid}`)) return NextResponse.json({ error: 'Too many lookups. Try again in a few minutes.' }, { status: 429 });
  const raw = (req.nextUrl.searchParams.get('doi') || '').split(/[\s,]+/).filter(Boolean);
  const dois = [...new Set(raw.map(normaliseDoi).filter((d): d is string => !!d))].slice(0, 20);
  if (dois.length === 0) return NextResponse.json({ error: 'Enter a DOI such as 10.1016/j.cell.2020.01.001' }, { status: 400 });
  const works: FoundPublication[] = [];
  const notFound: string[] = [];
  for (const doi of dois) {
    try {
      const w = await fetchDoi(doi);
      if (w) works.push(w); else notFound.push(doi);
    } catch {
      return NextResponse.json({ error: 'Could not reach Crossref. Please try again later.', works, notFound }, { status: 502 });
    }
  }
  return NextResponse.json({ works, notFound });
}
