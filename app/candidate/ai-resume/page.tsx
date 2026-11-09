'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bot, CheckCircle2, ChevronDown, Download, FileSearch, FileText, Loader2, MessageSquareText, Pencil, Send, Sparkles, Wand2 } from 'lucide-react';
import PayButton, { useOnlinePayment } from '@/components/PayButton';

interface Overview { available: boolean; configured: boolean; price: number; fullPrice: number; premium: boolean; credits: number; sessions: { id: string; createdAt: string; expiresAt: string; active: boolean; builds: number; improves: number; draftId: string | null; lastScore: number | null }[] }
interface Run { at: string; kind: 'build' | 'improve'; model: string; before: number | null; after: number; kept: boolean; changes: string[]; questions: string[] }
interface Session { id: string; createdAt: string; expiresAt: string; messages: { role: 'user' | 'assistant'; content: string; at: string }[]; ready: boolean; jobText: string; draftId: string | null; builds: number; improves: number; runs: Run[]; limits: { userMessages: number; messageChars: number; jobChars: number; builds: number; improves: number }; userMessages: number }

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const tone = (s: number) => (s >= 80 ? 'text-emerald-700' : s >= 60 ? 'text-gold-700' : 'text-crimson-700');

async function api(body: Record<string, unknown>) {
  const r = await fetch('/api/ai-resume', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d;
}

export default function Page() {
  return <Suspense fallback={null}><AiResume /></Suspense>;
}

function AiResume() {
  const sid = useSearchParams().get('s');
  const router = useRouter();
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/ai-resume', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setO(d); else setErr(d.error || 'Could not load.');
  }, []);
  useEffect(() => { load(); }, [load]);
  const start = async () => {
    try { const d = await api({ action: 'start' }); router.push(`/candidate/ai-resume?s=${d.session.id}`); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div>
        <Link href={sid ? '/candidate/ai-resume' : '/candidate/resume-checker'} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2"><ArrowLeft className="w-3 h-3" /> {sid ? 'All AI sessions' : 'Resume Intelligence'}</Link>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-7 h-7 text-gold-500" /> AI resume builder</h1>
        <p className="text-sm text-slate-600 max-w-3xl">Chat with our AI interviewer, get a professionally written ATS-friendly resume, then let a separate AI editor improve it against the ATS check. Download it as a PDF or Word file.</p>
      </div>
      {err && <p role="alert" className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-800">{err}</p>}
      {!o ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>
        : sid ? <SessionView id={sid} onError={setErr} />
          : <Landing o={o} onStart={start} onPaid={async () => { await load(); }} />}
    </div>
  );
}

function Landing({ o, onStart, onPaid }: { o: Overview; onStart: () => void; onPaid: () => void }) {
  const online = useOnlinePayment();
  const steps = [
    { icon: MessageSquareText, title: 'Chat interview', text: 'Our AI asks about your roles, achievements, teaching, research and publications. It already knows your AcadeXMatch profile.' },
    { icon: FileText, title: 'AI writes your resume', text: 'A professional, single-column, ATS-friendly resume in the right template (Academic CV for faculty posts).' },
    { icon: Wand2, title: 'Separate AI improves it', text: 'A second, stronger AI edits it against our ATS check and the job description. You see the score before and after.' },
  ];
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gold-200 bg-gradient-to-br from-white via-gold-50/50 to-white p-6 sm:p-8 grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="w-10 h-10 rounded-2xl bg-brand-900 text-white grid place-items-center shrink-0"><s.icon className="w-5 h-5" /></span>
              <div><div className="font-semibold text-slate-900">{i + 1}. {s.title}</div><p className="text-sm text-slate-600">{s.text}</p></div>
            </li>
          ))}
          <li className="text-xs text-slate-500 pl-[52px]">Uses only what you tell us; it never invents jobs, dates or numbers. Always read the final resume before you send it.</li>
        </ol>
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 text-center">
          <div className="text-sm font-semibold text-slate-700">One AI resume session</div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="font-serif text-4xl font-bold text-brand-900">{inr(o.price)}</span>
            {o.premium && o.price < o.fullPrice && <span className="text-slate-400 line-through">{inr(o.fullPrice)}</span>}
          </div>
          <p className="text-xs text-slate-500">{o.premium ? 'Premium member price. ' : ''}Includes the chat interview, up to 3 AI builds and 3 AI improvements of one resume, ATS checks and PDF/Word downloads. Valid 30 days. Incl. GST.</p>
          {!o.available ? (
            <p className="text-sm p-3 rounded-xl bg-gold-50 border border-gold-200 text-gold-900">{o.configured ? 'The AI resume builder is switched off at the moment.' : 'The AI resume builder is coming soon.'} You can still use the free resume builder.</p>
          ) : o.credits > 0 ? (
            <button onClick={onStart} className="w-full px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold inline-flex items-center justify-center gap-2"><Bot className="w-5 h-5" /> Start my AI session{o.credits > 1 ? ` (${o.credits} paid)` : ''}</button>
          ) : online === null ? <p className="text-xs text-slate-500">Checking payment options…</p> : !online.configured ? (
            <p className="text-sm text-slate-600">Online payment is not available right now.</p>
          ) : (
            <PayButton product="ai_resume" label={`Pay ${inr(o.price)} and start`} description="AI resume builder session" onPaid={onPaid} />
          )}
          {!o.premium && o.price > 0 && <p className="text-xs text-slate-500"><Link href="/premium" className="font-semibold text-brand-800 hover:underline">Premium members</Link> pay less.</p>}
        </div>
      </section>

      {!!o.sessions.length && (
        <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">Your AI sessions</h2>
          <ul className="divide-y divide-slate-100">
            {o.sessions.map(s => (
              <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Started {fmt(s.createdAt)} · {s.active ? `open until ${fmt(s.expiresAt)}` : 'ended'}{s.lastScore !== null && <> · ATS <strong className={tone(s.lastScore)}>{s.lastScore}</strong></>}</span>
                <Link href={`/candidate/ai-resume?s=${s.id}`} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SessionView({ id, onError }: { id: string; onError: (m: string) => void }) {
  const router = useRouter();
  const [s, setS] = useState<Session | null>(null);
  const [text, setText] = useState('');
  const [job, setJob] = useState('');
  const [showJob, setShowJob] = useState(false);
  const [busy, setBusy] = useState<'' | 'send' | 'build' | 'improve' | 'job' | 'check'>('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`/api/ai-resume?id=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setS(d.session); setJob(d.session.jobText || ''); } else onError(d.error || 'Session not found.');
    });
  }, [id, onError]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [s?.messages.length, busy]);
  const run = async (key: typeof busy, body: Record<string, unknown>) => {
    setBusy(key); onError('');
    try { const d = await api({ ...body, id }); setS(d.session); return d; } catch (e) { onError((e as Error).message); return null; } finally { setBusy(''); }
  };
  if (!s) return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;
  const expired = s.expiresAt < new Date().toISOString();
  const answered = s.userMessages;
  const last = s.runs[s.runs.length - 1];
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setS(x => (x ? { ...x, messages: [...x.messages, { role: 'user', content: t, at: new Date().toISOString() }] } : x));
    const d = await run('send', { action: 'message', text: t });
    if (!d) setText(t);
  };
  const fullCheck = async () => {
    if (!s.draftId) return;
    setBusy('check');
    const fd = new FormData(); fd.append('builderId', s.draftId); fd.append('consent', '1'); if (s.jobText) fd.append('jobText', s.jobText);
    const r = await fetch('/api/resume', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (r.ok) router.push(`/candidate/resume-checker/${j.analysis.id}`); else onError(j.error || 'The check failed.');
  };

  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col min-h-[560px] max-h-[78vh]" aria-label="Chat with the AI interviewer">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-900 flex items-center gap-2"><Bot className="w-5 h-5 text-brand-700" /> AI interviewer</span>
          <button type="button" onClick={() => setShowJob(v => !v)} className="text-xs font-semibold text-brand-800 inline-flex items-center gap-1">{s.jobText ? 'Job description added' : 'Add job description'} <ChevronDown className={`w-3.5 h-3.5 transition ${showJob ? 'rotate-180' : ''}`} /></button>
        </div>
        {showJob && (
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
            <textarea value={job} onChange={e => setJob(e.target.value)} maxLength={s.limits.jobChars} rows={5} placeholder="Paste the job advertisement or description. The AI uses its keywords only where they truly match your experience." className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
            <button disabled={!!busy || expired} onClick={async () => { if (await run('job', { action: 'job', text: job })) setShowJob(false); }} className="px-3 py-1.5 rounded-lg bg-brand-900 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1">{busy === 'job' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save job description</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
          {s.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-brand-900 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>{m.content}</div>
            </div>
          ))}
          {busy === 'send' && <div className="flex"><div className="px-3.5 py-2.5 rounded-2xl bg-slate-100 text-slate-500 text-sm inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</div></div>}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2 items-end">
          <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} maxLength={s.limits.messageChars}
            disabled={expired || answered >= s.limits.userMessages} placeholder={expired ? 'This session has ended.' : 'Type your answer… (Enter to send, Shift+Enter for a new line)'}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-100" aria-label="Your answer" />
          <button disabled={!text.trim() || !!busy || expired} className="p-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white disabled:opacity-40" aria-label="Send"><Send className="w-4 h-4" /></button>
        </form>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-900">Your resume</h2>
          <p className="text-xs text-slate-500">{answered} answer{answered === 1 ? '' : 's'} given · session open until {fmt(s.expiresAt)}</p>
          {s.ready && !s.draftId && <p className="text-sm p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> The interviewer has enough to write a strong resume.</p>}
          <button disabled={!!busy || expired || s.builds >= s.limits.builds || answered < 2}
            onClick={() => run('build', { action: 'build' })}
            className={`w-full px-4 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 ${s.draftId ? 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50' : 'bg-brand-900 hover:bg-brand-800 text-white'}`}>
            {busy === 'build' ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing your resume…</> : <><FileText className="w-4 h-4" /> {s.draftId ? 'Rebuild from the chat' : 'Build my resume'}</>}
          </button>
          <p className="text-[11px] text-slate-500 -mt-1">{s.limits.builds - s.builds} build{s.limits.builds - s.builds === 1 ? '' : 's'} left{answered < 2 && !s.draftId ? ' · answer at least two questions first' : ''}</p>
          {s.draftId && (
            <>
              <button disabled={!!busy || expired || s.improves >= s.limits.improves} onClick={() => run('improve', { action: 'improve' })}
                className="w-full px-4 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-gold-600 text-white hover:from-gold-600 hover:to-gold-700 disabled:opacity-50">
                {busy === 'improve' ? <><Loader2 className="w-4 h-4 animate-spin" /> Improving for ATS…</> : <><Wand2 className="w-4 h-4" /> Improve with AI</>}
              </button>
              <p className="text-[11px] text-slate-500 -mt-1">{s.limits.improves - s.improves} improvement{s.limits.improves - s.improves === 1 ? '' : 's'} left · a separate AI editor</p>
              <div className="grid grid-cols-2 gap-2">
                <a href={`/api/resume/pdf?id=${encodeURIComponent(s.draftId)}`} className="px-3 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Download className="w-4 h-4" /> PDF</a>
                <a href={`/api/resume/docx?id=${encodeURIComponent(s.draftId)}`} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"><Download className="w-4 h-4" /> Word</a>
                <Link href={`/candidate/resume-builder?id=${encodeURIComponent(s.draftId)}`} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"><Pencil className="w-4 h-4" /> Edit &amp; preview</Link>
                <button onClick={fullCheck} disabled={!!busy} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">{busy === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />} Full ATS report</button>
              </div>
            </>
          )}
        </section>

        {last && (
          <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">ATS score</h2>
            <div className="flex items-baseline gap-3">
              <span className={`font-serif text-4xl font-bold ${tone(last.after)}`}>{last.kind === 'improve' && !last.kept ? last.before : last.after}</span><span className="text-sm text-slate-500">/ 100</span>
              {last.kind === 'improve' && last.before !== null && (last.kept
                ? <span className="text-sm font-semibold text-emerald-700">{last.after > last.before ? `+${last.after - last.before} from ${last.before}` : `unchanged at ${last.before}`}</span>
                : <span className="text-xs text-slate-500">The AI’s rewrite scored {last.after}, lower than {last.before}, so your current version was kept.</span>)}
            </div>
            {!!last.changes.length && <div><div className="text-xs font-semibold text-slate-700 mb-1">What the AI editor changed</div><ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">{last.changes.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            {!!last.questions.length && <div className="p-3 rounded-xl bg-gold-50 border border-gold-200"><div className="text-xs font-semibold text-gold-900 mb-1">Answer these in the chat to score higher</div><ul className="list-disc pl-5 text-xs text-gold-900 space-y-0.5">{last.questions.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            {s.runs.length > 1 && <p className="text-[11px] text-slate-500">History: {s.runs.map(r => `${r.kind === 'build' ? 'built' : 'improved'} ${r.kept ? r.after : `${r.before} (kept)`}`).join(' → ')}</p>}
          </section>
        )}
        <p className="text-[11px] text-slate-500 px-1">AI can make mistakes. Read every line before you send your resume, and correct anything that is not exactly right.</p>
      </aside>
    </div>
  );
}
