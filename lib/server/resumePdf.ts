/*
 * Text-based, single-column A4 PDF of a builder resume. Real text (not an image), standard fonts and
 * standard headings, so applicant tracking systems and our own checker can read it.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { renderSections, type BuilderData, type TemplateId } from '@/lib/resume/builder';

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 50, top: 48, bottom: 50 };
const SIZE = { name: 19, headline: 11.5, contact: 9.5, heading: 10.5, body: 10 };
const LH = 13.2;

/** Standard PDF fonts only cover Latin-1/WinAnsi; map common symbols and drop the rest. */
function cleanFor(font: PDFFont): (s: string) => string {
  const ok = new Map<string, boolean>();
  const map: Record<string, string> = { '₹': 'Rs. ', '→': '->', '≥': '>=', '≤': '<=', '−': '-', ' ': ' ', '\t': ' ', '✓': '-', '●': '•', '▪': '•', '◦': '•' };
  return s => [...s.normalize('NFC')].map(ch => {
    if (map[ch] !== undefined) return map[ch];
    if (!ok.has(ch)) { try { font.encodeText(ch); ok.set(ch, true); } catch { ok.set(ch, false); } }
    return ok.get(ch) ? ch : (ch.normalize('NFD').replace(/[̀-ͯ]/g, '').length === 1 && ch.normalize('NFD')[0] !== ch ? ch.normalize('NFD')[0] : '');
  }).join('').replace(/[ ]{2,}/g, ' ');
}

export async function resumePdf(d: BuilderData, t: TemplateId, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const clean = cleanFor(regular);
  const accent = t === 'modern' ? rgb(0.12, 0.31, 0.47) : rgb(0.07, 0.09, 0.15);
  const ink = rgb(0.07, 0.09, 0.15);
  const width = A4.w - M.x * 2;

  doc.setTitle(clean(title)); doc.setAuthor(clean(d.fullName || '')); doc.setSubject('Resume'); doc.setCreator('AcadeXMatch resume builder'); doc.setProducer('AcadeXMatch');

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M.top;
  const need = (h: number) => { if (y - h < M.bottom) { page = doc.addPage([A4.w, A4.h]); y = A4.h - M.top; } };
  const wrap = (text: string, font: PDFFont, size: number, max: number): string[] => {
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= max) { line = tryLine; continue; }
        if (line) out.push(line);
        // Very long words (URLs) are split by characters.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > max) {
          let i = w.length; while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > max) i--;
          out.push(w.slice(0, i)); w = w.slice(i);
        }
        line = w;
      }
      out.push(line);
    }
    return out.filter((l, i, a) => l || (i > 0 && a[i - 1]));
  };
  const text = (s: string, x: number, font: PDFFont, size: number, color = ink) => page.drawText(s, { x, y, font, size, color });
  const para = (s: string, font = regular, size = SIZE.body, indent = 0) => {
    for (const l of wrap(s, font, size, width - indent)) { need(LH); text(l, M.x + indent, font, size); y -= LH; }
  };
  const bullet = (s: string) => {
    const lines = wrap(s, regular, SIZE.body, width - 14);
    lines.forEach((l, i) => { need(LH); if (i === 0) text('•', M.x + 3, regular, SIZE.body); text(l, M.x + 14, regular, SIZE.body); y -= LH; });
  };

  // Header
  need(30);
  text(clean(d.fullName || 'Your Name'), M.x, bold, SIZE.name, accent); y -= SIZE.name + 4;
  if (d.headline) { for (const l of wrap(d.headline, regular, SIZE.headline, width)) { text(l, M.x, regular, SIZE.headline); y -= SIZE.headline + 3; } }
  const contact = [d.email, d.phone, d.location].filter(Boolean).join('  |  ');
  if (contact) for (const l of wrap(contact, regular, SIZE.contact, width)) { text(l, M.x, regular, SIZE.contact); y -= SIZE.contact + 3; }
  if (d.links.length) for (const l of wrap(d.links.join('  |  '), regular, SIZE.contact, width)) { text(l, M.x, regular, SIZE.contact); y -= SIZE.contact + 3; }

  for (const s of renderSections({ ...d, experience: d.experience.map(e => ({ ...e, bullets: e.bullets.filter(b => b.trim()) })) }, t)) {
    y -= 7;
    need(LH * 3);
    text(clean(s.heading.toUpperCase()), M.x, bold, SIZE.heading, accent);
    y -= 4;
    page.drawLine({ start: { x: M.x, y }, end: { x: A4.w - M.x, y }, thickness: 0.6, color: rgb(0.6, 0.62, 0.66) });
    y -= LH - 1;
    if (s.paragraph) para(s.paragraph);
    if (s.kind === 'inline' && s.items?.length) para(s.items.join(', '));
    if (s.kind === 'list') for (const i of s.items || []) bullet(i);
    for (const e of s.entries || []) {
      const dates = clean(e.dates || '');
      const dw = dates ? bold.widthOfTextAtSize(dates, SIZE.body) : 0;
      const titleLines = wrap(e.title, bold, SIZE.body, width - dw - (dates ? 12 : 0));
      need(LH * (titleLines.length + (e.sub ? 1 : 0) + Math.min(1, e.bullets.length)));
      titleLines.forEach((l, i) => { text(l, M.x, bold, SIZE.body); if (i === 0 && dates) text(dates, A4.w - M.x - dw, regular, SIZE.body); y -= LH; });
      if (e.sub) para(e.sub, italic);
      for (const b of e.bullets) bullet(b);
      y -= 3;
    }
  }
  return doc.save();
}
