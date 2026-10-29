import type { RowDataPacket } from 'mysql2/promise';
import { backend, readJson, sqlPool, writeJson } from './persist';
import type { Rows } from './sheet';
import type { AisheRecord, InstitutionType } from '@/types';

/*
 * AISHE institution directory: the list of higher-education institutions published on the AISHE
 * portal (code, name, affiliating university, type, state, district, status).
 *
 *  - The platform administrator uploads the AISHE Excel/CSV export (Admin → Institute directory);
 *    rows are matched by AISHE code, so uploading a newer file updates existing rows and adds new ones.
 *    Rows are never deleted by an upload.
 *  - The institution sign-up form searches it as you type and fills in the details.
 *  - It is reference data only: institute accounts and their verification are kept separately.
 *
 * Storage: table acx_aishe in MySQL (viewable in phpMyAdmin); data/aishe.json in local development.
 */

export const AISHE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS acx_aishe (
  code VARCHAR(20) NOT NULL PRIMARY KEY,
  name VARCHAR(400) NOT NULL,
  category VARCHAR(60) NULL,
  university VARCHAR(400) NULL,
  inst_type VARCHAR(200) NULL,
  state VARCHAR(120) NULL,
  district VARCHAR(120) NULL,
  status VARCHAR(40) NULL,
  website VARCHAR(400) NULL,
  established VARCHAR(10) NULL,
  management VARCHAR(200) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_state (state),
  KEY idx_name (name(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const FIELDS = ['code', 'name', 'category', 'university', 'type', 'state', 'district', 'status', 'website', 'established', 'management'] as const;
type Field = typeof FIELDS[number];

/** Header spellings (lower-case letters and digits only) for each field. */
const HEADERS: Record<Field, string[]> = {
  code: ['aishecode', 'aishe', 'aisheid', 'code', 'aisheno', 'aishenumber'],
  name: ['institutename', 'nameoftheinstitute', 'nameofinstitute', 'institutionname', 'nameoftheinstitution', 'nameofinstitution', 'collegename', 'nameofthecollege', 'nameofcollege', 'name', 'universityname', 'nameoftheuniversity'],
  category: ['category', 'institutecategory'],
  university: ['nameofaffiliateduniversity', 'affiliateduniversity', 'nameoftheaffiliatinguniversity', 'affiliatinguniversity', 'university', 'universityaffiliated'],
  type: ['typeofinstitute', 'institutetype', 'typeofinstitution', 'institutiontype', 'type', 'universitytype', 'typeofuniversity', 'collegetype', 'typeofcollege'],
  state: ['state', 'statename', 'nameofstate'],
  district: ['district', 'districtname', 'nameofdistrict'],
  status: ['status'],
  website: ['website', 'websiteaddress', 'url', 'web'],
  established: ['yearofestablishment', 'establishmentyear', 'yearestablished', 'established'],
  management: ['management', 'managementtype', 'typeofmanagement', 'ownership'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Upper-case, "C16544" → "C-16544". Empty when the value is not an AISHE code. */
export function normaliseAisheCode(raw: string): string {
  const m = String(raw || '').trim().toUpperCase().match(/^([A-Z]{1,2})\s*[-–/ ]?\s*0*(\d{1,7})$/);
  return m ? `${m[1]}-${m[2]}` : '';
}

const clean = (s: string | undefined, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export interface ParseResult {
  records: AisheRecord[];
  /** Header row as found, and which field each column was used for. */
  columns: { header: string; field: Field | null }[];
  skipped: { row: number; reason: string }[];
  duplicates: number;
}

/** Turns spreadsheet rows (header row first; a title row above it is skipped) into directory records. */
export function parseAisheRows(rows: Rows): ParseResult {
  // The header is the first row (of the first 10) that has an AISHE-code and a name column.
  let headerAt = -1;
  let map: (Field | null)[] = [];
  for (let r = 0; r < Math.min(rows.length, 10) && headerAt < 0; r++) {
    const keys = rows[r].map(h => norm(h));
    const m: (Field | null)[] = keys.map(() => null);
    for (const f of FIELDS) {
      // Exact spelling first, then a looser "contains" match, each column used once.
      let i = keys.findIndex((k, j) => !m[j] && HEADERS[f].includes(k));
      if (i < 0 && f !== 'name' && f !== 'type') i = keys.findIndex((k, j) => !m[j] && k && HEADERS[f].some(h => h.length > 4 && k.includes(h)));
      if (i >= 0) m[i] = f;
    }
    if (m.includes('code') && m.includes('name')) { headerAt = r; map = m; }
  }
  if (headerAt < 0) throw new Error('Could not find the header row. The file needs at least the columns "AISHE Code" and "Institute Name".');

  const records = new Map<string, AisheRecord>();
  const skipped: ParseResult['skipped'] = [];
  let duplicates = 0;
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (f: Field) => { const i = map.indexOf(f); return i >= 0 ? row[i] : ''; };
    const code = normaliseAisheCode(get('code'));
    const name = clean(get('name'), 400);
    if (!code) { skipped.push({ row: r + 1, reason: get('code') ? `"${clean(get('code'), 30)}" is not an AISHE code` : 'no AISHE code' }); continue; }
    if (!name) { skipped.push({ row: r + 1, reason: 'no institute name' }); continue; }
    if (records.has(code)) duplicates++;
    const year = clean(get('established'), 10).match(/\b(1[89]\d\d|20\d\d)\b/)?.[1] || '';
    records.set(code, {
      code,
      name,
      category: clean(get('category'), 60).replace(/^Standlone$/i, 'Standalone'),
      university: clean(get('university'), 400),
      type: clean(get('type'), 200),
      state: clean(get('state'), 120),
      district: clean(get('district'), 120),
      status: clean(get('status'), 40),
      website: clean(get('website'), 400),
      established: year,
      management: clean(get('management'), 200),
    });
  }
  return {
    records: [...records.values()],
    columns: (rows[headerAt] || []).map((h, i) => ({ header: clean(h, 80), field: map[i] ?? null })),
    skipped,
    duplicates,
  };
}

// ------------------------------------------------------------------ storage + in-memory index

interface Indexed { rec: AisheRecord; key: string; words: string[] }
const g = globalThis as unknown as { __aishe?: { at: number; byCode: Map<string, Indexed> }; __aisheTable?: Promise<void> };
const CACHE_MS = 5 * 60_000;

const searchKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function index(rec: AisheRecord): Indexed {
  const key = searchKey(`${rec.name} ${rec.district} ${rec.university}`);
  return { rec, key, words: searchKey(rec.name).split(' ') };
}

async function table(): Promise<void> {
  g.__aisheTable ||= (async () => { await (await sqlPool()).query(AISHE_TABLE_DDL); })().catch(e => { g.__aisheTable = undefined; throw e; });
  return g.__aisheTable;
}

const fromRow = (r: RowDataPacket): AisheRecord => ({
  code: r.code, name: r.name, category: r.category || '', university: r.university || '', type: r.inst_type || '',
  state: r.state || '', district: r.district || '', status: r.status || '', website: r.website || '',
  established: r.established || '', management: r.management || '',
});

async function loadAll(): Promise<Map<string, Indexed>> {
  if (g.__aishe && Date.now() - g.__aishe.at < CACHE_MS) return g.__aishe.byCode;
  let list: AisheRecord[];
  if (backend() === 'file') list = (await readJson<AisheRecord[]>('aishe')) || [];
  else {
    await table();
    const [rows] = await (await sqlPool()).query<RowDataPacket[]>('SELECT * FROM acx_aishe');
    list = rows.map(fromRow);
  }
  const byCode = new Map(list.map(r => [r.code, index(r)]));
  g.__aishe = { at: Date.now(), byCode };
  return byCode;
}

const same = (a: AisheRecord, b: AisheRecord) => FIELDS.every(f => (a[f] || '') === (b[f] || ''));

/**
 * Adds new codes and updates changed ones. A blank cell in the upload never erases a value that
 * is already stored (some exports leave columns out).
 */
export async function importAishe(records: AisheRecord[]): Promise<{ added: number; updated: number; unchanged: number; total: number }> {
  g.__aishe = undefined;
  const current = await loadAll();
  const changed: AisheRecord[] = [];
  let added = 0, updated = 0, unchanged = 0;
  for (const rec of records) {
    const old = current.get(rec.code)?.rec;
    const merged: AisheRecord = old ? { ...old, ...Object.fromEntries(FIELDS.filter(f => rec[f]).map(f => [f, rec[f]])) } as AisheRecord : rec;
    if (!old) added++;
    else if (same(old, merged)) { unchanged++; continue; } else updated++;
    changed.push(merged);
  }
  if (changed.length) {
    if (backend() === 'file') {
      const all = new Map([...current].map(([k, v]) => [k, v.rec]));
      for (const r of changed) all.set(r.code, r);
      await writeJson('aishe', [...all.values()]);
    } else {
      await table();
      const p = await sqlPool();
      for (let i = 0; i < changed.length; i += 500) {
        const batch = changed.slice(i, i + 500);
        await p.query(
          `INSERT INTO acx_aishe (code, name, category, university, inst_type, state, district, status, website, established, management) VALUES ?
           ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), university = VALUES(university), inst_type = VALUES(inst_type),
           state = VALUES(state), district = VALUES(district), status = VALUES(status), website = VALUES(website), established = VALUES(established), management = VALUES(management)`,
          [batch.map(r => [r.code, r.name, r.category || null, r.university || null, r.type || null, r.state || null, r.district || null, r.status || null, r.website || null, r.established || null, r.management || null])],
        );
      }
    }
  }
  g.__aishe = undefined;
  const total = (await loadAll()).size;
  return { added, updated, unchanged, total };
}

export async function getAishe(code: string): Promise<AisheRecord | null> {
  const c = normaliseAisheCode(code);
  return c ? (await loadAll()).get(c)?.rec ?? null : null;
}

/** Name / code search for the sign-up form. Every word typed must appear; best matches first. */
export async function searchAishe(q: string, opts: { state?: string; limit?: number } = {}): Promise<AisheRecord[]> {
  const all = await loadAll();
  const limit = Math.min(opts.limit ?? 8, 20);
  const code = normaliseAisheCode(q);
  if (code) {
    const exact = all.get(code)?.rec;
    const prefix = [...all.keys()].filter(k => k !== code && k.startsWith(code)).slice(0, limit - (exact ? 1 : 0)).map(k => all.get(k)!.rec);
    return exact ? [exact, ...prefix] : prefix;
  }
  const query = searchKey(q);
  if (query.length < 2) return [];
  const terms = query.split(' ');
  const state = opts.state ? searchKey(opts.state) : '';
  const hits: { rec: AisheRecord; score: number }[] = [];
  for (const it of all.values()) {
    if (!terms.every(t => it.key.includes(t))) continue;
    let score = 0;
    const name = searchKey(it.rec.name);
    if (name === query) score += 100;
    else if (name.startsWith(query)) score += 60;
    else if (` ${name} `.includes(` ${query} `)) score += 40;
    for (const t of terms) if (it.words.some(w => w.startsWith(t))) score += 10;
    if (/^active$/i.test(it.rec.status) || !it.rec.status) score += 5;
    if (state && searchKey(it.rec.state) === state) score += 8;
    score -= name.length / 100;
    hits.push({ rec: it.rec, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(h => h.rec);
}

export async function aisheStats(): Promise<{ total: number; byState: { state: string; count: number }[]; byCategory: { category: string; count: number }[] }> {
  const all = await loadAll();
  const st = new Map<string, number>();
  const cat = new Map<string, number>();
  for (const { rec } of all.values()) {
    st.set(rec.state || '—', (st.get(rec.state || '—') || 0) + 1);
    cat.set(rec.category || '—', (cat.get(rec.category || '—') || 0) + 1);
  }
  return {
    total: all.size,
    byState: [...st].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
    byCategory: [...cat].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  };
}

/** The platform's institution type nearest to an AISHE type (used when an institute signs up). */
export function institutionTypeFor(rec: Pick<AisheRecord, 'type' | 'category'>): InstitutionType {
  const t = `${rec.type} ${rec.category}`.toLowerCase();
  if (/national importance/.test(t)) return 'IIT / NIT / IISc / IIIT (Institute of National Importance)';
  if (/central university/.test(t)) return 'Central University (Govt. of India)';
  if (/deemed/.test(t)) return 'Deemed-to-be University';
  if (/private university|state private/.test(t)) return 'Premier Private University';
  if (/university/.test(t) && !/college|affiliated|constituent/.test(t)) return 'State Public University';
  return 'Autonomous Engineering College';
}
