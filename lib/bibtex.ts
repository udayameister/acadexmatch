/** Minimal BibTeX reader for publication lists exported from Google Scholar, Zotero, Mendeley etc. */
export interface BibEntry { type: string; key: string; fields: Record<string, string> }

function clean(v: string): string {
  return v
    .replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_')
    .replace(/\\['"`^~=.]\{?([A-Za-z])\}?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBibtex(src: string): BibEntry[] {
  const out: BibEntry[] = [];
  const re = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    // find the matching closing brace of the entry
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(re.lastIndex, i - 1);
    re.lastIndex = i;
    const fields: Record<string, string> = {};
    let j = 0;
    while (j < body.length) {
      const fm = /\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/y;
      fm.lastIndex = j;
      const f = fm.exec(body);
      if (!f) break;
      j = fm.lastIndex;
      let val = '';
      if (body[j] === '{') {
        let d = 0; const start = j;
        for (; j < body.length; j++) { if (body[j] === '{') d++; else if (body[j] === '}') { d--; if (d === 0) { j++; break; } } }
        val = body.slice(start + 1, j - 1);
      } else if (body[j] === '"') {
        const end = body.indexOf('"', j + 1);
        val = body.slice(j + 1, end === -1 ? body.length : end);
        j = end === -1 ? body.length : end + 1;
      } else {
        const end = body.slice(j).search(/[,\n]/);
        val = end === -1 ? body.slice(j) : body.slice(j, j + end);
        j = end === -1 ? body.length : j + end;
      }
      fields[f[1].toLowerCase()] = clean(val);
    }
    out.push({ type, key: m[2], fields });
  }
  return out;
}

/** "Sharma, Priya and Rao, K." → "Priya Sharma, K. Rao" */
export function bibAuthors(a: string | undefined): string {
  if (!a) return '';
  return a.split(/\s+and\s+/i).map(n => {
    const [last, first] = n.split(',').map(x => x.trim());
    return first ? `${first} ${last}` : last;
  }).filter(Boolean).join(', ');
}
