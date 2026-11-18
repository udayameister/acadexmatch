import { NextResponse } from 'next/server';
import { getKey } from '@/lib/server/indexnow';

export const dynamic = 'force-dynamic';

/** Serves the IndexNow key file (/<key>.txt) so search engines can confirm that submissions come from this site. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const expected = await getKey();
  if (key !== expected) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(expected, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
}
