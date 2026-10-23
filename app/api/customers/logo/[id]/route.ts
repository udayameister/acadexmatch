import { NextRequest, NextResponse } from 'next/server';
import { listCustomers, logoBlobId } from '@/lib/server/customers';
import { getBlob } from '@/lib/server/persist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = (await listCustomers()).find(x => x.id === id);
  if (!c) return new NextResponse('Not found', { status: 404 });
  try {
    const bytes = await getBlob(logoBlobId(c.logoFile));
    if (!bytes) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': c.mimeType,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
