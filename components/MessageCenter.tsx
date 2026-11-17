'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postJson } from '@/components/AuthCard';
import { Spinner } from '@/components/AuthWidgets';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Inbox, Lock, MessageSquarePlus, RefreshCw, Search, Send, ShieldCheck, Unlock, UserRound, X,
} from 'lucide-react';

/*
 * One inbox, two sides.
 *  mode="user":  a signed-in candidate or institution talks to the AcadeXMatch team (/api/messages).
 *  mode="admin": the platform administrator sees every conversation and can reply to or message any user
 *                (/api/admin/messages).
 */

type Side = 'user' | 'admin';
interface Message { id: string; from: Side; author: string; body: string; at: string }
interface Thread {
  id: string; userId: string; userName: string; userEmail?: string; userRole: string; subject: string; status: 'open' | 'closed';
  startedBy: Side; createdAt: string; updatedAt: string; unreadUser: number; unreadAdmin?: number; messages?: Message[];
  count?: number; last?: { from: Side; preview: string; at: string };
}
interface Found { id: string; name: string; email: string; role: string }

const ROLE_LABEL: Record<string, string> = { candidate: 'Candidate', institute_admin: 'Institution', recruiter: 'Recruiter', super_admin: 'Admin' };
const MAX_BODY = 4000;
const MAX_SUBJECT = 140;

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const fullWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function lastOf(t: Thread) {
  if (t.last) return t.last;
  const m = t.messages?.[t.messages.length - 1];
  return m ? { from: m.from, preview: m.body.slice(0, 140), at: m.at } : undefined;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    const d = await r.json().catch(() => null);
    return r.ok ? d : { error: d?.error || 'Could not load messages.' };
  } catch { return null; }
}

export default function MessageCenter({ mode, initialThreadId }: { mode: Side; initialThreadId?: string | null }) {
  const admin = mode === 'admin';
  const api = admin ? '/api/admin/messages' : '/api/messages';
  const mine: Side = admin ? 'admin' : 'user';
  const unreadOf = useCallback((t: Thread) => (admin ? t.unreadAdmin || 0 : t.unreadUser), [admin]);

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialThreadId || null);
  const [open, setOpen] = useState<Thread | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'open' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const d = await getJson(api);
    if (!quiet) setLoading(false);
    if (!d) { if (!quiet) setError('Could not reach the server. Please try again.'); return; }
    if (d.error) { setError(String(d.error)); return; }
    setError(null);
    setThreads((d.threads as Thread[]) || []);
  }, [api]);

  const loadThread = useCallback(async (id: string) => {
    if (!admin) return; // the user list already holds full conversations
    const d = await getJson(`${api}?thread=${encodeURIComponent(id)}`);
    if (d?.thread) setOpen(d.thread as Thread);
    else if (d?.error) setError(String(d.error));
  }, [admin, api]);

  useEffect(() => { load(); }, [load]);
  // Light polling while the page is visible, so new messages show up without a reload.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load(true);
      if (openId && admin) loadThread(openId);
    }, 20_000);
    return () => clearInterval(t);
  }, [load, loadThread, openId, admin]);

  // Keep the open conversation in step with the list (user mode) or fetch it (admin mode).
  useEffect(() => {
    if (!openId) { setOpen(null); return; }
    if (!admin) setOpen(threads?.find(t => t.id === openId) || null);
  }, [openId, threads, admin]);
  useEffect(() => { if (openId && admin) { setOpen(null); loadThread(openId); } }, [openId, admin, loadThread]);

  // Mark as read when a conversation with unread messages is opened.
  useEffect(() => {
    if (!open || !unreadOf(open)) return;
    const id = open.id;
    postJson(api, { action: 'read', threadId: id }).then(() => {
      setThreads(ts => ts?.map(t => (t.id === id ? { ...t, ...(admin ? { unreadAdmin: 0 } : { unreadUser: 0 }) } : t)) || ts);
      setOpen(o => (o && o.id === id ? { ...o, ...(admin ? { unreadAdmin: 0 } : { unreadUser: 0 }) } : o));
      window.dispatchEvent(new Event('acx-messages-read'));
    });
  }, [open, api, admin, unreadOf]);

  const upsert = (t: Thread) => {
    setThreads(ts => {
      const rest = (ts || []).filter(x => x.id !== t.id);
      const merged = admin ? { ...t, count: t.messages?.length, last: lastOf({ ...t, last: undefined }) } : t;
      return [merged, ...rest];
    });
    setOpen(t);
    setOpenId(t.id);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (threads || []).filter(t => {
      if (filter === 'unread' && !unreadOf(t)) return false;
      if (filter === 'open' && t.status !== 'open') return false;
      if (filter === 'closed' && t.status !== 'closed') return false;
      if (!q) return true;
      return `${t.subject} ${t.userName} ${t.userEmail || ''} ${lastOf(t)?.preview || ''}`.toLowerCase().includes(q);
    });
  }, [threads, filter, search, unreadOf]);

  const totalUnread = (threads || []).reduce((n, t) => n + unreadOf(t), 0);
  const showConversation = !!(composing || openId);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <Inbox className="w-5 h-5 text-brand-800 shrink-0" aria-hidden="true" />
          <h2 className="font-bold text-slate-900 truncate">{admin ? 'Messages with users' : 'Your conversations'}</h2>
          {totalUnread > 0 && <span className="px-2 py-0.5 rounded-full bg-crimson-600 text-white text-[11px] font-bold">{totalUnread} unread</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load()} className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 border border-transparent hover:border-slate-200" aria-label="Refresh messages" title="Refresh">
            {loading ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button type="button" onClick={() => { setComposing(true); setOpenId(null); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">
            <MessageSquarePlus className="w-4 h-4" /> {admin ? 'Message a user' : 'New message'}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mx-4 mt-3 p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] min-h-[540px] md:h-[min(72vh,760px)]">
        {/* ---------------- list */}
        <aside className={`${showConversation ? 'hidden md:flex' : 'flex'} flex-col min-w-0 border-r border-slate-200`} aria-label="Conversations">
          <div className="p-3 space-y-2 border-b border-slate-100">
            <label className="relative block">
              <span className="sr-only">Search conversations</span>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={admin ? 'Search name, email or subject' : 'Search your messages'}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Filter">
              {(['all', 'unread', 'open', 'closed'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`px-2.5 py-1 rounded-full font-semibold border ${filter === f ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'open' ? 'Open' : 'Closed'}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {threads === null ? (
              <li className="p-6 text-sm text-slate-500 flex items-center gap-2"><Spinner /> Loading…</li>
            ) : visible.length === 0 ? (
              <li className="p-6 text-sm text-slate-500 text-center">
                {threads.length === 0 ? (admin ? 'No conversations yet. Users can write to you from their Messages page.' : 'No messages yet. Start one with “New message”.') : 'Nothing matches this filter.'}
              </li>
            ) : visible.map(t => {
              const l = lastOf(t);
              const unread = unreadOf(t);
              const active = t.id === openId;
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => { setComposing(false); setOpenId(t.id); }} aria-current={active || undefined}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${active ? 'bg-brand-50/70' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{admin ? t.userName : t.subject}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{when(t.updatedAt)}</span>
                    </div>
                    {admin && <div className="text-xs text-slate-600 truncate">{t.subject}</div>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs truncate flex-1 ${unread ? 'text-slate-800' : 'text-slate-500'}`}>
                        {l ? `${l.from === mine ? 'You: ' : ''}${l.preview}` : ''}
                      </span>
                      {unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-crimson-600 text-white text-[11px] font-bold grid place-items-center">{unread}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {admin && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ROLE_LABEL[t.userRole] || t.userRole}</span>}
                      {t.status === 'closed' && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">Closed</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ---------------- conversation / composer */}
        <section className={`${showConversation ? 'flex' : 'hidden md:flex'} flex-col min-w-0`} aria-label="Conversation">
          {composing ? (
            <NewConversation admin={admin} api={api} onCancel={() => setComposing(false)} onSent={t => { setComposing(false); upsert(t); }} />
          ) : openId && !open ? (
            <div className="flex-1 grid place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><Spinner /> Opening…</span></div>
          ) : open ? (
            <Conversation admin={admin} api={api} mine={mine} thread={open} onBack={() => setOpenId(null)} onChange={upsert} />
          ) : (
            <div className="flex-1 grid place-items-center p-8 text-center">
              <div className="max-w-sm space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-800 grid place-items-center mx-auto"><Inbox className="w-6 h-6" /></div>
                <p className="font-semibold text-slate-800">{admin ? 'Choose a conversation' : 'Talk to the AcadeXMatch team'}</p>
                <p className="text-sm text-slate-500">
                  {admin ? 'Pick a conversation on the left, or start one with any user.' : 'Ask about your account, payments, vacancies or anything else. We reply here and send you an email when we do.'}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one conversation

function Conversation({ admin, api, mine, thread, onBack, onChange }: { admin: boolean; api: string; mine: Side; thread: Thread; onBack: () => void; onChange: (t: Thread) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const msgs = thread.messages || [];

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread.id, msgs.length]);
  useEffect(() => { setText(''); setErr(null); }, [thread.id]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    const r = await postJson(api, { action: 'reply', threadId: thread.id, body: text });
    setBusy(false);
    if (r.thread) { setText(''); onChange(r.thread as Thread); } else setErr(r.error || 'Could not send.');
  };
  const setStatus = async (status: 'open' | 'closed') => {
    setBusy(true); setErr(null);
    const r = await postJson(api, { action: 'status', threadId: thread.id, status });
    setBusy(false);
    if (r.thread) onChange(r.thread as Thread); else setErr(r.error || 'Could not update.');
  };

  return (
    <>
      <header className="flex items-start gap-3 px-4 sm:px-5 py-3 border-b border-slate-200">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back to conversations"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900 break-words">{thread.subject}</h3>
          <p className="text-xs text-slate-500 mt-0.5 break-words">
            {admin ? <><UserRound className="w-3.5 h-3.5 inline -mt-0.5" /> {thread.userName} · {ROLE_LABEL[thread.userRole] || thread.userRole}{thread.userEmail ? ` · ${thread.userEmail}` : ''}</> : <>With the AcadeXMatch team</>}
            {' · '}started {fullWhen(thread.createdAt)}
          </p>
        </div>
        {admin && (
          thread.status === 'open'
            ? <button type="button" disabled={busy} onClick={() => setStatus('closed')} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Lock className="w-3.5 h-3.5" /> Mark resolved</button>
            : <button type="button" disabled={busy} onClick={() => setStatus('open')} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Unlock className="w-3.5 h-3.5" /> Re-open</button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3 bg-[linear-gradient(180deg,#fbfaf9,#ffffff)]" aria-live="polite">
        {msgs.map(m => {
          const own = m.from === mine;
          return (
            <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] min-w-0 rounded-2xl px-3.5 py-2.5 shadow-sm ${own ? 'bg-brand-900 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>
                <div className={`text-[11px] font-semibold mb-0.5 flex items-center gap-1 ${own ? 'text-white/75' : 'text-slate-500'}`}>
                  {m.from === 'admin' && <ShieldCheck className="w-3 h-3" aria-hidden="true" />}{own ? 'You' : m.author}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>
                <div className={`text-[10px] mt-1 text-right ${own ? 'text-white/60' : 'text-slate-400'}`}>{fullWhen(m.at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="border-t border-slate-200 p-3 sm:p-4 space-y-2">
        {thread.status === 'closed' && (
          <p className="text-xs text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{admin ? 'Marked resolved. Replying re-opens it.' : 'The team marked this resolved. Write again to re-open it.'}</p>
        )}
        {err && <p role="alert" className="text-xs text-crimson-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{err}</p>}
        <div className="flex items-end gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Write a reply</span>
            <textarea value={text} onChange={e => setText(e.target.value.slice(0, MAX_BODY))} rows={2} placeholder={admin ? `Reply to ${thread.userName}…` : 'Write your reply…'}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
              className="w-full resize-y min-h-[44px] max-h-60 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </label>
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Spinner /> : <Send className="w-4 h-4" />} Send
          </button>
        </div>
        <p className="text-[11px] text-slate-400">Ctrl + Enter to send · {text.length}/{MAX_BODY}{admin ? '' : ' · Never share passwords or OTP codes in messages.'}</p>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ new conversation

function NewConversation({ admin, api, onCancel, onSent }: { admin: boolean; api: string; onCancel: () => void; onSent: (t: Thread) => void }) {
  const [to, setTo] = useState<Found | null>(null);
  const [find, setFind] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || to) return;
    const t = setTimeout(async () => {
      const d = await getJson(`${api}?users=${encodeURIComponent(find)}`);
      setFound((d?.users as Found[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [admin, api, find, to]);

  const send = async () => {
    if (busy) return;
    if (admin && !to) { setErr('Choose who to write to.'); return; }
    setBusy(true); setErr(null);
    const r = await postJson(api, admin ? { action: 'start', userId: to!.id, subject, body } : { action: 'start', subject, body });
    setBusy(false);
    if (r.thread) onSent(r.thread as Thread); else setErr(r.error || 'Could not send.');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900">{admin ? 'Message a user' : 'New message to the AcadeXMatch team'}</h3>
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cancel"><X className="w-5 h-5" /></button>
      </div>

      {admin && (
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-slate-800">To</span>
          {to ? (
            <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-brand-200 bg-brand-50/60">
              <span className="min-w-0 text-sm"><span className="font-semibold text-slate-900">{to.name}</span> <span className="text-slate-500 break-all">· {ROLE_LABEL[to.role] || to.role} · {to.email}</span></span>
              <button type="button" onClick={() => setTo(null)} className="text-xs font-semibold text-brand-800 hover:underline shrink-0">Change</button>
            </div>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Find a user</span>
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find by name or email" autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
              </label>
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {found.length === 0 ? <li className="p-3 text-sm text-slate-500">No matching users.</li> : found.map(u => (
                  <li key={u.id}>
                    <button type="button" onClick={() => setTo(u)} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{u.name}</span>
                      <span className="block text-xs text-slate-500 truncate">{ROLE_LABEL[u.role] || u.role} · {u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="block text-sm font-semibold text-slate-800">Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value.slice(0, MAX_SUBJECT))} placeholder={admin ? 'e.g. About your institution verification' : 'e.g. Question about my Premium plan'}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
      </label>
      <label className="block space-y-1.5">
        <span className="block text-sm font-semibold text-slate-800">Message</span>
        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, MAX_BODY))} rows={7} placeholder="Write your message…"
          className="w-full resize-y px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <span className="block text-[11px] text-slate-400 text-right">{body.length}/{MAX_BODY}</span>
      </label>
      {!admin && <p className="text-xs text-slate-500">The team usually replies within one working day. You will get an email when they do. Never share passwords or OTP codes.</p>}
      {admin && <p className="text-xs text-slate-500">The user sees this in their Messages and gets an email telling them to sign in and read it.</p>}
      {err && <p role="alert" className="text-sm text-crimson-700 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={send} disabled={busy || !subject.trim() || !body.trim() || (admin && !to)}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? <Spinner /> : <Send className="w-4 h-4" />} Send message
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

/** Unread count for the navbar badge / admin tab label; refreshes every minute and when messages are read. */
export function useUnreadMessages(enabled: boolean, admin = false): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) { setN(0); return; }
    let alive = true;
    const check = () => getJson(`${admin ? '/api/admin/messages' : '/api/messages'}?count=1`).then(d => { if (alive && d && typeof d.unread === 'number') setN(d.unread); });
    check();
    const t = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 60_000);
    window.addEventListener('acx-messages-read', check);
    return () => { alive = false; clearInterval(t); window.removeEventListener('acx-messages-read', check); };
  }, [enabled, admin]);
  return n;
}
