import { NextRequest, NextResponse } from 'next/server';
import { STORAGE_KEYS, StorageService } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { currentUserId, requireAdmin, sameOrigin } from '@/lib/server/auth';
import type { UserAccount } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Rec = Record<string, unknown> & { id?: string; email?: string };

/**
 * Imports data (a backup file, or the data an older version kept in a browser).
 * mode "merge" adds records that are not already on the server (matched by id; accounts also by email);
 * mode "replace" overwrites every collection in the backup.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const data = body?.data as Record<string, unknown> | undefined;
  const mode = body?.mode === 'replace' ? 'replace' : 'merge';
  if (!data || typeof data !== 'object') return NextResponse.json({ error: 'No data to import.' }, { status: 400 });
  const userId = await currentUserId(req);

  const summary = await withDb(userId, (db, c) => {
    if (mode === 'replace') return { restored: StorageService.importAllData(data) as number, added: {} as Record<string, number> };
    const added: Record<string, number> = {};
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      if (name === 'SESSION' || !(key in data)) continue;
      const incoming = data[key];
      const current = db[key];
      if (Array.isArray(incoming)) {
        const cur = (Array.isArray(current) ? current : []) as Rec[];
        const ids = new Set(cur.map(r => r.id));
        const emails = key === STORAGE_KEYS.USERS ? new Set((cur as unknown as UserAccount[]).map(u => u.email)) : null;
        const fresh = (incoming as Rec[]).filter(r => r && !ids.has(r.id) && !(emails && r.email && emails.has(String(r.email))));
        if (fresh.length) { c.set(key, [...cur, ...fresh]); added[name] = fresh.length; }
      } else if (incoming && typeof incoming === 'object' && key === STORAGE_KEYS.CANDIDATE_PROFILES) {
        const cur = (current || {}) as Record<string, unknown>;
        const fresh = Object.entries(incoming as Record<string, unknown>).filter(([id]) => !(id in cur));
        if (fresh.length) { c.set(key, { ...cur, ...Object.fromEntries(fresh) }); added[name] = fresh.length; }
      } else if (incoming && key === STORAGE_KEYS.PLAN_SETTINGS && !current) {
        c.set(key, incoming); added[name] = 1;
      }
    }
    StorageService.addAuditLog(`Imported data (merge): ${JSON.stringify(added)}`, 'import', 'AUTHENTICATION');
    return { restored: Object.keys(added).length, added };
  });
  return NextResponse.json({ ok: true, mode, ...summary });
}
