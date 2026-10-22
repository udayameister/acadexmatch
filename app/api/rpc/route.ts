import { NextRequest, NextResponse } from 'next/server';
import { runRpc } from '@/lib/server/db';
import { currentUserId, sameOrigin } from '@/lib/server/auth';
import { afterRpc } from '@/lib/server/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Performs one data action for the signed-in user; permissions are checked in lib/server/db.ts. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req) || req.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.method !== 'string' || !Array.isArray(body.args)) {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
  const userId = await currentUserId(req);
  const r = await runRpc(userId, body.method, body.args, body.seed);
  if (r.ok) afterRpc(body.method, body.args, userId, r.result).catch(() => undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : r.status });
}
