'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FACEBOOK_URL, SOCIAL_LINKS, type SocialLink } from '@/lib/contact';
import { SITE_URL } from '@/lib/site';
import { Reveal } from '@/components/HomeMotion';
import { ArrowRight, BellRing, CalendarDays, Megaphone, Newspaper, Share2 } from 'lucide-react';

/** Simple network marks (inline, so no third-party script is needed to draw them). */
export function SocialIcon({ network, className = 'w-4 h-4' }: { network: SocialLink['network']; className?: string }) {
  const paths: Record<SocialLink['network'], string> = {
    facebook: 'M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3z',
    instagram: 'M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM12 4c2.2 0 2.4 0 3.3.1 2.2.1 3.2 1.1 3.3 3.3.1.9.1 1.1.1 3.3v2.6c0 2.2 0 2.4-.1 3.3-.1 2.2-1.1 3.2-3.3 3.3-.9.1-1.1.1-3.3.1s-2.4 0-3.3-.1c-2.2-.1-3.2-1.1-3.3-3.3C5.3 15.7 5.3 15.5 5.3 13.3v-2.6c0-2.2 0-2.4.1-3.3.1-2.2 1.1-3.2 3.3-3.3.9-.1 1.1-.1 3.3-.1z',
    linkedin: 'M6.9 8.8H4V20h2.9V8.8zM5.4 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20 13.6c0-3-1.6-5-4.3-5-1.4 0-2.4.8-2.8 1.5V8.8H10V20h2.9v-5.6c0-1.5.3-2.9 2.1-2.9 1.8 0 1.8 1.7 1.8 3V20H20v-6.4z',
    x: 'M17.7 4h2.8l-6.1 7 7.2 9h-5.6l-4.4-5.7L6.5 20H3.7l6.5-7.5L3.3 4h5.7l4 5.2L17.7 4zm-1 14.4h1.6L8.4 5.5H6.7l10 12.9z',
    youtube: 'M21.6 8.2a2.5 2.5 0 0 0-1.8-1.8C18.2 6 12 6 12 6s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 9.8 2 12 2 12s0 2.2.4 3.8a2.5 2.5 0 0 0 1.8 1.8C5.8 18 12 18 12 18s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-3.8.4-3.8s0-2.2-.4-3.8zM10 14.8V9.2l5 2.8-5 2.8z',
    whatsapp: 'M12 3.5a8.4 8.4 0 0 0-7.2 12.8L3.6 20.5l4.3-1.1A8.4 8.4 0 1 0 12 3.5zm4.9 11.9c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-3.3-.8-2.7-1.1-4.5-3.9-4.6-4-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 .9c.3.1.5.2.5.3.1.2.1.7-.1 1.2z',
  };
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d={paths[network]} /></svg>;
}

const POSTS_ABOUT = [
  { icon: Newspaper, text: 'New faculty vacancies across India, every day' },
  { icon: CalendarDays, text: 'FDPs, workshops, seminars and conference calls' },
  { icon: BellRing, text: 'Last-date reminders and walk-in interviews' },
  { icon: Megaphone, text: 'New AcadeXMatch features and launch offers' },
];

/**
 * Facebook's own page plugin (an iframe), loaded only when the section is about to scroll into view, so the
 * home page stays fast and Facebook is not contacted by visitors who never reach it.
 */
function FacebookTimeline({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => { const w = Math.floor(el.parentElement?.clientWidth || el.clientWidth); setWidth(Math.max(180, Math.min(500, w))); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (typeof IntersectionObserver === 'undefined') { setLoad(true); return () => ro?.disconnect(); }
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { setLoad(true); io.disconnect(); } }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => { io.disconnect(); ro?.disconnect(); };
  }, []);
  const height = 620;
  const src = `https://www.facebook.com/plugins/page.php?${new URLSearchParams({
    href: url, tabs: 'timeline', width: String(width || 500), height: String(height),
    small_header: 'false', adapt_container_width: 'true', hide_cover: 'false', show_facepile: 'true',
  })}`;
  return (
    <div ref={box} className="w-full min-w-0 max-w-[500px] mx-auto">
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm max-w-full" style={{ height }}>
        {load && width > 0 ? (
          <iframe
            key={width}
            title="AcadeXMatch posts on Facebook"
            src={src}
            width={width}
            height={height}
            style={{ border: 'none', overflow: 'hidden', display: 'block', maxWidth: '100%' }}
            scrolling="no"
            loading="lazy"
            allow="encrypted-media; clipboard-write; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="h-full grid place-items-center text-sm text-slate-400">Loading posts from Facebook…</div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2 text-center">
        Posts shown by Facebook. Not loading? <a href={url} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-brand-800">See all posts on our Facebook page</a>.
      </p>
    </div>
  );
}

/** Home page: follow AcadeXMatch on social media, with the latest Facebook posts. */
export default function SocialSection() {
  if (!SOCIAL_LINKS.length) return null;
  const share = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE_URL)}`;
  return (
    <section id="social" aria-labelledby="social-title" className="scroll-mt-20 border-y border-slate-200 bg-[linear-gradient(180deg,#f5f7fb_0%,#ffffff_100%)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 lg:py-14 grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        <Reveal className="space-y-5 min-w-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] flex items-center gap-3 text-brand-700"><span className="gold-rule" />Follow us</p>
            <h2 id="social-title" className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">Stay updated on social media</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-lg">Follow AcadeXMatch for the latest vacancies, faculty development programmes and platform news, as soon as we post them.</p>
          </div>

          <ul className="grid sm:grid-cols-2 gap-2.5">
            {POSTS_ABOUT.map(p => (
              <li key={p.text} className="acx-tile flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-200">
                <span className="acx-tile-icon w-8 h-8 rounded-lg bg-brand-50 text-brand-800 grid place-items-center shrink-0"><p.icon className="w-4 h-4" aria-hidden="true" /></span>
                <span className="text-sm text-slate-700">{p.text}</span>
              </li>
            ))}
          </ul>

          {FACEBOOK_URL && (
            <div className="relative overflow-hidden p-5 rounded-2xl bg-[#1877F2] text-white shadow-lg shadow-[#1877F2]/20">
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-white text-[#1877F2] grid place-items-center shrink-0 acx-bob"><SocialIcon network="facebook" className="w-7 h-7" /></span>
                <div>
                  <div className="font-bold text-lg leading-tight">AcadeXMatch on Facebook</div>
                  <div className="text-sm text-white/85">Like and follow our page to see every post</div>
                </div>
              </div>
              <div className="relative flex flex-wrap gap-2 mt-4">
                <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#1877F2] text-sm font-bold hover:bg-blue-50 transition">
                  Follow on Facebook <ArrowRight className="w-4 h-4" />
                </a>
                <a href={share} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition">
                  <Share2 className="w-4 h-4" /> Share AcadeXMatch
                </a>
              </div>
            </div>
          )}

          {SOCIAL_LINKS.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {SOCIAL_LINKS.filter(l => l.network !== 'facebook').map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-brand-300 transition">
                  <SocialIcon network={l.network} /> {l.label}
                </a>
              ))}
            </div>
          )}
        </Reveal>

        {FACEBOOK_URL && (
          <Reveal delay={120} className="min-w-0">
            <FacebookTimeline url={FACEBOOK_URL} />
          </Reveal>
        )}
      </div>
    </section>
  );
}
