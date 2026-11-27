/*
 * Excel (.xlsx) reading and writing that runs in the browser (and in Node for tests) with no dependency.
 * Reading: ZIP central directory → DEFLATE via DecompressionStream('deflate-raw') → sheet XML parsed with
 * regular expressions (shared strings, inline strings, numbers, cached formula values, booleans).
 * Writing: several sheets, bold header rows, column widths; stored (uncompressed) ZIP.
 * CSV is read too (comma, semicolon or tab separated, quoted fields).
 */

export type CellValue = string | number | null;
export interface Sheet { name: string; rows: CellValue[][] }

// ------------------------------------------------------------------ reading

const dec = new TextDecoder('utf-8');
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Files inside a ZIP (only the ones whose names pass `want`). */
export async function unzip(buf: Uint8Array, want: (name: string) => boolean = () => true): Promise<Map<string, Uint8Array>> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (u32(buf, p) !== 0x02014b50) throw new Error('The Excel file is damaged.');
    const method = u16(buf, p + 10), csize = u32(buf, p + 20), nlen = u16(buf, p + 28), xlen = u16(buf, p + 30), clen = u16(buf, p + 32), local = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const start = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error('This Excel file uses an unsupported compression. Save it again in Excel as .xlsx.');
  }
  return out;
}

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
/** Text of all <t> runs inside a fragment (rich text has several). */
const texts = (frag: string) => [...frag.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m => unxml(m[1])).join('');

export function colIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] || 'A').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetXml(x: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  let rm: RegExpExecArray | null;
  let nextRow = 0;
  while ((rm = rowRe.exec(x))) {
    const rAttr = rm[1].match(/\br="(\d+)"/);
    const r = rAttr ? Number(rAttr[1]) - 1 : nextRow;
    nextRow = r + 1;
    const body = rm[2] || '';
    const row: CellValue[] = [];
    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let cm: RegExpExecArray | null;
    let nextCol = 0;
    while ((cm = cellRe.exec(body))) {
      const attrs = cm[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/i);
      const c = ref ? colIndex(ref[1]) : nextCol;
      nextCol = c + 1;
      const t = attrs.match(/\bt="(\w+)"/)?.[1] || 'n';
      const inner = cm[2] || '';
      const v = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let val: CellValue = null;
      if (t === 's' && v != null) val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = texts(inner);
      else if (t === 'str' || t === 'e') val = v != null ? unxml(v) : null;
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null && v !== '') { const n = Number(v); val = Number.isFinite(n) ? n : unxml(v); }
      if (typeof val === 'string' && val.trim() === '') val = null;
      row[c] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[r] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** All sheets of an .xlsx workbook, in workbook order. */
export async function readXlsx(buf: Uint8Array): Promise<Sheet[]> {
  const files = await unzip(buf, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('This is not an Excel workbook (.xlsx).');
  const shared = files.get('xl/sharedStrings.xml') ? [...dec.decode(files.get('xl/sharedStrings.xml')!).matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => texts(m[1])) : [];
  const rels = new Map<string, string>();
  const relXml = files.get('xl/_rels/workbook.xml.rels');
  if (relXml) for (const m of dec.decode(relXml).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1], target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const sheets: Sheet[] = [];
  for (const m of dec.decode(wb).matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = unxml(m[0].match(/\bname="([^"]*)"/)?.[1] || `Sheet${sheets.length + 1}`);
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1] || m[0].match(/\bid="([^"]+)"/)?.[1];
    const target = (rid && rels.get(rid)) || `worksheets/sheet${sheets.length + 1}.xml`;
    const data = files.get(`xl/${target}`);
    if (data) sheets.push({ name, rows: parseSheetXml(dec.decode(data), shared) });
  }
  return sheets;
}

/** CSV / TSV text → rows (numbers become numbers). */
export function readCsv(text: string): CellValue[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: CellValue[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row.map(cellOf)); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row.map(cellOf)); }
  return rows;
}
function cellOf(s: string): CellValue {
  const v = s.trim();
  if (v === '') return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

/** Reads an uploaded file: .xlsx (all sheets) or .csv / .tsv / .txt (one sheet). */
export async function readSpreadsheet(name: string, buf: Uint8Array): Promise<Sheet[]> {
  if (/\.xls$/i.test(name)) throw new Error('Old .xls files cannot be read. In Excel, choose File → Save As → Excel Workbook (.xlsx).');
  if (/\.(csv|tsv|txt)$/i.test(name)) return [{ name: name.replace(/\.[^.]+$/, ''), rows: readCsv(dec.decode(buf)) }];
  return readXlsx(buf);
}

// ------------------------------------------------------------------ writing

const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const le = (n: number, bytes: number) => { const a = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xff; return a; };
  const cat = (...p: Uint8Array[]) => { const len = p.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(len); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const local = cat(le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(size, 4), le(size, 4), le(name.length, 2), le(0, 2));
    chunks.push(local, name, f.data);
    central.push(cat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(size, 4), le(size, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4)), name);
    offset += local.length + name.length + size;
  }
  const cd = cat(...central);
  return cat(...chunks, cd, le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2));
}

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 32000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function colName(i: number): string { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/** A sheet to write. `bold` = row indexes shown bold with the header fill (default: the first row). */
export interface OutSheet { name: string; rows: CellValue[][]; bold?: number[]; freeze?: boolean }

export function writeXlsx(sheets: OutSheet[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let n = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || `Sheet${i + 1}`;
    while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i + 1}`;
    used.add(n.toLowerCase());
    return n;
  });
  const sheetXml = (s: OutSheet) => {
    const bold = new Set(s.bold ?? [0]);
    const width = Math.max(0, ...s.rows.map(r => r.length));
    const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(6, ...s.rows.slice(0, 400).map(r => String(r[c] ?? '').length + 2))));
    const rows = s.rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => {
      if (v == null || v === '') return '';
      const ref = `${colName(c)}${i + 1}`, st = bold.has(i) ? ' s="1"' : '';
      return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${s.freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''}${width ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files: { name: string; data: string }[] = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6B0F1A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zipStore(files.map(f => ({ name: f.name, data: enc.encode(f.data) })));
}

/** Starts a browser download of bytes or text. */
export function downloadFile(name: string, data: Uint8Array | string, type: string): void {
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
