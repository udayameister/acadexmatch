import { NextRequest, NextResponse } from 'next/server';
import { readOutreachImage } from '@/lib/server/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: images the administrator uploaded for outreach emails (shown in recipients' email apps). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const img = await readOutreachImage(file).catch(() => null);
  if (!img) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(img.bytes), {
    headers: { 'Content-Type': img.type, 'Content-Length': String(img.bytes.length), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" },
  });
}
