import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { OUTREACH_IMAGE_MAX, saveOutreachImage } from '@/lib/server/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator: upload an image (multipart "file") for a campaign email. Returns its public link. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose an image file.' }, { status: 400 });
  if (file.size > OUTREACH_IMAGE_MAX) return NextResponse.json({ error: 'The image is larger than 2 MB. Make it smaller (for example 1200 pixels wide) and upload again.' }, { status: 400 });
  try {
    return NextResponse.json(await saveOutreachImage(Buffer.from(await file.arrayBuffer())));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
