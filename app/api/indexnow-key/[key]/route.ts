import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Serves the IndexNow key file (/<INDEXNOW_KEY>.txt) so search engines can confirm site ownership. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const expected = process.env.INDEXNOW_KEY;
  if (!expected || key !== expected) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(expected, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
}
