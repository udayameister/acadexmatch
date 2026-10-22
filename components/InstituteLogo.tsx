import React from 'react';
import Image from 'next/image';

interface InstituteLogoProps {
  src?: string;
  name: string;
  size: number;
  className?: string;
}

/** Institute logo with an initials fallback for institutes that have not uploaded one. */
export default function InstituteLogo({ src, name, size, className = '' }: InstituteLogoProps) {
  if (src) {
    return <Image src={src} alt={name} width={size} height={size} unoptimized className={`w-full h-full object-cover ${className}`} />;
  }
  const initials = name
    .replace(/^(the)\s+/i, '')
    .split(/\s+/)
    .filter(w => /^[A-Z]/.test(w))
    .slice(0, 3)
    .map(w => w[0])
    .join('');
  return (
    <span className={`w-full h-full grid place-items-center bg-brand-900 text-white font-serif font-bold ${className}`} style={{ fontSize: size / 3 }}>
      {initials || '?'}
    </span>
  );
}
