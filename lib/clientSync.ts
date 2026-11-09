'use client';

import { StorageService, StoreContext, STORAGE_EVENT, setStoreContextProvider, RegisterInput, AuthResult } from './storage';
import type { User } from '@/types';

/*
 * Browser side of the shared database.
 *  - Keeps a copy of what the signed-in user may see (GET /api/data) so pages read instantly.
 *  - Every change runs here first (so the page updates at once) and is then sent to the server
 *    (POST /api/rpc), which repeats it against the real database after checking permissions.
 *    The copy is then refreshed from the server, so the server always has the final say.
 */

export const SYNC_ERROR_EVENT = 'acad-sync-error';
export const HYDRATED_EVENT = 'acad-hydrated';

const cache: Record<string, unknown> = {};
const clientCtx: StoreContext = {
  get: key => cache[key],
  set: (key, value) => {
    cache[key] = value;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORAGE_EVENT));
  },
  userId: null,
  idCounter: 0,
};

let hydrated = false;
let hydrating: Promise<void> | null = null;

export function isHydrated(): boolean {
  return hydrated;
}

/**
 * Fills the browser copy with the public snapshot the server rendered the page with, so the first render in the
 * browser matches the server HTML. The signed-in user's own data still arrives through hydrate().
 */
export function seedCache(data: Record<string, unknown>): void {
  if (hydrated || Object.keys(cache).length) return;
  Object.assign(cache, data);
}

/** Loads (or reloads) everything the signed-in user may see from the server. */
export function hydrate(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const r = await fetch('/api/data', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const snap = (await r.json()) as { me: User | null; data: Record<string, unknown> };
      for (const k of Object.keys(cache)) delete cache[k];
      Object.assign(cache, snap.data);
      clientCtx.userId = snap.me?.id || null;
      hydrated = true;
      window.dispatchEvent(new Event(HYDRATED_EVENT));
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch (e) {
      if (!hydrated) {
        hydrated = true; // show the site (empty) rather than spin forever
        window.dispatchEvent(new Event(HYDRATED_EVENT));
      }
      reportError(`Could not reach the AcadeXMatch server (${(e as Error).message}). Is the app running?`);
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

function reportError(message: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: message }));
}

// ------------------------------------------------------------------ server calls

let queue: Promise<unknown> = Promise.resolve();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshTimer = null; hydrate(); }, 250);
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/** Sends one action to the server (in order). Resolves with the server's result. */
export function rpc<T = unknown>(method: string, args: unknown[], seed?: string): Promise<T> {
  const run = queue.then(async () => {
    const { ok, data } = await post('/api/rpc', { method, args, seed });
    if (!ok || data.ok === false) {
      const msg = String(data.error || 'The server rejected that change.');
      reportError(msg);
      scheduleRefresh();
      throw new Error(msg);
    }
    scheduleRefresh();
    return data.result as T;
  });
  queue = run.catch(() => undefined);
  return run;
}

// ------------------------------------------------------------------ install

/** Actions that change data. Each one runs locally, then on the server. */
const MUTATIONS = [
  'adminUpdateUser', 'adminDeleteUser', 'savePlanSettings', 'setUserPlan', 'requestPremiumUpgrade',
  'resolveUpgradeRequest', 'deleteUpgradeRequest', 'createPendingInstitute', 'updateInstitute', 'updateInstituteVerification',
  'adminCreateInstitute', 'adminUpdateInstitute', 'adminDeleteInstitute', 'requestInstituteSubscription',
  'setInstituteSubscription', 'declineInstituteSubscription', 'addJob', 'setJobStatus', 'updateJob', 'setJobPromotion', 'deleteJob',
  'deleteApplication', 'addJobs', 'saveProfileRecord', 'updateCandidateProfile', 'applyToJob', 'withdrawApplication',
  'updateApplicationStage', 'addReviewerScore', 'scheduleInterview', 'createDPDPRequest', 'updateDPDPStatus',
  'eraseUserData', 'deleteDPDPRequest', 'clearAuditLogs', 'addAuditLog',
  'saveJobAlert', 'setJobAlertActive', 'deleteJobAlert', 'closeExpiredJobs',
  'trackJob', 'untrackJob', 'addExternalTrackedJob', 'updateTrackedJob', 'removeTrackedJob',
  'addInterviewSlots', 'deleteInterviewSlot', 'inviteToBookSlots', 'bookInterviewSlot', 'cancelInterviewBooking',
  'makeOffer', 'respondToOffer', 'respondTalentInvite',
  'saveAnnouncement', 'setAnnouncementActive', 'deleteAnnouncement', 'setCandidateVerification', 'savePartner', 'deletePartner', 'savePrepState',
] as const;

/** Actions only the server can do (they need password hashes or the whole database). */
const SERVER_ONLY = ['adminCreateUser', 'adminResetPassword', 'changePassword', 'sendTalentInvite'] as const;

const g = globalThis as unknown as { __acadClientSync?: boolean };

function install() {
  if (g.__acadClientSync) return;
  g.__acadClientSync = true;
  setStoreContextProvider(() => clientCtx);
  const svc = StorageService as unknown as Record<string, (...a: unknown[]) => unknown>;
  let depth = 0;

  for (const name of MUTATIONS) {
    const original = svc[name];
    svc[name] = function wrapped(this: unknown, ...args: unknown[]) {
      if (depth > 0) return original.apply(StorageService, args); // nested call: the outer action is sent instead
      const seed = Math.random().toString(36).slice(2, 10);
      clientCtx.idSeed = seed;
      clientCtx.idCounter = 0;
      depth++;
      let result: unknown;
      try {
        result = original.apply(StorageService, args);
      } finally {
        depth--;
        clientCtx.idSeed = undefined;
      }
      // Don't send actions that already failed locally (they would fail on the server too).
      const failed = result && typeof result === 'object' && (result as { success?: boolean }).success === false;
      if (!failed) rpc(name, JSON.parse(JSON.stringify(args)), seed).catch(() => undefined);
      return result;
    };
  }

  for (const name of SERVER_ONLY) {
    svc[name] = (...args: unknown[]) => rpc(name, args).catch(e => ({ success: false, error: (e as Error).message }));
  }

  svc.register = async (input: unknown): Promise<AuthResult> => {
    const { data } = await post('/api/auth/register', input as RegisterInput);
    if (data.success) await hydrate();
    return data as unknown as AuthResult;
  };
  svc.login = async (email: unknown, password: unknown): Promise<AuthResult> => {
    const { data } = await post('/api/auth/login', { email, password });
    if (data.success) await hydrate();
    return (data.success !== undefined ? data : { success: false, error: String(data.error || 'Sign-in failed.') }) as unknown as AuthResult;
  };
  svc.logout = async () => {
    await post('/api/auth/logout', {});
    await hydrate();
  };
  svc.exportAllData = async () => {
    const r = await fetch('/api/admin/backup', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error('Could not download the backup.');
    return r.json();
  };
  svc.importAllData = async (backup: unknown) => {
    const { ok, data } = await post('/api/admin/import', { data: backup, mode: 'replace' });
    if (!ok) throw new Error(String(data.error || 'Import failed.'));
    await hydrate();
    return Number(data.restored || 0);
  };
  svc.resetAllData = async () => {
    await rpc('resetAllData', []);
    await post('/api/auth/logout', {});
    await hydrate();
  };

  hydrate();
  // Pick up changes made by other people.
  window.addEventListener('focus', () => hydrate());
  setInterval(() => { if (document.visibilityState === 'visible') hydrate(); }, 60_000);
}

if (typeof window !== 'undefined') install();

/** Imports data from a browser that used the older, browser-only version of AcadeXMatch. */
export async function importLegacyBrowserData(mode: 'merge' | 'replace'): Promise<{ restored: number; added: Record<string, number> }> {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith('acad_') || key === 'acad_session_v3' || key.startsWith('acad_visit')) continue;
    try { data[key] = JSON.parse(localStorage.getItem(key)!); } catch { /* skip */ }
  }
  if (!Object.keys(data).length) throw new Error('This browser has no data from the older version.');
  const { ok, data: res } = await post('/api/admin/import', { data, mode });
  if (!ok) throw new Error(String(res.error || 'Import failed.'));
  await hydrate();
  return { restored: Number(res.restored || 0), added: (res.added || {}) as Record<string, number> };
}

export function hasLegacyBrowserData(): boolean {
  try {
    return ['acad_users_v3', 'acad_jobs_v3', 'acad_applications_v3', 'acad_candidate_profiles_v3'].some(k => localStorage.getItem(k));
  } catch {
    return false;
  }
}
