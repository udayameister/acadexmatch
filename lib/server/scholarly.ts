/* Server-only lookups of publication metadata from ORCID and Crossref (both free, public APIs). */

export interface FoundPublication {
  title: string;
  venue: string;
  year: number | null;
  authors: string;
  doi: string | null;
  type: 'Journal' | 'Conference' | 'Book Chapter' | 'Patent';
  source: 'ORCID' | 'Crossref';
}

const ORCID = () => (process.env.ORCID_API_BASE || 'https://pub.orcid.org/v3.0').replace(/\/$/, '');
const CROSSREF = () => (process.env.CROSSREF_API_BASE || 'https://api.crossref.org').replace(/\/$/, '');
const UA = 'AcadeXMatch/1.0 (academic profile import)';

export function normaliseOrcid(input: string): string | null {
  const m = String(input || '').trim().match(/(\d{4}-?\d{4}-?\d{4}-?\d{3}[\dXx])\/?$/);
  if (!m) return null;
  const digits = m[1].replace(/-/g, '').toUpperCase();
  // ISO 7064 11,2 checksum used by ORCID
  let total = 0;
  for (const ch of digits.slice(0, 15)) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  const check = r === 10 ? 'X' : String(r);
  if (check !== digits[15]) return null;
  return digits.match(/.{4}/g)!.join('-');
}

export function normaliseDoi(input: string): string | null {
  const m = String(input || '').trim().match(/(10\.\d{4,9}\/\S+)$/i);
  return m ? m[1].replace(/[.,;]+$/, '') : null;
}

function mapType(t: string): FoundPublication['type'] {
  const x = t.toLowerCase();
  if (x.includes('conference') || x.includes('proceedings')) return 'Conference';
  if (x.includes('book')) return 'Book Chapter';
  if (x.includes('patent')) return 'Patent';
  return 'Journal';
}

async function getJson(url: string, accept = 'application/json'): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Accept: accept, 'User-Agent': UA }, signal: ctrl.signal, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

type OrcidValue = { value?: string } | null | undefined;
interface OrcidWork {
  title?: { title?: OrcidValue };
  'journal-title'?: OrcidValue;
  'publication-date'?: { year?: OrcidValue } | null;
  type?: string;
  'external-ids'?: { 'external-id'?: { 'external-id-type'?: string; 'external-id-value'?: string }[] } | null;
  contributors?: { contributor?: { 'credit-name'?: OrcidValue }[] } | null;
  'put-code'?: number;
}

/** All works on a public ORCID record, with authors where the record lists them. */
export async function fetchOrcidWorks(orcid: string): Promise<{ name: string | null; works: FoundPublication[] } | null> {
  const summary = await getJson(`${ORCID()}/${orcid}/works`) as { group?: { 'work-summary'?: OrcidWork[] }[] } | null;
  if (!summary) return null;
  const putCodes = (summary.group || []).map(g => g['work-summary']?.[0]?.['put-code']).filter((x): x is number => typeof x === 'number').slice(0, 300);
  const details: OrcidWork[] = [];
  for (let i = 0; i < putCodes.length; i += 100) {
    const bulk = await getJson(`${ORCID()}/${orcid}/works/${putCodes.slice(i, i + 100).join(',')}`) as { bulk?: { work?: OrcidWork }[] } | null;
    for (const b of bulk?.bulk || []) if (b.work) details.push(b.work);
  }
  const source = details.length ? details : (summary.group || []).map(g => g['work-summary']?.[0]).filter(Boolean) as OrcidWork[];
  let name: string | null = null;
  try {
    const person = await getJson(`${ORCID()}/${orcid}/person`) as { name?: { 'given-names'?: OrcidValue; 'family-name'?: OrcidValue } } | null;
    name = [person?.name?.['given-names']?.value, person?.name?.['family-name']?.value].filter(Boolean).join(' ') || null;
  } catch { /* name is optional */ }
  const works = source.map((w): FoundPublication | null => {
    const title = w.title?.title?.value?.trim();
    if (!title) return null;
    const doi = w['external-ids']?.['external-id']?.find(e => e['external-id-type'] === 'doi')?.['external-id-value'] || null;
    const year = Number(w['publication-date']?.year?.value) || null;
    const authors = (w.contributors?.contributor || []).map(c => c['credit-name']?.value).filter(Boolean).join(', ');
    return { title, venue: w['journal-title']?.value?.trim() || '', year, authors, doi: doi ? normaliseDoi(doi) : null, type: mapType(w.type || ''), source: 'ORCID' };
  }).filter((x): x is FoundPublication => !!x);
  return { name, works };
}

/** Metadata for one DOI from Crossref. */
export async function fetchDoi(doi: string): Promise<FoundPublication | null> {
  const d = await getJson(`${CROSSREF()}/works/${encodeURIComponent(doi)}`) as { message?: {
    title?: string[]; 'container-title'?: string[]; type?: string; DOI?: string;
    author?: { given?: string; family?: string; name?: string }[];
    issued?: { 'date-parts'?: number[][] }; published?: { 'date-parts'?: number[][] };
  } } | null;
  const m = d?.message;
  if (!m?.title?.[0]) return null;
  const year = m.issued?.['date-parts']?.[0]?.[0] || m.published?.['date-parts']?.[0]?.[0] || null;
  const authors = (m.author || []).map(a => a.name || [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ');
  return { title: m.title[0].replace(/\s+/g, ' ').trim(), venue: (m['container-title']?.[0] || '').trim(), year, authors, doi: m.DOI || doi, type: mapType(m.type || ''), source: 'Crossref' };
}
