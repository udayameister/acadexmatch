'use client';

import React, { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { SocialIcon } from '@/components/SocialSection';
import { X_HANDLE } from '@/lib/contact';

/** Share a post: LinkedIn, Facebook, X, WhatsApp, or copy the link. */
export default function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const links = [
    { n: 'linkedin' as const, label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { n: 'facebook' as const, label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { n: 'x' as const, label: 'X', href: `https://x.com/intent/post?url=${u}&text=${t}${X_HANDLE ? `&via=${X_HANDLE}` : ''}` },
    { n: 'whatsapp' as const, label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-700 mr-1">Share</span>
      {links.map(l => (
        <a key={l.n} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${l.label}`} title={l.label}
          className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-600 grid place-items-center hover:text-brand-800 hover:border-brand-300">
          <SocialIcon network={l.n} className="w-4 h-4" />
        </a>
      ))}
      <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
        className="h-9 px-3 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-brand-300 inline-flex items-center gap-1.5" aria-live="polite">
        {copied ? <><Check className="w-4 h-4 text-emerald-600" /> Copied</> : <><Link2 className="w-4 h-4" /> Copy link</>}
      </button>
    </div>
  );
}
