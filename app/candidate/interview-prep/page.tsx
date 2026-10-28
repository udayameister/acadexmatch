'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { isHydrated } from '@/lib/clientSync';
import { usePlan, PremiumBadge, PremiumLock } from '@/components/Premium';
import {
  PREP_TRACKS, PrepTrack, QuestionCategory, checklistFor, questionsFor, trackFromDesignation, DEMO_TEMPLATE,
} from '@/lib/interviewPrep';
import type { Application } from '@/types';
import { CalendarClock, CheckCircle2, Circle, Copy, Lightbulb, Mic, Pause, Play, RotateCcw, Shuffle, ExternalLink } from 'lucide-react';

const CATEGORIES: QuestionCategory[] = ['Teaching', 'Research', 'Subject', 'Institution', 'Leadership', 'Personal'];
const ANSWER_SECONDS = 120;

/**
 * Practice notes and checklist ticks, saved to the signed-in user's account in the database
 * (notes are saved shortly after typing stops). Notes kept in this browser by older versions are moved over once.
 */
function usePrepState<T extends Record<string, unknown>>(kind: 'notes' | 'ticks', userId: string | null): [T, (v: T) => void] {
  const stored = useStorageValue<T>(() => StorageService.getPrepState<T>(kind), {} as T);
  const [local, setLocal] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);

  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current && userId) StorageService.savePrepState(kind, pending.current);
    pending.current = null;
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId || !isHydrated()) return;
    const legacyKey = `acad_prep_${kind}_${userId}`;
    try {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const old = JSON.parse(raw) as T;
        if (old && Object.keys(old).length && !Object.keys(StorageService.getPrepState(kind)).length) StorageService.savePrepState(kind, old);
        localStorage.removeItem(legacyKey);
      }
    } catch { /* storage unavailable */ }
  }, [kind, userId, stored]);

  const set = (next: T) => {
    setLocal(next);
    if (!userId) return;
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, kind === 'notes' ? 800 : 0);
  };
  return [local ?? stored, set];
}

function UpcomingInterviews({ apps }: { apps: Application[] }) {
  const upcoming = apps
    .filter(a => a.interviewSlot && a.status !== 'rejected' && a.interviewSlot.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.interviewSlot!.date.localeCompare(b.interviewSlot!.date));
  if (!upcoming.length) return null;
  return (
    <section className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100 space-y-3">
      <h2 className="font-semibold text-emerald-900 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Your upcoming interviews</h2>
      <ul className="space-y-2 text-sm">
        {upcoming.map(a => {
          const days = Math.ceil((Date.parse(a.interviewSlot!.date) - Date.now()) / 86400000);
          return (
            <li key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white border border-emerald-100">
              <div>
                <div className="font-medium text-slate-900">{a.jobTitle}</div>
                <div className="text-xs text-slate-600">{a.instituteName} · {a.interviewSlot!.date} at {a.interviewSlot!.time} · {a.interviewSlot!.platform}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">{days <= 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`}</span>
                {a.interviewSlot!.meetingLink && <a href={a.interviewSlot!.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-800 hover:underline">Meeting link <ExternalLink className="w-3 h-3" /></a>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Practice({ track, userId }: { track: PrepTrack; userId: string | null }) {
  const [category, setCategory] = useState<QuestionCategory | 'All'>('All');
  const pool = useMemo(() => questionsFor(track).filter(q => category === 'All' || q.category === category), [track, category]);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(ANSWER_SECONDS);
  const [running, setRunning] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [notes, setNotes] = usePrepState<Record<string, string>>('notes', userId);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const q = pool[index % Math.max(1, pool.length)];

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);
  useEffect(() => { if (left === 0) setRunning(false); }, [left]);

  const next = (random = false) => {
    setIndex(i => (random && pool.length > 1 ? (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length : (i + 1) % Math.max(1, pool.length)));
    setLeft(ANSWER_SECONDS); setRunning(false); setShowTip(false);
  };
  useEffect(() => { setIndex(0); setLeft(ANSWER_SECONDS); setRunning(false); setShowTip(false); }, [track, category]);

  if (!q) return null;
  const mm = String(Math.floor(left / 60)).padStart(1, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4" aria-labelledby="practice-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 id="practice-title" className="text-lg font-bold text-slate-900 flex items-center gap-2"><Mic className="w-5 h-5 text-brand-700" /> Practice mode</h2>
        <select aria-label="Question category" className="px-3 py-2 rounded-lg border border-slate-200 text-sm" value={category} onChange={e => setCategory(e.target.value as QuestionCategory | 'All')}>
          <option value="All">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">Answer aloud as you would to the committee. Aim for one to two minutes per answer.</p>
      <div className="p-5 rounded-2xl bg-blush border border-brand-100">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{q.category} · question {(index % pool.length) + 1} of {pool.length}</div>
        <p className="mt-2 text-lg font-semibold text-slate-900">{q.q}</p>
        {showTip && <p className="mt-3 text-sm text-slate-700 flex gap-2"><Lightbulb className="w-4 h-4 text-gold-600 shrink-0 mt-0.5" />{q.tip}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-mono text-2xl font-bold tabular-nums ${left <= 15 ? 'text-crimson-700' : 'text-slate-900'}`} aria-live="polite" aria-label={`${mm} minutes ${ss} seconds left`}>{mm}:{ss}</span>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold" onClick={() => setRunning(r => !r)}>{running ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> {left === ANSWER_SECONDS ? 'Start' : 'Resume'}</>}</button>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium" onClick={() => { setLeft(ANSWER_SECONDS); setRunning(false); }}><RotateCcw className="w-4 h-4" /> Reset</button>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium" onClick={() => setShowTip(t => !t)}><Lightbulb className="w-4 h-4" /> {showTip ? 'Hide tip' : 'What panels look for'}</button>
        <span className="flex-1" />
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium" onClick={() => next(true)}><Shuffle className="w-4 h-4" /> Random</button>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-brand-900" onClick={() => next(false)}>Next question →</button>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Your notes for this question (saved to your account)</span>
        <textarea rows={3} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" value={notes[q.q] || ''} onChange={e => setNotes({ ...notes, [q.q]: e.target.value })} placeholder="Key points, an example to mention, a number to remember…" />
      </label>
    </section>
  );
}

export default function InterviewPrepPage() {
  const { user, ready, isPremium } = usePlan();
  const profile = useStorageValue(() => StorageService.getCandidateProfile(), null);
  const apps = useStorageValue<Application[]>(() => StorageService.getApplications(), []);
  const [track, setTrack] = useState<PrepTrack | null>(null);
  const [ticks, setTicks] = usePrepState<Record<string, boolean>>('ticks', user?.id || null);
  const [copied, setCopied] = useState(false);

  const activeTrack: PrepTrack = track || trackFromDesignation(apps.find(a => a.interviewSlot)?.jobTitle || profile?.currentDesignation);
  const groups = checklistFor(activeTrack);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const done = groups.reduce((n, g) => n + g.items.filter(i => ticks[`${activeTrack}|${i}`]).length, 0);

  if (!ready) return null;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="pb-6 border-b border-slate-200">
        <Link href="/candidate/dashboard" className="text-xs text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900">Interview preparation</h1>
          <PremiumBadge />
        </div>
        <p className="text-slate-600 text-sm mt-1 max-w-3xl">Checklists, a question bank and timed practice for faculty selection committees, teaching demonstrations and research presentations. General guidance only: always follow the instructions in your interview letter.</p>
      </div>

      {!isPremium ? (
        <PremiumLock title="Interview preparation is part of Premium" text="Get the full checklist for your post, more than 25 common selection-committee questions with tips, a timed practice mode and a teaching-demonstration planner." />
      ) : (
        <>
          <UpcomingInterviews apps={apps} />

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Position type">
            {PREP_TRACKS.map(t => (
              <button key={t.key} role="tab" aria-selected={activeTrack === t.key} onClick={() => setTrack(t.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${activeTrack === t.key ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{t.label}</button>
            ))}
          </div>
          <p className="text-sm text-slate-600 -mt-2">{PREP_TRACKS.find(t => t.key === activeTrack)?.blurb}</p>

          <div className="grid lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5" aria-labelledby="checklist-title">
              <div className="flex items-baseline justify-between">
                <h2 id="checklist-title" className="text-lg font-bold text-slate-900">Checklist</h2>
                <span className="text-sm font-semibold text-emerald-700">{done}/{total}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
              {groups.map(g => (
                <div key={g.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{g.title}</h3>
                  <ul className="space-y-1.5">
                    {g.items.map(item => {
                      const k = `${activeTrack}|${item}`;
                      const on = !!ticks[k];
                      return (
                        <li key={item}>
                          <button className="w-full flex items-start gap-2 text-left text-sm text-slate-700 hover:text-slate-900" aria-pressed={on} onClick={() => setTicks({ ...ticks, [k]: !on })}>
                            {on ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />}
                            <span className={on ? 'line-through text-slate-400' : ''}>{item}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>

            <div className="lg:col-span-7 space-y-6">
              <Practice track={activeTrack} userId={user?.id || null} />

              <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Teaching demonstration planner</h2>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => { navigator.clipboard?.writeText(DEMO_TEMPLATE).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined); }}><Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy template'}</button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-700 bg-cream border border-slate-200 rounded-2xl p-4 font-sans">{DEMO_TEMPLATE}</pre>
              </section>

              <section className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-slate-900">All questions for this post</h2>
                {CATEGORIES.map(c => {
                  const qs = questionsFor(activeTrack).filter(q => q.category === c);
                  if (!qs.length) return null;
                  return (
                    <details key={c} className="group">
                      <summary className="cursor-pointer font-semibold text-slate-800">{c} <span className="text-slate-500 font-normal">({qs.length})</span></summary>
                      <ul className="mt-2 space-y-2">
                        {qs.map(q => (
                          <li key={q.q} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                            <div className="font-medium text-slate-900">{q.q}</div>
                            <div className="text-xs text-slate-600 mt-1 flex gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-gold-600 shrink-0 mt-0.5" />{q.tip}</div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
