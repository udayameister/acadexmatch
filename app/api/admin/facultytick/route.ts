import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import {
  addFacultyTickLink, ftRunning, getFtStore, refreshCategories, runFacultyTick, todayIst, nowIst, updateFtStore,
  type FtStore,
} from '@/lib/server/facultytickEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** FacultyTick scraping, for the platform administrator only (checked on every request). */
async function denied(req: NextRequest): Promise<NextResponse | null> {
  if (req.method !== 'GET' && !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return requireAdmin(req);
}

function view(s: FtStore) {
  const { seen, ...rest } = s;
  return NextResponse.json({ ...rest, seenCount: seen.length, running: ftRunning(), today: todayIst() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  return view(await getFtStore());
}

type Body =
  | { action: 'run' }
  | { action: 'addLink'; url: string }
  | { action: 'decide'; ids: string[]; status: 'approved' | 'rejected' }
  | { action: 'reopen'; ids: string[] }
  | { action: 'edit'; id: string; title?: string; applicationDeadline?: string | null }
  | { action: 'clearDecided' }
  | { action: 'refreshCategories' }
  | { action: 'settings'; dailyEnabled?: boolean; dailyTime?: string; categories?: number[]; lookbackDays?: number; maxPosts?: number };

export async function POST(req: NextRequest) {
  const no = await denied(req);
  if (no) return no;
  const body = await req.json().catch(() => null) as Body | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const ids = (x: unknown) => new Set(Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string').slice(0, 500) : []);

  switch (body.action) {
    case 'run':
      if (ftRunning()) return NextResponse.json({ error: 'FacultyTick is already being read.' }, { status: 409 });
      runFacultyTick('manual').catch(err => console.error('[AcadeXMatch] FacultyTick run failed', err));
      break;
    case 'addLink': {
      const r = await addFacultyTickLink(String(body.url || '').slice(0, 600));
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      break;
    }
    case 'decide': {
      const set = ids(body.ids);
      if (body.status !== 'approved' && body.status !== 'rejected') return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
      await updateFtStore(s => {
        for (const q of s.queue) if (set.has(q.id)) { q.status = body.status; q.decidedAt = nowIst(); }
      });
      break;
    }
    case 'reopen': {
      const set = ids(body.ids);
      await updateFtStore(s => { for (const q of s.queue) if (set.has(q.id)) { q.status = 'pending'; q.decidedAt = undefined; } });
      break;
    }
    case 'edit': {
      const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, 200) : undefined;
      const date = body.applicationDeadline;
      if (date !== undefined && date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Enter the last date as a date.' }, { status: 400 });
      if (title !== undefined && title.length < 3) return NextResponse.json({ error: 'Enter a post name.' }, { status: 400 });
      await updateFtStore(s => {
        const q = s.queue.find(x => x.id === body.id && x.status === 'pending');
        if (!q) return;
        if (title !== undefined) q.job.title = title;
        if (date !== undefined) {
          q.job.applicationDeadline = date;
          if (q.job.details) q.job.details.deadlineEstimated = false;
          q.issues = q.issues.filter(i => !/^Last date (estimated|not found)|Last date has passed/.test(i));
        }
      });
      break;
    }
    case 'clearDecided':
      await updateFtStore(s => { s.queue = s.queue.filter(q => q.status === 'pending'); });
      break;
    case 'refreshCategories':
      try { await refreshCategories(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
      break;
    case 'settings':
      await updateFtStore(s => {
        if (typeof body.dailyEnabled === 'boolean') s.settings.dailyEnabled = body.dailyEnabled;
        if (typeof body.dailyTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.dailyTime)) {
          if (body.dailyTime !== s.settings.dailyTime) s.settings.lastDailyRunDate = undefined;
          s.settings.dailyTime = body.dailyTime;
        }
        if (Array.isArray(body.categories)) s.settings.categories = [...new Set(body.categories.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 50);
        if (Number.isFinite(body.lookbackDays)) s.settings.lookbackDays = Math.min(30, Math.max(1, Math.round(body.lookbackDays!)));
        if (Number.isFinite(body.maxPosts)) s.settings.maxPosts = Math.min(500, Math.max(10, Math.round(body.maxPosts!)));
      });
      break;
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  return view(await getFtStore());
}
