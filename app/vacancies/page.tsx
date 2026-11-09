import type { Metadata } from 'next';
import Link from 'next/link';
import { STORAGE_KEYS } from '@/lib/storage';
import { withDb } from '@/lib/server/db';
import { isOpenJob } from '@/lib/server/seo';
import { deadlineLabel } from '@/lib/display';
import JsonLd from '@/components/JsonLd';
import { SITE_URL } from '@/lib/site';
import type { Job } from '@/types';

// Server-rendered list of every open vacancy, so search engines can reach each one by an ordinary link.
export const dynamic = 'force-dynamic';

async function openJobs(): Promise<Job[]> {
  return withDb(null, db => ((db[STORAGE_KEYS.JOBS] as Job[]) || []).filter(isOpenJob))
    .then(js => js.sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || '')));
}

export async function generateMetadata(): Promise<Metadata> {
  const n = (await openJobs()).length;
  const title = `All Open Faculty Vacancies in India (${n})`;
  const description = `Every open teaching and research vacancy on AcadeXMatch, by state: Assistant Professor, Associate Professor, Professor, lecturer and research posts at universities, IITs, NITs and colleges. Updated daily.`;
  return { title, description, alternates: { canonical: '/vacancies' }, openGraph: { type: 'website', url: '/vacancies', title: `${title} | AcadeXMatch`, description } };
}

export default async function VacanciesPage() {
  const jobs = await openJobs();
  const byState = new Map<string, Job[]>();
  for (const j of jobs) {
    const st = (j.location?.state || '').trim() || 'Location not specified';
    byState.set(st, [...(byState.get(st) || []), j]);
  }
  const states = [...byState.keys()].sort((a, b) => (a === 'Location not specified' ? 1 : b === 'Location not specified' ? -1 : a.localeCompare(b)));
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Open faculty vacancies on AcadeXMatch', numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 500).map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/jobs/${encodeURIComponent(j.id)}`, name: j.title })),
  };
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 space-y-8">
      <JsonLd data={list} />
      <nav className="text-xs text-slate-500" aria-label="Breadcrumb"><Link href="/" className="hover:underline">Home</Link> / <Link href="/jobs" className="hover:underline">Faculty jobs</Link> / All open vacancies</nav>
      <header className="space-y-2">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900">All open faculty vacancies ({jobs.length})</h1>
        <p className="text-slate-600 max-w-3xl">Every open teaching and research post on AcadeXMatch, newest first within each state. For filters by pay level, subject and qualification, use the <Link href="/jobs" className="font-semibold text-brand-800 hover:underline">vacancy search</Link>.</p>
        {!!states.length && (
          <p className="text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-1">{states.map(s => <a key={s} href={`#${slug(s)}`} className="text-brand-800 hover:underline">{s} ({byState.get(s)!.length})</a>)}</p>
        )}
      </header>
      {!jobs.length ? <p className="text-slate-600">No open vacancies right now. New posts are added every day.</p> : states.map(s => (
        <section key={s} id={slug(s)} className="space-y-2 scroll-mt-24">
          <h2 className="font-serif text-xl font-bold text-slate-900 border-b border-slate-200 pb-1">{s} <span className="text-sm font-sans font-normal text-slate-500">({byState.get(s)!.length})</span></h2>
          <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            {byState.get(s)!.map(j => (
              <li key={j.id} className="text-sm">
                <Link href={`/jobs/${encodeURIComponent(j.id)}`} className="font-semibold text-brand-900 hover:underline">{j.title}</Link>
                <span className="block text-xs text-slate-500">{[j.instituteName, j.location?.city].filter(Boolean).join(', ')} · {deadlineLabel(j)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
