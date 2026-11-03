import { NextRequest, NextResponse } from 'next/server';
import { badOrigin, currentUserId } from '@/lib/server/auth';
import { deleteAnalysis, getAnalysis } from '@/lib/server/resumes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One of the signed-in user's own analyses. Other users' ids simply are not found. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await getAnalysis(userId, (await params).id);
  if (!a) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { text: _text, ...rest } = a;
  return NextResponse.json({ analysis: rest }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (badOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const userId = await currentUserId(req);
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const ok = await deleteAnalysis(userId, (await params).id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}
