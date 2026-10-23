import { readJson, writeJson, putBlob, deleteBlob } from './persist';

/* "Our Customers" logos shown on the home page. Stored on the server so every visitor sees them:
   data/customers.json (list) and data/customer-logos/<id>.<ext> (images). */

export interface Customer {
  id: string;
  name: string;
  website?: string;
  logoFile: string;
  mimeType: string;
  visible: boolean;
  order: number;
  addedAt: string;
}

/** Blob id of a customer logo (stored in the database, or data/customer-logos locally). */
export const logoBlobId = (file: string) => `customer-logos/${file.replace(/[^A-Za-z0-9._-]/g, '')}`;
export const MAX_LOGO_BYTES = 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Customer[]> {
  const list = await readJson<Customer[]>('customers');
  return Array.isArray(list) ? list.sort((a, b) => a.order - b.order) : [];
}

async function write(list: Customer[]): Promise<void> {
  list.forEach((c, i) => { c.order = i; });
  await writeJson('customers', list);
}

export function listCustomers(): Promise<Customer[]> {
  return locked(read);
}

export function cleanWebsite(url: string | null | undefined): string | undefined {
  const u = (url || '').trim();
  if (!u) return undefined;
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function addCustomer(name: string, website: string | undefined, bytes: Buffer, mimeType: string): Promise<Customer> {
  return locked(async () => {
    const list = await read();
    const id = `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const logoFile = `${id}.${LOGO_TYPES[mimeType]}`;
    await putBlob(logoBlobId(logoFile), mimeType, bytes);
    const c: Customer = { id, name: name.trim().slice(0, 120), website, logoFile, mimeType, visible: true, order: list.length, addedAt: new Date().toISOString().slice(0, 10) };
    list.push(c);
    await write(list);
    return c;
  });
}

export function updateCustomer(id: string, patch: { name?: string; website?: string | null; visible?: boolean; move?: 'up' | 'down'; logo?: { bytes: Buffer; mimeType: string } }): Promise<Customer[]> {
  return locked(async () => {
    const list = await read();
    const i = list.findIndex(c => c.id === id);
    if (i === -1) return list;
    const c = list[i];
    if (typeof patch.name === 'string' && patch.name.trim()) c.name = patch.name.trim().slice(0, 120);
    if (patch.website !== undefined) c.website = cleanWebsite(patch.website);
    if (typeof patch.visible === 'boolean') c.visible = patch.visible;
    if (patch.logo) {
      const old = logoBlobId(c.logoFile);
      c.logoFile = `${c.id}-${Date.now().toString(36)}.${LOGO_TYPES[patch.logo.mimeType]}`;
      c.mimeType = patch.logo.mimeType;
      await putBlob(logoBlobId(c.logoFile), c.mimeType, patch.logo.bytes);
      await deleteBlob(old).catch(() => undefined);
    }
    if (patch.move === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (patch.move === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    await write(list);
    return list;
  });
}

export function deleteCustomer(id: string): Promise<Customer[]> {
  return locked(async () => {
    const list = await read();
    const c = list.find(x => x.id === id);
    if (c) await deleteBlob(logoBlobId(c.logoFile)).catch(() => undefined);
    const next = list.filter(x => x.id !== id);
    await write(next);
    return next;
  });
}

/** Checks the file really is a PNG / JPEG / WebP by its first bytes. */
export function sniffImage(bytes: Buffer): string | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
