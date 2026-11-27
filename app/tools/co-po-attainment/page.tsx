'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Printer, Plus, RotateCcw, Save, Trash2, Upload, XCircle } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { Field, NumberInput, cardCls, fieldCls } from '@/components/toolsUi';
import {
  DEFAULT_SETTINGS, PRESETS, computeCourse, cosOf, normaliseCos, parseMarksSheet, programmeAttainment, psos, reportSheets, templateRows,
  type Component, type CourseInfo, type CourseInput, type CourseResult, type MarkColumn, type Outcome, type SavedCourse, type Settings, type Student,
} from '@/lib/copo';
import { XLSX_TYPE, downloadFile, readSpreadsheet, writeXlsx, type Sheet } from '@/lib/xlsxio';
import { BLOOM, tagQuestion } from '@/lib/blooms';

const DRAFT_KEY = 'acx-copo-draft-v1';
const SAVED_KEY = 'acx-copo-programme-v1';
const BLANK_INFO: CourseInfo = { institution: '', department: '', programme: '', code: '', name: '', semester: '', year: '', faculty: '' };

interface Draft {
  info: CourseInfo; preset: string; outcomes: Outcome[]; psoCount: number; psoTitles: string[];
  columns: MarkColumn[]; students: Student[]; extraCos: string[]; coText: Record<string, string>;
  indirect: Record<string, number | null>; mapping: Record<string, Record<string, number | null>>; settings: Settings; fileName: string;
}
const blankDraft = (): Draft => ({
  info: BLANK_INFO, preset: 'eng11', outcomes: PRESETS.eng11.outcomes, psoCount: 2, psoTitles: [], columns: [], students: [], extraCos: [],
  coText: {}, indirect: {}, mapping: {}, settings: DEFAULT_SETTINGS, fileName: '',
});

function load<T>(key: string): T | null { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : null; } catch { return null; } }
function store(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked or full */ } }
const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'course';
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className={`${cardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-3"><span className="w-8 h-8 rounded-full bg-brand-900 text-white text-sm flex items-center justify-center font-sans">{n}</span>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bar on the 0–3 scale with the target marked. */
function LevelBar({ value, target, label }: { value: number | null; target: number; label: string }) {
  const pct = value == null ? 0 : (value / 3) * 100;
  const met = value != null && value + 1e-9 >= target;
  return (
    <div className="flex items-center gap-3 text-sm" title={`${label}: ${fmt(value)} of 3 (target ${target})`}>
      <span className="w-14 shrink-0 font-semibold text-slate-700">{label}</span>
      <div className="relative flex-1 h-4 rounded-full bg-slate-100">
        <div className={`absolute inset-y-0 left-0 rounded-full ${met ? 'bg-brand-700' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-800" style={{ left: `${(target / 3) * 100}%` }} aria-hidden="true" />
      </div>
      <span className="w-12 text-right tabular-nums font-semibold text-slate-900">{fmt(value)}</span>
    </div>
  );
}

export default function CoPoAttainmentPage() {
  const [d, setD] = useState<Draft>(blankDraft);
  const [ready, setReady] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draft = load<Draft>(DRAFT_KEY);
    if (draft && Array.isArray(draft.columns)) setD({ ...blankDraft(), ...draft, settings: { ...DEFAULT_SETTINGS, ...(draft.settings || {}) } });
    setSaved(load<SavedCourse[]>(SAVED_KEY) || []);
    setReady(true);
  }, []);
  useEffect(() => { if (ready) store(DRAFT_KEY, d); }, [d, ready]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(cur => ({ ...cur, [k]: v }));
  const outcomes = useMemo(() => [...d.outcomes, ...psos(d.psoCount, d.psoTitles)], [d.outcomes, d.psoCount, d.psoTitles]);
  const cos = useMemo(() => cosOf(d.columns, d.extraCos), [d.columns, d.extraCos]);
  const input: CourseInput = useMemo(() => ({ columns: d.columns, students: d.students, cos, indirect: d.indirect, mapping: d.mapping, outcomes, settings: d.settings }), [d, cos, outcomes]);
  const result: CourseResult | null = useMemo(() => (d.students.length && cos.length ? computeCourse(input) : null), [input, d.students.length, cos.length]);

  const applyRows = (rows: Sheet['rows'], fileName: string) => {
    const p = parseMarksSheet(rows);
    setWarnings(p.warnings);
    setD(cur => ({ ...cur, columns: p.columns, students: p.students, fileName }));
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setNote('');
    if (f.size > 15 * 1024 * 1024) { setError('That file is larger than 15 MB. Keep only the marks sheet and try again.'); return; }
    try {
      const all = await readSpreadsheet(f.name, new Uint8Array(await f.arrayBuffer()));
      const usable = all.filter(s => s.rows.some(r => r.some(c => c != null)));
      if (!usable.length) throw new Error('The file has no data.');
      setSheets(usable);
      applyRows(usable[0].rows, f.name);
    } catch (e) { setError((e as Error).message || 'Could not read the file.'); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const updateCol = (i: number, patch: Partial<MarkColumn>) => set('columns', d.columns.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const setMap = (co: string, po: string, v: number | null) => set('mapping', { ...d.mapping, [co]: { ...(d.mapping[co] || {}), [po]: v } });
  const applyPreset = (key: string) => setD(cur => ({ ...cur, preset: key, outcomes: PRESETS[key].outcomes }));
  const reset = () => { if (confirm('Clear this course (marks, mapping and settings) and start again? Saved courses in the programme summary stay.')) { setD(blankDraft()); setSheets([]); setWarnings([]); } };

  const exportExcel = () => {
    if (!result) return;
    const bytes = writeXlsx(reportSheets(d.info, input, result, d.coText));
    downloadFile(`CO-PO-attainment-${safeName(d.info.code || d.info.name)}.xlsx`, bytes, XLSX_TYPE);
  };
  const printReport = () => {
    if (!result) return;
    const w = window.open('', '_blank');
    if (!w) { setNote('Your browser blocked the report window; allow pop-ups for this site and try again.'); return; }
    w.document.write(reportHtml(d, input, result));
    w.document.close();
    setTimeout(() => w.print(), 400);
  };
  const saveToProgramme = () => {
    if (!result) return;
    const id = `${d.info.code || d.info.name || 'course'}|${d.info.semester}|${d.info.year}`;
    const entry: SavedCourse = { id, code: d.info.code, name: d.info.name, semester: d.info.semester, year: d.info.year, outcomes, po: result.po, cos: result.cos.map(c => ({ co: c.co, final: c.final })), savedAt: new Date().toISOString() };
    const next = [...saved.filter(s => s.id !== id), entry];
    setSaved(next); store(SAVED_KEY, next);
    setNote(`Saved ${d.info.code || d.info.name || 'this course'} to the programme summary (in this browser).`);
  };
  const removeSaved = (id: string) => { const next = saved.filter(s => s.id !== id); setSaved(next); store(SAVED_KEY, next); };
  const programme = useMemo(() => programmeAttainment(saved), [saved]);
  const exportProgramme = () => {
    const codes = programme.outcomes.map(o => o.code);
    const rows = [['Course', 'Semester', 'Year', ...codes], ...saved.map(s => [`${s.code} ${s.name}`.trim(), s.semester, s.year, ...codes.map(c => s.po[c] ?? null)]), ['Programme average', null, null, ...codes.map(c => programme.avg[c])], ['Courses mapping it', null, null, ...codes.map(c => programme.count[c])]];
    downloadFile('PO-attainment-programme.xlsx', writeXlsx([{ name: 'PO attainment', rows, bold: [0, rows.length - 2], freeze: true }]), XLSX_TYPE);
  };

  const studentsAbsent = (k: number) => d.students.filter(s => s.marks[k] == null).length;
  const gaps = result?.cos.filter(c => c.met === false) || [];

  return (
    <ToolPage slug="co-po-attainment" title="CO–PO attainment calculator"
      intro={<>Upload the <strong>marks sheet in Excel</strong> — internal (CIE) and end-semester (SEE) question-wise marks — and get <strong>CO attainment levels</strong>, the <strong>CO–PO articulation matrix</strong>, <strong>PO and PSO attainment</strong> and a report ready for the <strong>NBA SAR</strong> (Criterion 3) and <strong>NAAC</strong> (Criterion 2.6). The file is read in your browser; the marks are never uploaded to AcadeXMatch.</>}
      notes={<>
        <p><strong>Student level.</strong> A student attains a CO in a component (CIE or SEE) when their marks in the questions mapped to that CO reach {d.settings.studentThreshold}% of those questions’ maximum. Absent or blank questions are left out of that student’s total; a student absent for all of them is not counted for that CO.</p>
        <p><strong>Attainment level.</strong> Level 3 when at least {d.settings.levels[2]}% of students attain the CO, 2 at {d.settings.levels[1]}%, 1 at {d.settings.levels[0]}%, otherwise 0. Direct attainment = CIE level × {d.settings.wCIE}% + SEE level × {d.settings.wSEE}% (if a CO has questions in only one component, that component counts in full). With a course-exit survey (0–3), final attainment = direct × {d.settings.wDirect}% + survey × {100 - d.settings.wDirect}%.</p>
        <p><strong>PO / PSO attainment.</strong> Σ (CO–PO mapping × CO attainment) ÷ Σ mapping, over the COs mapped to that outcome (1 = low, 2 = medium, 3 = high). The programme summary averages the courses that map each PO.</p>
        <p>These are the defaults most departments use; NBA leaves thresholds, weights and targets to the programme, so set the values your IQAC has approved under “Rules”. The engineering PO titles follow NBA’s graduate attributes — check them against the SAR edition you file.</p>
      </>}>

      <Step n={1} title="Course and programme" aside={<button onClick={reset} className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> Start again</button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {([['institution', 'Institution'], ['department', 'Department'], ['programme', 'Programme (e.g. B.Tech CSE)'], ['faculty', 'Course faculty'], ['code', 'Course code'], ['name', 'Course name'], ['semester', 'Semester'], ['year', 'Academic year (e.g. 2025–26)']] as [keyof CourseInfo, string][]).map(([k, l]) => (
            <Field key={k} label={l}><input className={fieldCls} value={d.info[k]} onChange={e => set('info', { ...d.info, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Programme outcomes">
            <select className={fieldCls} value={d.preset} onChange={e => applyPreset(e.target.value)}>
              {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Programme-specific outcomes (PSOs)">
            <select className={fieldCls} value={d.psoCount} onChange={e => set('psoCount', Number(e.target.value))}>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </Field>
        </div>
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit outcome titles ({d.outcomes.length} POs{d.psoCount ? `, ${d.psoCount} PSOs` : ''})</summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {d.outcomes.map((o, i) => (
              <div key={o.code} className="flex items-center gap-2"><span className="w-12 text-xs font-bold text-slate-600">{o.code}</span>
                <input className={fieldCls} value={o.title} placeholder="Title" onChange={e => set('outcomes', d.outcomes.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} /></div>
            ))}
            {psos(d.psoCount, d.psoTitles).map((o, i) => (
              <div key={o.code} className="flex items-center gap-2"><span className="w-12 text-xs font-bold text-slate-600">{o.code}</span>
                <input className={fieldCls} value={o.title} placeholder="Title" onChange={e => { const t = [...d.psoTitles]; t[i] = e.target.value; set('psoTitles', t); }} /></div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button className="text-sm font-semibold text-brand-700 inline-flex items-center gap-1" onClick={() => set('outcomes', [...d.outcomes, { code: `PO${d.outcomes.length + 1}`, title: '' }])}><Plus className="w-4 h-4" /> Add a PO</button>
            {d.outcomes.length > 1 && <button className="text-sm text-slate-500" onClick={() => set('outcomes', d.outcomes.slice(0, -1))}>Remove the last PO</button>}
          </div>
        </details>
      </Step>

      <Step n={2} title="Marks" aside={<button className="text-sm font-semibold text-brand-700 inline-flex items-center gap-1.5 hover:underline" onClick={() => downloadFile('CO-PO-marks-template.xlsx', writeXlsx([{ name: 'Marks', rows: templateRows(), bold: [0, 1, 2, 3] }]), XLSX_TYPE)}><Download className="w-4 h-4" /> Excel template</button>}>
        <p className="text-sm text-slate-600">One row per student, one column per question (or per assessment). Under the header, add a <strong>Max marks</strong> row, a <strong>CO</strong> row (CO1, or CO1,CO2 for a question on several, or ALL) and a <strong>Component</strong> row (CIE or SEE). If your sheet lacks these rows you can fill them in below. Write AB for absent.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> Upload marks (.xlsx or .csv)
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          {d.fileName && <span className="text-sm text-slate-600 inline-flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" /> {d.fileName} · {d.students.length} students · {d.columns.length} questions</span>}
          {sheets.length > 1 && (
            <select className={`${fieldCls} w-auto`} aria-label="Sheet" onChange={e => applyRows(sheets[Number(e.target.value)].rows, d.fileName)}>
              {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
            </select>
          )}
        </div>
        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}
        {warnings.length > 0 && <ul className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">{warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{w}</li>)}</ul>}
        {d.columns.length > 0 && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wide"><th className="p-2">Question</th><th className="p-2 w-24">Max</th><th className="p-2 w-40">CO(s)</th><th className="p-2 w-48">Component</th><th className="p-2 w-24 text-right">Absent</th></tr></thead>
              <tbody>
                {d.columns.map((c, i) => (
                  <tr key={c.index} className="border-t border-slate-100">
                    <td className="p-2 font-medium text-slate-800">{c.label}</td>
                    <td className="p-2"><NumberInput value={c.max} onChange={v => updateCol(i, { max: v })} /></td>
                    <td className="p-2"><input className={`${fieldCls} ${!c.cos.length && c.component !== 'ignore' ? 'border-amber-400' : ''}`} defaultValue={c.cos.join(', ')} key={c.cos.join(',')} placeholder="CO1" onBlur={e => updateCol(i, { cos: normaliseCos(e.target.value) })} /></td>
                    <td className="p-2"><select className={fieldCls} value={c.component} onChange={e => updateCol(i, { component: e.target.value as Component })}><option value="CIE">CIE (internal)</option><option value="SEE">SEE (end-sem)</option><option value="ignore">Leave out</option></select></td>
                    <td className="p-2 text-right tabular-nums text-slate-500">{studentsAbsent(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Step>

      {cos.length > 0 && (
        <Step n={3} title="Course outcomes" aside={<button className="text-sm font-semibold text-brand-700 inline-flex items-center gap-1" onClick={() => { const n = cos.length + 1; set('extraCos', [...d.extraCos, `CO${n}`]); }}><Plus className="w-4 h-4" /> Add a CO</button>}>
          <p className="text-sm text-slate-600">The statement is optional (it goes into the report, and its action verb shows the Bloom’s level). The <strong>course-exit survey</strong> is the class average on a 0–3 scale; leave it empty to use direct attainment only.</p>
          <div className="space-y-2">
            {cos.map(co => { const tag = d.coText[co] ? tagQuestion(d.coText[co]) : null; const b = tag?.level ? BLOOM[tag.level - 1] : null; return (
              <div key={co} className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[3.5rem_1fr_7rem_8rem] gap-2 items-center">
                <span className="font-bold text-slate-800 text-sm">{co}</span>
                <input className={fieldCls} placeholder={`Statement of ${co}, e.g. “Apply … to …”`} value={d.coText[co] || ''} onChange={e => set('coText', { ...d.coText, [co]: e.target.value })} />
                <span className="text-xs font-semibold hidden sm:block" style={{ color: b?.color }}>{b ? `${b.code} ${b.name}` : ''}</span>
                <div className="col-start-2 sm:col-start-auto"><NumberInput value={d.indirect[co] ?? null} min={0} max={3} step={0.01} placeholder="Survey 0–3" onChange={v => set('indirect', { ...d.indirect, [co]: v })} /></div>
              </div>
            ); })}
          </div>
        </Step>
      )}

      {cos.length > 0 && (
        <Step n={4} title="CO–PO mapping">
          <p className="text-sm text-slate-600">How strongly each CO supports each outcome: 3 = high, 2 = medium, 1 = low, empty = not mapped.</p>
          <div className="overflow-x-auto -mx-2">
            <table className="text-sm border-separate border-spacing-1">
              <thead><tr><th className="p-1 text-left text-xs text-slate-500">CO</th>{outcomes.map(o => <th key={o.code} className="p-1 text-xs font-semibold text-slate-700" title={o.title}>{o.code}</th>)}</tr></thead>
              <tbody>
                {cos.map(co => (
                  <tr key={co}><th className="p-1 text-left text-xs font-bold text-slate-800">{co}</th>
                    {outcomes.map(o => { const v = d.mapping[co]?.[o.code] ?? null; return (
                      <td key={o.code}><select aria-label={`${co} to ${o.code}`} value={v ?? ''} onChange={e => setMap(co, o.code, e.target.value ? Number(e.target.value) : null)}
                        className={`w-12 h-9 rounded-lg border text-center text-sm font-semibold ${v === 3 ? 'bg-brand-900 text-white border-brand-900' : v === 2 ? 'bg-brand-600 text-white border-brand-600' : v === 1 ? 'bg-brand-100 text-brand-900 border-brand-200' : 'bg-white text-slate-400 border-slate-200'}`}>
                        <option value="">–</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></td>
                    ); })}
                  </tr>
                ))}
                {result && <tr><th className="p-1 text-left text-xs text-slate-500">Avg</th>{outcomes.map(o => <td key={o.code} className="text-center text-xs tabular-nums text-slate-600">{result.articulation[o.code] == null ? '' : result.articulation[o.code]!.toFixed(1)}</td>)}</tr>}
              </tbody>
            </table>
          </div>
        </Step>
      )}

      {cos.length > 0 && (
        <Step n={5} title="Rules">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Student attains a CO at (% of max)"><NumberInput value={d.settings.studentThreshold} min={1} max={100} onChange={v => set('settings', { ...d.settings, studentThreshold: v ?? 60 })} /></Field>
            {(['Level 1 at (% of students)', 'Level 2 at', 'Level 3 at'] as const).map((l, i) => (
              <Field key={l} label={l}><NumberInput value={d.settings.levels[i]} min={0} max={100} onChange={v => { const lv = [...d.settings.levels] as Settings['levels']; lv[i] = v ?? 0; set('settings', { ...d.settings, levels: lv }); }} /></Field>
            ))}
            <Field label="CIE weight (%)" hint="SEE gets the rest"><NumberInput value={d.settings.wCIE} min={0} max={100} onChange={v => set('settings', { ...d.settings, wCIE: v ?? 0, wSEE: 100 - (v ?? 0) })} /></Field>
            <Field label="Direct weight when a survey is given (%)" hint="Survey gets the rest"><NumberInput value={d.settings.wDirect} min={0} max={100} onChange={v => set('settings', { ...d.settings, wDirect: v ?? 80 })} /></Field>
            <Field label="Target attainment level (0–3)"><NumberInput value={d.settings.target} min={0} max={3} step={0.1} onChange={v => set('settings', { ...d.settings, target: v ?? 2 })} /></Field>
          </div>
          {(d.settings.levels[0] > d.settings.levels[1] || d.settings.levels[1] > d.settings.levels[2]) && <p className="text-sm text-amber-800">Level thresholds should rise from level 1 to level 3.</p>}
        </Step>
      )}

      {result && (
        <section className={`${cardCls} space-y-6`} aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl font-bold text-slate-900">Attainment{d.info.code || d.info.name ? ` — ${`${d.info.code} ${d.info.name}`.trim()}` : ''}</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportExcel} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel report</button>
              <button onClick={printReport} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-2"><Printer className="w-4 h-4" /> Print / PDF</button>
              <button onClick={saveToProgramme} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-2"><Save className="w-4 h-4" /> Add to programme summary</button>
            </div>
          </div>
          {note && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3">{note}</p>}
          {result.problems.length > 0 && <ul className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}

          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="p-2">CO</th><th className="p-2 text-right">CIE: % attained</th><th className="p-2 text-right">Level</th><th className="p-2 text-right">SEE: % attained</th><th className="p-2 text-right">Level</th><th className="p-2 text-right">Direct</th><th className="p-2 text-right">Survey</th><th className="p-2 text-right">Final</th><th className="p-2">Target {d.settings.target}</th>
              </tr></thead>
              <tbody>
                {result.cos.map(r => (
                  <tr key={r.co} className="border-t border-slate-100 tabular-nums">
                    <td className="p-2 font-bold text-slate-900">{r.co}</td>
                    <td className="p-2 text-right" title={r.cie ? `${r.cie.attained} of ${r.cie.students} students · class average ${r.cie.average}%` : ''}>{r.cie ? `${r.cie.pct}% (${r.cie.attained}/${r.cie.students})` : '—'}</td>
                    <td className="p-2 text-right font-semibold">{r.cie?.level ?? '—'}</td>
                    <td className="p-2 text-right" title={r.see ? `${r.see.attained} of ${r.see.students} students · class average ${r.see.average}%` : ''}>{r.see ? `${r.see.pct}% (${r.see.attained}/${r.see.students})` : '—'}</td>
                    <td className="p-2 text-right font-semibold">{r.see?.level ?? '—'}</td>
                    <td className="p-2 text-right">{fmt(r.direct)}</td>
                    <td className="p-2 text-right">{fmt(r.indirect)}</td>
                    <td className="p-2 text-right font-bold text-slate-900">{fmt(r.final)}</td>
                    <td className="p-2">{r.met == null ? '—' : r.met ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-4 h-4" /> Met</span> : <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><XCircle className="w-4 h-4" /> Not met</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">CO attainment <span className="font-normal text-slate-500 text-sm">(0–3; line = target)</span></h3>
              {result.cos.map(r => <LevelBar key={r.co} label={r.co} value={r.final} target={d.settings.target} />)}
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-900">PO / PSO attainment from this course</h3>
              {outcomes.filter(o => result.po[o.code] != null).map(o => <LevelBar key={o.code} label={o.code} value={result.po[o.code]} target={d.settings.target} />)}
              {!outcomes.some(o => result.po[o.code] != null) && <p className="text-sm text-slate-500">Map the COs to POs in step 4 to see PO attainment.</p>}
            </div>
          </div>

          {gaps.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-950 space-y-1">
              <p className="font-semibold">Below target: {gaps.map(g => g.co).join(', ')}</p>
              <p>The SAR asks what the department did about each gap — for example remedial classes, more practice on the weak questions, a change in teaching method, or revising the CO or its assessment. Note the action against each CO before filing.</p>
            </div>
          )}
        </section>
      )}

      {saved.length > 0 && (
        <section className={`${cardCls} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl font-bold text-slate-900">Programme summary · {saved.length} course{saved.length === 1 ? '' : 's'}</h2>
            <button onClick={exportProgramme} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          </div>
          <p className="text-sm text-slate-600">Each course you add is kept in this browser only. Programme PO attainment = average of the courses that map the PO (NBA asks for this direct attainment alongside the graduate-exit survey).</p>
          <div className="overflow-x-auto -mx-2">
            <table className="text-sm min-w-[640px] w-full">
              <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Course</th>{programme.outcomes.map(o => <th key={o.code} className="p-2 text-right">{o.code}</th>)}<th /></tr></thead>
              <tbody>
                {saved.map(s => (
                  <tr key={s.id} className="border-t border-slate-100 tabular-nums">
                    <td className="p-2 text-slate-800">{`${s.code} ${s.name}`.trim() || 'Course'} <span className="text-xs text-slate-500">{[s.semester, s.year].filter(Boolean).join(' · ')}</span></td>
                    {programme.outcomes.map(o => <td key={o.code} className="p-2 text-right">{s.po[o.code] == null ? '' : s.po[o.code]!.toFixed(2)}</td>)}
                    <td className="p-2 text-right"><button aria-label="Remove this course" onClick={() => removeSaved(s.id)} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-bold tabular-nums"><td className="p-2">Programme</td>{programme.outcomes.map(o => <td key={o.code} className="p-2 text-right">{fmt(programme.avg[o.code])}</td>)}<td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ToolPage>
  );
}

/** A self-contained printable report (opened in a new window, printed or saved as PDF). */
function reportHtml(d: Draft, input: CourseInput, r: CourseResult): string {
  const s = input.settings;
  const info = d.info;
  const row = (cells: unknown[], th = false) => `<tr>${cells.map(c => (th ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`;
  const f = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));
  const codes = input.outcomes.map(o => o.code);
  return `<!doctype html><html><head><meta charset="utf-8"><title>CO-PO attainment ${esc(info.code)} ${esc(info.name)}</title>
<style>body{font:12px/1.45 Georgia,serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #888;padding:4px 6px;text-align:center}th{background:#eee}td.l,th.l{text-align:left}.meta td{border:none;text-align:left;padding:2px 8px 2px 0}.small{color:#444;font-size:11px}.sign{margin-top:48px;display:flex;justify-content:space-between}@media print{body{margin:10mm}}</style></head><body>
<h1>CO–PO attainment — ${esc(`${info.code} ${info.name}`.trim() || 'Course')}</h1>
<table class="meta">${[['Institution', info.institution], ['Department', info.department], ['Programme', info.programme], ['Semester / Year', [info.semester, info.year].filter(Boolean).join(' / ')], ['Course faculty', info.faculty], ['Students assessed', input.students.length]].filter(x => x[1] !== '' && x[1] != null).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>
<h2>Course outcomes</h2><table>${row(['CO', 'Statement'], true)}${input.cos.map(co => `<tr><td>${co}</td><td class="l">${esc(d.coText[co] || '')}</td></tr>`).join('')}</table>
<h2>CO–PO / PSO articulation matrix</h2><table>${row(['CO', ...codes], true)}${input.cos.map(co => row([co, ...codes.map(p => input.mapping[co]?.[p] || '')])).join('')}${row(['Average', ...codes.map(p => (r.articulation[p] == null ? '' : r.articulation[p]!.toFixed(2)))])}</table>
<h2>CO attainment</h2><table>${row(['CO', 'CIE % students attained', 'CIE level', 'SEE % students attained', 'SEE level', 'Direct', 'Course-exit survey', 'Final', `Target ${s.target}`], true)}${r.cos.map(c => row([c.co, c.cie ? `${c.cie.pct}% (${c.cie.attained}/${c.cie.students})` : '—', c.cie?.level ?? '—', c.see ? `${c.see.pct}% (${c.see.attained}/${c.see.students})` : '—', c.see?.level ?? '—', f(c.direct), f(c.indirect), f(c.final), c.met == null ? '—' : c.met ? 'Met' : 'Not met'])).join('')}</table>
<h2>PO / PSO attainment from this course</h2><table>${row(['Outcome', 'Title', 'Attainment (0–3)'], true)}${input.outcomes.filter(o => r.po[o.code] != null).map(o => `<tr><td>${o.code}</td><td class="l">${esc(o.title)}</td><td>${f(r.po[o.code])}</td></tr>`).join('')}</table>
<h2>Method</h2><p class="small">A student attains a CO when their marks in the questions mapped to it reach ${s.studentThreshold}% of the maximum. Level 3 / 2 / 1 when at least ${s.levels[2]}% / ${s.levels[1]}% / ${s.levels[0]}% of students attain it. Direct attainment = CIE ${s.wCIE}% + SEE ${s.wSEE}%. Final = direct ${s.wDirect}% + course-exit survey ${100 - s.wDirect}% (direct only where no survey was entered). PO attainment = Σ(mapping × CO attainment) ÷ Σ mapping.</p>
${r.cos.some(c => c.met === false) ? `<h2>Actions for COs below target</h2><table>${row(['CO', 'Action taken'], true)}${r.cos.filter(c => c.met === false).map(c => `<tr><td>${c.co}</td><td class="l" style="height:34px"></td></tr>`).join('')}</table>` : ''}
<div class="sign"><span>Course faculty</span><span>Course coordinator</span><span>Head of the Department</span></div>
<p class="small" style="margin-top:28px">Prepared with the free CO–PO attainment calculator, acadexmatch.com/tools/co-po-attainment</p>
</body></html>`;
}
