import { inflateRawSync } from 'zlib';

/*
 * Reads the first worksheet of an Excel (.xlsx) file, or a CSV file, into rows of text cells.
 * Self-contained (Node's zlib only), so no spreadsheet package and its dependencies are needed.
 * Limits guard against oversized or malformed uploads.
 */

const MAX_UNZIPPED = 120 * 1024 * 1024;

export type Rows = string[][];

export function readSpreadsheet(bytes: Buffer, filename = ''): Rows {
  const isZip = bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (isZip) return readXlsx(bytes);
  if (/\.xls$/i.test(filename) || (bytes.length > 8 && bytes.readUInt32LE(0) === 0xe011cfd0)) {
    throw new Error('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then upload again.');
  }
  return readCsv(bytes.toString('utf8'));
}

// ------------------------------------------------------------------ CSV

export function readCsv(text: string): Rows {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: Rows = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ------------------------------------------------------------------ XLSX (zip of XML parts)

function unzip(buf: Buffer): Map<string, () => Buffer> {
  // End of central directory record: last 22..65557 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid Excel workbook.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, () => Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('This Excel file is damaged.');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    total += usize;
    if (total > MAX_UNZIPPED) throw new Error('The workbook is too large.');
    files.set(name, () => {
      const lnlen = buf.readUInt16LE(local + 26);
      const lelen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnlen + lelen;
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data, { maxOutputLength: Math.max(usize, 1) + 1024 });
      throw new Error('This Excel file uses an unsupported compression.');
    });
  }
  return files;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? _;
  });
}

/** Joined text of every <t> inside a fragment (handles rich-text runs). */
function texts(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += xmlText(m[1]);
  return out;
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(buf: Buffer): Rows {
  const files = unzip(buf);
  const get = (name: string) => files.get(name)?.().toString('utf8');

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const firstSheet = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstSheet && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => r.includes(`Id="${firstSheet}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  if (!files.has(sheetPath)) sheetPath = [...files.keys()].filter(k => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0] || sheetPath;
  const sheet = get(sheetPath);
  if (!sheet) throw new Error('No worksheet found in this Excel file.');

  const shared: string[] = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  const rows: Rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d*"/)?.[1];
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const t = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = texts(body);
      else if (v !== undefined) value = xmlText(v);
      while (row.length < idx) row.push('');
      row[idx] = value;
    }
    if (row.some(c => c.trim() !== '')) rows.push(row);
  }
  return rows;
}
