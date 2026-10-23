'use client';

import { FounderSection } from '@/components/Founder';
import { promotionRank } from '@/components/Promotions';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import OurCustomers from '@/components/OurCustomers';
import HeroMatchPreview from '@/components/HeroMatchPreview';
import { StorageService, isDeadlinePassed } from '@/lib/storage';
import { payLabel, orNS, deadlineLabel, NOT_SPECIFIED } from '@/lib/display';
import { useCurrentUser, useStorageValue, homePathForRole } from '@/lib/useAuth';
import { Job, Institute } from '@/types';
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
} from 'lucide-react';

const MATCH_WEIGHTS = [
  { label: 'Statutory qualifications', detail: 'Ph.D. and NET/SLET as required by UGC / AICTE', weight: 35, color: 'bg-brand-700' },
  { label: 'Research alignment', detail: 'Your research areas vs. the department’s focus', weight: 30, color: 'bg-brand-500' },
  { label: 'Indexed publications', detail: 'UGC-CARE / Scopus / SCI papers vs. the benchmark', weight: 20, color: 'bg-gold-500' },
  { label: 'Experience', detail: 'Teaching, post-doctoral and industry years', weight: 15, color: 'bg-emerald-500' },
];

const FEATURES = [
  { icon: Scale, title: 'Explainable matching', text: 'Every match score comes with a criterion-by-criterion breakdown, strengths and gaps. No black boxes.' },
  { icon: LineChart, title: 'UGC Table 3A academic score', text: 'Your academic score is computed from your degrees, NET/JRF, publications, experience and awards.' },
  { icon: FileCheck2, title: 'Regulation-aware vacancies', text: '7th CPC pay levels, reservation categories, Ph.D. norms and publication benchmarks on every posting.' },
  { icon: Users, title: 'Selection committee scoring', text: 'Structured rubrics for the Dean, HoD and external experts, with recommendations kept on record.' },
  { icon: CalendarClock, title: 'Interview scheduling', text: 'Schedule campus or online interviews and keep candidates informed at each stage of selection.' },
  { icon: ShieldCheck, title: 'Data rights built in', text: 'Download your data, withdraw matching consent or erase your account, as set out in the DPDP Act, 2023.' },
];

const FAQS = [
  {
    q: 'Is AcadeXMatch free for candidates?',
    a: 'Yes, the Free plan lets you browse every vacancy, build your profile and apply on each institution\'s own website. Premium adds one-click applications through AcadeXMatch, Premium-only vacancies, application tracking, match scores, CV import and your UGC academic score. See the Plans page for details.',
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

export default function HomePage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const jobs = useStorageValue<Job[]>(() => StorageService.getPublishedJobs(), []);
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const openJobs = useMemo(() => jobs.filter(j => !isDeadlinePassed(j)), [jobs]);
  const latestJobs = useMemo(
    () => [...openJobs].sort((a, b) => promotionRank(b) - promotionRank(a) || b.postedAt.localeCompare(a.postedAt)).slice(0, 3),
    [openJobs],
  );
  const verifiedInstitutes = institutes.filter(i => i.verificationStatus === 'verified');
  const departments = new Set(openJobs.map(j => j.department)).size;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(query.trim() ? `/jobs?search=${encodeURIComponent(query.trim())}` : '/jobs');
  };

  return (
    <div className="w-full">
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200 hero-backdrop">
        <div className="absolute inset-0 hero-pattern" />
        <svg className="absolute -right-32 top-10 w-[46rem] h-[46rem] text-gold-400/40 pointer-events-none hidden md:block" viewBox="0 0 600 600" fill="none" aria-hidden="true">
          <circle cx="300" cy="300" r="240" stroke="currentColor" strokeWidth="1" />
          <circle cx="300" cy="300" r="180" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" />
          <path d="M40 520 C 180 360, 360 420, 580 120" stroke="#800000" strokeOpacity="0.12" strokeWidth="2" />
        </svg>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-12 gap-14 items-center">
          <div className="lg:col-span-6 space-y-8">
            <span className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs font-medium text-brand-800">
              <span className="px-2 py-0.5 rounded-full bg-brand-900 text-white text-[10px] font-semibold tracking-wide">New</span>
              Import your academic CV in seconds
            </span>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.6rem] font-bold text-brand-800 leading-[1.08] tracking-[-0.02em]">
              Where India&apos;s next generation of <span className="relative whitespace-nowrap text-brand-900">faculty<svg className="absolute left-0 -bottom-2 w-full h-3 text-gold-400" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9 C 60 2, 140 2, 198 8" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span> gets hired.
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
              AcadeXMatch connects scholars with universities, IITs, NITs and colleges. Every vacancy is mapped to UGC and AICTE norms, and every match comes with a clear explanation.
            </p>

            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 p-2 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-brand-900/5 max-w-xl focus-within:border-brand-400 transition">
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
              <button type="submit" className="px-6 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm hover:-translate-y-px">
                Search jobs <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              {user ? (
                <Link href={homePathForRole(user.role)} className="font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1.5">
                  Go to your dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1.5">
                    Create a free candidate profile <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link href="/register" className="font-medium text-slate-600 hover:text-slate-900">
                    Hiring faculty? Register your institute
                  </Link>
                </>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200 max-w-xl">
              {[
                { value: openJobs.length, label: 'Open vacancies' },
                { value: verifiedInstitutes.length, label: 'Verified institutions' },
                { value: departments, label: 'Departments hiring' },
              ].map(s => (
                <div key={s.label}>
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                  <dd className="font-serif text-3xl font-bold text-slate-900 mt-1">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Product preview */}
          <div className="lg:col-span-6 relative">
            <HeroMatchPreview />
          </div>
        </div>
      </section>

      {/* ───────────────────────── Institutions strip ───────────────────────── */}
      {verifiedInstitutes.length > 0 && (
        <section className="border-b border-slate-200 bg-cream">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
            <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-500 mb-6">Vacancies from leading institutions</p>
            <div className="flex flex-wrap justify-center gap-x-12 gap-y-4">
              {verifiedInstitutes.slice(0, 8).map(inst => (
                <Link key={inst.id} href={`/institutes/${inst.id}`} className="text-lg font-semibold text-slate-500 hover:text-brand-900 transition">
                  {inst.shortName}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────────────────────── Our customers ───────────────────────── */}
      <OurCustomers />

      {/* ───────────────────────── How it works ───────────────────────── */}
      <section id="how-it-works" className="scroll-mt-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />How it works</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">From CV to campus interview, in three steps.</h2>
          <p className="text-slate-600 mt-4 text-lg">Build one academic profile, then apply anywhere. Before you apply, you can see how well you fit each post.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-14">
          {[
            { icon: Upload, step: '01', title: 'Build your academic profile', text: 'Import your CV or fill in your degrees, NET/SLET, publications and experience. We compute your UGC Table 3A score as you go.' },
            { icon: Sparkles, step: '02', title: 'See where you fit', text: 'Every vacancy shows your match score with a full breakdown, so you can focus on posts where you meet the statutory criteria.' },
            { icon: Send, step: '03', title: 'Apply and track', text: 'Apply in one click and follow your application from screening to shortlisting, interview, committee review and offer.' },
          ].map(s => (
            <div key={s.step} className="relative p-8 rounded-3xl bg-ivory border border-slate-200 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5 hover:-translate-y-0.5 transition">
              <div className="flex items-center justify-between">
                <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 grid place-items-center">
                  <s.icon className="w-5 h-5" />
                </span>
                <span className="text-4xl font-bold text-gold-200">{s.step}</span>
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mt-6">{s.title}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed text-[15px]">{s.text}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ───────────────────────── Transparency ───────────────────────── */}
      <section className="bg-blush border-b border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-24 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Explainable by design</p>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">A match score you can actually read.</h2>
            <p className="text-slate-600 mt-4 text-lg leading-relaxed">
              We don&apos;t use video analysis, personality inference or hidden models. Each score is a published, weighted formula over the criteria that selection committees already use.
            </p>
            <ul className="mt-8 space-y-3 text-slate-700">
              {['Mandatory criteria are enforced: if you lack a required Ph.D. or NET, your score is capped', 'Strengths and gaps are listed in plain language for each vacancy', 'The same formula applies to every candidate'].map(t => (
                <li key={t} className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
            <div className="flex h-3 rounded-full overflow-hidden">
              {MATCH_WEIGHTS.map(w => (
                <div key={w.label} className={w.color} style={{ width: `${w.weight}%` }} />
              ))}
            </div>
            <div className="mt-8 space-y-6">
              {MATCH_WEIGHTS.map(w => (
                <div key={w.label} className="flex items-start gap-4">
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${w.color}`} />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-semibold text-slate-900">{w.label}</span>
                      <span className="font-serif text-2xl font-bold text-slate-900">{w.weight}%</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{w.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Latest vacancies ───────────────────────── */}
      {latestJobs.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-8 py-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Open now</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Latest faculty vacancies</h2>
            </div>
            <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
              View all {openJobs.length} vacancies <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {latestJobs.map(job => {
              const left = job.applicationDeadline ? daysLeft(job.applicationDeadline) : null;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex flex-col p-6 rounded-3xl bg-white border border-slate-200 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5 hover:-translate-y-0.5 transition"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-brand-700 truncate">{job.instituteShortName}{promotionRank(job) >= 2 && <span className="ml-2 text-[10px] font-bold text-gold-800 bg-gold-50 border border-gold-200 px-1.5 py-0.5 rounded">Featured</span>}{promotionRank(job) % 2 === 1 && <span className="ml-1 text-[10px] font-bold text-crimson-700 bg-crimson-50 border border-crimson-100 px-1.5 py-0.5 rounded">Urgent</span>}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${left !== null && left <= 14 ? 'bg-gold-50 text-gold-800' : 'bg-slate-100 text-slate-600'}`}>
                      {left === null ? 'Deadline not specified' : `${left} days left`}
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-bold text-slate-900 mt-3 leading-snug group-hover:text-brand-800 line-clamp-2">{job.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-1">{orNS(job.department)}</p>
                  <div className="mt-auto pt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 border-t border-slate-100 mt-5">
                    <span className="inline-flex items-center gap-1 pt-4"><MapPin className="w-3.5 h-3.5 text-slate-400" />{job.location.city || NOT_SPECIFIED}</span>
                    <span className="inline-flex items-center gap-1 pt-4"><IndianRupee className="w-3.5 h-3.5 text-slate-400" />{payLabel(job)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ───────────────────────── Features ───────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Platform</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Built around how Indian academia actually hires.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 mt-14">
          {FEATURES.map(f => (
            <div key={f.title}>
              <span className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 text-brand-900 grid place-items-center">
                <f.icon className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-slate-900 text-lg mt-5">{f.title}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed text-[15px]">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── For institutions ───────────────────────── */}
      <section id="for-institutions" className="scroll-mt-20 px-4 sm:px-8">
        <div className="relative max-w-7xl mx-auto overflow-hidden rounded-[2rem] bg-brand-950 text-white">
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-brand-600/30 blur-3xl" />
          <div className="relative grid lg:grid-cols-2 gap-12 p-8 sm:p-14 lg:p-16 items-center">
            <div>
              <p className="text-sm font-semibold text-gold-400">For universities &amp; colleges</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold mt-2 leading-tight">Run your entire faculty selection in one place.</h2>
              <p className="text-brand-100/80 mt-4 text-lg leading-relaxed">
                Publish vacancies with the right pay level and reservation category, then shortlist, interview and record committee scores, all in one auditable workflow. Available with the Institution Premium plan.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/register" className="px-6 py-3 rounded-xl bg-white text-brand-950 font-semibold text-sm hover:bg-gold-50 transition inline-flex items-center gap-2">
                  Register your institute <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/premium#institutions" className="px-6 py-3 rounded-xl border border-white/20 text-white font-semibold text-sm hover:bg-white/10 transition">
                  See institution pricing
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Building2, title: 'Verified profiles', text: 'AISHE-verified institute pages with NAAC and NIRF details.' },
                { icon: FileCheck2, title: 'Compliant postings', text: '7th CPC levels, Ph.D. norms and publication benchmarks.' },
                { icon: Users, title: 'Applicant pipeline', text: 'Eight-stage board, from screening to joining.' },
                { icon: ClipboardList, title: 'Committee rubric', text: 'Research, teaching, academic score and interview, out of 100.' },
              ].map(c => (
                <div key={c.title} className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <c.icon className="w-5 h-5 text-gold-400" />
                  <div className="font-semibold mt-3">{c.title}</div>
                  <div className="text-sm text-brand-100/70 mt-1 leading-relaxed">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FounderSection />

      {/* ───────────────────────── FAQ ───────────────────────── */}
      <section id="faq" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-8 py-24">
        <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 text-center">Frequently asked questions</h2>
        <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-6 py-5 text-left"
                aria-expanded={openFaq === i}
              >
                <span className="font-semibold text-slate-900">{f.q}</span>
                <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="pb-5 -mt-1 text-slate-600 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── Final CTA ───────────────────────── */}
      {!user && (
        <section className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-blush border border-brand-100 px-6 py-14 sm:px-14 text-center">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-900 via-gold-400 to-brand-900" />
          <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full border border-gold-300/60" aria-hidden="true" />
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full border border-brand-200" aria-hidden="true" />
          <h2 className="relative text-3xl sm:text-4xl font-bold text-brand-800">Your next academic appointment starts here.</h2>
          <p className="relative text-slate-600 mt-4 text-lg">Create your profile in minutes. It&apos;s free to browse and apply; <Link href="/premium" className="font-semibold text-brand-800 underline">Premium</Link> unlocks one-click applications and matching.</p>
          <div className="relative flex flex-wrap justify-center gap-3 mt-8">
            <Link href="/register" className="px-6 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm inline-flex items-center gap-2 shadow-sm transition">
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/jobs" className="px-6 py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-sm transition">
              Browse vacancies
            </Link>
          </div>
          </div>
        </section>
      )}
    </div>
  );
}
