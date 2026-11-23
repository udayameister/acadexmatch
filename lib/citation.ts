/*
 * Reference formatting from Crossref metadata (pure functions). Styles: APA 7, IEEE, Vancouver, Harvard, BibTeX.
 * Output is a list of text runs so the page can show italics and copy plain text or rich text.
 */

export interface CrossrefWork {
  DOI: string;
  type?: string;
  title?: string[];
  'container-title'?: string[];
  'short-container-title'?: string[];
  author?: { given?: string; family?: string; name?: string; sequence?: string }[];
  editor?: { given?: string; family?: string }[];
  issued?: { 'date-parts'?: (number | null)[][] };
  'published-print'?: { 'date-parts'?: (number | null)[][] };
  'published-online'?: { 'date-parts'?: (number | null)[][] };
  volume?: string; issue?: string; page?: string; 'article-number'?: string;
  publisher?: string; 'publisher-location'?: string; ISBN?: string[]; edition?: string;
}

export type Style = 'apa' | 'ieee' | 'vancouver' | 'harvard' | 'bibtex';
export const STYLES: { key: Style; label: string }[] = [
  { key: 'apa', label: 'APA 7th' }, { key: 'ieee', label: 'IEEE' }, { key: 'vancouver', label: 'Vancouver' }, { key: 'harvard', label: 'Harvard' }, { key: 'bibtex', label: 'BibTeX' },
];
export interface Run { text: string; italic?: boolean }

/** A DOI from text such as "doi:10.1000/xyz", "https://doi.org/10.1000/xyz" or a bare "10.1000/xyz". */
export function extractDoi(s: string): string | null {
  const m = s.trim().match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;)\]]+$/, '') : null;
}

const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
function dateParts(w: CrossrefWork): (number | null)[] {
  return w['published-print']?.['date-parts']?.[0] || w.issued?.['date-parts']?.[0] || w['published-online']?.['date-parts']?.[0] || [];
}
const year = (w: CrossrefWork) => (dateParts(w)[0] ? String(dateParts(w)[0]) : 'n.d.');
const clean = (s?: string) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const title = (w: CrossrefWork) => clean(w.title?.[0]).replace(/[.\s]+$/, '');
const journal = (w: CrossrefWork) => clean(w['container-title']?.[0]);
const pages = (w: CrossrefWork) => clean(w.page || w['article-number']).replace(/-/g, '–');
const isBook = (w: CrossrefWork) => /^(book|monograph|edited-book|reference-book)$/.test(w.type || '');
const isChapter = (w: CrossrefWork) => /chapter|book-section|book-part/.test(w.type || '');
const isProc = (w: CrossrefWork) => /proceedings/.test(w.type || '');

interface Person { given: string; family: string }
function people(w: CrossrefWork): Person[] {
  return (w.author || []).map(a => (a.family ? { given: clean(a.given), family: clean(a.family) } : { given: '', family: clean(a.name) })).filter(a => a.family);
}
/** "Priya Ranjani" → initials with separators. */
function initials(given: string, sep: string, joinHyphen = true): string {
  return given.split(/\s+/).filter(Boolean).map(part => part.split('-').map(p => (p[0] ? p[0].toUpperCase() + sep : '')).join(joinHyphen ? '-' : '')).join(sep === '.' ? ' ' : '').trim();
}
const ini = (g: string) => initials(g, '.');                 // "P. R."
const iniTight = (g: string) => initials(g, '.').replace(/\s+/g, ''); // "P.R."
const iniVanc = (g: string) => g.split(/[\s-]+/).filter(Boolean).map(p => p[0].toUpperCase()).join(''); // "PR"

function joinList(items: string[], last: string, sep = ', '): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]}${last}${items[1]}`;
  return `${items.slice(0, -1).join(sep)}${last}${items[items.length - 1]}`;
}

export function format(w: CrossrefWork, style: Style): Run[] {
  const ps = people(w);
  const t = title(w), j = journal(w), y = year(w), v = clean(w.volume), iss = clean(w.issue), pg = pages(w);
  const doiUrl = `https://doi.org/${w.DOI}`;
  const R = (text: string, italic = false): Run => ({ text, italic });
  const out: Run[] = [];
  switch (style) {
    case 'apa': {
      let names = ps.map(p => `${p.family}${p.given ? `, ${ini(p.given)}` : ''}`);
      if (names.length > 20) names = [...names.slice(0, 19), '…', names[names.length - 1]];
      const a = names.length === 0 ? '' : names.length === 1 ? names[0] : names.includes('…') ? `${names.slice(0, 19).join(', ')}, … ${names[20]}` : `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
      out.push(R(a ? `${a} (${y}). ` : `${t}. (${y}). `));
      if (isBook(w)) { if (a) out.push(R(t, true)); out.push(R(`. ${clean(w.publisher)}. `)); }
      else if (isChapter(w)) { if (a) out.push(R(`${t}. `)); out.push(R('In '), R(j, true), R(`${pg ? ` (pp. ${pg})` : ''}. ${clean(w.publisher)}. `)); }
      else {
        if (a) out.push(R(`${t}. `));
        if (j) { out.push(R(j, true)); if (v) { out.push(R(', ')); out.push(R(v, true)); } out.push(R(`${iss ? `(${iss})` : ''}${pg ? `, ${pg}` : ''}. `)); }
      }
      out.push(R(doiUrl));
      break;
    }
    case 'ieee': {
      const names = ps.map(p => `${p.given ? `${ini(p.given)} ` : ''}${p.family}`);
      const a = names.length > 6 ? `${names[0]} et al.` : joinList(names, names.length > 2 ? ', and ' : ' and ');
      const dp = dateParts(w);
      const when = `${dp[1] ? `${MONTHS[(dp[1] as number) - 1]} ` : ''}${y}`;
      if (isBook(w)) { out.push(R(`${a ? `${a}, ` : ''}`), R(t, true), R(`. ${clean(w['publisher-location']) ? `${clean(w['publisher-location'])}: ` : ''}${clean(w.publisher)}, ${y}, doi: ${w.DOI}.`)); break; }
      out.push(R(`${a ? `${a}, ` : ''}“${t},” ${isChapter(w) || isProc(w) ? 'in ' : ''}`));
      if (j) out.push(R(j, true));
      const bits = [v && `vol. ${v}`, iss && `no. ${iss}`, pg && (/–/.test(pg) ? `pp. ${pg}` : `Art. no. ${pg}`), when].filter(Boolean);
      out.push(R(`${j ? ', ' : ''}${bits.join(', ')}, doi: ${w.DOI}.`));
      break;
    }
    case 'vancouver': {
      const names = ps.map(p => `${p.family}${p.given ? ` ${iniVanc(p.given)}` : ''}`);
      const a = names.length > 6 ? `${names.slice(0, 6).join(', ')}, et al.` : names.join(', ');
      const abbrev = clean(w['short-container-title']?.[0]) || j;
      if (isBook(w)) { out.push(R(`${a ? `${a.replace(/\.$/, '')}. ` : ''}${t}. ${clean(w['publisher-location']) ? `${clean(w['publisher-location'])}: ` : ''}${clean(w.publisher)}; ${y}. doi:${w.DOI}`)); break; }
      out.push(R(`${a ? `${a.replace(/\.$/, '')}. ` : ''}${t}. ${abbrev ? `${abbrev}. ` : ''}${y}${v ? `;${v}` : ''}${iss ? `(${iss})` : ''}${pg ? `:${pg.replace('–', '-')}` : ''}. doi:${w.DOI}`));
      break;
    }
    case 'harvard': {
      const names = ps.map(p => `${p.family}${p.given ? `, ${iniTight(p.given)}` : ''}`);
      const a = names.length > 3 ? `${names[0]} et al.` : joinList(names, ' and ');
      if (isBook(w)) { out.push(R(`${a ? `${a} ` : ''}(${y}) `), R(t, true), R(`. ${clean(w['publisher-location']) ? `${clean(w['publisher-location'])}: ` : ''}${clean(w.publisher)}. doi: ${w.DOI}.`)); break; }
      out.push(R(`${a ? `${a} ` : ''}(${y}) ‘${t}’, `));
      if (isChapter(w)) out.push(R('in '));
      if (j) out.push(R(j, true));
      out.push(R(`${v ? `, ${v}` : ''}${iss ? `(${iss})` : ''}${pg ? `, ${/–/.test(pg) ? 'pp.' : 'p.'} ${pg}` : ''}. Available at: ${doiUrl}.`));
      break;
    }
    case 'bibtex': {
      const key = `${(ps[0]?.family || 'ref').normalize('NFD').replace(/[^A-Za-z]/g, '')}${y === 'n.d.' ? '' : y}${(t.match(/[A-Za-z]{4,}/) || [''])[0].toLowerCase()}`;
      const kind = isBook(w) ? 'book' : isChapter(w) ? 'incollection' : isProc(w) ? 'inproceedings' : 'article';
      const f: [string, string][] = [
        ['author', ps.map(p => `${p.family}${p.given ? `, ${p.given}` : ''}`).join(' and ')], ['title', `{${t}}`],
        [kind === 'article' ? 'journal' : 'booktitle', j], ['year', y === 'n.d.' ? '' : y], ['volume', v], ['number', iss], ['pages', pg.replace('–', '--')],
        ['publisher', clean(w.publisher)], ['doi', w.DOI],
      ];
      out.push(R(`@${kind}{${key},\n${f.filter(([, val]) => val && !(kind === 'book' && val === j)).map(([k, val]) => `  ${k} = {${val}}`).join(',\n')}\n}`));
      break;
    }
  }
  return out.filter(r => r.text);
}

export const plain = (runs: Run[]) => runs.map(r => r.text).join('');
export const html = (runs: Run[]) => runs.map(r => { const e = r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return r.italic ? `<i>${e}</i>` : e; }).join('');
