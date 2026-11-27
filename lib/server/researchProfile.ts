/*
 * Public research profile for the free "Research profile from ORCID" tool.
 * Works, name, biography, keywords and employment come from the public ORCID record; citation counts per work
 * come from OpenAlex (matched by DOI). The h-index and i10-index are computed from those works only, so works
 * without a DOI on ORCID count as uncited. Both APIs are free and keyless. Results are cached in memory for 12 hours.
 */
import { fetchOrcidWorks, normaliseDoi } from './scholarly';

const ORCID = () => (process.env.ORCID_API_BASE || 'https://pub.orcid.org/v3.0').replace(/\/$/, '');
const OPENALEX = () => (process.env.OPENALEX_API_BASE || 'https://api.openalex.org').replace(/\/$/, '');
const UA = 'AcadeXMatch/1.0 (research profile; mailto:info@acadexmatch.com)';

export interface ProfileWork { title: string; venue: string; year: number | null; doi: string | null; type: string; citations: number | null; openAccess: boolean | null }
export interface ResearchProfile {
  orcid: string;
  name: string | null;
  biography: string;
  keywords: string[];
  country: string;
  affiliations: { org: string; role: string; start: string; end: string; current: boolean }[];
  works: ProfileWork[];
  metrics: { works: number; withDoi: number; matched: number; citations: number; hIndex: number; i10: number; openAccess: number };
  citesByYear: { year: number; n: number }[];
  worksByYear: { year: number; n: number }[];
  fetchedAt: string;
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: ctrl.signal, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

type V = { value?: string } | null | undefined;
const year = (d: { year?: V } | null | undefined) => d?.year?.value || '';

/** h-index: the largest h such that h works have at least h citations each. */
export function hIndex(cites: number[]): number {
  const s = [...cites].sort((a, b) => b - a);
  let h = 0;
  while (h < s.length && s[h] >= h + 1) h++;
  return h;
}

interface OaWork { doi?: string | null; cited_by_count?: number; counts_by_year?: { year: number; cited_by_count: number }[]; open_access?: { is_oa?: boolean } }

/** Citation data from OpenAlex for a list of DOIs (50 per request). */
export async function citationsFor(dois: string[]): Promise<Map<string, OaWork>> {
  const out = new Map<string, OaWork>();
  const unique = [...new Set(dois.map(d => d.toLowerCase()))].slice(0, 500);
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const filter = `doi:${batch.map(d => `https://doi.org/${d}`).join('|')}`;
    const url = `${OPENALEX()}/works?filter=${encodeURIComponent(filter)}&per-page=50&select=doi,cited_by_count,counts_by_year,open_access&mailto=info@acadexmatch.com`;
    const res = await getJson(url) as { results?: OaWork[] } | null;
    for (const w of res?.results || []) {
      const d = w.doi ? normaliseDoi(w.doi)?.toLowerCase() : null;
      if (d) out.set(d, w);
    }
  }
  return out;
}

const cache = new Map<string, { at: number; data: ResearchProfile }>();
const TTL = 12 * 3600_000;

/** null when there is no public ORCID record for the iD. */
export async function researchProfile(orcid: string, opts: { fresh?: boolean } = {}): Promise<ResearchProfile | null> {
  const hit = cache.get(orcid);
  if (hit && !opts.fresh && Date.now() - hit.at < TTL) return hit.data;

  const base = await fetchOrcidWorks(orcid);
  if (!base) return null;

  let biography = '', keywords: string[] = [], country = '';
  try {
    const p = await getJson(`${ORCID()}/${orcid}/person`) as {
      biography?: { content?: string } | null; keywords?: { keyword?: { content?: string }[] } | null; addresses?: { address?: { country?: V }[] } | null;
    } | null;
    biography = (p?.biography?.content || '').trim();
    keywords = [...new Set((p?.keywords?.keyword || []).flatMap(k => String(k.content || '').split(/[,;]/)).map(s => s.trim()).filter(Boolean))].slice(0, 15);
    country = p?.addresses?.address?.[0]?.country?.value || '';
  } catch { /* optional */ }

  let affiliations: ResearchProfile['affiliations'] = [];
  try {
    const e = await getJson(`${ORCID()}/${orcid}/employments`) as { 'affiliation-group'?: { summaries?: { 'employment-summary'?: { organization?: { name?: string }; 'role-title'?: string | null; 'department-name'?: string | null; 'start-date'?: { year?: V } | null; 'end-date'?: { year?: V } | null } }[] }[] } | null;
    affiliations = (e?.['affiliation-group'] || []).map(g => g.summaries?.[0]?.['employment-summary']).filter(Boolean).map(s => ({
      org: s!.organization?.name || '', role: [s!['role-title'], s!['department-name']].filter(Boolean).join(', '),
      start: year(s!['start-date']), end: year(s!['end-date']), current: !s!['end-date'],
    })).filter(a => a.org).slice(0, 8);
  } catch { /* optional */ }

  // One entry per DOI (ORCID records often list the same paper from several sources).
  const seen = new Set<string>();
  const works: ProfileWork[] = [];
  for (const w of base.works) {
    const key = w.doi ? `doi:${w.doi.toLowerCase()}` : `t:${w.title.toLowerCase().replace(/\W+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    works.push({ title: w.title, venue: w.venue, year: w.year, doi: w.doi, type: w.type, citations: null, openAccess: null });
  }

  const byYearCites = new Map<number, number>();
  let matched = 0;
  try {
    const oa = await citationsFor(works.map(w => w.doi).filter((d): d is string => !!d));
    for (const w of works) {
      const hit2 = w.doi ? oa.get(w.doi.toLowerCase()) : undefined;
      if (!hit2) continue;
      matched++;
      w.citations = hit2.cited_by_count ?? 0;
      w.openAccess = hit2.open_access?.is_oa ?? null;
      for (const c of hit2.counts_by_year || []) byYearCites.set(c.year, (byYearCites.get(c.year) || 0) + (c.cited_by_count || 0));
    }
  } catch { /* citations are optional: the card still shows the works */ }

  works.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1) || (b.year ?? 0) - (a.year ?? 0));
  const cites = works.map(w => w.citations ?? 0);
  const byYearWorks = new Map<number, number>();
  for (const w of works) if (w.year) byYearWorks.set(w.year, (byYearWorks.get(w.year) || 0) + 1);

  const data: ResearchProfile = {
    orcid, name: base.name, biography, keywords, country, affiliations, works,
    metrics: {
      works: works.length, withDoi: works.filter(w => w.doi).length, matched,
      citations: cites.reduce((a, b) => a + b, 0), hIndex: hIndex(cites), i10: cites.filter(c => c >= 10).length,
      openAccess: works.filter(w => w.openAccess).length,
    },
    citesByYear: [...byYearCites].map(([y, n]) => ({ year: y, n })).sort((a, b) => a.year - b.year),
    worksByYear: [...byYearWorks].map(([y, n]) => ({ year: y, n })).sort((a, b) => a.year - b.year),
    fetchedAt: new Date().toISOString(),
  };
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  cache.set(orcid, { at: Date.now(), data });
  return data;
}
