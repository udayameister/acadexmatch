import { NextRequest, NextResponse } from 'next/server';
import { withDb, accountOf, canViewDocuments, DOCUMENTS_KEY, docBlobId, StoredDocument } from '@/lib/server/db';
import { getBlob } from '@/lib/server/persist';
import { currentUserId } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serves a document file to people allowed to see it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentUserId(req);
  const doc = await withDb(me, db => {
    const d = ((db[DOCUMENTS_KEY] as StoredDocument[]) || []).find(x => x.id === id);
    return d && canViewDocuments(db, accountOf(db, me), d.userId) ? d : null;
  });
  if (!doc) return new NextResponse('Not found', { status: 404 });
  try {
    const bytes = await getBlob(docBlobId(doc.userId, doc.file));
    if (!bytes) return new NextResponse('Not found', { status: 404 });
    const download = req.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName.replace(/["\r\n]/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
