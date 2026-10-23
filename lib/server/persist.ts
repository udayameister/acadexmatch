import { promises as fs, statSync } from 'fs';
import path from 'path';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

/*
 * Where AcadeXMatch keeps its data.
 *
 *  - MySQL (production): used whenever DB_HOST is set — GoDaddy Node.js Hosting injects DB_HOST,
 *    DB_PORT, DB_NAME, DB_USER and DB_PASSWORD automatically for the app's hosted database. The
 *    database lives outside the app's code, so deploying a new version never touches the data.
 *  - Files in ./data (local development): used when no database is configured.
 *
 * Three kinds of data:
 *  - the main store: collections such as users, jobs, applications (key → JSON value);
 *  - small JSON stores: visit counter, "Our customers" list, scraping pipeline;
 *  - blobs: uploaded documents and customer logos.
 */

export const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export type Backend = 'mysql' | 'file';
export function backend(): Backend {
  if (process.env.ACAD_STORAGE === 'file') return 'file';
  return process.env.DB_HOST ? 'mysql' : 'file';
}

const g = globalThis as unknown as { __acadPool?: Pool; __acadSchema?: Promise<void> };

async function pool(): Promise<Pool> {
  if (!g.__acadPool) {
    const mysql = await import('mysql2/promise');
    g.__acadPool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionLimit: 5,
      waitForConnections: true,
      charset: 'utf8mb4',
      enableKeepAlive: true,
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return g.__acadPool;
}

async function ensureSchema(): Promise<void> {
  g.__acadSchema ||= (async () => {
    const p = await pool();
    await p.query(`CREATE TABLE IF NOT EXISTS acx_kv (
      k VARCHAR(191) NOT NULL PRIMARY KEY,
      v LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS acx_blobs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      mime VARCHAR(100) NOT NULL,
      data LONGBLOB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await p.query(`CREATE TABLE IF NOT EXISTS acx_meta (
      id TINYINT NOT NULL PRIMARY KEY,
      version BIGINT NOT NULL
    ) ENGINE=InnoDB`);
    await p.query('INSERT IGNORE INTO acx_meta (id, version) VALUES (1, 0)');
    await migrateLegacyFiles(p);
  })().catch(e => { g.__acadSchema = undefined; throw e; });
  return g.__acadSchema;
}

// ------------------------------------------------------------------ main store

export type Db = Record<string, unknown>;
const MAIN_PREFIX = 'db:';

/**
 * A session on the main store, held for the length of one withDb call. In MySQL mode it holds a
 * named lock so the preview and the published app (which share one database) never write at once.
 */
export interface StoreSession {
  /** Current data; reloaded only when another process has changed it. */
  data: Db;
  /** Saves every collection whose content changed since it was loaded (removed keys are deleted). */
  save(): Promise<void>;
  close(): Promise<void>;
}

const cache = globalThis as unknown as { __acadMain?: { data: Db; version: number; json: Map<string, string> } };

export async function openStore(): Promise<StoreSession> {
  if (backend() === 'file') return openFileStore();
  await ensureSchema();
  const conn: PoolConnection = await (await pool()).getConnection();
  try {
    const [lk] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK('acx_store', 20) AS ok");
    if (!lk[0]?.ok) throw new Error('The database is busy. Please try again.');
    const [vr] = await conn.query<RowDataPacket[]>('SELECT version FROM acx_meta WHERE id = 1');
    const version = Number(vr[0]?.version || 0);
    let data: Db;
    let json: Map<string, string>;
    if (cache.__acadMain && cache.__acadMain.version === version) {
      ({ data, json } = cache.__acadMain);
    } else {
      const [rows] = await conn.query<RowDataPacket[]>('SELECT k, v FROM acx_kv WHERE k LIKE ?', [`${MAIN_PREFIX}%`]);
      data = {};
      json = new Map();
      for (const r of rows) {
        const key = String(r.k).slice(MAIN_PREFIX.length);
        try { data[key] = JSON.parse(String(r.v)); json.set(key, String(r.v)); } catch { /* skip a damaged row */ }
      }
      cache.__acadMain = { data, version, json };
    }
    let released = false;
    return {
      data,
      async save() {
        const writes: [string, string][] = [];
        const deletes: string[] = [];
        for (const key of Object.keys(data)) {
          if (data[key] === undefined) continue;
          const v = JSON.stringify(data[key]);
          if (json.get(key) !== v) writes.push([key, v]);
        }
        for (const key of json.keys()) if (data[key] === undefined) deletes.push(key);
        if (!writes.length && !deletes.length) return;
        await conn.beginTransaction();
        try {
          for (const [key, v] of writes) await conn.query('INSERT INTO acx_kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [MAIN_PREFIX + key, v]);
          for (const key of deletes) await conn.query('DELETE FROM acx_kv WHERE k = ?', [MAIN_PREFIX + key]);
          await conn.query('UPDATE acx_meta SET version = version + 1 WHERE id = 1');
          const [nv] = await conn.query<RowDataPacket[]>('SELECT version FROM acx_meta WHERE id = 1');
          await conn.commit();
          for (const [key, v] of writes) json.set(key, v);
          for (const key of deletes) json.delete(key);
          cache.__acadMain = { data, version: Number(nv[0]?.version || 0), json };
        } catch (e) {
          await conn.rollback().catch(() => undefined);
          cache.__acadMain = undefined; // reload from the database next time
          throw e;
        }
      },
      async close() {
        if (released) return;
        released = true;
        await conn.query("SELECT RELEASE_LOCK('acx_store')").catch(() => undefined);
        conn.release();
      },
    };
  } catch (e) {
    await conn.query("SELECT RELEASE_LOCK('acx_store')").catch(() => undefined);
    conn.release();
    throw e;
  }
}

const fileCache = globalThis as unknown as { __acadFileDb?: { data: Db; mtimeMs: number } };

async function openFileStore(): Promise<StoreSession> {
  let mtimeMs = 0;
  try { mtimeMs = statSync(DB_FILE).mtimeMs; } catch { /* no file yet */ }
  let data: Db;
  if (fileCache.__acadFileDb && fileCache.__acadFileDb.mtimeMs === mtimeMs && mtimeMs !== 0) data = fileCache.__acadFileDb.data;
  else {
    try { data = JSON.parse(await fs.readFile(DB_FILE, 'utf8')); } catch { data = {}; }
    fileCache.__acadFileDb = { data, mtimeMs };
  }
  return {
    data,
    async save() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DB_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
      await fs.rename(tmp, DB_FILE);
      fileCache.__acadFileDb = { data, mtimeMs: statSync(DB_FILE).mtimeMs };
    },
    async close() { /* nothing to release */ },
  };
}

// ------------------------------------------------------------------ small JSON stores

const JSON_PREFIX = 'json:';

/** Reads a small JSON store (e.g. "visits"); null when it does not exist yet. */
export async function readJson<T>(name: string): Promise<T | null> {
  if (backend() === 'file') {
    try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8')) as T; } catch { return null; }
  }
  await ensureSchema();
  const [rows] = await (await pool()).query<RowDataPacket[]>('SELECT v FROM acx_kv WHERE k = ?', [JSON_PREFIX + name]);
  if (!rows.length) return null;
  try { return JSON.parse(String(rows[0].v)) as T; } catch { return null; }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  if (backend() === 'file') {
    const file = path.join(DATA_DIR, `${name}.json`);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(`${file}.tmp`, file);
    return;
  }
  await ensureSchema();
  await (await pool()).query('INSERT INTO acx_kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [JSON_PREFIX + name, JSON.stringify(value)]);
}

// ------------------------------------------------------------------ blobs (documents, logos)

/** Blob ids look like "documents/<userId>/<file>" or "customer-logos/<file>" (also their path under ./data). */
function blobPath(id: string): string {
  const parts = id.split('/').map(p => path.basename(p)).filter(p => p && p !== '..' && p !== '.');
  return path.join(DATA_DIR, ...parts);
}

export async function putBlob(id: string, mime: string, bytes: Buffer): Promise<void> {
  if (backend() === 'file') {
    const file = blobPath(id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return;
  }
  await ensureSchema();
  await (await pool()).query('INSERT INTO acx_blobs (id, mime, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)', [id, mime, bytes]);
}

export async function getBlob(id: string): Promise<Buffer | null> {
  if (backend() === 'file') {
    try { return await fs.readFile(blobPath(id)); } catch { return null; }
  }
  await ensureSchema();
  const [rows] = await (await pool()).query<RowDataPacket[]>('SELECT data FROM acx_blobs WHERE id = ?', [id]);
  return rows.length ? (rows[0].data as Buffer) : null;
}

export async function deleteBlob(id: string): Promise<void> {
  if (backend() === 'file') { await fs.unlink(blobPath(id)).catch(() => undefined); return; }
  await ensureSchema();
  await (await pool()).query('DELETE FROM acx_blobs WHERE id = ?', [id]);
}

/** Removes every blob whose id starts with prefix (e.g. "documents/" or "documents/<userId>/"). */
export async function deleteBlobPrefix(prefix: string): Promise<void> {
  if (backend() === 'file') { await fs.rm(blobPath(prefix), { recursive: true, force: true }).catch(() => undefined); return; }
  await ensureSchema();
  await (await pool()).query('DELETE FROM acx_blobs WHERE id LIKE ?', [`${prefix.replace(/[%_]/g, '\\$&')}%`]);
}

// ------------------------------------------------------------------ one-time move from files

/**
 * Runs once, before any data is read: when the MySQL database is completely empty but this server
 * still has data files from an earlier version (data/db.json, visit counter, customers, scraping
 * pipeline, uploaded documents and logos), copies all of them into MySQL so nothing is lost.
 */
async function migrateLegacyFiles(p: Pool): Promise<void> {
  const conn = await p.getConnection();
  try {
    const [lk] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK('acx_migrate', 60) AS ok");
    if (!lk[0]?.ok) return;
    const [cnt] = await conn.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM acx_kv) + (SELECT COUNT(*) FROM acx_blobs) AS n');
    if (Number(cnt[0].n) > 0) return;
    let imported = 0;
    try {
      const main = JSON.parse(await fs.readFile(DB_FILE, 'utf8')) as Db;
      for (const [k, v] of Object.entries(main)) {
        await conn.query('INSERT INTO acx_kv (k, v) VALUES (?, ?)', [MAIN_PREFIX + k, JSON.stringify(v)]);
        imported++;
      }
    } catch { /* no old database file */ }
    for (const name of ['visits', 'customers', 'scrape-pipeline']) {
      try {
        const v = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8'));
        await conn.query('INSERT INTO acx_kv (k, v) VALUES (?, ?)', [JSON_PREFIX + name, JSON.stringify(v)]);
        imported++;
      } catch { /* not present */ }
    }
    for (const dir of ['documents', 'customer-logos']) {
      const root = path.join(DATA_DIR, dir);
      const walk = async (rel: string): Promise<void> => {
        let entries: import('fs').Dirent[] = [];
        try { entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { await walk(r); continue; }
          if (!e.isFile()) continue;
          const ext = path.extname(e.name).toLowerCase();
          const mime = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          await conn.query('INSERT IGNORE INTO acx_blobs (id, mime, data) VALUES (?, ?, ?)', [`${dir}/${r}`, mime, await fs.readFile(path.join(root, r))]);
          imported++;
        }
      };
      await walk('');
    }
    if (imported) {
      await conn.query('UPDATE acx_meta SET version = version + 1 WHERE id = 1');
      console.log(`[AcadeXMatch] Moved ${imported} items from the data folder into the MySQL database.`);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('acx_migrate')").catch(() => undefined);
    conn.release();
  }
}

/** Quick health information for the admin console. */
export async function storageStatus(): Promise<{ backend: Backend; ok: boolean; error?: string; rows?: number; blobs?: number }> {
  if (backend() === 'file') return { backend: 'file', ok: true };
  try {
    await ensureSchema();
    const p = await pool();
    const [a] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM acx_kv');
    const [b] = await p.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM acx_blobs');
    return { backend: 'mysql', ok: true, rows: Number(a[0].n), blobs: Number(b[0].n) };
  } catch (e) {
    return { backend: 'mysql', ok: false, error: (e as Error).message };
  }
}
