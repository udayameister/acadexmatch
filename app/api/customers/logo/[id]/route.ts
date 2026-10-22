import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { listCustomers, LOGO_DIR } from '@/lib/server/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = (await listCustomers()).find(x => x.id === id);
  if (!c) return new NextResponse('Not found', { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(LOGO_DIR, path.basename(c.logoFile)));
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
