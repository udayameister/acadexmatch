import React from 'react';
import VerifiedTick from '@/components/VerifiedTick';

/** Shown when the platform administrator has checked a candidate's profile and uploaded proofs: green tick + label. */
export default function VerifiedBadge({ verified, compact = false }: { verified?: { at: string; by?: string } | null; compact?: boolean }) {
  if (!verified) return null;
  const title = `Verified by AcadeXMatch on ${verified.at}: profile and documents checked`;
  return (
    <span title={title}
      className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold whitespace-nowrap">
      <VerifiedTick size={16} title={title} />{compact ? 'Verified' : 'Verified candidate'}
    </span>
  );
}
