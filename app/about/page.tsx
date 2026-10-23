import type { Metadata } from 'next';
import Link from 'next/link';
import { FounderProfile } from '@/components/Founder';
import { ShieldCheck, Scale, Sparkles, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About AcadeXMatch — Founder & CEO Udayakumar Palanivelu',
  description: 'AcadeXMatch is an academic recruitment platform for Indian higher education, founded by Udayakumar Palanivelu.',
};

const VALUES = [
  { icon: Scale, title: 'Regulation-aware', text: 'Every vacancy is mapped to UGC and AICTE norms and the 7th CPC pay matrix, so eligibility is clear before anyone applies.' },
  { icon: Sparkles, title: 'Explainable matching', text: 'Candidates see why they match a post, criterion by criterion — no black-box scores.' },
  { icon: ShieldCheck, title: 'Trust and privacy', text: 'Verified institutions, verified documents and data rights under the DPDP Act, 2023.' },
];

export default function AboutPage() {
  return (
    <div className="w-full">
      <section className="hero-backdrop border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-16 text-center">
          <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />About us</p>
          <h1 className="font-serif text-3xl sm:text-5xl font-bold text-brand-800 mt-3 tracking-[-0.02em]">Connecting India&apos;s scholars with its classrooms</h1>
          <p className="text-slate-600 mt-4 text-lg max-w-2xl mx-auto">AcadeXMatch is the academic recruitment platform for Indian higher education — built by an educator, for educators and the institutions that hire them.</p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16">
        <FounderProfile />
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">What we stand for</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-5">
          {VALUES.map(v => (
            <div key={v.title} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <v.icon className="w-6 h-6 text-brand-700" aria-hidden="true" />
              <h3 className="font-semibold text-slate-900 mt-3">{v.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{v.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/jobs" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">Browse vacancies <ArrowRight className="w-4 h-4" /></Link>
          <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:border-brand-300">Register your institute</Link>
        </div>
      </section>
    </div>
  );
}
