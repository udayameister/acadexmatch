import React from 'react';
import { BadgeCheck } from 'lucide-react';

/** Shown when the platform administrator has checked a candidate's uploaded proofs. */
export default function VerifiedBadge({ verified, compact = false }: { verified?: { at: string; by?: string } | null; compact?: boolean }) {
  if (!verified) return null;
  return (
    <span title={`Documents checked by AcadeXMatch on ${verified.at}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold whitespace-nowrap">
      <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />{compact ? 'Verified' : 'Documents verified'}
    </span>
  );
}
