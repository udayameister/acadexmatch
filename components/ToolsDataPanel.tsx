'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { CALL_KINDS, DISCIPLINES, NOTICE_KINDS, callStatus, fmtDate, noticeWhen, sortCalls, todayIst, type Exam, type ExamNotice, type FundingCall, type ToolsData } from '@/lib/toolsData';

type Tab = 'calls' | 'notices' | 'exams';
type FieldDef = { k: string; label: string; type?: 'text' | 'date' | 'url' | 'textarea' | 'select' | 'check' | 'multi'; options?: [string, string][]; hint?: string; wide?: boolean };

const CALL_FIELDS: FieldDef[] = [
  { k: 'funder', label: 'Funder (e.g. ANRF)' }, { k: 'title', label: 'Title of the call', wide: true },
  { k: 'kind', label: 'Type', type: 'select', options: CALL_KINDS }, { k: 'disciplines', label: 'Subjects', type: 'multi', options: DISCIPLINES, wide: true },
  { k: 'who', label: 'Who can apply (one line)', type: 'textarea', wide: true }, { k: 'amount', label: 'Support (amount, duration)' },
  { k: 'opens', label: 'Opens', type: 'date' }, { k: 'deadline', label: 'Deadline', type: 'date' }, { k: 'rolling', label: 'Open through the year (no fixed deadline)', type: 'check' },
  { k: 'link', label: 'Official notice link', type: 'url', wide: true }, { k: 'source', label: 'Where you read it, if not the official notice', type: 'url', wide: true },
  { k: 'checked', label: 'Checked on', type: 'date' }, { k: 'notes', label: 'Notes (extensions, time of closing…)', type: 'textarea', wide: true },
];
const EXAM_FIELDS: FieldDef[] = [
  { k: 'name', label: 'Short name (e.g. TS SET)' }, { k: 'full', label: 'Full name' }, { k: 'body', label: 'Conducting body' }, { k: 'scope', label: 'State / All India' },
  { k: 'site', label: 'Official website', type: 'url', wide: true }, { k: 'syllabus', label: 'Syllabus page', type: 'url', wide: true },
  { k: 'frequency', label: 'How often' }, { k: 'qualifies', label: 'Qualifies for' },
];
const noticeFields = (exams: Exam[]): FieldDef[] => [
  { k: 'examId', label: 'Exam', type: 'select', options: exams.map(e => [e.id, e.name]) }, { k: 'kind', label: 'Type', type: 'select', options: NOTICE_KINDS },
  { k: 'title', label: 'Title (e.g. UGC-NET June 2027: online applications)', wide: true },
  { k: 'date', label: 'Date (start)', type: 'date' }, { k: 'endDate', label: 'End date (optional)', type: 'date' },
  { k: 'link', label: 'Official page', type: 'url', wide: true }, { k: 'source', label: 'Where you read it, if not the official page', type: 'url', wide: true },
  { k: 'checked', label: 'Checked on', type: 'date' }, { k: 'note', label: 'Note (shifts, subject-wise dates…)', type: 'textarea', wide: true },
];

const inp = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-brand-500';

function Form({ fields, value, onChange }: { fields: FieldDef[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {fields.map(f => (
        <label key={f.k} className={`block space-y-1 ${f.wide ? 'sm:col-span-2' : ''}`}>
          {f.type !== 'check' && <span className="text-xs font-semibold text-slate-700">{f.label}</span>}
          {f.type === 'textarea' ? <textarea className={inp} rows={2} value={String(value[f.k] ?? '')} onChange={e => set(f.k, e.target.value)} />
            : f.type === 'select' ? <select className={inp} value={String(value[f.k] ?? '')} onChange={e => set(f.k, e.target.value)}><option value="">Choose…</option>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : f.type === 'check' ? <span className="flex items-center gap-2 text-sm text-slate-700 pt-5"><input type="checkbox" className="w-4 h-4" checked={!!value[f.k]} onChange={e => set(f.k, e.target.checked)} />{f.label}</span>
            : f.type === 'multi' ? <span className="flex flex-wrap gap-3">{f.options!.map(([v, l]) => { const arr = (value[f.k] as string[]) || []; return <span key={v} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" className="w-4 h-4" checked={arr.includes(v)} onChange={e => set(f.k, e.target.checked ? [...arr, v] : arr.filter(x => x !== v))} />{l}</span>; })}</span>
            : <input className={inp} type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'url' ? 'url' : undefined} value={String(value[f.k] ?? '')} onChange={e => set(f.k, e.target.value)} />}
        </label>
      ))}
    </div>
  );
}

export default function ToolsDataPanel() {
  const [data, setData] = useState<ToolsData | null>(null);
  const [tab, setTab] = useState<Tab>('calls');
  const [edit, setEdit] = useState<{ kind: Tab; prevId?: string; value: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const today = todayIst();

  useEffect(() => { fetch('/api/admin/tools-data').then(r => r.json()).then(setData).catch(() => setMsg('Could not load the data.')); }, []);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/admin/tools-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save.');
      setData(j); return true;
    } catch (e) { setMsg((e as Error).message); return false; } finally { setBusy(false); }
  };
  const save = async () => {
    if (!edit) return;
    const action = edit.kind === 'calls' ? 'saveCall' : edit.kind === 'exams' ? 'saveExam' : 'saveNotice';
    if (await post({ action, item: edit.value, prevId: edit.prevId })) { setEdit(null); setMsg('Saved — the public page shows it now.'); }
  };
  const remove = async (kind: Tab, id: string, label: string) => {
    if (!confirm(`Delete “${label}” from the public page? This cannot be undone.`)) return;
    await post({ action: kind === 'calls' ? 'deleteCall' : kind === 'exams' ? 'deleteExam' : 'deleteNotice', id });
  };
  if (!data) return <div className="p-6 text-sm text-slate-600">{msg || <Loader2 className="w-5 h-5 animate-spin" />}</div>;

  const blank: Record<Tab, Record<string, unknown>> = {
    calls: { kind: 'grant', disciplines: [], checked: today, rolling: false },
    exams: {},
    notices: { kind: 'exam', checked: today, examId: data.exams[0]?.id || '' },
  };
  const fields = edit?.kind === 'calls' ? CALL_FIELDS : edit?.kind === 'exams' ? EXAM_FIELDS : noticeFields(data.exams);
  const row = 'flex items-start justify-between gap-3 py-3 border-t border-slate-100';
  const icon = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-100';

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-2">
        <h2 className="text-lg font-bold text-slate-900">Free tools data</h2>
        <p className="text-sm text-slate-600">What the public <a className="text-brand-700 underline" href="/tools/funding-calendar" target="_blank">funding calendar</a> and <a className="text-brand-700 underline" href="/tools/net-set-hub" target="_blank">NET / SET hub</a> show. Enter only what an official notice (or a report quoting it) says, with its link and the date you checked it.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {([['calls', `Funding calls (${data.calls.length})`], ['notices', `Exam dates and notices (${data.notices.length})`], ['exams', `Exams (${data.exams.length})`]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} onClick={() => { setTab(t); setEdit(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === t ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{l}</button>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm p-3 rounded-xl bg-slate-50 border border-slate-200">{msg}</p>}

      {edit ? (
        <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
          <h3 className="font-bold text-slate-900">{edit.prevId ? 'Edit' : 'Add'} {edit.kind === 'calls' ? 'funding call' : edit.kind === 'exams' ? 'exam' : 'exam date / notice'}</h3>
          <Form fields={fields} value={edit.value} onChange={v => setEdit({ ...edit, value: v })} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-white border border-slate-200">
          <div className="flex justify-end pb-2"><button onClick={() => setEdit({ kind: tab, value: blank[tab] })} className="px-3 py-1.5 rounded-lg bg-brand-900 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add</button></div>
          {tab === 'calls' && sortCalls(data.calls, today).map((c: FundingCall) => (
            <div key={c.id} className={row}>
              <div className="min-w-0"><p className="font-semibold text-slate-900">{c.title}</p><p className="text-xs text-slate-600">{c.funder} · {callStatus(c, today)} · {c.rolling ? 'rolling' : `deadline ${fmtDate(c.deadline)}`} · checked {fmtDate(c.checked)} <a className="inline-flex text-brand-700" href={c.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /></a></p></div>
              <div className="flex shrink-0"><button aria-label="Edit" className={icon} onClick={() => setEdit({ kind: 'calls', prevId: c.id, value: { ...c } })}><Pencil className="w-4 h-4" /></button><button aria-label="Delete" className={icon} onClick={() => remove('calls', c.id, c.title)}><Trash2 className="w-4 h-4" /></button></div>
            </div>
          ))}
          {tab === 'notices' && [...data.notices].sort((a, b) => b.date.localeCompare(a.date)).map((n: ExamNotice) => (
            <div key={n.id} className={row}>
              <div className="min-w-0"><p className="font-semibold text-slate-900">{n.title}</p><p className="text-xs text-slate-600">{data.exams.find(e => e.id === n.examId)?.name || n.examId} · {fmtDate(n.date)}{n.endDate ? ` – ${fmtDate(n.endDate)}` : ''} · {noticeWhen(n, today)} · checked {fmtDate(n.checked)}</p></div>
              <div className="flex shrink-0"><button aria-label="Edit" className={icon} onClick={() => setEdit({ kind: 'notices', prevId: n.id, value: { ...n } })}><Pencil className="w-4 h-4" /></button><button aria-label="Delete" className={icon} onClick={() => remove('notices', n.id, n.title)}><Trash2 className="w-4 h-4" /></button></div>
            </div>
          ))}
          {tab === 'exams' && data.exams.map((e: Exam) => (
            <div key={e.id} className={row}>
              <div className="min-w-0"><p className="font-semibold text-slate-900">{e.name} <span className="text-xs font-normal text-slate-500">{e.scope}</span></p><p className="text-xs text-slate-600">{e.body} · {data.notices.filter(n => n.examId === e.id).length} notices</p></div>
              <div className="flex shrink-0"><button aria-label="Edit" className={icon} onClick={() => setEdit({ kind: 'exams', prevId: e.id, value: { ...e } })}><Pencil className="w-4 h-4" /></button><button aria-label="Delete" className={icon} onClick={() => remove('exams', e.id, e.name)}><Trash2 className="w-4 h-4" /></button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
