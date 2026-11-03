import { NextRequest, NextResponse } from 'next/server';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { allow, clientIp } from '@/lib/server/security';
import { putBlob, deleteBlob } from '@/lib/server/persist';
import { setPoster } from '@/lib/server/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 3 * 1024 * 1024;

/** Image type from the file's first bytes (the browser's stated type is not trusted). */
function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Upload (file) or remove (remove=1) the poster of the signed-in user's listing; the administrator may do any. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!allow(`poster:${userId}:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: 'Too many uploads. Please wait a minute.' }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const eventId = String(form?.get('eventId') || '');
  if (!eventId) return NextResponse.json({ error: 'Listing not found.' }, { status: 400 });

  if (form?.get('remove') === '1') {
    const r = await setPoster(userId, eventId, null);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.previous) await deleteBlob(r.previous).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The poster must be 3 MB or smaller.' }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return NextResponse.json({ error: 'The poster must be a JPG, PNG or WebP image.' }, { status: 400 });

  const blobId = `event-posters/${eventId.replace(/[^A-Za-z0-9_-]/g, '')}-${Date.now().toString(36)}`;
  await putBlob(blobId, mime, bytes);
  const r = await setPoster(userId, eventId, blobId);
  if (!r.ok) { await deleteBlob(blobId).catch(() => undefined); return NextResponse.json({ error: r.error }, { status: r.status }); }
  if (r.previous) await deleteBlob(r.previous).catch(() => undefined);
  return NextResponse.json({ ok: true, posterId: blobId });
}
