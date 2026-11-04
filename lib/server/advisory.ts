/*
 * Advisory board members shown on the About page. The administrator adds, edits, hides, reorders and
 * removes members; everyone can see the visible ones. Stored as JSON ("advisory-board") with optional
 * photos as blobs ("advisory-photos/<file>").
 */
import { readJson, writeJson, putBlob, deleteBlob } from './persist';
import { cleanWebsite, sniffImage } from './customers';

export interface Advisor {
  id: string;
  name: string;
  /** Role on the board, e.g. "Chair", "Member". */
  boardRole: string;
  /** Their own position, e.g. "Professor and Head, Department of CSE". */
  designation: string;
  organization: string;
  bio: string;
  profileUrl?: string;
  photoFile?: string;
  mimeType?: string;
  visible: boolean;
  order: number;
  addedAt: string;
}

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const photoBlobId = (file: string) => `advisory-photos/${file.replace(/[^A-Za-z0-9._-]/g, '')}`;
export { sniffImage };

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function read(): Promise<Advisor[]> {
  const list = await readJson<Advisor[]>('advisory-board');
  return Array.isArray(list) ? list.sort((a, b) => a.order - b.order) : [];
}
async function write(list: Advisor[]): Promise<void> {
  list.forEach((a, i) => { a.order = i; });
  await writeJson('advisory-board', list);
}

export const listAdvisors = () => locked(read);

const t = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export interface AdvisorInput { name?: unknown; boardRole?: unknown; designation?: unknown; organization?: unknown; bio?: unknown; profileUrl?: unknown }

export function cleanAdvisor(raw: AdvisorInput): { ok: true; value: Omit<Advisor, 'id' | 'visible' | 'order' | 'addedAt' | 'photoFile' | 'mimeType'> } | { ok: false; error: string } {
  const name = t(raw.name, 120);
  if (name.length < 2) return { ok: false, error: 'Enter the member’s name.' };
  const designation = t(raw.designation, 160);
  const organization = t(raw.organization, 160);
  if (!designation && !organization) return { ok: false, error: 'Enter the member’s designation or organisation.' };
  const profileRaw = t(raw.profileUrl, 300);
  const profileUrl = profileRaw ? cleanWebsite(profileRaw) : undefined;
  if (profileRaw && !profileUrl) return { ok: false, error: 'The profile link must be a web address (https://…).' };
  return { ok: true, value: { name, boardRole: t(raw.boardRole, 60) || 'Member', designation, organization, bio: t(raw.bio, 600), profileUrl } };
}

export function addAdvisor(input: ReturnType<typeof cleanAdvisor> & { ok: true }, photo?: { bytes: Buffer; mimeType: string }): Promise<Advisor> {
  return locked(async () => {
    const list = await read();
    const id = `adv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const a: Advisor = { id, ...input.value, visible: true, order: list.length, addedAt: new Date().toISOString().slice(0, 10) };
    if (photo) {
      a.photoFile = `${id}.${EXT[photo.mimeType]}`;
      a.mimeType = photo.mimeType;
      await putBlob(photoBlobId(a.photoFile), photo.mimeType, photo.bytes);
    }
    list.push(a);
    await write(list);
    return a;
  });
}

export function updateAdvisor(id: string, patch: { fields?: ReturnType<typeof cleanAdvisor> & { ok: true }; visible?: boolean; move?: 'up' | 'down'; photo?: { bytes: Buffer; mimeType: string }; removePhoto?: boolean }): Promise<Advisor[] | null> {
  return locked(async () => {
    const list = await read();
    const i = list.findIndex(a => a.id === id);
    if (i === -1) return null;
    const a = list[i];
    if (patch.fields) Object.assign(a, patch.fields.value);
    if (typeof patch.visible === 'boolean') a.visible = patch.visible;
    if ((patch.photo || patch.removePhoto) && a.photoFile) { await deleteBlob(photoBlobId(a.photoFile)).catch(() => undefined); a.photoFile = undefined; a.mimeType = undefined; }
    if (patch.photo) {
      a.photoFile = `${a.id}-${Date.now().toString(36)}.${EXT[patch.photo.mimeType]}`;
      a.mimeType = patch.photo.mimeType;
      await putBlob(photoBlobId(a.photoFile), a.mimeType, patch.photo.bytes);
    }
    if (patch.move === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (patch.move === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    await write(list);
    return list;
  });
}

export function deleteAdvisor(id: string): Promise<Advisor[]> {
  return locked(async () => {
    const list = await read();
    const a = list.find(x => x.id === id);
    if (a?.photoFile) await deleteBlob(photoBlobId(a.photoFile)).catch(() => undefined);
    const next = list.filter(x => x.id !== id);
    await write(next);
    return next;
  });
}

/** What visitors receive (no internal file names). */
export function publicAdvisor(a: Advisor) {
  return {
    id: a.id, name: a.name, boardRole: a.boardRole, designation: a.designation, organization: a.organization, bio: a.bio,
    profileUrl: a.profileUrl || null, visible: a.visible, order: a.order,
    photoUrl: a.photoFile ? `/api/advisory/photo/${a.id}?v=${encodeURIComponent(a.photoFile)}` : null,
  };
}
export type PublicAdvisor = ReturnType<typeof publicAdvisor>;
