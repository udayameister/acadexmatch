/*
 * A small, safe Markdown renderer for blog posts and white papers (used on the server for the public page and in the
 * admin editor's preview, so both look the same).
 *
 * Safety: every character of the source is HTML-escaped first; only the tags produced here are ever emitted, and
 * links/images are limited to http(s), mailto and site-relative addresses. Raw HTML in a post is shown as text.
 *
 * Supported: # ## ### #### headings, paragraphs, **bold**, *italic*, `code`, ``` code blocks ```, [links](url),
 * ![images](url "caption"), - / * / 1. lists, > quotes (with "> **Note:**" call-outs), --- rules, | tables |,
 * and footnote-style references [^1] / [^1]: text.
 */

export interface Heading { level: 2 | 3; id: string; text: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Allowed link targets: http(s), mailto, site-relative ("/x", "#x"). Anything else (javascript:, data:, …) is dropped. */
export function safeUrl(raw: string): string | null {
  const u = raw.trim().replace(/&amp;/g, '&');
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^\/(?!\/)/.test(u) || u.startsWith('#')) return u;
  return null;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&[a-z#0-9]+;/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section';
}

/** Inline formatting on already-escaped text. */
function inline(s: string, notes: Map<string, number>): string {
  const codes: string[] = [];
  // Protect inline code first.
  s = s.replace(/`([^`]+)`/g, (_m, c) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  // Images ![alt](url "caption")
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, (_m, alt, url, cap) => {
    const u = safeUrl(url);
    if (!u) return alt;
    codes.push(`<img src="${esc(u)}" alt="${alt}" loading="lazy" decoding="async" />`);
    const img = `\u0000${codes.length - 1}\u0000`;
    return cap ? `<figure>${img}<figcaption>${cap}</figcaption></figure>` : img;
  });
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)\s*\)/g, (_m, text, url) => {
    const u = safeUrl(url);
    if (!u) return text;
    const ext = /^https?:\/\//i.test(u) && !/^https?:\/\/(www\.)?acadexmatch\.com/i.test(u);
    codes.push(`<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>`);
    return `\u0000${codes.length - 1}\u0000${text}</a>`;
  });
  // Footnote references [^1]
  s = s.replace(/\[\^([A-Za-z0-9_-]{1,20})\]/g, (_m, k) => {
    if (!notes.has(k)) notes.set(k, notes.size + 1);
    const n = notes.get(k)!;
    codes.push(`<sup class="fn-ref"><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function renderMarkdown(src: string): { html: string; headings: Heading[] } {
  const notes = new Map<string, number>();
  const noteText = new Map<string, string>();
  const headings: Heading[] = [];
  const usedIds = new Set<string>();
  const out: string[] = [];
  // Collect footnote definitions "[^1]: text" first.
  const lines = esc(String(src || '').replace(/\r\n?/g, '\n')).split('\n').filter(l => {
    const m = l.match(/^\[\^([A-Za-z0-9_-]{1,20})\]:\s+(.*)$/);
    if (m) { noteText.set(m[1], m[2]); return false; }
    return true;
  });

  let i = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), notes)}</p>`); para.length = 0; } };

  while (i < lines.length) {
    const line = lines[i];
    // Code block
    if (/^```/.test(line.trim())) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${body.join('\n')}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    // Headings: "#" and "##" become h2 (the page title is the h1), "###" h3, "####" h4.
    const h = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      const level = h[1].length <= 2 ? 2 : h[1].length === 3 ? 3 : 4;
      const html = inline(h[2], notes);
      const text = html.replace(/<[^>]+>/g, '');
      let id = slugify(text);
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(text)}-${n}`;
      usedIds.add(id);
      if (level !== 4) headings.push({ level: level as 2 | 3, id, text });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }
    if (isRule(line)) { flush(); out.push('<hr />'); i++; continue; }
    // Quote / call-out
    if (/^&gt;\s?/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) body.push(lines[i++].replace(/^&gt;\s?/, ''));
      const inner = renderMarkdown(body.join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")).html;
      const callout = /^<p><strong>(Note|Key finding|Key takeaway|Tip|Important|Summary)/i.test(inner);
      out.push(`<blockquote${callout ? ' class="callout"' : ''}>${inner}</blockquote>`);
      continue;
    }
    // Table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c, notes)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '', notes)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    // Lists
    const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      flush();
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && (re.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      const start = ordered ? Number((line.match(/\d+/) || ['1'])[0]) : 1;
      out.push(`<${ordered ? 'ol' : 'ul'}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.map(it => `<li>${inline(it, notes)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();

  if (notes.size) {
    const list = [...notes.entries()].sort((a, b) => a[1] - b[1])
      .map(([k, n]) => `<li id="fn-${n}">${inline(noteText.get(k) || '', new Map())} <a href="#fnref-${n}" aria-label="Back to text">↩</a></li>`).join('');
    out.push(`<section class="footnotes" aria-label="References"><h2 id="references">References</h2><ol>${list}</ol></section>`);
    headings.push({ level: 2, id: 'references', text: 'References' });
  }
  return { html: out.join('\n'), headings };
}

/** Plain text (for summaries, search and reading time). */
export function plainText(src: string): string {
  return String(src || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\^[^\]]+\]:?/g, ' ')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readingMinutes(src: string): number {
  const words = plainText(src).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
