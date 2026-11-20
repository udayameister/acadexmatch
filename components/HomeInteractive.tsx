'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Bell, BookOpen, Building2, FileCheck2, FlaskConical, GraduationCap,
  Microscope, Pause, Play, ScrollText, Send, Sparkles, Trophy, Upload, Users, type LucideIcon,
} from 'lucide-react';
import type { Job } from '@/types';

/*
 * Interactive and animated pieces of the home page. Every one of them:
 *  - renders its real content on the server (search engines and visitors without JavaScript see everything);
 *  - stops moving when the visitor has asked their device to reduce motion;
 *  - pauses on hover / keyboard focus where it changes on its own, so it can always be read.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** True after mount when motion is allowed (false on the server, so server HTML is the calm, final state). */
export function useMotionOK(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const set = () => setOk(!mq?.matches);
    set();
    mq?.addEventListener?.('change', set);
    return () => mq?.removeEventListener?.('change', set);
  }, []);
  return ok;
}

// ────────────────────────────────────────────── page-wide helpers

/** Thin gold bar at the very top that fills as the visitor scrolls down the page. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, h.scrollTop / max) : 0})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={bar} aria-hidden="true" className="fixed left-0 top-0 z-[70] h-[3px] w-full origin-left scale-x-0 bg-gradient-to-r from-brand-800 via-gold-400 to-brand-700 pointer-events-none" />;
}

/**
 * One pointer listener for the whole page: elements with class "acx-spot" get a soft gold spotlight that follows the
 * mouse (CSS variables --sx / --sy), and elements with "acx-magnet" lean slightly toward it.
 */
export function PointerEffects() {
  useEffect(() => {
    if (!finePointer() || prefersReducedMotion()) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    let magnet: HTMLElement | null = null;
    const run = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const t = e.target as Element | null;
      const spot = t?.closest?.('.acx-spot') as HTMLElement | null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--sx', `${e.clientX - r.left}px`);
        spot.style.setProperty('--sy', `${e.clientY - r.top}px`);
      }
      const m = t?.closest?.('.acx-magnet') as HTMLElement | null;
      if (magnet && magnet !== m) magnet.style.transform = '';
      magnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        m.style.transform = `translate(${dx * 6}px, ${dy * 5}px)`;
      }
    };
    const onMove = (e: PointerEvent) => { last = e; if (!raf) raf = requestAnimationFrame(run); };
    const onLeave = () => { if (magnet) magnet.style.transform = ''; magnet = null; };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

// ────────────────────────────────────────────── hero

const PARTICLES: { icon: LucideIcon; left: string; size: number; dur: number; delay: number }[] = [
  { icon: GraduationCap, left: '6%', size: 22, dur: 16, delay: 0 },
  { icon: BookOpen, left: '18%', size: 16, dur: 19, delay: 5 },
  { icon: FlaskConical, left: '31%', size: 18, dur: 17, delay: 9 },
  { icon: Microscope, left: '47%', size: 20, dur: 21, delay: 2 },
  { icon: ScrollText, left: '58%', size: 15, dur: 18, delay: 12 },
  { icon: Sparkles, left: '71%', size: 14, dur: 15, delay: 7 },
  { icon: GraduationCap, left: '84%', size: 18, dur: 20, delay: 4 },
  { icon: BookOpen, left: '93%', size: 14, dur: 16, delay: 10 },
];

/**
 * Hero background: three slowly drifting colour glows, academic icons floating upward, and a gold spotlight that
 * follows the mouse across the hero. Purely decorative.
 */
export function HeroBackdropFx() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || !finePointer() || prefersReducedMotion()) return;
    let raf = 0;
    let p = { x: 0, y: 0 };
    const apply = () => { raf = 0; el.style.setProperty('--mx', `${p.x}px`); el.style.setProperty('--my', `${p.y}px`); el.style.setProperty('--mo', '1'); };
    const move = (e: PointerEvent) => { const r = host.getBoundingClientRect(); p = { x: e.clientX - r.left, y: e.clientY - r.top }; if (!raf) raf = requestAnimationFrame(apply); };
    const leave = () => el.style.setProperty('--mo', '0');
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', leave);
    return () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
      <span className="acx-blob acx-blob-a w-[30rem] h-[30rem] -top-40 -left-24 bg-brand-300/40" />
      <span className="acx-blob acx-blob-b w-[26rem] h-[26rem] top-10 right-[-6rem] bg-gold-300/50" />
      <span className="acx-blob acx-blob-c w-[22rem] h-[22rem] bottom-[-8rem] left-1/3 bg-rose-200/50" />
      <div className="acx-hero-spot absolute inset-0" />
      <div className="hidden md:block">
        {PARTICLES.map((p, i) => (
          <p.icon key={i} className="acx-particle text-brand-800/[0.13]" style={{ left: p.left, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `-${p.delay}s` }} />
        ))}
      </div>
    </div>
  );
}

const HERO_WORDS = ['faculty', 'professors', 'researchers', 'scholars'];

/**
 * The hero headline: words rise in one by one, and the highlighted word cycles (faculty → professors → researchers →
 * scholars) with the gold underline redrawn each time. The server renders "faculty", so the headline search engines
 * read is unchanged.
 */
export function HeroHeadline() {
  const motion = useMotionOK();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const slot = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!motion || paused) return;
    const t = setInterval(() => setI(x => (x + 1) % HERO_WORDS.length), 2800);
    return () => clearInterval(t);
  }, [motion, paused]);
  // The slot glides to the width of each new word, so the rest of the line moves smoothly instead of jumping.
  useLayoutEffectSafe(() => {
    if (!motion || !slot.current || !word.current) return;
    slot.current.style.width = `${word.current.scrollWidth}px`;
  }, [i, motion]);
  const before = ['Where', "India's", 'next', 'generation', 'of'];
  let n = 0;
  const w = (t: string) => <span key={t} className="acx-word" style={{ animationDelay: `${0.05 + n++ * 0.07}s` }}>{t}&nbsp;</span>;
  return (
    <h1 className="font-serif text-[2.1rem] sm:text-5xl lg:text-[3.3rem] font-bold text-brand-800 leading-[1.08] tracking-[-0.02em]"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {before.map(w)}
      <span className="acx-word" style={{ animationDelay: `${0.05 + n++ * 0.07}s` }}>
        <span ref={slot} className="acx-wordslot relative text-brand-900">
          <span ref={word} key={i} className={motion && i > 0 ? 'acx-wordin' : 'inline-block'}>{HERO_WORDS[i]}</span>
          <svg key={`u${i}`} className="acx-underline absolute left-0 -bottom-2 w-full h-3 text-gold-400" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 9 C 60 2, 140 2, 198 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </span>{' '}
      {['gets', 'hired.'].map(w)}
    </h1>
  );
}

const useLayoutEffectSafe = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SEARCH_IDEAS = [
  'Assistant Professor, Computer Science',
  'Associate Professor in Tamil Nadu',
  'Mechanical Engineering, NIT',
  'Professor of Physics',
  'Post-doctoral fellow, Biotechnology',
  'Visiting Faculty, Architecture',
];

/** Search-box placeholder that types example searches; stops while the visitor is typing or the box is focused. */
export function useTypedPlaceholder(fallback: string, active: boolean): string {
  const motion = useMotionOK();
  const [text, setText] = useState(fallback);
  useEffect(() => {
    if (!motion || !active) { setText(fallback); return; }
    let phrase = 0, pos = 0, dir: 1 | -1 = 1, hold = 0;
    const t = setInterval(() => {
      const full = SEARCH_IDEAS[phrase];
      if (hold > 0) { hold--; return; }
      pos += dir;
      if (pos >= full.length) { dir = -1; hold = 22; }
      if (pos <= 0) { dir = 1; phrase = (phrase + 1) % SEARCH_IDEAS.length; hold = 4; }
      setText(`Try “${full.slice(0, Math.max(0, pos))}”`);
    }, 55);
    return () => clearInterval(t);
  }, [motion, active, fallback]);
  return text;
}

const ago = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600_000));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/**
 * "New vacancy" pop-up that cycles through the newest real vacancies, sliding in from the side. Hidden when there
 * are none. `variant="strip"` is the compact one-line version for phones and tablets.
 */
export function LiveVacancyToast({ jobs, variant = 'float' }: { jobs: Job[]; variant?: 'float' | 'strip' }) {
  const motion = useMotionOK();
  const recent = jobs.slice().sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 8);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const period = 4800;
  useEffect(() => {
    if (!motion || paused || recent.length < 2) return;
    const t = setInterval(() => setI(x => (x + 1) % recent.length), period);
    return () => clearInterval(t);
  }, [motion, paused, recent.length]);
  if (!recent.length) return null;
  const j = recent[i % recent.length];
  const where = j.location?.city || j.location?.state || '';
  if (variant === 'strip') {
    return (
      <Link href={`/jobs/${j.id}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
        className="flex items-center gap-2.5 w-full max-w-xl min-w-0 px-3 py-2 rounded-xl bg-white/80 border border-slate-200 text-xs text-slate-700 hover:border-brand-300 hover:shadow-sm overflow-hidden transition">
        <span className="relative flex w-2 h-2 shrink-0"><span className="absolute inset-0 rounded-full bg-emerald-500 acx-ping" /><span className="relative w-2 h-2 rounded-full bg-emerald-500" /></span>
        <span className="font-bold text-emerald-700 shrink-0">Just posted</span>
        <span key={j.id} className={`min-w-0 flex-1 truncate ${motion ? 'acx-swap' : ''}`}><span className="font-semibold text-slate-900">{j.title}</span> · {j.instituteShortName || j.instituteName}{where ? ` · ${where}` : ''}</span>
        <span className="ml-auto shrink-0 text-slate-400">{ago(j.postedAt)}</span>
      </Link>
    );
  }
  return (
    <Link href={`/jobs/${j.id}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      aria-label={`New vacancy: ${j.title}, ${j.instituteName}`}
      className="group block w-72 rounded-2xl bg-white/95 backdrop-blur border border-slate-200 shadow-xl shadow-brand-900/10 p-3 hover:border-brand-300 transition">
      <div key={j.id} className={motion ? 'acx-toast' : undefined} style={{ ['--acx-toast-ms' as string]: `${period}ms`, animationPlayState: paused ? 'paused' : 'running' }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="w-6 h-6 rounded-full bg-gold-400 text-brand-950 grid place-items-center shrink-0"><Bell className="w-3.5 h-3.5" /></span>
          <span className="text-brand-800 uppercase tracking-wide">New vacancy</span>
          <span className="ml-auto text-slate-400 font-medium">{ago(j.postedAt)}</span>
        </div>
        <p className="mt-1.5 text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-brand-800">{j.title}</p>
        <p className="text-xs text-slate-500 line-clamp-1">{j.instituteName}{where ? ` · ${where}` : ''}</p>
      </div>
    </Link>
  );
}

/**
 * Wraps the hero vacancy card: it tilts toward the mouse in 3D with a moving glare, and settles back when the mouse
 * leaves. Only on devices with a precise pointer and when motion is allowed.
 */
export function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const enabled = useRef(false);
  useEffect(() => { enabled.current = finePointer() && !prefersReducedMotion(); }, []);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!enabled.current || !outer.current || !inner.current) return;
    const r = outer.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    inner.current.style.transform = `rotateX(${(0.5 - py) * 9}deg) rotateY(${(px - 0.5) * 11}deg) translateZ(0)`;
    if (glare.current) { glare.current.style.opacity = '1'; glare.current.style.background = `radial-gradient(420px circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,.28), transparent 45%)`; }
  }, []);
  const reset = useCallback(() => {
    if (inner.current) inner.current.style.transform = '';
    if (glare.current) glare.current.style.opacity = '0';
  }, []);
  return (
    <div ref={outer} onPointerMove={onMove} onPointerLeave={reset} className={`[perspective:1100px] ${className}`}>
      <div ref={inner} className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d] will-change-transform">
        {children}
        <div ref={glare} aria-hidden="true" className="absolute inset-0 rounded-3xl pointer-events-none opacity-0 transition-opacity duration-300 mix-blend-soft-light" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────── "How it works": candidate / institution journey

type Step = { icon: LucideIcon; title: string; text: string; href: string; cta: string };
const JOURNEYS: Record<'candidate' | 'institution', { label: string; heading: string; steps: Step[] }> = {
  candidate: {
    label: 'I am a candidate',
    heading: 'From CV to campus interview.',
    steps: [
      { icon: Upload, title: 'Build your profile', text: 'Import your CV or add degrees, NET/SLET, publications and experience. Your UGC API score is worked out for you.', href: '/register', cta: 'Create a free profile' },
      { icon: Sparkles, title: 'See where you fit', text: 'Every vacancy shows your match score, criterion by criterion: qualifications, research, publications and experience.', href: '/jobs', cta: 'Browse vacancies' },
      { icon: Bell, title: 'Get matching alerts', text: 'Save a search with keywords and get new matching vacancies by e-mail, before the last date comes close.', href: '/register', cta: 'Set up alerts' },
      { icon: Send, title: 'Apply and track', text: 'Apply in one click and follow each application from screening to interview and offer, all in one place.', href: '/register', cta: 'Start applying' },
    ],
  },
  institution: {
    label: 'I hire for an institution',
    heading: 'From vacancy to offer letter.',
    steps: [
      { icon: Building2, title: 'Verify your institute', text: 'Register with your official e-mail. Your AISHE code is checked and your page shows NAAC and NIRF details.', href: '/register', cta: 'Register your institute' },
      { icon: FileCheck2, title: 'Post a compliant vacancy', text: '7th CPC pay levels, reservation and Ph.D. norms are built in, and every post carries Google job-search data.', href: '/register', cta: 'Post a vacancy' },
      { icon: Users, title: 'Shortlist and interview', text: 'Move applicants through an eight-stage board, search verified profiles and book interview slots.', href: '/register', cta: 'See the pipeline' },
      { icon: Trophy, title: 'Score and offer', text: 'Dean, HoD and experts score with rubrics out of 100; the merit list and offer letters follow.', href: '/premium#institutions', cta: 'See institution plans' },
    ],
  },
};

export function JourneySwitcher() {
  const motion = useMotionOK();
  const [who, setWho] = useState<'candidate' | 'institution'>('candidate');
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const period = 3800;
  const j = JOURNEYS[who];
  useEffect(() => {
    if (!motion || paused) return;
    const t = setInterval(() => setStep(s => (s + 1) % j.steps.length), period);
    return () => clearInterval(t);
  }, [motion, paused, j.steps.length, who]);
  const choose = (w: typeof who) => { setWho(w); setStep(0); };
  const s = j.steps[step];
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      {/* Who are you? */}
      <div role="tablist" aria-label="Show the journey for" className="relative grid grid-cols-2 p-1 rounded-2xl bg-white border border-brand-100 shadow-sm max-w-md">
        <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand-900 shadow transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ transform: who === 'institution' ? 'translateX(100%)' : 'none' }} />
        {(['candidate', 'institution'] as const).map(w => (
          <button key={w} type="button" role="tab" aria-selected={who === w} onClick={() => choose(w)}
            className={`relative z-10 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 ${who === w ? 'text-white' : 'text-slate-600 hover:text-brand-900'}`}>
            {w === 'candidate' ? <GraduationCap className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}{JOURNEYS[w].label}
          </button>
        ))}
      </div>

      <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-5"><span key={who} className={motion ? 'acx-swap inline-block' : undefined}>{j.heading}</span></h2>

      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 mt-5">
        <ol className="relative space-y-2" aria-label="Steps">
          <span aria-hidden="true" className="absolute left-[1.45rem] top-5 bottom-5 w-0.5 rounded-full bg-brand-100" />
          <span aria-hidden="true" className="absolute left-[1.45rem] top-5 w-0.5 rounded-full bg-gradient-to-b from-brand-700 to-gold-400 transition-all duration-700 ease-out"
            style={{ height: `calc(${(step / (j.steps.length - 1)) * 100}% - ${(step / (j.steps.length - 1)) * 2.5}rem)` }} />
          {j.steps.map((st, k) => {
            const active = k === step, done = k < step;
            return (
              <li key={st.title}>
                <button type="button" onClick={() => setStep(k)} aria-current={active ? 'step' : undefined}
                  className={`relative w-full flex items-center gap-3 p-2 rounded-xl text-left transition ${active ? 'bg-white shadow-md shadow-brand-900/5' : 'hover:bg-white/60'}`}>
                  <span className={`relative w-9 h-9 rounded-xl grid place-items-center shrink-0 ring-4 ring-blush transition-all duration-500 ${active ? 'bg-brand-900 text-white scale-110' : done ? 'bg-gold-400 text-brand-950' : 'bg-white text-brand-700 border border-brand-100'}`}>
                    <st.icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className={`text-sm font-semibold ${active ? 'text-brand-900' : 'text-slate-700'}`}><span className="text-slate-400 mr-1">{k + 1}.</span>{st.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="relative overflow-hidden rounded-2xl bg-white border border-brand-100 shadow-sm p-5 flex flex-col min-h-[13rem]" aria-live="polite">
          <div key={`${who}-${step}`} className={`flex-1 flex flex-col ${motion ? 'acx-panel-in' : ''}`}>
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-950 text-gold-300 grid place-items-center shadow-lg shadow-brand-900/20"><s.icon className="w-6 h-6" aria-hidden="true" /></span>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gold-700 mt-4">Step {step + 1} of {j.steps.length}</p>
            <h3 className="font-serif text-xl font-bold text-slate-900 mt-0.5">{s.title}</h3>
            <p className="text-sm text-slate-600 mt-1.5">{s.text}</p>
            <Link href={s.href} className="acx-magnet mt-auto pt-4 self-start inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:text-brand-950 transition-transform">
              {s.cta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {motion && (
            <div className="absolute left-0 right-0 bottom-0 h-1 bg-brand-50">
              <div key={`${who}-${step}-${paused}`} className="h-full bg-gradient-to-r from-brand-700 to-gold-400 origin-left" style={paused ? { transform: 'scaleX(0)' } : { animation: `acx-fill ${period}ms linear both` }} />
            </div>
          )}
        </div>
      </div>
      {motion && (
        <button type="button" onClick={() => setPaused(p => !p)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-800">
          {paused ? <><Play className="w-3.5 h-3.5" /> Play steps</> : <><Pause className="w-3.5 h-3.5" /> Pause steps</>}
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────── explainable score

export interface Weight { label: string; detail: string; weight: number; color: string }

/** The match-score weights: the bar grows in, and pointing at a criterion highlights its share of the bar. */
export function ScoreWeights({ weights }: { weights: Weight[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) { setSeen(true); return; }
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-slate-100">
        {weights.map((w, i) => (
          <div key={w.label} className={`${w.color} transition-all duration-700 ease-out`}
            style={{ width: seen ? `${w.weight}%` : '0%', transitionDelay: seen ? `${i * 120}ms` : '0ms', opacity: hot === null || hot === i ? 1 : 0.25 }} />
        ))}
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1">
        {weights.map((w, i) => (
          <button key={w.label} type="button" onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}
            className={`flex items-start gap-3 p-2 -mx-2 rounded-xl text-left transition ${hot === i ? 'bg-brand-50' : ''}`}>
            <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${w.color} transition-transform ${hot === i ? 'scale-150' : ''}`} />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-sm text-slate-900">{w.label}</span>
                <span className="font-serif text-lg font-bold text-slate-900">{w.weight}%</span>
              </span>
              <span className="block text-xs text-slate-500">{w.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

