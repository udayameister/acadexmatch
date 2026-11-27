'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Printer, Share2 } from 'lucide-react';

/** Copy link / share buttons for a research profile card. */
export default function ProfileShare({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && 'share' in navigator), []);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ } };
  const share = async () => { try { await navigator.share({ title, url }); } catch { /* cancelled */ } };
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const btn = 'px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-1.5';
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button className={btn} onClick={copy}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}</button>
      {canShare && <button className={btn} onClick={share}><Share2 className="w-4 h-4" /> Share</button>}
      <a className={btn} href={`https://www.linkedin.com/sharing/share-offsite/?url=${u}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a className={btn} href={`https://wa.me/?text=${t}%20${u}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className={btn} href={`https://x.com/intent/post?url=${u}&text=${t}`} target="_blank" rel="noopener noreferrer">X</a>
      <button className={btn} onClick={() => window.print()}><Printer className="w-4 h-4" /> Print / PDF</button>
    </div>
  );
}
