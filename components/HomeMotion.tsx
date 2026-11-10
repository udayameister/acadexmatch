'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/*
 * Small animation helpers for the home page. All of them respect "reduce motion": the content is shown at once,
 * with no movement. Server-rendered HTML always contains the final content, so search engines and visitors without
 * JavaScript see everything.
 */

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useInView<T extends Element>(once = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || reducedMotion()) { setSeen(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); if (once) io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return [ref, seen];
}

/**
 * Fades and lifts its children into place when scrolled into view. `delay` (ms) staggers items in a grid.
 * Before hydration the content is visible (class "acx-reveal" only hides it once JavaScript has marked the page).
 */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: { children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return React.createElement(Tag, {
    ref,
    className: `acx-reveal ${seen ? 'acx-reveal-in' : ''} ${className}`,
    style: { transitionDelay: seen ? `${delay}ms` : undefined },
  }, children);
}

/** Counts up from 0 to `value` when it comes into view. */
export function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (!seen || started.current || reducedMotion() || value <= 0) { setShown(value); return; }
    started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);
  return <span ref={ref} className="tabular-nums">{shown.toLocaleString('en-IN')}</span>;
}

/** Cycles through short phrases (e.g. "What's new" highlights), with a slide-up change. */
export function RotatingText({ items, interval = 2800, className = '' }: { items: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2 || reducedMotion()) return;
    const t = setInterval(() => setI(x => (x + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items.length, interval]);
  return (
    <span className={`relative inline-grid overflow-hidden align-bottom ${className}`} aria-live="off">
      {/* The widest phrase keeps the space steady; screen readers read the full list once. */}
      <span className="sr-only">{items.join(', ')}</span>
      <span key={i} aria-hidden="true" className="acx-swap whitespace-nowrap">{items[i]}</span>
    </span>
  );
}

export interface MarqueeItem { icon: LucideIcon; label: string; href: string }

/** An endless, slow strip of services. Pauses on hover and focus; stops entirely for reduced motion. */
export function ServiceMarquee({ items }: { items: MarqueeItem[] }) {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 gap-3 pr-3" aria-hidden={hidden || undefined}>
      {items.map(s => (
        <li key={`${s.label}-${hidden}`}>
          <Link href={s.href} tabIndex={hidden ? -1 : undefined}
            className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700 shadow-sm hover:border-brand-300 hover:text-brand-900 hover:-translate-y-0.5 transition whitespace-nowrap">
            <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-800 grid place-items-center group-hover:bg-brand-900 group-hover:text-white transition">
              <s.icon className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            {s.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="acx-marquee relative overflow-hidden py-1 [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
      <div className="acx-marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
