import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import {
  MessageError, adminMarkRead, adminReply, adminSetStatus, adminStart, allThreads, summary, threadById, unreadForAdmin, type Thread,
} from '@/lib/server/messages';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/** Messages with every user, for the platform administrator only (checked on every request). */
async function denied(req: NextRequest): Promise<NextResponse | null> {
  if (req.method !== 'GET' && !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return requireAdmin(req);
}

async function users(): Promise<UserAccount[]> {
  return withDb(null, db => ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => u.role !== 'super_admin'));
}

/**
 * GET                → list of conversations (summaries) and the unread total
 * GET ?count=1       → unread total only (for the tab badge)
 * GET ?thread=<id>   → one conversation with all its messages
 * GET ?users=<text>  → up to 20 users matching a name or email, to start a conversation
 */
export async function GET(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  const q = req.nextUrl.searchParams;
  if (q.get('count')) return NextResponse.json({ unread: await unreadForAdmin() }, { headers: noStore });
  const id = q.get('thread');
  if (id) {
    const t = await threadById(id);
    return t ? NextResponse.json({ thread: t }, { headers: noStore }) : NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  const find = q.get('users');
  if (find !== null) {
    const term = find.trim().toLowerCase();
    const list = (await users())
      .filter(u => !term || `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(term))
      .slice(0, 20)
      .map(u => ({ id: u.id, name: u.name || u.email, email: u.email, role: u.role }));
    return NextResponse.json({ users: list }, { headers: noStore });
  }
  const threads = await allThreads();
  return NextResponse.json({ threads: threads.map(summary), unread: threads.reduce((n, t) => n + t.unreadAdmin, 0) }, { headers: noStore });
}

type Body =
  | { action: 'reply'; threadId: string; body: string }
  | { action: 'read'; threadId: string }
  | { action: 'status'; threadId: string; status: 'open' | 'closed' }
  | { action: 'start'; userId: string; subject: string; body: string };

export async function POST(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  const b = await req.json().catch(() => null) as Body | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    let t: Thread | null;
    switch (b.action) {
      case 'reply':
        t = await adminReply(b.threadId, b.body);
        break;
      case 'read':
        t = await adminMarkRead(b.threadId);
        if (!t) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
        break;
      case 'status':
        t = await adminSetStatus(b.threadId, b.status);
        break;
      case 'start': {
        const u = (await users()).find(x => x.id === b.userId);
        if (!u) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
        t = await adminStart({ id: u.id, name: u.name || u.email, email: u.email, role: u.role }, b.subject, b.body);
        break;
      }
      default:
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    return NextResponse.json({ thread: t });
  } catch (e) {
    if (e instanceof MessageError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[AcadeXMatch] Admin messages error', (e as Error).message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
