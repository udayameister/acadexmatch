'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Send, ShieldCheck, X, RotateCcw } from 'lucide-react';
import { useCurrentUser } from '@/lib/useAuth';
import {
  answerFromKnowledgeBase, blockedReply, greeting, sensitiveInput, SUPPORT_EMAIL,
  type HelpAudience, type HelpLink, type HelpReply,
} from '@/lib/helpBot';
import type { User } from '@/types';

interface Msg { id: number; role: 'user' | 'assistant'; text: string; links?: HelpLink[]; suggestions?: string[]; kind?: HelpReply['kind'] }

/** Remembers, for this browser tab, which sign-in the assistant has already greeted. */
const GREETED_KEY = 'acx-help-greeted';

function audienceOf(user: User | null): HelpAudience | null {
  if (!user) return 'guest';
  if (user.role === 'candidate') return 'candidate';
  if (user.role === 'institute_admin' || user.role === 'recruiter') return 'institute';
  return null; // platform administrators have the admin console
}

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* storage blocked */ } };

/**
 * Floating Help Assistant for candidates, institutions and visitors. Opens by itself once after each sign-in.
 * It answers questions about using the platform and never sees account data (see lib/helpBot.ts).
 */
export default function HelpAssistant() {
  const { user, ready } = useCurrentUser();
  const pathname = usePathname() || '/';
  const who = audienceOf(user);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState('');
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const lastUser = useRef<string | null | undefined>(undefined);

  const firstName = user?.name?.trim().split(/\s+/).find(w => !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w));

  const start = useCallback((aud: HelpAudience, name?: string) => {
    const g = greeting(aud, name);
    setMsgs([{ id: nextId.current++, role: 'assistant', text: g.text, suggestions: g.suggestions, kind: 'greeting' }]);
  }, []);

  // Sign-in / sign-out: greet once per sign-in, and clear the chat when someone signs out or switches account.
  useEffect(() => {
    if (!ready) return;
    const id = user?.id ?? null;
    if (lastUser.current !== undefined && lastUser.current !== id) {
      setMsgs([]);
      setOpen(false);
    }
    lastUser.current = id;
    if (!id) { write(GREETED_KEY, null); return; }
    if (who === 'candidate' || who === 'institute') {
      if (read(GREETED_KEY) === id) return;
      const t = setTimeout(() => { write(GREETED_KEY, id); start(who, firstName); setOpen(true); }, 1200);
      return () => clearTimeout(t);
    }
  }, [ready, user?.id, who, firstName, start]);

  useEffect(() => {
    if (open && !msgs.length && who) start(who, firstName);
  }, [open, msgs.length, who, firstName, start]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, [open]);

  const close = () => { setOpen(false); setTimeout(() => launcherRef.current?.focus(), 0); };

  const ask = async (raw: string) => {
    const text = raw.trim().slice(0, 500);
    if (!text || busy || !who) return;
    // Secrets never leave the browser: refuse before sending.
    const secret = sensitiveInput(text);
    if (secret) {
      setWarn(blockedReply(secret).text);
      return;
    }
    setWarn('');
    setInput('');
    const history = msgs.filter(m => m.kind !== 'greeting').slice(-6).map(m => ({ role: m.role, text: m.text }));
    setMsgs(m => [...m, { id: nextId.current++, role: 'user', text }]);
    setBusy(true);
    let r: HelpReply;
    try {
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, audience: who, history }),
        cache: 'no-store',
      });
      const d = await res.json().catch(() => null);
      r = res.ok && d?.text ? d as HelpReply : d?.error ? { kind: 'fallback', text: d.error } : answerFromKnowledgeBase(text, who);
    } catch {
      r = answerFromKnowledgeBase(text, who); // offline: the knowledge base also runs in the browser
    }
    setMsgs(m => [...m, { id: nextId.current++, role: 'assistant', text: r.text, links: r.links, suggestions: r.suggestions, kind: r.kind }]);
    setBusy(false);
  };

  if (!ready || !who || pathname.startsWith('/admin')) return null;

  const lastId = msgs[msgs.length - 1]?.id;

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the AcadeXMatch Help Assistant"
          className="fixed z-50 bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 pl-4 pr-5 rounded-full bg-brand-900 hover:bg-brand-800 text-white shadow-xl shadow-brand-950/25 flex items-center gap-2 font-semibold text-sm print:hidden"
        >
          <MessageCircle className="w-5 h-5 text-gold-300" aria-hidden="true" />
          <span className="hidden sm:inline">Help</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="AcadeXMatch Help Assistant"
          onKeyDown={e => { if (e.key === 'Escape') close(); }}
          className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 w-full sm:w-[400px] h-[85dvh] sm:h-[min(640px,calc(100dvh-48px))] flex flex-col bg-white sm:rounded-2xl rounded-t-2xl border border-slate-200 shadow-2xl overflow-hidden print:hidden"
        >
          <header className="flex items-center gap-3 px-4 py-3 bg-brand-950 text-white">
            <span className="w-9 h-9 rounded-xl bg-brand-800 grid place-items-center shrink-0" aria-hidden="true">
              <MessageCircle className="w-5 h-5 text-gold-300" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold leading-tight">Help Assistant</h2>
              <p className="text-[11px] text-gold-200/90 leading-tight">{who === 'institute' ? 'For institutions' : who === 'candidate' ? 'For candidates' : 'AcadeXMatch'}</p>
            </div>
            <button type="button" onClick={() => { setMsgs([]); setWarn(''); start(who, firstName); }} aria-label="Start a new chat"
              className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/10"><RotateCcw className="w-4 h-4" aria-hidden="true" /></button>
            <button type="button" onClick={close} aria-label="Close the Help Assistant"
              className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/10"><X className="w-5 h-5" aria-hidden="true" /></button>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-ivory" aria-live="polite">
            {msgs.map(m => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[88%] ${m.role === 'user' ? 'bg-brand-900 text-white rounded-2xl rounded-br-md px-3.5 py-2.5' : 'space-y-2'}`}>
                  {m.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                  ) : (
                    <>
                      <div className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-slate-800 border ${m.kind === 'blocked' || m.kind === 'privacy' ? 'bg-gold-50 border-gold-200' : 'bg-white border-slate-200'}`}>
                        <RichText text={m.text} />
                      </div>
                      {!!m.links?.length && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.links.map(l => <HelpLinkChip key={l.href + l.label} link={l} onNavigate={() => { if (window.matchMedia('(max-width: 639px)').matches) setOpen(false); }} />)}
                        </div>
                      )}
                      {m.id === lastId && !!m.suggestions?.length && !busy && (
                        <div className="flex flex-col items-start gap-1.5 pt-0.5">
                          {m.suggestions.map(s => (
                            <button key={s} type="button" onClick={() => ask(s)}
                              className="text-left text-xs font-medium px-3 py-2 rounded-xl border border-brand-200 text-brand-800 bg-white hover:bg-brand-50">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start" aria-label="The assistant is typing">
                <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-slate-200 flex gap-1">
                  {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={e => { e.preventDefault(); ask(input); }} className="border-t border-slate-200 bg-white px-3 pt-2.5 pb-3 space-y-2">
            {warn && <p role="alert" className="text-xs text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2">{warn}</p>}
            <div className="flex items-end gap-2">
              <label htmlFor="help-input" className="sr-only">Your question</label>
              <textarea
                id="help-input"
                ref={inputRef}
                rows={1}
                maxLength={500}
                value={input}
                onChange={e => { setInput(e.target.value); if (warn) setWarn(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                placeholder="Ask a question…"
                autoComplete="off"
                className="flex-1 resize-none max-h-28 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
                className="w-11 h-11 shrink-0 grid place-items-center rounded-xl bg-brand-900 hover:bg-brand-800 text-white disabled:opacity-40">
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-700" aria-hidden="true" />
              <span>I can&apos;t see your account or anyone else&apos;s. Never type passwords or codes here. Need a person? <a href={`mailto:${SUPPORT_EMAIL}`} className="underline text-brand-800">{SUPPORT_EMAIL}</a></span>
            </p>
          </form>
        </section>
      )}
    </>
  );
}

/** Paragraphs, with lines that start with "• " shown as a list. */
function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="list-disc pl-4 space-y-0.5">{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  text.split('\n').forEach(line => {
    const t = line.trim();
    if (/^[•\-*]\s+/.test(t)) list.push(t.replace(/^[•\-*]\s+/, ''));
    else { flush(); if (t) blocks.push(<p key={`p${blocks.length}`}>{t}</p>); }
  });
  flush();
  return <div className="space-y-1.5 break-words">{blocks}</div>;
}

function HelpLinkChip({ link, onNavigate }: { link: HelpLink; onNavigate: () => void }) {
  const cls = 'inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-50 text-brand-800 border border-brand-100 hover:bg-brand-100';
  if (link.href.startsWith('/')) return <Link href={link.href} onClick={onNavigate} className={cls}>{link.label}</Link>;
  if (link.href.startsWith('mailto:')) return <a href={link.href} className={cls}>{link.label}</a>;
  return null; // only on-site pages and the support address are ever linked
}
