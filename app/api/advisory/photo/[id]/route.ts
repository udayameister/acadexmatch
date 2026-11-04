import { NextRequest, NextResponse } from 'next/server';
import { listAdvisors, photoBlobId } from '@/lib/server/advisory';
import { getBlob } from '@/lib/server/persist';
import { requireAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = (await listAdvisors()).find(x => x.id === id);
  // Hidden members' photos are only for the administrator.
  const a = found && (found.visible || !(await requireAdmin(req))) ? found : undefined;
  if (!a?.photoFile || !a.mimeType) return new NextResponse('Not found', { status: 404 });
  const bytes = await getBlob(photoBlobId(a.photoFile)).catch(() => null);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': a.mimeType, 'Cache-Control': a.visible ? 'public, max-age=86400' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
