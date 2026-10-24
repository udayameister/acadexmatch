'use client';

import { useEffect, useState } from 'react';
import { StorageService, STORAGE_EVENT } from './storage';
import { isHydrated, HYDRATED_EVENT } from './clientSync';
import { User } from '@/types';

/**
 * Current signed-in user, kept in sync with the server copy.
 * `ready` is false until the first load from the server, so guards don't redirect too early.
 */
export function useCurrentUser(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(StorageService.getCurrentUser());
      setReady(isHydrated());
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener(HYDRATED_EVENT, sync);
    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener(HYDRATED_EVENT, sync);
    };
  }, []);

  return { user, ready };
}

/** Re-runs `read` whenever data changes and returns its latest value. */
export function useStorageValue<T>(read: () => T, initial: T): T {
  // Read straight away so server-rendered pages (public snapshot) already contain the data.
  const [value, setValue] = useState<T>(() => { try { return read(); } catch { return initial; } });

  useEffect(() => {
    const sync = () => setValue(read());
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

export function homePathForRole(role: User['role']): string {
  if (role === 'super_admin') return '/admin';
  if (role === 'institute_admin' || role === 'recruiter') return '/institute/dashboard';
  return '/candidate/dashboard';
}
