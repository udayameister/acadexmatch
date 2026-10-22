import { NextRequest, NextResponse } from 'next/server';
import { addSource, getStore, isRunning, runPipeline, updateStore, todayIst, nowIstString, Audience } from '@/lib/server/scrapeQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin console only: the signed-in platform administrator's session is checked on every request.
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
async function allowed(req: NextRequest): Promise<boolean> {
  if (req.method !== 'GET' && !sameOrigin(req)) return false;
  return !(await requireAdmin(req));
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const s = await getStore();
  return NextResponse.json({ ...s, running: isRunning(), today: todayIst() }, { headers: { 'Cache-Control': 'no-store' } });
}

type Action =
  | { action: 'addSource'; name: string; url: string }
  | { action: 'updateSource'; id: string; name?: string; enabled?: boolean }
  | { action: 'removeSource'; id: string }
  | { action: 'addSources'; lines: string }
  | { action: 'updateSources'; ids: string[]; enabled: boolean }
  | { action: 'removeSources'; ids: string[] }
  | { action: 'run'; sourceId?: string }
  | { action: 'decide'; ids: string[]; status: 'approved' | 'rejected'; audience?: Audience }
  | { action: 'reopen'; ids: string[] }
  | { action: 'clearDecided' }
  | { action: 'settings'; dailyEnabled?: boolean; dailyTime?: string };

export async function POST(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  let body: Action;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  switch (body.action) {
    case 'addSource': {
      const r = await addSource(body.name || '', body.url || '');
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      break;
    }
    case 'addSources': {
      // One source per line: "College name | https://…" or just the URL.
      const lines = String(body.lines || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 200);
      let added = 0;
      const errors: string[] = [];
      for (const line of lines) {
        const parts = line.split('|').map(x => x.trim());
        const url = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        const name = parts.length > 1 ? parts.slice(0, -1).join(' | ') : '';
        const r = await addSource(name, url);
        if (r.ok) added++; else errors.push(`${url}: ${r.error}`);
      }
      const s2 = await getStore();
      return NextResponse.json({ ...s2, running: isRunning(), today: todayIst(), added, errors });
    }
    case 'updateSources':
      await updateStore(s => {
        const ids = new Set(body.ids || []);
        s.sources.forEach(src => { if (ids.has(src.id)) src.enabled = !!body.enabled; });
      });
      break;
    case 'removeSources':
      await updateStore(s => {
        const ids = new Set(body.ids || []);
        s.sources = s.sources.filter(x => !ids.has(x.id));
        s.queue = s.queue.filter(q => !(ids.has(q.sourceId) && q.status === 'pending'));
      });
      break;
    case 'updateSource':
      await updateStore(s => {
        const src = s.sources.find(x => x.id === body.id);
        if (!src) return;
        if (typeof body.name === 'string' && body.name.trim()) src.name = body.name.trim();
        if (typeof body.enabled === 'boolean') src.enabled = body.enabled;
      });
      break;
    case 'removeSource':
      await updateStore(s => {
        s.sources = s.sources.filter(x => x.id !== body.id);
        s.queue = s.queue.filter(q => !(q.sourceId === body.id && q.status === 'pending'));
      });
      break;
    case 'run': {
      if (isRunning()) return NextResponse.json({ error: 'A scrape is already running.' }, { status: 409 });
      // Start in the background; the console polls for progress.
      runPipeline('manual', body.sourceId).catch(err => console.error('[AcadeXMatch] Scrape failed', err));
      break;
    }
    case 'decide':
      await updateStore(s => {
        const ids = new Set(body.ids || []);
        for (const q of s.queue) {
          if (!ids.has(q.id)) continue;
          q.status = body.status;
          q.decidedAt = nowIstString();
          q.audience = body.status === 'approved' ? (body.audience || 'all') : undefined;
        }
      });
      break;
    case 'reopen':
      await updateStore(s => {
        const ids = new Set(body.ids || []);
        for (const q of s.queue) if (ids.has(q.id)) { q.status = 'pending'; q.decidedAt = undefined; q.audience = undefined; }
      });
      break;
    case 'clearDecided':
      await updateStore(s => { s.queue = s.queue.filter(q => q.status === 'pending'); });
      break;
    case 'settings':
      await updateStore(s => {
        if (typeof body.dailyEnabled === 'boolean') s.settings.dailyEnabled = body.dailyEnabled;
        if (typeof body.dailyTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.dailyTime)) {
          if (body.dailyTime !== s.settings.dailyTime) s.settings.lastDailyRunDate = undefined;
          s.settings.dailyTime = body.dailyTime;
        }
      });
      break;
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const s = await getStore();
  return NextResponse.json({ ...s, running: isRunning(), today: todayIst() });
}
