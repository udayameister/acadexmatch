import React from 'react';
import {
  MapPin, IndianRupee, CalendarDays, GraduationCap, CheckCircle2, AlertCircle, Sparkles, BookOpen, FlaskConical,
  Briefcase, CalendarClock, TrendingUp, BadgeCheck,
} from 'lucide-react';

/*
 * Illustrative product preview for the home-page hero: a sample vacancy with an explainable match.
 * The data is a fixed example (not a live vacancy), so the hero always looks complete.
 */

const MATCH = 86;
const R = 34;
const CIRC = 2 * Math.PI * R;

const BREAKDOWN = [
  { label: 'Qualifications', value: 100, icon: GraduationCap },
  { label: 'Research alignment', value: 95, icon: FlaskConical },
  { label: 'Indexed publications', value: 90, icon: BookOpen },
  { label: 'Teaching experience', value: 65, icon: Briefcase },
];

export default function HeroMatchPreview() {
  return (
    <div className="relative mx-auto max-w-lg" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-brand-200/60 via-white to-gold-200/70 blur-2xl opacity-80" />

      <div className="relative rounded-3xl bg-white border border-brand-100 shadow-2xl shadow-brand-900/15 overflow-hidden acx-rise">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 px-6 pt-6 pb-16 text-white">
          <svg className="absolute right-0 top-0 h-full w-48 text-gold-300/20" viewBox="0 0 200 200" fill="none">
            <circle cx="170" cy="30" r="80" stroke="currentColor" strokeWidth="1" />
            <circle cx="170" cy="30" r="52" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
          </svg>
          <div className="relative flex items-center gap-2">
            <span className="w-10 h-10 rounded-xl bg-white/10 ring-1 ring-gold-300/40 grid place-items-center">
              <GraduationCap className="w-5 h-5 text-gold-300" />
            </span>
            <div className="text-[11px] leading-tight">
              <div className="font-semibold text-gold-200 tracking-wide uppercase">Sample match</div>
              <div className="text-brand-100/80">NAAC A++ university · Verified</div>
            </div>
            <BadgeCheck className="w-4 h-4 text-gold-300 ml-auto" />
          </div>
          <div className="relative font-serif text-xl font-bold leading-snug mt-4">Assistant Professor</div>
          <div className="relative text-sm text-brand-100/90">Computer Science &amp; Engineering</div>
          <div className="relative flex flex-wrap gap-1.5 mt-3 pr-24 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10"><MapPin className="w-3 h-3" /> Bengaluru</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10"><IndianRupee className="w-3 h-3" /> Level 10 · ₹57,700 + DA</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold-400/25 text-gold-100"><CalendarDays className="w-3 h-3" /> Closes in 12 days</span>
          </div>
        </div>

        {/* Match ring overlapping the band */}
        <div className="absolute right-5 top-[8.4rem] w-24 h-24 rounded-full bg-white shadow-lg shadow-brand-900/20 grid place-items-center">
          <svg viewBox="0 0 80 80" className="absolute inset-1.5 -rotate-90">
            <defs>
              <linearGradient id="acx-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#C6A15B" />
                <stop offset="100%" stopColor="#800000" />
              </linearGradient>
            </defs>
            <circle cx="40" cy="40" r={R} stroke="#F4DEDF" strokeWidth="7" fill="none" />
            <circle
              cx="40" cy="40" r={R} stroke="url(#acx-ring)" strokeWidth="7" fill="none" strokeLinecap="round"
              className="acx-ring" style={{ strokeDasharray: CIRC, ['--acx-ring-end' as string]: CIRC * (1 - MATCH / 100) }}
            />
          </svg>
          <div className="relative text-center leading-none">
            <div className="font-serif text-2xl font-bold text-brand-900">{MATCH}%</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mt-1">match</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-6 space-y-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800 pr-28">
            <Sparkles className="w-3.5 h-3.5 text-gold-500" /> Why you match
          </div>
          <div className="space-y-3">
            {BREAKDOWN.map(({ label, value, icon: Icon }, i) => (
              <div key={label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-slate-600"><Icon className="w-3.5 h-3.5 text-brand-500" />{label}</span>
                  <span className={`font-semibold ${value >= 80 ? 'text-brand-900' : 'text-gold-700'}`}>{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-brand-50 overflow-hidden">
                  <div
                    className={`h-full rounded-full acx-fill ${value >= 80 ? 'bg-gradient-to-r from-brand-700 to-brand-900' : 'bg-gradient-to-r from-gold-300 to-gold-500'}`}
                    style={{ width: `${value}%`, animationDelay: `${0.3 + i * 0.12}s` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {['Ph.D. · UGC 2018', 'UGC-NET', '6 Scopus papers'].map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800 font-medium">
                <CheckCircle2 className="w-3 h-3" /> {t}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold-50 border border-gold-200 text-gold-800 font-medium">
              <AlertCircle className="w-3 h-3" /> 1.4 yrs short of preferred experience
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {['bg-brand-200 text-brand-900', 'bg-gold-200 text-gold-900', 'bg-emerald-100 text-emerald-800'].map((c, i) => (
                  <span key={i} className={`w-7 h-7 rounded-full ring-2 ring-white grid place-items-center text-[10px] font-bold ${c}`}>{['PS', 'AK', 'RM'][i]}</span>
                ))}
              </div>
              <span className="text-[11px] text-slate-500">24 scholars applied</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-900 text-white text-xs font-semibold shadow-sm whitespace-nowrap">
              Apply in one click
            </span>
          </div>
        </div>
      </div>

      {/* Floating cards */}
      <div className="hidden sm:flex absolute -top-6 -right-8 items-center gap-3 rounded-2xl bg-brand-950 text-white shadow-xl shadow-brand-900/30 px-4 py-3 acx-float">
        <span className="w-8 h-8 rounded-lg bg-gold-400/20 grid place-items-center"><TrendingUp className="w-4 h-4 text-gold-300" /></span>
        <div className="leading-tight">
          <div className="text-[10px] uppercase tracking-wider text-brand-200">API score</div>
          <div className="text-sm font-bold">82<span className="text-brand-300 font-medium"> / 100</span></div>
        </div>
        <svg viewBox="0 0 48 20" className="w-12 h-5 text-gold-300" fill="none">
          <path d="M1 17 L10 13 L18 15 L27 8 L36 10 L47 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="hidden sm:flex absolute -bottom-14 -left-10 items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-xl px-4 py-3 acx-float" style={{ animationDelay: '1.5s' }}>
        <span className="relative w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
          <CalendarClock className="w-5 h-5" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white acx-ping" />
        </span>
        <div>
          <div className="text-xs font-semibold text-slate-900">Interview scheduled</div>
          <div className="text-[11px] text-slate-500">Mon, 10:30 AM · Selection committee</div>
        </div>
      </div>

      <div className="hidden sm:flex absolute -top-4 left-8 items-center gap-2 rounded-full bg-white border border-gold-200 shadow-lg px-3 py-1.5 acx-float" style={{ animationDelay: '0.8s' }}>
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="text-[11px] font-semibold text-slate-800">Shortlisted</span>
      </div>
    </div>
  );
}
