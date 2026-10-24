'use client';

import { seedPublicSnapshot } from '@/lib/storage';
import { seedCache } from '@/lib/clientSync';

/** Makes the public snapshot available to the first render (server and browser). Renders nothing. */
export default function StoreSeed({ data }: { data: Record<string, unknown> | null }) {
  if (data) {
    seedPublicSnapshot(data);
    if (typeof window !== 'undefined') seedCache(data);
  }
  return null;
}
