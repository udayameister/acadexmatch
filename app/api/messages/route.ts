import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb, accountOf } from '@/lib/server/db';
import { badOrigin, currentUserId, notAllowed } from '@/lib/server/auth';
import { allow } from '@/lib/server/security';
import { notify } from '@/lib/server/notifications';
import { appUrl } from '@/lib/server/mailer';
import {
  MessageError, threadsForUser, unreadForUser, userMarkRead, userReply, userStart, type Thread, type Who,
} from '@/lib/server/messages';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { candidate: 'Candidate', institute_admin: 'Institution', recruiter: 'Recruiter', super_admin: 'Administrator' };
const noStore = { 'Cache-Control': 'no-store' };

async function me(req: NextRequest): Promise<Who | null> {
  const id = await currentUserId(req);
  if (!id) return null;
  const u = await withDb(id, db => accountOf(db, id));
  return u ? { id: u.id, name: u.name || u.email, email: u.email, role: u.role } : null;
}

/** Shape sent to the user: their own conversations only, without the admin-side counters. */
function forUser(t: Thread) {
  const { unreadAdmin: _a, userEmail: _e, ...rest } = t;
  return rest;
}

/** The signed-in user's conversations with the AcadeXMatch team (or just the unread count with ?count=1). */
export async function GET(req: NextRequest) {
  const who = await me(req);
  if (!who) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401, headers: noStore });
  if (req.nextUrl.searchParams.get('count')) return NextResponse.json({ ok: true, unread: await unreadForUser(who.id) }, { headers: noStore });
  const threads = await threadsForUser(who.id);
  return NextResponse.json({ ok: true, threads: threads.map(forUser), unread: threads.reduce((n, t) => n + t.unreadUser, 0) }, { headers: noStore });
}

/** Emails the platform administrator(s) when a conversation gets its first unread message (not for every message). */
async function tellAdmins(t: Thread, who: Who) {
  if (t.unreadAdmin !== 1) return;
  const admins = await withDb(null, db => ((db[STORAGE_KEYS.USERS] as UserAccount[]) || []).filter(u => u.role === 'super_admin' && u.email));
  const last = t.messages[t.messages.length - 1];
  for (const a of admins) {
    await notify({
      key: `msg-admin:${last.id}:${a.id}`, category: 'account', kind: 'message_to_admin', user: a,
      subject: `New message from ${who.name}: ${t.subject}`,
      heading: 'New message in the admin console',
      paragraphs: [`${who.name} (${ROLE_LABEL[who.role] || who.role}, ${who.email}) wrote about “${t.subject}”.`, 'Open the Messages tab in the admin console to read and reply.'],
      button: { label: 'Open messages', url: `${appUrl()}/admin?tab=messages&thread=${encodeURIComponent(t.id)}` },
      ref: { label: t.subject },
    }).catch(() => undefined);
  }
}

type Body = { action: 'start'; subject: string; body: string } | { action: 'reply'; threadId: string; body: string } | { action: 'read'; threadId: string };

export async function POST(req: NextRequest) {
  if (badOrigin(req)) return notAllowed();
  const who = await me(req);
  if (!who) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  const b = await req.json().catch(() => null) as Body | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  try {
    if (b.action === 'read') {
      const t = await userMarkRead(who.id, b.threadId);
      return t ? NextResponse.json({ ok: true, thread: forUser(t) }) : NextResponse.json({ ok: false, error: 'Conversation not found.' }, { status: 404 });
    }
    if (b.action !== 'start' && b.action !== 'reply') return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
    if (!allow(`messages:${who.id}`, 30, 60 * 60_000)) return NextResponse.json({ ok: false, error: 'You have sent many messages in the last hour. Please wait a little.' }, { status: 429 });
    const t = b.action === 'start' ? await userStart(who, b.subject, b.body) : await userReply(who, b.threadId, b.body);
    await tellAdmins(t, who);
    return NextResponse.json({ ok: true, thread: forUser(t) });
  } catch (e) {
    if (e instanceof MessageError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error('[AcadeXMatch] Messages error', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'Could not send your message. Please try again.' }, { status: 500 });
  }
}
