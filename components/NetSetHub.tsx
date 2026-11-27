'use client';

import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarPlus, ExternalLink, Globe } from 'lucide-react';
import { cardCls } from '@/components/toolsUi';
import { NOTICE_KINDS, daysBetween, fmtDate, noticeWhen, type Exam, type ExamNotice } from '@/lib/toolsData';
import { googleCalendarLink } from '@/lib/gcal';

const kindLabel = (k: ExamNotice['kind']) => NOTICE_KINDS.find(x => x[0] === k)?.[1] || 'Notice';
const range = (n: ExamNotice) => (n.endDate && n.endDate !== n.date ? `${fmtDate(n.date)} – ${fmtDate(n.endDate)}` : fmtDate(n.date));

function NoticeRow({ n, exam, today }: { n: ExamNotice; exam?: Exam; today: string }) {
  const when = noticeWhen(n, today);
  const left = daysBetween(today, n.date);
  return (
    <li className="py-3 flex gap-4">
      <div className="w-24 shrink-0 text-right">
        <div className="text-sm font-bold text-slate-900 tabular-nums">{fmtDate(n.date)}</div>
        {n.endDate && n.endDate !== n.date && <div className="text-xs text-slate-500">to {fmtDate(n.endDate)}</div>}
        {when === 'upcoming' && <div className="text-xs font-semibold text-brand-700">{left === 1 ? 'tomorrow' : `in ${left} days`}</div>}
        {when === 'ongoing' && <div className="text-xs font-semibold text-emerald-700">now</div>}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">{exam?.name || n.examId}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kindLabel(n.kind)}</span>
        </div>
        <p className="font-medium text-slate-900">{n.title}</p>
        {n.note && <p className="text-sm text-slate-600">{n.note}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 inline-flex items-center gap-1 hover:underline">Official page <ExternalLink className="w-3.5 h-3.5" /></a>
          {when !== 'past' && <a href={googleCalendarLink(n.title, n.date, n.endDate || undefined, `${n.note ? `${n.note}\n` : ''}${n.link}`)} target="_blank" rel="noopener noreferrer" className="text-slate-600 inline-flex items-center gap-1 hover:underline"><CalendarPlus className="w-3.5 h-3.5" /> Google Calendar</a>}
          <span className="text-xs text-slate-400">Checked {fmtDate(n.checked)}{n.source ? <> · <a className="underline" href={n.source} target="_blank" rel="noopener noreferrer nofollow">source</a></> : null}</span>
        </div>
      </div>
    </li>
  );
}

export default function NetSetHub({ exams, notices, today }: { exams: Exam[]; notices: ExamNotice[]; today: string }) {
  const [only, setOnly] = useState<string[]>([]);
  const byId = useMemo(() => new Map(exams.map(e => [e.id, e])), [exams]);
  const shown = notices.filter(n => !only.length || only.includes(n.examId));
  const coming = shown.filter(n => noticeWhen(n, today) !== 'past').sort((a, b) => a.date.localeCompare(b.date));
  const past = shown.filter(n => noticeWhen(n, today) === 'past').sort((a, b) => (b.endDate || b.date).localeCompare(a.endDate || a.date)).slice(0, 20);
  const next = (id: string) => notices.filter(n => n.examId === id && noticeWhen(n, today) !== 'past').sort((a, b) => a.date.localeCompare(b.date))[0];
  const toggle = (id: string) => setOnly(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));
  const icsHref = `/tools/net-set-hub/calendar.ics${only.length ? `?exam=${only.join(',')}` : ''}`;

  return (
    <>
      <section className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-slate-700">Show dates for</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Exams">
          <button onClick={() => setOnly([])} aria-pressed={!only.length} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${!only.length ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-700 border-slate-300'}`}>All exams</button>
          {exams.map(e => (
            <button key={e.id} onClick={() => toggle(e.id)} aria-pressed={only.includes(e.id)} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${only.includes(e.id) ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-700 border-slate-300 hover:border-brand-300'}`}>{e.name}</button>
          ))}
        </div>
      </section>

      <section className={`${cardCls} space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-bold text-slate-900">Coming up</h2>
          <a href={icsHref} className="text-sm font-semibold text-brand-700 inline-flex items-center gap-1.5 hover:underline"><CalendarPlus className="w-4 h-4" /> Add these dates to my calendar (.ics)</a>
        </div>
        {coming.length ? <ol className="divide-y divide-slate-100">{coming.map(n => <NoticeRow key={n.id} n={n} exam={byId.get(n.examId)} today={today} />)}</ol>
          : <p className="text-sm text-slate-600">No dates announced yet for {only.length ? 'these exams' : 'any exam'}. Check the official sites below; we add dates as soon as they are notified.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-bold text-slate-900">The exams</h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {exams.filter(e => !only.length || only.includes(e.id)).map(e => { const nx = next(e.id); return (
            <li key={e.id} className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-2">
              <div>
                <h3 className="font-bold text-slate-900">{e.name} <span className="text-xs font-semibold text-slate-500">· {e.scope}</span></h3>
                <p className="text-xs text-slate-600">{e.full}</p>
              </div>
              <dl className="text-sm text-slate-700 space-y-1">
                <div><dt className="inline font-semibold">Conducted by: </dt><dd className="inline">{e.body}</dd></div>
                {e.frequency && <div><dt className="inline font-semibold">How often: </dt><dd className="inline">{e.frequency}</dd></div>}
                {e.qualifies && <div><dt className="inline font-semibold">Qualifies for: </dt><dd className="inline">{e.qualifies}</dd></div>}
                <div><dt className="inline font-semibold">Next date: </dt><dd className="inline">{nx ? `${kindLabel(nx.kind)} — ${range(nx)}` : 'not announced yet'}</dd></div>
              </dl>
              <div className="mt-auto pt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={e.site} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 inline-flex items-center gap-1 hover:underline"><Globe className="w-3.5 h-3.5" /> Official site</a>
                {e.syllabus && <a href={e.syllabus} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 inline-flex items-center gap-1 hover:underline"><BookOpen className="w-3.5 h-3.5" /> Syllabus</a>}
              </div>
            </li>
          ); })}
        </ul>
      </section>

      {past.length > 0 && (
        <section className={`${cardCls} space-y-2`}>
          <h2 className="font-serif text-xl font-bold text-slate-900">Recent notices</h2>
          <ol className="divide-y divide-slate-100">{past.map(n => <NoticeRow key={n.id} n={n} exam={byId.get(n.examId)} today={today} />)}</ol>
        </section>
      )}
    </>
  );
}
