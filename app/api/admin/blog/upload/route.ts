import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { BlogError, MAX_PDF_BYTES, storeFile } from '@/lib/server/blog';
import { fileUrl } from '@/lib/blog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upload a cover image, an inline image or a PDF for a post (admin only). Multipart field "file". */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const no = await requireAdmin(req);
  if (no) return no;
  const form = await req.formData().catch(() => null);
  const f = form?.get('file');
  if (!f || typeof f === 'string') return NextResponse.json({ error: 'Choose a file.' }, { status: 400 });
  if (f.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'File is too large (PDF up to 10 MB, images up to 2 MB).' }, { status: 413 });
  try {
    const r = await storeFile(Buffer.from(await f.arrayBuffer()));
    return NextResponse.json({ ...r, url: fileUrl(r.file), name: f.name });
  } catch (e) {
    if (e instanceof BlogError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[AcadeXMatch] Blog upload error', (e as Error).message);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
