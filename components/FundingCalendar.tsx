'use client';

import React, { useMemo, useState } from 'react';
import { CalendarPlus, Clock, ExternalLink, Search } from 'lucide-react';
import { cardCls, fieldCls } from '@/components/toolsUi';
import { CALL_KINDS, DISCIPLINES, callStatus, daysBetween, fmtDate, sortCalls, type CallKind, type CallStatus, type Discipline, type FundingCall } from '@/lib/toolsData';
import { googleCalendarLink } from '@/lib/gcal';

const STATUS: Record<CallStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  upcoming: { label: 'Opens soon', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  rolling: { label: 'Open through the year', cls: 'bg-brand-50 text-brand-800 border-brand-200' },
  closed: { label: 'Closed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function Due({ c, today }: { c: FundingCall; today: string }) {
  const st = callStatus(c, today);
  if (st === 'rolling') return <span className="text-sm text-slate-600">{c.deadline ? `Current call listed until ${fmtDate(c.deadline)}` : 'No fixed deadline'}</span>;
  if (st === 'upcoming') return <span className="text-sm text-slate-700">Opens {fmtDate(c.opens)} · closes {fmtDate(c.deadline)}</span>;
  if (st === 'closed') return <span className="text-sm text-slate-500">Closed {fmtDate(c.deadline)}</span>;
  const left = daysBetween(today, c.deadline);
  return (
    <span className={`text-sm font-semibold inline-flex items-center gap-1.5 ${left <= 7 ? 'text-rose-700' : 'text-slate-800'}`}>
      <Clock className="w-4 h-4" /> Closes {fmtDate(c.deadline)} · {left === 0 ? 'today' : left === 1 ? 'tomorrow' : `${left} days left`}
    </span>
  );
}

export default function FundingCalendar({ calls, today }: { calls: FundingCall[]; today: string }) {
  const [q, setQ] = useState('');
  const [disc, setDisc] = useState<Discipline | ''>('');
  const [kind, setKind] = useState<CallKind | ''>('');
  const [funder, setFunder] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const funders = useMemo(() => [...new Set(calls.map(c => c.funder))].sort(), [calls]);
  const list = useMemo(() => sortCalls(calls, today).filter(c => {
    if (!showClosed && callStatus(c, today) === 'closed') return false;
    if (disc && !c.disciplines.includes(disc) && !c.disciplines.includes('all')) return false;
    if (kind && c.kind !== kind) return false;
    if (funder && c.funder !== funder) return false;
    if (q && !`${c.title} ${c.funder} ${c.who} ${c.notes}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [calls, today, q, disc, kind, funder, showClosed]);
  const closedCount = calls.filter(c => callStatus(c, today) === 'closed').length;

  return (
    <>
      <section className={`${cardCls} space-y-3`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="relative"><span className="sr-only">Search</span><Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" /><input className={`${fieldCls} pl-9`} placeholder="Search calls" value={q} onChange={e => setQ(e.target.value)} /></label>
          <select aria-label="Subject" className={fieldCls} value={disc} onChange={e => setDisc(e.target.value as Discipline | '')}><option value="">All subjects</option>{DISCIPLINES.filter(d => d[0] !== 'all').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="Type" className={fieldCls} value={kind} onChange={e => setKind(e.target.value as CallKind | '')}><option value="">Grants and fellowships</option>{CALL_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select aria-label="Funder" className={fieldCls} value={funder} onChange={e => setFunder(e.target.value)}><option value="">All funders</option>{funders.map(f => <option key={f} value={f}>{f}</option>)}</select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-700"><input type="checkbox" className="w-4 h-4" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show recently closed calls ({closedCount})</label>
          <a href="/tools/funding-calendar/calendar.ics" className="font-semibold text-brand-700 inline-flex items-center gap-1.5 hover:underline"><CalendarPlus className="w-4 h-4" /> All deadlines to my calendar (.ics)</a>
        </div>
      </section>

      <ul className="space-y-3" aria-live="polite">
        {list.map(c => { const st = callStatus(c, today); return (
          <li key={c.id} className={`${cardCls} !p-5 space-y-2 ${st === 'closed' ? 'opacity-75' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${STATUS[st].cls}`}>{STATUS[st].label}</span>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.funder}</span>
              <span className="text-xs text-slate-400">· {CALL_KINDS.find(k => k[0] === c.kind)?.[1]}</span>
            </div>
            <h2 className="font-serif text-lg font-bold text-slate-900">{c.title}</h2>
            <Due c={c} today={today} />
            {c.who && <p className="text-sm text-slate-700"><span className="font-semibold">Who can apply:</span> {c.who}</p>}
            {c.amount && <p className="text-sm text-slate-700"><span className="font-semibold">Support:</span> {c.amount}</p>}
            {c.notes && <p className="text-sm text-slate-600">{c.notes}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
              <a href={c.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 inline-flex items-center gap-1 hover:underline">Official notice <ExternalLink className="w-3.5 h-3.5" /></a>
              {c.deadline && st !== 'closed' && <a href={googleCalendarLink(`Deadline: ${c.title}`, c.deadline, undefined, `${c.funder}. ${c.who}\n${c.link}`)} target="_blank" rel="noopener noreferrer" className="text-slate-600 inline-flex items-center gap-1 hover:underline"><CalendarPlus className="w-3.5 h-3.5" /> Google Calendar</a>}
              <span className="text-xs text-slate-400">Checked {fmtDate(c.checked)}{c.source ? <> · <a className="underline" href={c.source} target="_blank" rel="noopener noreferrer nofollow">source</a></> : null}</span>
            </div>
          </li>
        ); })}
        {!list.length && <li className={`${cardCls} text-sm text-slate-600`}>No calls match these filters.</li>}
      </ul>
    </>
  );
}
