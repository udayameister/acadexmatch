import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/server/auth';
import { getDraft, recordDocxExport } from '@/lib/server/resumes';
import { builderDocx } from '@/lib/server/docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Download one of the user's own builder drafts as an ATS-friendly Word file. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const d = await getDraft(userId, req.nextUrl.searchParams.get('id') || '');
  if (!d) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  const bytes = builderDocx(d.data, d.template);
  await recordDocxExport();
  const name = `${(d.data.fullName || d.label || 'Resume').replace(/[^\w -]/g, '').trim().replace(/\s+/g, '_') || 'Resume'}_Resume.docx`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
