import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/server/auth';
import { getDraft } from '@/lib/server/resumes';
import { resumePdf } from '@/lib/server/resumePdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Download one of the user's own builder drafts as a text-based, ATS-friendly PDF. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const d = await getDraft(userId, req.nextUrl.searchParams.get('id') || '');
  if (!d) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  const bytes = await resumePdf(d.data, d.template, `${d.data.fullName || d.label} - Resume`);
  const name = `${(d.data.fullName || d.label || 'Resume').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '_') || 'Resume'}_Resume.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
