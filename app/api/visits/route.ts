import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, sameOrigin } from '@/lib/server/auth';
import { promises as fs } from 'fs';
import path from 'path';

// Site-wide visit counter stored on the server in data/visits.json.
// One visit = one browser session (the client only posts once per session).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VisitStore {
  total: number;
  since: string;
  days: Record<string, number>;
}

const FILE = path.join(process.cwd(), 'data', 'visits.json');
let queue: Promise<unknown> = Promise.resolve();

function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function read(): Promise<VisitStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8')) as VisitStore;
    return { total: Number(parsed.total) || 0, since: parsed.since || todayIst(), days: parsed.days || {} };
  } catch {
    return { total: 0, since: todayIst(), days: {} };
  }
}

async function write(store: VisitStore): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // Keep the last 400 days of daily counts.
  const keys = Object.keys(store.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete store.days[k];
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8');
}

/** Serialises file updates so concurrent visits are not lost. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function summary(store: VisitStore, days = 0) {
  const today = todayIst();
  const series: { date: string; count: number }[] = [];
  for (let i = Math.min(400, Math.max(0, days)) - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    series.push({ date: d, count: store.days[d] || 0 });
  }
  const last7: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    last7.push({ date: d, count: store.days[d] || 0 });
  }
  return { total: store.total, today: store.days[today] || 0, since: store.since, last7, ...(days ? { series } : {}) };
}

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') || 0) || 0;
  return NextResponse.json(summary(await read(), days), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  const store = await locked(async () => {
    const s = await read();
    const today = todayIst();
    s.total += 1;
    s.days[today] = (s.days[today] || 0) + 1;
    await write(s);
    return s;
  });
  return NextResponse.json(summary(store), { headers: { 'Cache-Control': 'no-store' } });
}

/** Reset (used from the admin console). */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const store = await locked(async () => {
    const s: VisitStore = { total: 0, since: todayIst(), days: {} };
    await write(s);
    return s;
  });
  return NextResponse.json(summary(store));
}
