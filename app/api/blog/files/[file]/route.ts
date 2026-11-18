import { NextRequest, NextResponse } from 'next/server';
import { listPosts, mimeOf, readFile } from '@/lib/server/blog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cover images, inline images and PDFs of blog posts. ?download=1 saves a PDF instead of opening it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  const mime = mimeOf(file);
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  if (mime === 'application/pdf') {
    const post = (await listPosts()).find(p => p.pdfFile === file);
    const name = (post?.pdfName || file).replace(/[^\w .()-]+/g, '').replace(/\.pdf$/i, '') + '.pdf';
    headers['Content-Disposition'] = `${req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${name}"`;
  }
  return new NextResponse(new Uint8Array(bytes), { headers });
}
