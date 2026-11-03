import { unzip } from './sheet';

/*
 * Text of an uploaded resume (PDF, DOCX or TXT), plus layout signals that commonly trip up Applicant Tracking
 * Systems: tables, text boxes, images, multi-column layouts, scanned (image-only) pages, headers/footers.
 */

export interface ExtractedResume {
  text: string;
  format: 'pdf' | 'docx' | 'txt';
  pages: number | null;
  signals: {
    tables: number;
    textBoxes: number;
    images: number;
    multiColumn: boolean;
    /** Contact details only in the header / footer, which some ATS skip. */
    contactInHeader: boolean;
    scanned: boolean;
  };
}

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 15;

export type ExtractResult = { ok: true; value: ExtractedResume } | { ok: false; error: string };

/** Type from the file's first bytes; the name / browser type are not trusted. */
export function sniffResume(b: Buffer, name: string): 'pdf' | 'docx' | 'txt' | 'doc' | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (b.length > 4 && b.readUInt32LE(0) === 0x04034b50) return 'docx';
  if (b.length > 8 && b.readUInt32LE(0) === 0xe011cfd0) return 'doc';
  if (/\.txt$/i.test(name) || !/[\x00-\x08\x0e-\x1f]/.test(b.subarray(0, 4000).toString('latin1'))) return 'txt';
  return null;
}

export async function extractResume(bytes: Buffer, name: string): Promise<ExtractResult> {
  if (bytes.length > RESUME_MAX_BYTES) return { ok: false, error: 'The file is larger than 5 MB.' };
  const kind = sniffResume(bytes, name);
  try {
    if (kind === 'pdf') return await fromPdf(bytes);
    if (kind === 'docx') return fromDocx(bytes);
    if (kind === 'txt') return fromTxt(bytes);
    if (kind === 'doc') return { ok: false, error: 'Old Word (.doc) files cannot be read. In Word choose File → Save As → Word Document (.docx) or PDF, then upload again.' };
    return { ok: false, error: 'Upload a PDF, Word (.docx) or plain-text (.txt) file.' };
  } catch {
    return { ok: false, error: 'This file could not be read. It may be damaged or password-protected; try saving it again as PDF or DOCX.' };
  }
}

const tidy = (t: string) => t.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

async function fromPdf(buf: Buffer): Promise<ExtractResult> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pageTexts: string[] = [];
  let splitRows = 0, rows = 0;
  for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES); i++) {
    const page = await pdf.getPage(i);
    const width = page.getViewport({ scale: 1 }).width || 600;
    const content = await page.getTextContent();
    const items = (content.items as { str?: string; hasEOL?: boolean; transform?: number[]; width?: number }[]).filter(it => it.str !== undefined);
    // Lines by vertical position, to spot side-by-side columns or tables.
    const byY = new Map<number, { x: number; end: number }[]>();
    let s = '';
    for (const it of items) {
      s += it.str ?? '';
      s += it.hasEOL ? '\n' : (it.str ? ' ' : '');
      if (!it.str?.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5] / 3);
      const x = it.transform[4];
      const list = byY.get(y) || [];
      list.push({ x, end: x + (it.width || 0) });
      byY.set(y, list);
    }
    for (const runs of byY.values()) {
      rows++;
      runs.sort((a, b) => a.x - b.x);
      for (let k = 1; k < runs.length; k++) if (runs[k].x - runs[k - 1].end > width * 0.12) { splitRows++; break; }
    }
    pageTexts.push(s);
  }
  const text = tidy(pageTexts.join('\n'));
  const scanned = text.replace(/\s/g, '').length < 80 * Math.max(1, pageTexts.length) / 2;
  if (scanned && text.length < 60) {
    return { ok: false, error: 'This PDF has no readable text (it is probably a scanned image). Upload the original Word file or a PDF saved from it; ATS cannot read scanned resumes either.' };
  }
  return {
    ok: true,
    value: {
      text, format: 'pdf', pages: pdf.numPages,
      signals: { tables: 0, textBoxes: 0, images: 0, multiColumn: rows > 10 && splitRows / rows > 0.25, contactInHeader: false, scanned },
    },
  };
}

function docxText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function fromDocx(buf: Buffer): ExtractResult {
  const files = unzip(buf);
  const read = (n: string) => files.get(n)?.().toString('utf8');
  const doc = read('word/document.xml');
  if (!doc) return { ok: false, error: 'This is not a Word (.docx) document.' };
  const body = docxText(doc);
  const headerFooter = [...files.keys()].filter(k => /^word\/(header|footer)\d*\.xml$/.test(k)).map(k => docxText(read(k) || '')).join('\n');
  const text = tidy(`${headerFooter.trim() ? `${headerFooter}\n` : ''}${body}`);
  const contactRe = /[^\s@]+@[^\s@]+\.[a-z]{2,}|(?:\+?\d[\d\s-]{8,}\d)/i;
  const pagesMeta = read('docProps/app.xml')?.match(/<Pages>(\d+)<\/Pages>/)?.[1];
  return {
    ok: true,
    value: {
      text, format: 'docx', pages: pagesMeta ? Number(pagesMeta) : null,
      signals: {
        tables: (doc.match(/<w:tbl>/g) || []).length,
        textBoxes: (doc.match(/<w:txbxContent>/g) || []).length,
        images: (doc.match(/<w:drawing>|<w:pict>/g) || []).length,
        multiColumn: /<w:cols\b[^>]*w:num="([2-9])"/.test(doc),
        contactInHeader: contactRe.test(headerFooter) && !contactRe.test(body),
        scanned: false,
      },
    },
  };
}

function fromTxt(buf: Buffer): ExtractResult {
  const text = tidy(buf.toString('utf8').replace(/^﻿/, ''));
  if (text.length < 40) return { ok: false, error: 'The file is almost empty.' };
  return { ok: true, value: { text, format: 'txt', pages: null, signals: { tables: 0, textBoxes: 0, images: 0, multiColumn: false, contactInHeader: false, scanned: false } } };
}
