'use client';

import { FounderSection } from '@/components/Founder';
import { promotionRank } from '@/components/Promotions';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import OurCustomers from '@/components/OurCustomers';
import HeroMatchPreview from '@/components/HeroMatchPreview';
import HomeEventSections from '@/components/HomeEventSections';
import DonationSection from '@/components/DonationSection';
import HomeEventPosters from '@/components/HomeEventPosters';
import SocialSection from '@/components/SocialSection';
import LatestPosts from '@/components/LatestPosts';
import { Reveal, CountUp, RotatingText, ServiceMarquee, type MarqueeItem } from '@/components/HomeMotion';
import { StorageService, isDeadlinePassed, institutionFreeActive, eventsFreeActive } from '@/lib/storage';
import { payLabel, orNS, NOT_SPECIFIED } from '@/lib/display';
import { useCurrentUser, useStorageValue, homePathForRole } from '@/lib/useAuth';
import { Job, Institute, User, PlanSettings } from '@/types';
import {
  Search,
  ArrowRight,
  Sparkles,
  Scale,
  FileCheck2,
  Users,
  CalendarClock,
  ShieldCheck,
  Upload,
  Send,
  LineChart,
  Building2,
  MapPin,
  IndianRupee,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  FileText,
  Wand2,
  BadgeCheck,
  Mic,
  Presentation,
  Megaphone,
  Star,
  UserSearch,
  BarChart3,
  Trophy,
  Calculator,
  ListChecks,
  Bell,
  Newspaper,
  Heart,
  SearchCheck,
  Gift,
  type LucideIcon,
} from 'lucide-react';

const MATCH_WEIGHTS = [
  { label: 'Statutory qualifications', detail: 'Ph.D. and NET/SLET as required by UGC / AICTE', weight: 35, color: 'bg-brand-700' },
  { label: 'Research alignment', detail: 'Your research areas vs. the department’s focus', weight: 30, color: 'bg-brand-500' },
  { label: 'Indexed publications', detail: 'UGC-CARE / Scopus / SCI papers vs. the benchmark', weight: 20, color: 'bg-gold-500' },
  { label: 'Experience', detail: 'Teaching, post-doctoral and industry years', weight: 15, color: 'bg-emerald-500' },
];

type Service = { icon: LucideIcon; title: string; text: string; href: string; badge?: string; isPublic?: boolean };

const CANDIDATE_SERVICES: Service[] = [
  { icon: Newspaper, title: 'Fresh vacancies daily', text: 'New posts from across India, checked by our team before they go live.', href: '/jobs', badge: 'Daily', isPublic: true },
  { icon: Search, title: 'Smart vacancy search', text: 'Filter by state, discipline, designation and pay level.', href: '/jobs', isPublic: true },
  { icon: Bell, title: 'Job alerts', text: 'Matching vacancies by e-mail as soon as they are posted.', href: '/candidate/alerts' },
  { icon: Scale, title: 'Explainable match score', text: 'See how you fit each post, criterion by criterion.', href: '/jobs', isPublic: true },
  { icon: LineChart, title: 'Profile & UGC API score', text: 'One academic profile with your Table 3A score.', href: '/candidate/profile' },
  { icon: Upload, title: 'Import from CV', text: 'Fill your profile from an existing CV in seconds.', href: '/candidate/resume-parser' },
  { icon: Wand2, title: 'AI resume builder', text: 'Chat-guided, ATS-ready resume, improved by a second AI, as a PDF.', href: '/candidate/ai-resume', badge: 'New' },
  { icon: FileText, title: 'Resume checker', text: 'Find gaps in your resume before you apply.', href: '/candidate/resume-checker' },
  { icon: BadgeCheck, title: 'Verified green tick', text: 'Upload documents; once checked, institutions see the tick.', href: '/candidate/profile', badge: 'New' },
  { icon: Send, title: 'Apply & track', text: 'One-click applications, deadlines and status in one place.', href: '/candidate/applications' },
  { icon: Mic, title: 'Interview preparation', text: 'Prepare for teaching demos and panel questions.', href: '/candidate/interview-prep' },
  { icon: Presentation, title: 'FDPs & conferences', text: 'Workshops, seminars and calls for papers.', href: '/events', isPublic: true },
];

const INSTITUTION_SERVICES: Service[] = [
  { icon: Building2, title: 'Verified institute page', text: 'AISHE-verified profile with NAAC and NIRF details.', href: '/institutes', isPublic: true },
  { icon: FileCheck2, title: 'Compliant vacancy posts', text: '7th CPC levels, reservation and Ph.D. norms built in.', href: '/institute/post-job' },
  { icon: SearchCheck, title: 'Search-ready job pages', text: 'Every vacancy carries Google job-posting data.', href: '/jobs', isPublic: true },
  { icon: Star, title: 'Featured & urgent posts', text: 'Put priority vacancies at the top of search.', href: '/premium#institutions', isPublic: true },
  { icon: Users, title: 'Applicant pipeline', text: 'Eight-stage board, from screening to joining.', href: '/institute/ats' },
  { icon: UserSearch, title: 'Talent search', text: 'Find candidates, with verified green-tick profiles first.', href: '/institute/talent' },
  { icon: CalendarClock, title: 'Interview slots', text: 'Schedule campus or online interviews.', href: '/institute/interviews' },
  { icon: ClipboardList, title: 'Committee scoring', text: 'Rubrics for Dean, HoD and experts, out of 100.', href: '/institute/selection' },
  { icon: Trophy, title: 'Ranking & offers', text: 'Combined merit list and offer letters.', href: '/institute/selection' },
  { icon: BarChart3, title: 'Hiring reports', text: 'Vacancy analytics for NAAC / NBA records.', href: '/institute/reports' },
  { icon: Megaphone, title: 'Advertise FDPs & conferences', text: 'Promote workshops, seminars and calls for papers.', href: '/events/post', isPublic: true },
  { icon: Calculator, title: 'Salary calculator', text: '7th CPC pay with DA and HRA, for offers and budgets.', href: '/salary-calculator', isPublic: true },
];

/** The scrolling strip under the hero: every service, linking to its public page or to sign-up. */
const MARQUEE: MarqueeItem[] = [
  { icon: Newspaper, label: 'Fresh vacancies daily', href: '/jobs' },
  { icon: Wand2, label: 'AI resume builder', href: '/candidate/ai-resume' },
  { icon: BadgeCheck, label: 'Verified green tick', href: '/register' },
  { icon: Scale, label: 'Explainable match score', href: '/jobs' },
  { icon: Bell, label: 'Job alerts', href: '/register' },
  { icon: LineChart, label: 'UGC API score', href: '/register' },
  { icon: FileText, label: 'Resume checker', href: '/candidate/resume-checker' },
  { icon: Users, label: 'Applicant pipeline', href: '/register' },
  { icon: ClipboardList, label: 'Committee scoring', href: '/register' },
  { icon: Presentation, label: 'FDPs & conferences', href: '/events' },
  { icon: Calculator, label: '7th CPC salary calculator', href: '/salary-calculator' },
  { icon: Building2, label: 'Verified institutions', href: '/institutes' },
  { icon: Heart, label: 'Support AcadeXMatch', href: '/#support' },
];

const WHATS_NEW = ['AI resume builder', 'Verified green-tick profiles', 'Fresh vacancies every day', 'Job alerts by e-mail', 'Free FDP & conference listings'];

const STEPS = [
  { icon: Upload, title: 'Build your profile', text: 'Import your CV or add degrees, NET/SLET, publications and experience.' },
  { icon: Sparkles, title: 'See where you fit', text: 'Every vacancy shows your match score with a full breakdown.' },
  { icon: Send, title: 'Apply and track', text: 'Follow each application from screening to interview and offer.' },
];

const FAQS = [
  {
    q: 'Is AcadeXMatch free for candidates?',
    a: 'Yes. Browsing vacancies, your academic profile, one-click applications, match scores, CV import, alerts and application tracking are free for candidates. Optional tools such as the AI resume builder are charged per use.',
  },
  {
    q: 'Where do the vacancies come from?',
    a: 'Institutions post their vacancies directly. Our team also collects new faculty vacancies from public notifications every day and checks each one, including duplicates and last dates, before it is published. Always confirm the details in the institution\'s official notification before applying.',
  },
  {
    q: 'How is the match score calculated?',
    a: 'It is a deterministic weighted score: qualifications 35%, research alignment 30%, indexed publications 20% and experience 15%. If a mandatory requirement such as a Ph.D. is missing, the score is capped below 50%. You can open the full breakdown for any vacancy.',
  },
  {
    q: 'Is the API score an official UGC score?',
    a: 'No. It is an estimate based on the UGC Regulations 2018, Table 3A short-listing criteria and the details in your profile. Institutions verify documents independently during selection.',
  },
  {
    q: 'What does the green tick mean?',
    a: 'Candidates who complete their profile and upload their supporting documents can ask for verification. Once an administrator has checked them, a green tick appears on the profile for the candidate and for institutions.',
  },
  {
    q: 'How do institutions join?',
    a: 'An administrator registers with an official institute email. Institutes that are already listed are matched by email domain; new institutes can post vacancies after their AISHE code has been verified.',
  },
  {
    q: 'What happens to my CV when I import it?',
    a: 'The CV is read and parsed in your browser. Only the fields you choose to save are added to your profile.',
  },
];

function daysLeft(deadline: string): number {
  return Math.ceil((Date.parse(deadline) - Date.now()) / 86400000);
}

const isInstitutionRole = (role?: User['role']) => role === 'institute_admin' || role === 'recruiter' || role === 'super_admin';
const isCandidateRole = (role?: User['role']) => role === 'candidate' || role === 'super_admin';

/** One service tile. Private tools link only for the matching signed-in role; otherwise the panel's own button leads to sign-up. */
function ServiceItem({ s, linked, dark }: { s: Service; linked: boolean; dark?: boolean }) {
  const body = (
    <>
      <span className={`acx-tile-icon w-9 h-9 rounded-lg grid place-items-center shrink-0 ${dark ? 'bg-white/10 text-gold-300' : 'bg-brand-50 text-brand-800 border border-brand-100'}`}>
        <s.icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>
          {s.title}
          {s.badge && <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-px rounded ${dark ? 'bg-gold-400 text-brand-950' : 'bg-gold-100 text-gold-800'}`}>{s.badge}</span>}
        </span>
        <span className={`hidden sm:block text-xs leading-snug mt-0.5 ${dark ? 'text-brand-100/70' : 'text-slate-500'}`}>{s.text}</span>
      </span>
    </>
  );
  const cls = `acx-tile flex items-center sm:items-start gap-3 p-2 sm:p-2.5 rounded-xl transition ${dark ? 'hover:bg-white/5' : 'hover:bg-white hover:shadow-sm'}`;
  return linked ? <Link href={s.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

const Eyebrow = ({ children, light }: { children: React.ReactNode; light?: boolean }) => (
  <p className={`text-xs font-semibold uppercase tracking-[0.14em] flex items-center gap-3 ${light ? 'text-gold-300' : 'text-brand-700'}`}><span className="gold-rule" />{children}</p>
);

export default function HomePage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const jobs = useStorageValue<Job[]>(() => StorageService.getPublishedJobs(), []);
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const plan = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const instFree = institutionFreeActive(plan);
  const eventsFree = eventsFreeActive(plan);
  const fmtUntil = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  const openJobs = useMemo(() => jobs.filter(j => !isDeadlinePassed(j)), [jobs]);
  const latestJobs = useMemo(
    () => [...openJobs].sort((a, b) => promotionRank(b) - promotionRank(a) || b.postedAt.localeCompare(a.postedAt)).slice(0, 6),
    [openJobs],
  );
  const verifiedInstitutes = institutes.filter(i => i.verificationStatus === 'verified');
  const departments = new Set(openJobs.map(j => j.department)).size;
  const states = new Set(openJobs.map(j => j.location?.state).filter(Boolean)).size;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(query.trim() ? `/jobs?search=${encodeURIComponent(query.trim())}` : '/jobs');
  };

  return (
    <div className="w-full">
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200 hero-backdrop">
        <div className="absolute inset-0 hero-pattern" />
        <svg className="absolute -right-32 top-6 w-[42rem] h-[42rem] text-gold-400/40 pointer-events-none hidden md:block" viewBox="0 0 600 600" fill="none" aria-hidden="true">
          <circle cx="300" cy="300" r="240" stroke="currentColor" strokeWidth="1" />
          <circle cx="300" cy="300" r="180" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" />
          <path d="M40 520 C 180 360, 360 420, 580 120" stroke="#800000" strokeOpacity="0.12" strokeWidth="2" />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-10 lg:pt-12 lg:pb-14 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <span className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs font-medium text-brand-800">
              <span className="px-2 py-0.5 rounded-full bg-brand-900 text-white text-[11px] font-semibold tracking-wide">What&apos;s new</span>
              <RotatingText items={WHATS_NEW} className="min-w-[12rem]" />
            </span>

            <h1 className="font-serif text-[2.1rem] sm:text-5xl lg:text-[3.3rem] font-bold text-brand-800 leading-[1.08] tracking-[-0.02em]">
              Where India&apos;s next generation of <span className="relative whitespace-nowrap text-brand-900">faculty<svg className="absolute left-0 -bottom-2 w-full h-3 text-gold-400" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9 C 60 2, 140 2, 198 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span> gets hired.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              One platform for scholars and institutions: UGC- and AICTE-aware vacancies, explainable matching, and a complete selection workflow from posting to offer.
            </p>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 p-1.5 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-brand-900/5 max-w-xl focus-within:border-brand-400 transition">
              <div className="flex-1 flex items-center gap-2.5 px-3">
                <Search className="w-5 h-5 text-slate-400 shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Designation, department or institution"
                  aria-label="Search vacancies"
                  className="w-full py-2.5 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                />
              </div>
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm hover:-translate-y-px">
                Search jobs <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 mr-1">Popular:</span>
              {[
                { href: '/jobs', label: 'All vacancies', icon: ListChecks },
                { href: '/salary-calculator', label: 'Salary calculator', icon: Calculator },
                { href: '/events', label: 'FDPs & workshops', icon: Presentation },
                { href: '/conferences', label: 'Conferences', icon: GraduationCap },
              ].map(c => (
                <Link key={c.href} href={c.href} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 border border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-900 transition">
                  <c.icon className="w-3.5 h-3.5 text-brand-700" aria-hidden="true" />{c.label}
                </Link>
              ))}
            </div>

            <dl className="grid grid-cols-4 gap-3 pt-4 border-t border-slate-200 max-w-xl">
              {[
                { value: openJobs.length, label: 'Open vacancies' },
                { value: verifiedInstitutes.length, label: 'Verified institutions' },
                { value: departments, label: 'Departments' },
                { value: states, label: 'States' },
              ].map(s => (
                <div key={s.label}>
                  <dd className="font-serif text-2xl sm:text-3xl font-bold text-slate-900"><CountUp value={s.value} /></dd>
                  <dt className="text-[11px] sm:text-xs text-slate-500 leading-tight">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* Product preview */}
          <div className="lg:col-span-6 relative">
            <HeroMatchPreview jobs={jobs} institutes={institutes} user={user} />
            {/* Floating service badges (decorative; the services are listed in full below). */}
            <div aria-hidden="true" className="hidden xl:block">
              <span className="acx-bob absolute left-1/3 -top-5 inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-lg text-xs font-semibold text-slate-800" style={{ ['--acx-tilt' as string]: '-4deg' }}>
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white grid place-items-center"><BadgeCheck className="w-3.5 h-3.5" /></span>Verified green tick
              </span>
              <span className="acx-bob absolute -right-6 top-[46%] inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-lg text-xs font-semibold text-slate-800" style={{ animationDelay: '1.4s', ['--acx-tilt' as string]: '3deg' }}>
                <span className="w-6 h-6 rounded-full bg-brand-900 text-white grid place-items-center"><Wand2 className="w-3.5 h-3.5" /></span>AI resume ready
              </span>
              <span className="acx-bob absolute right-8 -bottom-6 inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-lg text-xs font-semibold text-slate-800" style={{ animationDelay: '2.6s', ['--acx-tilt' as string]: '-2deg' }}>
                <span className="w-6 h-6 rounded-full bg-gold-400 text-brand-950 grid place-items-center"><Bell className="w-3.5 h-3.5" /></span>New vacancy alert
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Services ticker ───────────────────────── */}
      <section aria-label="Services at a glance" className="bg-cream border-b border-slate-200 py-3">
        <ServiceMarquee items={MARQUEE} />
      </section>

      {/* ───────────────────────── Services: candidates & institutions ───────────────────────── */}
      <section id="services" className="scroll-mt-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 lg:py-14">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <Eyebrow>Our services</Eyebrow>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">Everything faculty hiring needs, on one platform.</h2>
            </div>
            <p className="text-sm text-slate-500 max-w-md">Tools for scholars looking for their next post, and for institutions running fair, regulation-aware selection.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-5 mt-6">
            {/* Candidates */}
            <Reveal className="relative overflow-hidden rounded-3xl bg-ivory border border-slate-200 p-4 sm:p-5 flex flex-col">
              <div className="acx-sheen absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#800000,#c6a15b,#800000,#c6a15b)]" aria-hidden="true" />
              <div className="flex items-center gap-3 px-1">
                <span className="w-11 h-11 rounded-2xl bg-brand-900 text-white grid place-items-center shadow-sm"><GraduationCap className="w-5 h-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="font-serif text-xl font-bold text-slate-900 leading-tight">For candidates</h3>
                  <p className="text-xs text-slate-500">Assistant Professors to Professors, post-docs and researchers</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-1 sm:gap-x-2 gap-y-0.5 mt-3">
                {CANDIDATE_SERVICES.map((s, i) => <Reveal key={s.title} delay={i * 45}><ServiceItem s={s} linked={!!s.isPublic || isCandidateRole(user?.role)} /></Reveal>)}
              </div>
              <div className="flex flex-wrap gap-2 mt-auto pt-4 px-1">
                {user && isCandidateRole(user.role) ? (
                  <Link href={homePathForRole(user.role)} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition">Go to your dashboard <ArrowRight className="w-4 h-4" /></Link>
                ) : (
                  <Link href="/register" className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition">Create a free profile <ArrowRight className="w-4 h-4" /></Link>
                )}
                <Link href="/jobs" className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-brand-300 text-slate-800 text-sm font-semibold transition">Browse vacancies</Link>
              </div>
            </Reveal>

            {/* Institutions */}
            <div id="for-institutions" className="scroll-mt-20 relative overflow-hidden rounded-3xl bg-brand-950 text-white p-4 sm:p-5 flex flex-col">
              <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden="true" />
              <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-brand-600/30 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3 px-1">
                <span className="w-11 h-11 rounded-2xl bg-gold-400 text-brand-950 grid place-items-center shadow-sm"><Building2 className="w-5 h-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="font-serif text-xl font-bold leading-tight">For institutions</h3>
                  <p className="text-xs text-brand-100/70">Universities, IITs, NITs, colleges and research institutes</p>
                </div>
              </div>
              {(instFree || eventsFree) && (
                <div className="relative mt-3 mx-1 px-3 py-2 rounded-xl bg-gold-400/15 border border-gold-300/40 text-xs text-gold-100 flex items-start gap-2">
                  <Gift className="w-4 h-4 text-gold-300 shrink-0 mt-px acx-bob" aria-hidden="true" />
                  <span>
                    <strong className="text-white">Launch offer:</strong>{' '}
                    {instFree && <>all institution tools free until {fmtUntil(plan.institutionFreeUntil)} for verified institutions</>}
                    {instFree && eventsFree && '; '}
                    {eventsFree && <>FDP and conference listings free until {fmtUntil(plan.eventsFreeUntil)}</>}.
                  </span>
                </div>
              )}
              <div className="relative grid grid-cols-2 gap-x-1 sm:gap-x-2 gap-y-0.5 mt-3">
                {INSTITUTION_SERVICES.map((s, i) => <Reveal key={s.title} delay={i * 45}><ServiceItem s={s} dark linked={!!s.isPublic || isInstitutionRole(user?.role)} /></Reveal>)}
              </div>
              <div className="relative flex flex-wrap gap-2 mt-auto pt-4 px-1">
                {user && isInstitutionRole(user.role) ? (
                  <Link href={homePathForRole(user.role)} className="px-4 py-2 rounded-xl bg-white text-brand-950 hover:bg-gold-50 text-sm font-semibold inline-flex items-center gap-1.5 transition">Go to your dashboard <ArrowRight className="w-4 h-4" /></Link>
                ) : (
                  <Link href="/register" className="px-4 py-2 rounded-xl bg-white text-brand-950 hover:bg-gold-50 text-sm font-semibold inline-flex items-center gap-1.5 transition">Register your institute <ArrowRight className="w-4 h-4" /></Link>
                )}
                <Link href="/premium#institutions" className="px-4 py-2 rounded-xl border border-white/20 hover:bg-white/10 text-white text-sm font-semibold transition">See institution plans</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Latest vacancies ───────────────────────── */}
      {latestJobs.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 lg:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <Eyebrow>Open now</Eyebrow>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">Latest faculty vacancies</h2>
            </div>
            <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
              View all {openJobs.length} vacancies <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            {latestJobs.map((job, idx) => {
              const left = job.applicationDeadline ? daysLeft(job.applicationDeadline) : null;
              return (
                <Reveal key={job.id} delay={idx * 70} className="min-w-0 flex">
                <Link
                  href={`/jobs/${job.id}`}
                  className="group w-full min-w-0 flex flex-col p-4 rounded-2xl bg-white border border-slate-200 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5 hover:-translate-y-0.5 transition"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-brand-700 truncate">{job.instituteShortName}{promotionRank(job) >= 2 && <span className="ml-2 text-[11px] font-bold text-gold-800 bg-gold-50 border border-gold-200 px-1.5 py-0.5 rounded">Featured</span>}{promotionRank(job) % 2 === 1 && <span className="ml-1 text-[11px] font-bold text-crimson-700 bg-crimson-50 border border-crimson-100 px-1.5 py-0.5 rounded">Urgent</span>}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${left !== null && left <= 14 ? 'bg-gold-50 text-gold-800' : 'bg-slate-100 text-slate-600'}`}>
                      {left === null ? 'No deadline given' : `${left} days left`}
                    </span>
                  </div>
                  <h3 className="font-serif text-base font-bold text-slate-900 mt-2 leading-snug group-hover:text-brand-800 line-clamp-2">{job.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{orNS(job.department)}</p>
                  <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" />{job.location.city || NOT_SPECIFIED}</span>
                    <span className="inline-flex items-center gap-1 min-w-0 max-w-full"><IndianRupee className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="truncate">{payLabel(job)}</span></span>
                  </div>
                </Link>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* ───────────────────────── Highlighted events, as posters ───────────────────────── */}
      <HomeEventPosters />

      {/* ───────────────────────── Advertised FDPs / workshops / seminars, and conferences ───────────────────────── */}
      <HomeEventSections />

      {/* ───────────────────────── How it works + explainable score ───────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 bg-blush border-y border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 lg:py-14 grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">From CV to campus interview, in three steps.</h2>
            <Reveal as="div" className="relative mt-5">
            <span className="acx-draw absolute left-[2.45rem] top-6 bottom-6 w-0.5 bg-gradient-to-b from-brand-700 via-gold-400 to-emerald-500 rounded-full" aria-hidden="true" />
            <ol className="relative space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="acx-tile flex gap-4 p-4 rounded-2xl bg-white/80 border border-brand-100 hover:bg-white hover:shadow-md transition">
                  <span className="acx-tile-icon relative w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0 ring-4 ring-blush">
                    <s.icon className="w-5 h-5" aria-hidden="true" />
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold-400 text-brand-950 text-[11px] font-bold grid place-items-center">{i + 1}</span>
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-900">{s.title}</h3>
                    <p className="text-sm text-slate-600 mt-0.5">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            </Reveal>
          </div>

          <div>
            <Eyebrow>Explainable by design</Eyebrow>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5">A match score you can actually read.</h2>
            <div className="mt-5 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                {MATCH_WEIGHTS.map(w => <div key={w.label} className={w.color} style={{ width: `${w.weight}%` }} />)}
              </div>
              <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {MATCH_WEIGHTS.map(w => (
                  <div key={w.label} className="flex items-start gap-3">
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${w.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">{w.label}</span>
                        <span className="font-serif text-lg font-bold text-slate-900">{w.weight}%</span>
                      </div>
                      <p className="text-xs text-slate-500">{w.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <ul className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-sm text-slate-700">
                {['Missing a mandatory Ph.D. or NET caps the score', 'Strengths and gaps in plain language', 'The same published formula for every candidate'].map(t => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> <span>{t}</span></li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" /> No video analysis or personality inference. Your data rights follow the DPDP Act, 2023.</p>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Institutions strip ───────────────────────── */}
      {verifiedInstitutes.length > 0 && (
        <section className="border-b border-slate-200 bg-cream">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shrink-0">Vacancies from</p>
            <div className="flex flex-wrap gap-x-7 gap-y-2">
              {verifiedInstitutes.slice(0, 10).map(inst => (
                <Link key={inst.id} href={`/institutes/${inst.id}`} className="text-[15px] font-semibold text-slate-500 hover:text-brand-900 transition">
                  {inst.shortName}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────────────────────── Our customers ───────────────────────── */}
      <OurCustomers />

      {/* ───────────────────────── Social media ───────────────────────── */}
      <LatestPosts />
      <SocialSection />

      <FounderSection />

      {/* ───────────────────────── FAQ ───────────────────────── */}
      <section id="faq" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-8 py-10 lg:py-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 text-center">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-6 py-3.5 text-left"
                aria-expanded={openFaq === i}
              >
                <span className="font-semibold text-slate-900 text-[15px]">{f.q}</span>
                <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="pb-4 -mt-1 text-sm text-slate-600 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── Voluntary contribution ───────────────────────── */}
      <DonationSection />

      {/* ───────────────────────── Final CTA ───────────────────────── */}
      {!user && (
        <section className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-blush border border-brand-100 px-6 py-9 sm:px-12 text-center">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-900 via-gold-400 to-brand-900" />
            <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full border border-gold-300/60" aria-hidden="true" />
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border border-brand-200" aria-hidden="true" />
            <h2 className="relative font-serif text-2xl sm:text-3xl font-bold text-brand-800">Your next academic appointment starts here.</h2>
            <p className="relative text-slate-600 mt-2">Free for candidates. Institutions register in minutes with an official email.</p>
            <div className="relative flex flex-wrap justify-center gap-3 mt-5">
              <Link href="/register" className="px-6 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm inline-flex items-center gap-2 shadow-sm transition">
                Get started <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/jobs" className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-sm transition">
                Browse vacancies
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
