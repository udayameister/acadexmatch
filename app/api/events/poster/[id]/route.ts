import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/server/auth';
import { getBlob } from '@/lib/server/persist';
import { posterFor } from '@/lib/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function typeOf(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  return 'image/webp';
}

/** An event's poster image: public while the listing is live; otherwise only for its organiser and the administrator. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await posterFor(await currentUserId(req), id);
  const bytes = found ? await getBlob(found.blobId) : null;
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': typeOf(bytes),
      // The address carries ?v=<poster id>, so a replaced poster gets a new address.
      'Cache-Control': found!.isPublic ? 'public, max-age=86400' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
