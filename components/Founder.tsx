import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Award, GraduationCap, Globe, BookOpen, ArrowRight, UserRound, Code2 } from 'lucide-react';

/** Founder details shown on the home page and the About page. Edit here to update both. */
export const FOUNDER = {
  name: 'Udayakumar Palanivelu',
  role: 'Founder & CEO, AcadeXMatch',
  photo: '/brand/founder.jpg',
  summary:
    'Assistant Professor in Computer Science and Engineering (AI & ML) at Madanapalle Institute of Technology and Science, Andhra Pradesh, with more than 15 years of teaching experience in India and Ethiopia.',
  highlights: [
    { icon: GraduationCap, text: 'Assistant Professor, Department of CSE (AI & ML), Madanapalle Institute of Technology and Science (MITS)' },
    { icon: BookOpen, text: 'Ph.D. research scholar at Vellore Institute of Technology (VIT) — deep learning, graph neural networks and brain connectome analysis' },
    { icon: Award, text: 'Raman Research Award (2024, 2025) and Dr. APJ Abdul Kalam Award (2024), VIT' },
    { icon: Award, text: 'Certified in Deep Learning (NPTEL, IIT Ropar) and Oracle Generative AI' },
  ],
  note:
    'After more than fifteen years in classrooms and research labs, I have seen how hard faculty hiring is on both sides: candidates chase scattered notices and unclear eligibility rules, and institutions sift through hundreds of applications by hand. AcadeXMatch brings every vacancy, every UGC and AICTE norm and every step of selection into one transparent place — so the right teacher reaches the right classroom.',
  links: [
    { icon: UserRound, label: 'LinkedIn', href: 'https://www.linkedin.com/in/udayakumar-palanivelu-934bb941' },
    { icon: Globe, label: 'Website', href: 'https://udayakumar.vercel.app/' },
    { icon: Code2, label: 'GitHub', href: 'https://github.com/udayameister' },
  ],
};

function Photo({ size }: { size: 'md' | 'lg' }) {
  const px = size === 'lg' ? 320 : 220;
  return (
    <div className="relative shrink-0">
      <div className="absolute -inset-2 rounded-[2rem] border border-gold-300/70 rotate-2" aria-hidden="true" />
      <Image src={FOUNDER.photo} alt={`${FOUNDER.name}, ${FOUNDER.role}`} width={px} height={Math.round(px * 447 / 436)}
        className="relative rounded-[1.75rem] object-cover shadow-lg ring-4 ring-white" priority={size === 'lg'} />
    </div>
  );
}

/** Home page section. */
export function FounderSection() {
  return (
    <section id="founder" className="scroll-mt-20 bg-cream border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-20 grid md:grid-cols-[auto_1fr] gap-10 md:gap-16 items-center">
        <div className="mx-auto"><Photo size="md" /></div>
        <div>
          <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Meet the founder</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">{FOUNDER.name}</h2>
          <p className="text-brand-800 font-semibold mt-1">{FOUNDER.role}</p>
          <blockquote className="mt-5 text-lg text-slate-700 leading-relaxed border-l-2 border-gold-400 pl-5">{FOUNDER.note}</blockquote>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href="/about" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">About AcadeXMatch <ArrowRight className="w-4 h-4" /></Link>
            {FOUNDER.links.map(l => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-brand-800">
                <l.icon className="w-4 h-4" /> {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Full profile for the About page. */
export function FounderProfile() {
  return (
    <section className="grid md:grid-cols-[auto_1fr] gap-10 md:gap-14 items-start">
      <div className="mx-auto"><Photo size="lg" /></div>
      <div>
        <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Founder &amp; CEO</p>
        <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">{FOUNDER.name}</h2>
        <p className="text-slate-600 mt-3 text-lg leading-relaxed">{FOUNDER.summary}</p>
        <ul className="mt-6 space-y-3">
          {FOUNDER.highlights.map(h => (
            <li key={h.text} className="flex gap-3 text-slate-700">
              <h.icon className="w-5 h-5 text-gold-600 mt-0.5 shrink-0" aria-hidden="true" />{h.text}
            </li>
          ))}
        </ul>
        <figure className="mt-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <blockquote className="text-slate-700 leading-relaxed">“{FOUNDER.note}”</blockquote>
          <figcaption className="mt-3 text-sm font-semibold text-brand-800">— {FOUNDER.name}</figcaption>
        </figure>
        <div className="mt-6 flex flex-wrap gap-3">
          {FOUNDER.links.map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-800">
              <l.icon className="w-4 h-4" /> {l.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
