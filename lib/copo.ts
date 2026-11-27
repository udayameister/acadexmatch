/*
 * CO–PO attainment (outcome-based education, as reported to NBA / NAAC). Pure functions, no I/O.
 *
 * Method (the common one in SARs; every number is a setting the department can change):
 *  1. For each course outcome (CO) and each assessment component (CIE = internal, SEE = end-semester), a student
 *     "attains" the CO when their marks in the questions mapped to it reach the student threshold (default 60 %
 *     of the maximum of those questions). Absent / blank questions are left out of that student's total.
 *  2. The share of students who attain it gives the attainment level: 3 at ≥ 70 %, 2 at ≥ 60 %, 1 at ≥ 50 %, else 0.
 *  3. Direct attainment = CIE level × CIE weight + SEE level × SEE weight (default 30 : 70; if one component has no
 *     questions for that CO, the other counts in full).
 *  4. Final CO attainment = direct × 80 % + indirect (course-exit survey, on the same 0–3 scale) × 20 %; without a
 *     survey, final = direct.
 *  5. PO (and PSO) attainment of the course = Σ (CO–PO mapping strength × CO attainment) ÷ Σ mapping strength,
 *     over the COs mapped to that PO (mapping 1 = low, 2 = medium, 3 = high).
 *  6. Programme-level PO attainment = average of the course PO attainments where the PO is mapped.
 */

import type { CellValue } from './xlsxio';

export type Component = 'CIE' | 'SEE' | 'ignore';
export interface MarkColumn { index: number; label: string; max: number | null; cos: string[]; component: Component }
export interface Student { id: string; name: string; marks: (number | null)[] }
export interface Outcome { code: string; title: string }

export interface Settings {
  studentThreshold: number;           // % of maximum marks a student needs to attain a CO
  levels: [number, number, number];   // % of students for level 1, 2, 3
  wCIE: number; wSEE: number;         // weights of the components in direct attainment (%)
  wDirect: number;                    // weight of direct attainment when a survey is given (%); indirect = 100 − this
  target: number;                     // target attainment level (0–3)
}
export const DEFAULT_SETTINGS: Settings = { studentThreshold: 60, levels: [50, 60, 70], wCIE: 30, wSEE: 70, wDirect: 80, target: 2 };

export interface CourseInput {
  columns: MarkColumn[];
  students: Student[];
  cos: string[];
  indirect: Record<string, number | null>;              // course-exit survey per CO (0–3)
  mapping: Record<string, Record<string, number | null>>; // CO → PO/PSO code → 1..3
  outcomes: Outcome[];                                    // POs then PSOs
  settings: Settings;
}

// ------------------------------------------------------------------ presets

const pos = (titles: string[], prefix = 'PO') => titles.map((t, i) => ({ code: `${prefix}${i + 1}`, title: t }));
export const PRESETS: Record<string, { label: string; outcomes: Outcome[] }> = {
  eng11: { label: 'Engineering (NBA) — 11 POs, 2025 onwards', outcomes: pos(['Engineering knowledge', 'Problem analysis', 'Design / development of solutions', 'Conduct investigations of complex problems', 'Engineering tool usage', 'The engineer and the world', 'Ethics', 'Individual and collaborative team work', 'Communication', 'Project management and finance', 'Life-long learning']) },
  eng12: { label: 'Engineering (NBA) — 12 POs, earlier SAR', outcomes: pos(['Engineering knowledge', 'Problem analysis', 'Design / development of solutions', 'Conduct investigations of complex problems', 'Modern tool usage', 'The engineer and society', 'Environment and sustainability', 'Ethics', 'Individual and team work', 'Communication', 'Project management and finance', 'Life-long learning']) },
  pharm: { label: 'Pharmacy (B.Pharm) — 11 POs', outcomes: pos(['Pharmacy knowledge', 'Planning abilities', 'Problem analysis', 'Modern tool usage', 'Leadership skills', 'Professional identity', 'Pharmaceutical ethics', 'Communication', 'The pharmacist and society', 'Environment and sustainability', 'Life-long learning']) },
  custom: { label: 'Management / other — your own POs', outcomes: pos(['', '', '', '', '', '']) },
};
export const psos = (n: number, titles: string[] = []): Outcome[] => Array.from({ length: n }, (_, i) => ({ code: `PSO${i + 1}`, title: titles[i] || '' }));

// ------------------------------------------------------------------ reading a marks sheet

const ID_HEADER = /^(s\.?\s*no|sl\.?\s*no|sr\.?\s*no|serial|roll|reg|register|registration|usn|h\.?\s*t\.?\s*no|hall\s*ticket|enrol|admission|student|name|section|sec|batch|id|pin)\b/i;
const ABSENT = /^(a|ab|abs|absent|-|–|na|n\/a|nil|mp|malpractice|dt|detained)$/i;

export function normaliseCos(v: CellValue | string): string[] {
  if (v == null) return [];
  const s = String(v).toUpperCase().replace(/\s+/g, '');
  if (!s || s === '-' ) return [];
  if (/^(ALL|ALLCOS?)$/.test(s)) return ['ALL'];
  const out = new Set<string>();
  for (const part of s.split(/[,;&/+]|AND/)) {
    const range = part.match(/^C?O?(\d+)[-–]C?O?(\d+)$/);
    if (range) { for (let i = Number(range[1]); i <= Number(range[2]) && i - Number(range[1]) < 20; i++) out.add(`CO${i}`); continue; }
    const one = part.match(/^(?:CO)?(\d{1,2})$/);
    if (one) out.add(`CO${Number(one[1])}`);
  }
  return [...out];
}

export function componentOf(v: CellValue | string): Component | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^(ignore|skip|total|none|-)$/i.test(s)) return 'ignore';
  if (/\b(see|end\s*-?\s*sem(ester)?|external|university|semester\s*end|ese|final\s*exam)\b/i.test(s)) return 'SEE';
  if (/\b(cie|internal|mid|sessional|ia|cat|quiz|assignment|test|cia|continuous|unit\s*test|lab|seminar|tutorial)\b/i.test(s)) return 'CIE';
  return null;
}

const num = (v: CellValue): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim();
  if (ABSENT.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export interface ParsedSheet { columns: MarkColumn[]; students: Student[]; idCols: number[]; warnings: string[]; found: { max: boolean; co: boolean; component: boolean } }

/**
 * Finds the header row, the optional "Max marks", "CO" and "Component" rows, the roll-number / name columns and the
 * students. Works with the template and with most department sheets: CO and maximum can also sit in the question
 * label, e.g. "Q1a (CO2) [5]" or "Mid-1 Q3 CO1 /10".
 */
export function parseMarksSheet(rows: CellValue[][]): ParsedSheet {
  const warnings: string[] = [];
  const nonEmpty = (r: CellValue[] = []) => r.filter(c => c != null && String(c).trim() !== '').length;
  let h = rows.findIndex(r => (r || []).some(c => typeof c === 'string' && ID_HEADER.test(c.trim())));
  if (h < 0) h = rows.findIndex(r => nonEmpty(r) >= 2);
  if (h < 0) return { columns: [], students: [], idCols: [], warnings: ['The sheet is empty.'], found: { max: false, co: false, component: false } };
  const header = rows[h] || [];
  const width = Math.max(...rows.slice(h, h + 400).map(r => (r || []).length), header.length);

  // Rows right under the header whose first cells say what they are.
  let maxRow: CellValue[] | null = null, coRow: CellValue[] | null = null, compRow: CellValue[] | null = null;
  let r = h + 1;
  for (; r < Math.min(rows.length, h + 8); r++) {
    const row = rows[r] || [];
    const tag = row.slice(0, 3).map(c => String(c ?? '').trim()).find(Boolean) || '';
    if (/^max(imum)?\.?\s*(marks?)?\b/i.test(tag) || /^out\s*of$/i.test(tag)) maxRow = row;
    else if (/^(component|assessment|type|exam|cie\s*\/\s*see|category)/i.test(tag)) compRow = row;
    else if (/^(cos?\b|co\s*-?\s*mapp|mapped\s*co|course\s*outcome)/i.test(tag)) coRow = row;
    else if (/^(bloom|btl|level|k-?level|marks\s*type)/i.test(tag)) continue;
    else break;
  }
  const first = r;

  const body = rows.slice(first).filter(row => nonEmpty(row) > 0);
  const idCols: number[] = [];
  for (let c = 0; c < width; c++) {
    const label = String(header[c] ?? '').trim();
    const numeric = body.slice(0, 200).filter(row => num(row?.[c] ?? null) != null).length;
    const texty = body.slice(0, 200).filter(row => typeof row?.[c] === 'string' && !ABSENT.test(String(row[c]).trim())).length;
    if ((label && ID_HEADER.test(label)) || (texty > numeric && texty > 0)) idCols.push(c);
  }
  // A plain serial-number column (1, 2, 3 …) with no header is also not a question.
  const nameCol = idCols.find(c => /name/i.test(String(header[c] ?? ''))) ?? idCols.find(c => body.some(row => typeof row?.[c] === 'string' && /[a-z]{3}/i.test(String(row[c])))) ;
  const rollCol = idCols.find(c => /roll|reg|usn|h\.?\s*t|hall|enrol|admission|pin|id/i.test(String(header[c] ?? ''))) ?? idCols.find(c => c !== nameCol);

  const columns: MarkColumn[] = [];
  for (let c = 0; c < width; c++) {
    if (idCols.includes(c)) continue;
    const label = String(header[c] ?? '').trim() || `Column ${c + 1}`;
    if (/^(total|grand\s*total|sum|grade|result|percentage|%|sgpa|cgpa|attendance)/i.test(label)) continue;
    if (!body.some(row => num(row?.[c] ?? null) != null)) continue;
    const fromLabelMax = label.match(/[[(/]\s*(\d+(?:\.\d+)?)\s*(?:m(?:arks?)?)?\s*[\])]?\s*$/i);
    const max = num(maxRow?.[c] ?? null) ?? (fromLabelMax ? Number(fromLabelMax[1]) : null);
    let cos = coRow ? normaliseCos(coRow[c] ?? null) : [];
    if (!cos.length) cos = normaliseCos((label.match(/\bCO\s*\d{1,2}(?:\s*[,&/-]\s*(?:CO)?\s*\d{1,2})*/i) || [''])[0]);
    const component = componentOf(compRow?.[c] ?? null) ?? componentOf(label) ?? 'CIE';
    columns.push({ index: c, label, max, cos, component });
  }

  const students: Student[] = [];
  for (const row of body) {
    const marks = columns.map(col => num(row?.[col.index] ?? null));
    const id = rollCol != null ? String(row?.[rollCol] ?? '').trim() : '';
    const name = nameCol != null ? String(row?.[nameCol] ?? '').trim() : '';
    if (!marks.some(m => m != null) && !id && !name) continue;
    // Summary rows at the bottom ("Average", "No. attempted" …)
    if (/^(avg|average|mean|total|count|no\.?\s*of|number\s*of|%|percentage|max|min|attempted|class\s*average)/i.test(id || name)) continue;
    students.push({ id: id || `Row ${rows.indexOf(row) + 1}`, name, marks });
  }

  for (const col of columns) {
    const k = columns.indexOf(col);
    if (col.max == null) {
      const top = Math.max(0, ...students.map(s => s.marks[k] ?? 0));
      warnings.push(`“${col.label}” has no maximum marks; enter it below${top ? ` (highest mark in the sheet: ${top})` : ''}.`);
    } else {
      const over = students.filter(s => (s.marks[k] ?? 0) > col.max!).length;
      if (over) warnings.push(`${over} student(s) have more than the maximum (${col.max}) in “${col.label}”; their mark is counted as the maximum.`);
    }
  }
  if (!columns.some(c => c.cos.length)) warnings.push('No CO is given for the questions yet; choose the CO for each question below.');
  if (!students.length) warnings.push('No student rows were found under the header.');
  return { columns, students, idCols, warnings, found: { max: !!maxRow, co: !!coRow, component: !!compRow } };
}

/** COs used by the columns, in natural order (CO1, CO2, … CO10). */
export function cosOf(columns: MarkColumn[], extra: string[] = []): string[] {
  const set = new Set<string>(extra);
  for (const c of columns) for (const co of c.cos) if (co !== 'ALL') set.add(co);
  return [...set].sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
}

// ------------------------------------------------------------------ computing

export const round2 = (x: number) => Math.round(x * 100) / 100;
export function levelFor(pct: number, levels: Settings['levels']): 0 | 1 | 2 | 3 {
  return pct >= levels[2] ? 3 : pct >= levels[1] ? 2 : pct >= levels[0] ? 1 : 0;
}

export interface ComponentResult { questions: number; maxMarks: number; students: number; attained: number; pct: number; level: number; average: number }
export interface CoResult {
  co: string;
  cie: ComponentResult | null; see: ComponentResult | null;
  direct: number | null; indirect: number | null; final: number | null;
  met: boolean | null;
}
export interface StudentCo { id: string; name: string; byCo: Record<string, { cie: number | null; see: number | null }> }
export interface CourseResult { cos: CoResult[]; po: Record<string, number | null>; articulation: Record<string, number | null>; students: StudentCo[]; problems: string[] }

function colsFor(input: CourseInput, co: string, comp: Component) {
  return input.columns.map((c, k) => ({ c, k })).filter(({ c }) => c.component === comp && (c.cos.includes(co) || c.cos.includes('ALL')) && (c.max ?? 0) > 0);
}

export function computeCourse(input: CourseInput): CourseResult {
  const s = input.settings;
  const problems: string[] = [];
  if (Math.abs(s.wCIE + s.wSEE - 100) > 0.01) problems.push('CIE and SEE weights should add up to 100 %; they are scaled to do so.');
  const wSum = s.wCIE + s.wSEE || 1;
  const students: StudentCo[] = input.students.map(st => ({ id: st.id, name: st.name, byCo: {} }));

  const cos = input.cos.map((co): CoResult => {
    const comp = (which: Component): ComponentResult | null => {
      const cols = colsFor(input, co, which);
      if (!cols.length) return null;
      let considered = 0, attained = 0, pctSum = 0;
      input.students.forEach((st, i) => {
        let got = 0, max = 0;
        for (const { c, k } of cols) {
          const m = st.marks[k];
          if (m == null) continue;
          got += Math.min(Math.max(m, 0), c.max!); max += c.max!;
        }
        const key = which === 'CIE' ? 'cie' : 'see';
        students[i].byCo[co] = { ...(students[i].byCo[co] || { cie: null, see: null }), [key]: max > 0 ? round2((got / max) * 100) : null };
        if (max <= 0) return;
        considered++;
        const pct = (got / max) * 100;
        pctSum += pct;
        if (pct + 1e-9 >= s.studentThreshold) attained++;
      });
      const pct = considered ? (attained / considered) * 100 : 0;
      return { questions: cols.length, maxMarks: cols.reduce((a, x) => a + x.c.max!, 0), students: considered, attained, pct: round2(pct), level: considered ? levelFor(pct, s.levels) : 0, average: considered ? round2(pctSum / considered) : 0 };
    };
    const cie = comp('CIE'), see = comp('SEE');
    let direct: number | null = null;
    if (cie && see) direct = (cie.level * s.wCIE + see.level * s.wSEE) / wSum;
    else if (cie) direct = cie.level;
    else if (see) direct = see.level;
    const ind = input.indirect[co];
    const indirect = ind == null || !Number.isFinite(ind) ? null : Math.min(3, Math.max(0, ind));
    const final = direct == null ? null : indirect == null ? direct : (direct * s.wDirect + indirect * (100 - s.wDirect)) / 100;
    if (direct == null) problems.push(`${co} has no questions with maximum marks, so it has no attainment.`);
    return { co, cie, see, direct: direct == null ? null : round2(direct), indirect, final: final == null ? null : round2(final), met: final == null ? null : final + 1e-9 >= s.target };
  });

  const po: Record<string, number | null> = {};
  const articulation: Record<string, number | null> = {};
  for (const o of input.outcomes) {
    let num2 = 0, den = 0, n = 0, sum = 0;
    for (const r of cos) {
      const m = input.mapping[r.co]?.[o.code];
      if (!m) continue;
      n++; sum += m;
      if (r.final == null) continue;
      num2 += m * r.final; den += m;
    }
    articulation[o.code] = n ? round2(sum / n) : null;
    po[o.code] = den ? round2(num2 / den) : null;
  }
  return { cos, po, articulation, students, problems };
}

/** Programme level: average of the courses' PO attainments, per PO, over the courses that map it. */
export interface SavedCourse { id: string; code: string; name: string; semester: string; year: string; outcomes: Outcome[]; po: Record<string, number | null>; cos: { co: string; final: number | null }[]; savedAt: string }
export function programmeAttainment(courses: SavedCourse[]): { outcomes: Outcome[]; avg: Record<string, number | null>; count: Record<string, number> } {
  const outcomes: Outcome[] = [];
  for (const c of courses) for (const o of c.outcomes) if (!outcomes.some(x => x.code === o.code)) outcomes.push(o);
  const avg: Record<string, number | null> = {}, count: Record<string, number> = {};
  for (const o of outcomes) {
    const vals = courses.map(c => c.po[o.code]).filter((v): v is number => v != null);
    count[o.code] = vals.length;
    avg[o.code] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  return { outcomes, avg, count };
}

// ------------------------------------------------------------------ template and report rows

export function templateRows(): CellValue[][] {
  return [
    ['Roll No', 'Name', 'Mid-1 Q1', 'Mid-1 Q2', 'Mid-1 Q3', 'Mid-2 Q1', 'Mid-2 Q2', 'Assignment', 'SEE Q1', 'SEE Q2', 'SEE Q3', 'SEE Q4', 'SEE Q5'],
    ['Max marks', null, 10, 10, 10, 10, 10, 5, 14, 14, 14, 14, 14],
    ['CO', null, 'CO1', 'CO2', 'CO2', 'CO3', 'CO4', 'CO1,CO2,CO3,CO4', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5'],
    ['Component', null, 'CIE', 'CIE', 'CIE', 'CIE', 'CIE', 'CIE', 'SEE', 'SEE', 'SEE', 'SEE', 'SEE'],
    ['(example) 21A01', 'Example student 1', 8, 6, 7, 9, 5, 5, 10, 12, 8, 9, 11],
    ['(example) 21A02', 'Example student 2', 5, 4, 'AB', 6, 7, 4, 7, 6, 9, 10, 5],
    ['(example) 21A03', 'Example student 3', 9, 9, 8, 7, 8, 5, 13, 11, 12, 12, 10],
  ];
}

export interface CourseInfo { institution: string; department: string; programme: string; code: string; name: string; semester: string; year: string; faculty: string }

export function reportSheets(info: CourseInfo, input: CourseInput, res: CourseResult, coText: Record<string, string>) {
  const s = input.settings;
  const lv = (v: number | null) => (v == null ? '—' : v);
  const summary: CellValue[][] = [
    ['CO–PO attainment report'],
    ['Institution', info.institution], ['Department', info.department], ['Programme', info.programme],
    ['Course', `${info.code} ${info.name}`.trim()], ['Semester', info.semester], ['Academic year', info.year], ['Course faculty', info.faculty],
    ['Students', input.students.length],
    [],
    ['Method'],
    ['Student attains a CO at', `${s.studentThreshold} % of the maximum marks of the questions mapped to it`],
    ['Attainment level 3 / 2 / 1', `≥ ${s.levels[2]} % / ≥ ${s.levels[1]} % / ≥ ${s.levels[0]} % of students attain`],
    ['Direct attainment', `CIE ${s.wCIE} % + SEE ${s.wSEE} %`],
    ['Final CO attainment', `Direct ${s.wDirect} % + course-exit survey ${100 - s.wDirect} % (direct only when no survey is entered)`],
    ['Target level', s.target],
    ['PO attainment', 'Σ (mapping × CO attainment) ÷ Σ mapping'],
    [],
    ['Prepared with the free CO–PO attainment calculator at acadexmatch.com/tools/co-po-attainment'],
  ];
  const coSheet: CellValue[][] = [
    ['CO', 'Statement', 'CIE: students', 'CIE: attained', 'CIE: % attained', 'CIE level', 'SEE: students', 'SEE: attained', 'SEE: % attained', 'SEE level', 'Direct', 'Survey', 'Final', `Target (${s.target})`],
    ...res.cos.map(r => [r.co, coText[r.co] || '', r.cie?.students ?? '—', r.cie?.attained ?? '—', r.cie?.pct ?? '—', r.cie?.level ?? '—', r.see?.students ?? '—', r.see?.attained ?? '—', r.see?.pct ?? '—', r.see?.level ?? '—', lv(r.direct), lv(r.indirect), lv(r.final), r.met == null ? '—' : r.met ? 'Met' : 'Not met'] as CellValue[]),
  ];
  const codes = input.outcomes.map(o => o.code);
  const matrix: CellValue[][] = [
    ['CO', ...codes],
    ...input.cos.map(co => [co, ...codes.map(p => input.mapping[co]?.[p] || null)] as CellValue[]),
    ['Average mapping', ...codes.map(p => res.articulation[p] ?? null)],
  ];
  const poSheet: CellValue[][] = [
    ['Outcome', 'Title', 'Average mapping', 'Attainment (0–3)'],
    ...input.outcomes.map(o => [o.code, o.title, lv(res.articulation[o.code]), lv(res.po[o.code])] as CellValue[]),
  ];
  const studentSheet: CellValue[][] = [
    ['Roll No', 'Name', ...input.cos.flatMap(co => [`${co} CIE %`, `${co} SEE %`])],
    ...res.students.map(st => [st.id, st.name, ...input.cos.flatMap(co => [st.byCo[co]?.cie ?? null, st.byCo[co]?.see ?? null])] as CellValue[]),
  ];
  return [
    { name: 'Summary', rows: summary, bold: [0, 10] },
    { name: 'CO attainment', rows: coSheet, freeze: true },
    { name: 'CO-PO matrix', rows: matrix, bold: [0, matrix.length - 1], freeze: true },
    { name: 'PO attainment', rows: poSheet, freeze: true },
    { name: 'Students CO %', rows: studentSheet, freeze: true },
  ];
}
