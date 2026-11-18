import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { BlogError, deletePost, listPosts, savePost, type PostInput } from '@/lib/server/blog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Blog management for the platform administrator only (checked on every request). */
async function denied(req: NextRequest) {
  if (req.method !== 'GET' && !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return requireAdmin(req);
}

export async function GET(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  return NextResponse.json({ posts: await listPosts() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  const b = await req.json().catch(() => null) as { action?: string; post?: PostInput; id?: string } | null;
  try {
    if (b?.action === 'save' && b.post && typeof b.post === 'object') return NextResponse.json({ post: await savePost(b.post) });
    if (b?.action === 'delete' && typeof b.id === 'string') {
      return (await deletePost(b.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  } catch (e) {
    if (e instanceof BlogError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[AcadeXMatch] Blog save error', (e as Error).message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
