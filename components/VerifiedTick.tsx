'use client';

import React from 'react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';

/** The green verified tick (a badge with a white check), shown next to a verified candidate's name. */
export default function VerifiedTick({ size = 18, className = '', title = 'Verified by AcadeXMatch: profile and documents checked' }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title} className={`inline-block shrink-0 align-[-0.15em] ${className}`}>
      <title>{title}</title>
      <path fill="#16a34a" d="M12 1.5l2.39 1.74 2.95-.03.9 2.81 2.4 1.72-.92 2.8.92 2.8-2.4 1.72-.9 2.81-2.95-.03L12 22.5l-2.39-1.74-2.95.03-.9-2.81-2.4-1.72.92-2.8-.92-2.8 2.4-1.72.9-2.81 2.95.03z" />
      <path fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M7.6 12.3l3 3 5.8-6.1" />
    </svg>
  );
}

/** Green tick for a candidate by account id (reads the verified flag from the profiles this viewer may see). */
export function CandidateTick({ userId, size = 16, className = '' }: { userId?: string | null; size?: number; className?: string }) {
  const verified = useStorageValue(() => (userId ? !!StorageService.getProfilesMap()[userId]?.documentsVerified : false), false);
  return verified ? <VerifiedTick size={size} className={className} /> : null;
}
