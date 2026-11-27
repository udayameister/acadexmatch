import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Building2, ExternalLink, Quote, Unlock } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import ProfileShare from '@/components/ProfileShare';
import { parseOrcid } from '@/lib/orcid';
import { researchProfile, type ResearchProfile } from '@/lib/server/researchProfile';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ orcid: string }> };

async function load(raw: string): Promise<{ id: string; p: ResearchProfile | null; error?: string }> {
  const id = parseOrcid(decodeURIComponent(raw));
  if (!id) notFound();
  try { return { id, p: await researchProfile(id) }; }
  catch { return { id, p: null, error: 'ORCID could not be reached just now. Please try again in a minute.' }; }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseOrcid(decodeURIComponent((await params).orcid));
  if (!id) return { title: 'Research profile', robots: { index: false } };
  let p: ResearchProfile | null = null;
  try { p = await researchProfile(id); } catch { /* fall back */ }
  const who = p?.name || `ORCID ${id}`;
  const desc = p ? `${p.metrics.works} publications · ${p.metrics.citations} citations · h-index ${p.metrics.hIndex}. Research profile of ${who} from ORCID and OpenAlex.` : `Research profile for ORCID ${id}.`;
  return {
    title: `${who} — Research Profile (h-index ${p?.metrics.hIndex ?? '—'})`,
    description: desc,
    alternates: { canonical: `/tools/research-profile/${id}` },
    openGraph: { url: `/tools/research-profile/${id}`, title: `${who} — research profile`, description: desc, type: 'profile' },
    // Personal pages: shareable, but not pushed into search results.
    robots: { index: false, follow: true },
  };
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200" title={hint}>
      <div className="text-3xl font-bold text-brand-900 tabular-nums">{value}</div>
      <div className="text-xs font-semibold text-slate-600 mt-1">{label}</div>
    </div>
  );
}

function YearBars({ data, label }: { data: { year: number; n: number }[]; label: string }) {
  const rows = data.slice(-12);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.n), 1);
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold text-slate-800">{label}</figcaption>
      <div className="flex items-end gap-1.5 h-36" role="img" aria-label={`${label}: ${rows.map(r => `${r.year} ${r.n}`).join(', ')}`}>
        {rows.map(r => (
          <div key={r.year} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${r.year}: ${r.n}`}>
            <span className="text-[10px] text-slate-600 tabular-nums">{r.n}</span>
            <div className="w-full max-w-[28px] rounded-t bg-brand-700" style={{ height: `${Math.max(2, (r.n / max) * 100)}%` }} />
            <span className="text-[10px] text-slate-500 mt-1 tabular-nums">{String(r.year).slice(2)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default async function ResearchProfilePage({ params }: Params) {
  const { id, p, error } = await load((await params).orcid);
  const url = `${SITE_URL}/tools/research-profile/${id}`;
  if (!p) {
    return (
      <ToolPage slug="research-profile" title="Research profile from ORCID" intro={<>ORCID iD <span className="font-mono">{id}</span></>}>
        <section className="p-6 rounded-3xl bg-white border border-slate-200 space-y-3">
          <p className="text-slate-800">{error || 'There is no public ORCID record for this iD, or it has no public works yet.'}</p>
          <p className="text-sm text-slate-600">On ORCID, set your works’ visibility to “Everyone”, then open this page again. <Link className="text-brand-700 underline" href="/tools/research-profile">Try another iD</Link></p>
        </section>
      </ToolPage>
    );
  }
  const m = p.metrics;
  const current = p.affiliations.find(a => a.current) || p.affiliations[0];
  const top = p.works.slice(0, 50);
  return (
    <ToolPage slug="research-profile" title={p.name || `ORCID ${id}`}
      intro={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {current && <span className="inline-flex items-center gap-1.5"><Building2 className="w-4 h-4" />{[current.role, current.org].filter(Boolean).join(' · ')}</span>}
        <a className="inline-flex items-center gap-1 font-mono text-sm text-brand-700 hover:underline" href={`https://orcid.org/${id}`} target="_blank" rel="noopener noreferrer">orcid.org/{id} <ExternalLink className="w-3 h-3" /></a>
      </span>}
      notes={<>
        <p>Works, name and affiliation: the public ORCID record of {id}. Citations: OpenAlex, matched by DOI ({m.matched} of {m.withDoi} works with a DOI were found). The h-index and i10-index count only the works on this ORCID record, so they can differ from Google Scholar, Scopus or Web of Science.</p>
        <p>Updated {new Date(p.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST; refreshed at most every 12 hours. <Link className="underline" href="/tools/research-profile">Make a card for another ORCID iD</Link>.</p>
      </>}>
      <section className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Publications" value={m.works} />
          <Stat label="Citations" value={m.citations.toLocaleString('en-IN')} hint="Sum of OpenAlex citation counts of the works on ORCID" />
          <Stat label="h-index" value={m.hIndex} hint="h works with at least h citations each" />
          <Stat label="i10-index" value={m.i10} hint="Works with 10 or more citations" />
        </div>
        {(p.keywords.length > 0 || p.biography) && (
          <div className="space-y-2">
            {p.biography && <p className="text-sm text-slate-700 whitespace-pre-line line-clamp-6">{p.biography}</p>}
            {p.keywords.length > 0 && <ul className="flex flex-wrap gap-1.5">{p.keywords.map(k => <li key={k} className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-700">{k}</li>)}</ul>}
          </div>
        )}
        <ProfileShare url={url} title={`${p.name || id} — research profile on AcadeXMatch`} />
      </section>

      {(p.citesByYear.length > 0 || p.worksByYear.length > 0) && (
        <section className="grid md:grid-cols-2 gap-6 p-5 sm:p-6 rounded-3xl bg-white border border-slate-200">
          <YearBars data={p.citesByYear} label="Citations per year" />
          <YearBars data={p.worksByYear} label="Publications per year" />
        </section>
      )}

      <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 space-y-3">
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><BookOpen className="w-5 h-5 text-brand-700" /> Publications <span className="text-sm font-sans font-normal text-slate-500">most cited first{p.works.length > top.length ? ` · top ${top.length} of ${p.works.length}` : ''}</span></h2>
        <ol className="divide-y divide-slate-100">
          {top.map((w, i) => (
            <li key={`${w.doi || w.title}-${i}`} className="py-3 flex gap-3">
              <span className="w-14 shrink-0 text-right">
                <span className="block text-lg font-bold text-brand-900 tabular-nums">{w.citations ?? '—'}</span>
                <span className="block text-[10px] text-slate-500 uppercase">cites</span>
              </span>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{w.doi ? <a className="hover:underline" href={`https://doi.org/${w.doi}`} target="_blank" rel="noopener noreferrer">{w.title}</a> : w.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-2">
                  {w.venue && <span className="italic">{w.venue}</span>}{w.year && <span>{w.year}</span>}<span>{w.type}</span>
                  {w.openAccess && <span className="inline-flex items-center gap-0.5 text-emerald-700"><Unlock className="w-3 h-3" /> Open access</span>}
                  {!w.doi && <span className="text-slate-400">no DOI on ORCID</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {p.affiliations.length > 1 && (
        <section className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 space-y-2">
          <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-brand-700" /> Employment</h2>
          <ul className="text-sm text-slate-700 space-y-1">{p.affiliations.map((a, i) => <li key={i}><strong>{a.org}</strong>{a.role ? ` — ${a.role}` : ''} <span className="text-slate-500">{[a.start, a.current ? 'present' : a.end].filter(Boolean).join('–')}</span></li>)}</ul>
        </section>
      )}

      <section className="p-5 rounded-3xl bg-brand-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <p className="flex items-center gap-2"><Quote className="w-5 h-5 text-gold-400" /> Looking for a faculty position? Import these publications into an AcadeXMatch profile in one click and see the vacancies you qualify for.</p>
        <Link href="/register" className="px-4 py-2 rounded-xl bg-white text-brand-900 font-semibold text-sm shrink-0 text-center">Create a free profile</Link>
      </section>
    </ToolPage>
  );
}
