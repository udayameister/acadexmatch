import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Award, GraduationCap, BookOpen, ArrowRight, UserRound, Code2 } from 'lucide-react';

/** Founder details shown on the home page and the About page. Edit here to update both. */
export const FOUNDER = {
  name: 'Udayakumar Palanivelu',
  role: 'Founder & CEO',
  photo: { src: '/brand/founder.jpg', width: 436, height: 447 },
  summary: 'Computer science educator and researcher with more than 15 years of teaching experience in India and Ethiopia.',
  highlights: [
    { icon: BookOpen, text: 'Ph.D. research at Vellore Institute of Technology (VIT) in deep learning and graph neural networks' },
    { icon: Award, text: 'Raman Research Award (2024, 2025) and Dr. APJ Abdul Kalam Award (2024)' },
  ],
  note:
    'After more than fifteen years in classrooms and research labs, I have seen how hard faculty hiring is on both sides: candidates chase scattered notices and unclear eligibility rules, and institutions sift through hundreds of applications by hand. AcadeXMatch brings every vacancy, every UGC and AICTE norm and every step of selection into one transparent place — so the right teacher reaches the right classroom.',
  links: [
    { icon: UserRound, label: 'LinkedIn', href: 'https://www.linkedin.com/in/udayakumar-palanivelu-934bb941' },
    { icon: Code2, label: 'GitHub', href: 'https://github.com/udayameister' },
  ],
};

/** Co-founder details (only the highest qualification is shown). */
export const CO_FOUNDER = {
  name: 'Dr. M. Indhumathi',
  role: 'Co-Founder',
  photo: { src: '/brand/cofounder.jpg', width: 183, height: 236 },
  education: 'Ph.D. in Computer Science (Wireless Sensor Networks), Bharathidasan University, Tiruchirappalli',
  note:
    'A department is only as strong as the teachers it appoints. With AcadeXMatch we want every deserving scholar to find the right position on merit, and every institution to hire with clarity and fairness instead of months of paperwork. We are building it together with the academic community, for the academic community.',
};

type Person = { name: string; role: string; photo: { src: string; width: number; height: number } };

function Photo({ person, width, priority = false }: { person: Person; width: number; priority?: boolean }) {
  const height = Math.round(width * person.photo.height / person.photo.width);
  return (
    <div className="relative shrink-0" style={{ width }}>
      <div className="absolute -inset-2 rounded-[2rem] border border-gold-300/70 rotate-2" aria-hidden="true" />
      <Image src={person.photo.src} alt={`${person.name}, ${person.role}, AcadeXMatch`} width={width} height={height}
        className="relative rounded-[1.75rem] object-cover shadow-lg ring-4 ring-white" priority={priority} />
    </div>
  );
}

/** Home page section: both founders. */
export function FounderSection() {
  return (
    <section id="founder" className="scroll-mt-20 bg-cream border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-20 space-y-12">
        <div className="text-center">
          <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Meet the founders</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Built by educators, for educators</h2>
        </div>
        <div className="grid lg:grid-cols-2 gap-8">
          {[
            { person: FOUNDER, note: FOUNDER.note, line: FOUNDER.summary, links: FOUNDER.links },
            { person: CO_FOUNDER, note: CO_FOUNDER.note, line: CO_FOUNDER.education, links: [] as typeof FOUNDER.links },
          ].map(({ person, note, line, links }) => (
            <article key={person.name} className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-6 sm:gap-8">
              <div className="mx-auto sm:mx-0"><Photo person={person} width={150} /></div>
              <div className="flex-1">
                <h3 className="font-serif text-2xl font-bold text-slate-900">{person.name}</h3>
                <p className="text-brand-800 font-semibold">{person.role}, AcadeXMatch</p>
                <p className="text-sm text-slate-500 mt-1">{line}</p>
                <blockquote className="mt-4 text-slate-700 leading-relaxed border-l-2 border-gold-400 pl-4">{note}</blockquote>
                {links.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-4">
                    {links.map(l => (
                      <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-brand-800">
                        <l.icon className="w-4 h-4" /> {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="text-center">
          <Link href="/about" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">About AcadeXMatch <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </section>
  );
}

/** Full profiles for the About page. */
export function FounderProfile() {
  return (
    <div className="space-y-16">
      <section className="grid md:grid-cols-[auto_1fr] gap-10 md:gap-14 items-start">
        <div className="mx-auto"><Photo person={FOUNDER} width={300} priority /></div>
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

      <section className="grid md:grid-cols-[auto_1fr] gap-10 md:gap-14 items-start">
        <div className="mx-auto md:w-[300px] flex justify-center"><Photo person={CO_FOUNDER} width={183} /></div>
        <div>
          <p className="text-sm font-semibold text-brand-700 flex items-center gap-3"><span className="gold-rule" />Co-Founder</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mt-2">{CO_FOUNDER.name}</h2>
          <p className="mt-4 flex gap-3 text-slate-700"><GraduationCap className="w-5 h-5 text-gold-600 mt-0.5 shrink-0" aria-hidden="true" />{CO_FOUNDER.education}</p>
          <figure className="mt-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <blockquote className="text-slate-700 leading-relaxed">“{CO_FOUNDER.note}”</blockquote>
            <figcaption className="mt-3 text-sm font-semibold text-brand-800">— {CO_FOUNDER.name}</figcaption>
          </figure>
        </div>
      </section>
    </div>
  );
}
