import { NextRequest, NextResponse } from 'next/server';
import { livePosts } from '@/lib/server/blog';
import { POST_TYPES, toCard } from '@/lib/blog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Published posts for cards (no article bodies). ?type=white_paper, ?limit=3 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 50));
  let list = await livePosts();
  if (type && POST_TYPES.some(t => t.id === type)) list = list.filter(p => p.type === type);
  return NextResponse.json({ posts: list.slice(0, limit).map(toCard) }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
