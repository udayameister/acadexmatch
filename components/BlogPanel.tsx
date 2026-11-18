'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { postJson } from '@/components/AuthCard';
import { Spinner } from '@/components/AuthWidgets';
import { renderMarkdown, slugify } from '@/lib/markdown';
import { POST_TYPES, fileUrl, fmtDate, fmtSize, postState, postUrl, typeLabel, weekStart, type BlogPost, type PostType } from '@/lib/blog';
import {
  AlertCircle, Bold, CalendarClock, CheckCircle2, Eye, FilePlus2, FileText, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered,
  Paperclip, PenLine, Quote, Save, Send, Table2, Trash2, Upload, X, ExternalLink, Flame, ArrowLeft, Star, EyeOff,
} from 'lucide-react';

/*
 * Admin console → Blog. Write articles, white papers, reports, guides and news; attach a cover image and a PDF;
 * save drafts, schedule or publish. Includes a weekly publishing tracker.
 */

type Draft = {
  id?: string; type: PostType; title: string; slug: string; summary: string; body: string; author: string; authorRole: string; tags: string;
  coverFile: string | null; coverAlt: string; pdfFile: string | null; pdfName: string | null; pdfSize: number | null; featured: boolean;
  publishAt: string; // datetime-local value (India time), '' = now
  published?: boolean;
};

const EMPTY: Draft = {
  type: 'article', title: '', slug: '', summary: '', body: '', author: 'AcadeXMatch team', authorRole: '', tags: '',
  coverFile: null, coverAlt: '', pdfFile: null, pdfName: null, pdfSize: null, featured: false, publishAt: '',
};

const TEMPLATES: Record<string, { label: string; type: PostType; body: string }> = {
  white_paper: {
    label: 'White paper outline', type: 'white_paper',
    body: `## Executive summary

Two or three short paragraphs: the problem, what you found and what you recommend.

> **Key finding:** One sentence that a busy reader should remember.

## Background

Why this matters for Indian higher education now (UGC / AICTE / NEP 2020 context).

## Method and data

Where the data comes from, the period covered and any limits.

## Findings

### Finding 1

| Measure | Value | Note |
| --- | --- | --- |
| Example | 00 | Source |

### Finding 2

Text.

## Recommendations

1. For institutions: …
2. For candidates: …
3. For policymakers: …

## Conclusion

Short closing paragraph.

## About AcadeXMatch

AcadeXMatch is the academic recruitment platform for Indian higher education.[^1]

[^1]: Source or reference, with a link: [AcadeXMatch](https://acadexmatch.com).
`,
  },
  guide: {
    label: 'How-to guide', type: 'guide',
    body: `## Who this guide is for

## Before you start

- Item
- Item

## Step 1: …

## Step 2: …

## Step 3: …

> **Tip:** A practical tip.

## Frequently asked questions

### Question?

Answer.
`,
  },
  report: {
    label: 'Monthly report', type: 'report',
    body: `## Highlights

- Vacancies posted this month: …
- Most in-demand subjects: …
- States with the most openings: …

## Vacancies by discipline

| Discipline | Vacancies | Change |
| --- | --- | --- |
| Computer Science | 0 | +0% |

## What this means

## Methodology
`,
  },
};

const LOCAL_KEY = 'acx_blog_draft_v1';
const istLocal = (iso?: string) => (iso ? new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 16) : '');
const fromIstLocal = (v: string) => (v ? new Date(Date.parse(`${v}:00Z`) - 5.5 * 3600_000).toISOString() : null);
const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

function toDraft(p: BlogPost): Draft {
  return {
    id: p.id, type: p.type, title: p.title, slug: p.slug, summary: p.summary, body: p.body, author: p.author, authorRole: p.authorRole || '',
    tags: p.tags.join(', '), coverFile: p.coverFile || null, coverAlt: p.coverAlt || '', pdfFile: p.pdfFile || null, pdfName: p.pdfName || null,
    pdfSize: p.pdfSize || null, featured: p.featured, publishAt: istLocal(p.publishAt), published: p.status === 'published',
  };
}

async function upload(file: File): Promise<{ file: string; url: string; size: number; name: string } | { error: string }> {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/admin/blog/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { error: d.error || 'Upload failed.' };
  } catch { return { error: 'Upload failed. Check your connection.' }; }
}

const STATE_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  scheduled: 'bg-gold-50 text-gold-900 border-gold-200',
  published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export default function BlogPanel() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/blog', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load posts.');
      setPosts(d.posts);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // An unsaved draft from a closed tab can be resumed.
  const [resume, setResume] = useState<Draft | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) setResume(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const remove = async (p: BlogPost) => {
    if (!window.confirm(`Delete “${p.title}”? This removes the post, its cover image and PDF permanently. This cannot be undone.`)) return;
    const r = await postJson('/api/admin/blog', { action: 'delete', id: p.id });
    if (r.error) setError(r.error); else { setNotice('Post deleted.'); load(); }
  };

  if (editing) {
    return (
      <Editor
        initial={editing}
        onClose={msg => { setEditing(null); try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } setResume(null); if (msg) setNotice(msg); load(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Blog, white papers &amp; resources</h2>
          <p className="text-sm text-slate-600 mt-1">Write, schedule and publish. Published posts appear on <a href="/blog" target="_blank" className="font-semibold text-brand-800 underline">/blog</a>, in the sitemap and the RSS feed.</p>
        </div>
        <button type="button" onClick={() => setEditing({ ...EMPTY })} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold">
          <FilePlus2 className="w-4 h-4" /> New post
        </button>
      </div>

      {notice && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}<button type="button" className="ml-auto" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button></p>}
      {error && <p role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</p>}
      {resume && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 flex flex-wrap items-center gap-3 text-sm">
          <PenLine className="w-4 h-4 text-gold-900" />
          <span className="text-gold-900">You have unsaved writing{resume.title ? <>: <strong>{resume.title}</strong></> : ''}.</span>
          <button type="button" onClick={() => setEditing(resume)} className="ml-auto px-3 py-1.5 rounded-lg bg-brand-900 text-white font-semibold">Continue writing</button>
          <button type="button" onClick={() => { try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } setResume(null); }} className="px-3 py-1.5 rounded-lg border border-gold-300 text-gold-900 font-semibold">Discard</button>
        </div>
      )}

      {posts && <WeeklyTracker posts={posts} onWrite={() => setEditing({ ...EMPTY })} />}

      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        {posts === null ? (
          <p className="p-6 text-sm text-slate-500 flex items-center gap-2"><Spinner /> Loading posts…</p>
        ) : posts.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-800 mt-3">No posts yet</p>
            <p className="text-sm text-slate-500 mt-1">Start with a white paper, report or guide. Templates are available in the editor.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {posts.map(p => {
              const st = postState(p);
              return (
                <li key={p.id} className="p-4 sm:px-5 flex flex-wrap items-center gap-3">
                  <div className="w-16 h-11 rounded-lg overflow-hidden bg-brand-900 shrink-0 grid place-items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.coverFile ? <img src={fileUrl(p.coverFile)} alt="" className="w-full h-full object-cover" /> : <FileText className="w-5 h-5 text-gold-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${STATE_BADGE[st]}`}>{st}</span>
                      <span className="text-xs text-slate-500">{typeLabel(p.type)}</span>
                      {p.pdfFile && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Paperclip className="w-3 h-3" />PDF</span>}
                      {p.featured && <span className="text-xs text-gold-800 inline-flex items-center gap-1"><Star className="w-3 h-3" />Featured</span>}
                    </div>
                    <p className="font-semibold text-slate-900 mt-1 break-words">{p.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {st === 'published' ? `Published ${fmtDateTime(p.publishAt)}` : st === 'scheduled' ? `Goes live ${fmtDateTime(p.publishAt)}` : `Draft, last saved ${fmtDateTime(p.updatedAt)}`} · {p.readMinutes} min read · {p.author}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {st === 'published' && <a href={postUrl(p)} target="_blank" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="View on the site" aria-label={`View ${p.title}`}><ExternalLink className="w-4 h-4" /></a>}
                    <button type="button" onClick={() => setEditing(toDraft(p))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                    <button type="button" onClick={() => remove(p)} className="p-2 rounded-lg text-crimson-600 hover:bg-crimson-50" title="Delete" aria-label={`Delete ${p.title}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ weekly tracker

function WeeklyTracker({ posts, onWrite }: { posts: BlogPost[]; onWrite: () => void }) {
  const now = Date.now();
  const start = weekStart(now);
  const week = 7 * 86400_000;
  const live = posts.filter(p => p.status === 'published' && p.publishAt);
  const inWeek = (s: number) => live.filter(p => { const t = Date.parse(p.publishAt!); return t >= s && t < s + week; });
  const thisWeek = inWeek(start);
  const done = thisWeek.some(p => Date.parse(p.publishAt!) <= now);
  const scheduled = thisWeek.filter(p => Date.parse(p.publishAt!) > now);
  let streak = 0;
  for (let s = done || scheduled.length ? start : start - week; inWeek(s).length; s -= week) streak++;
  const upcoming = live.filter(p => Date.parse(p.publishAt!) > now).sort((a, b) => a.publishAt!.localeCompare(b.publishAt!));
  const dueBy = new Date(start + week - 1).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const last8 = Array.from({ length: 8 }, (_, k) => start - (7 - k) * week).map(s => ({ s, n: inWeek(s).length }));

  return (
    <section aria-label="Weekly publishing" className={`rounded-2xl border p-5 grid md:grid-cols-[1fr_auto] gap-4 items-center ${done ? 'bg-emerald-50/60 border-emerald-200' : scheduled.length ? 'bg-gold-50/60 border-gold-200' : 'bg-crimson-50/50 border-crimson-100'}`}>
      <div>
        <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
          {done ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : scheduled.length ? <CalendarClock className="w-4 h-4 text-gold-800" /> : <AlertCircle className="w-4 h-4 text-crimson-600" />}
          {done ? 'This week’s post is published.' : scheduled.length ? `This week’s post is scheduled for ${fmtDateTime(scheduled[0].publishAt)}.` : `This week’s post is not written yet. Publish by ${dueBy}.`}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          <Flame className="w-3.5 h-3.5 inline -mt-0.5 text-gold-700" /> {streak} week{streak === 1 ? '' : 's'} in a row
          {upcoming.length ? ` · ${upcoming.length} scheduled ahead (next: ${fmtDateTime(upcoming[0].publishAt)})` : ' · Tip: write ahead and schedule, so a busy week never breaks the streak.'}
        </p>
        <div className="flex items-end gap-1.5 mt-3" aria-label="Posts in the last 8 weeks">
          {last8.map(w => (
            <div key={w.s} className="flex flex-col items-center gap-1" title={`Week of ${new Date(w.s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}: ${w.n} post${w.n === 1 ? '' : 's'}`}>
              <span className={`w-6 rounded ${w.n ? 'bg-brand-800' : 'bg-slate-200'}`} style={{ height: `${8 + Math.min(w.n, 3) * 8}px` }} />
            </div>
          ))}
          <span className="text-[10px] text-slate-500 ml-1">last 8 weeks</span>
        </div>
      </div>
      {!done && !scheduled.length && (
        <button type="button" onClick={onWrite} className="justify-self-start md:justify-self-end inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold"><PenLine className="w-4 h-4" /> Write this week’s post</button>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ editor

function Editor({ initial, onClose }: { initial: Draft; onClose: (msg?: string) => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [when, setWhen] = useState<'now' | 'later'>(initial.publishAt && Date.parse(fromIstLocal(initial.publishAt)!) > Date.now() ? 'later' : 'now');
  const ta = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));

  // Keep unsaved writing in this browser (cleared after saving).
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch { /* ignore */ } }, 800);
    return () => clearTimeout(t);
  }, [d]);
  useEffect(() => { if (!slugTouched) set('slug', slugify(d.title)); }, [d.title, slugTouched]);

  const preview = useMemo(() => (view === 'preview' ? renderMarkdown(d.body).html : ''), [view, d.body]);
  const words = d.body.trim() ? d.body.trim().split(/\s+/).length : 0;

  /** Wraps the selection (or inserts a snippet) in the body. */
  const wrap = (before: string, after = '', placeholder = '') => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b) || placeholder;
    const next = value.slice(0, a) + before + sel + after + value.slice(b);
    set('body', next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length); });
  };
  const line = (prefix: string, placeholder: string) => {
    const el = ta.current;
    if (!el) return;
    const a = el.selectionStart;
    const startOfLine = el.value.lastIndexOf('\n', a - 1) + 1;
    const needsBreak = startOfLine !== a && el.value.slice(startOfLine, a).trim() ? '\n\n' : '';
    wrap(needsBreak + prefix, '', placeholder);
  };

  const addImage = async (f: File) => {
    setBusy('Uploading image…'); setErr(null);
    const r = await upload(f);
    setBusy(null);
    if ('error' in r) { setErr(r.error); return; }
    wrap(`\n\n![${f.name.replace(/\.[^.]+$/, '')}](${r.url} "Caption")\n\n`);
  };
  const setCover = async (f: File) => {
    setBusy('Uploading cover…'); setErr(null);
    const r = await upload(f);
    setBusy(null);
    if ('error' in r) { setErr(r.error); return; }
    if (r.file.endsWith('.pdf')) { setErr('The cover must be an image (PNG, JPG or WebP).'); return; }
    set('coverFile', r.file);
  };
  const setPdf = async (f: File) => {
    setBusy('Uploading PDF…'); setErr(null);
    const r = await upload(f);
    setBusy(null);
    if ('error' in r) { setErr(r.error); return; }
    if (!r.file.endsWith('.pdf')) { setErr('Attach a PDF file here.'); return; }
    setD(x => ({ ...x, pdfFile: r.file, pdfName: f.name, pdfSize: r.size }));
  };

  const save = async (status: 'draft' | 'published', message: string) => {
    setErr(null);
    if (!d.title.trim()) { setErr('Please add a title.'); return; }
    if (status === 'published' && when === 'later' && (!d.publishAt || Date.parse(fromIstLocal(d.publishAt)!) <= Date.now())) { setErr('Choose a future date and time to schedule, or choose “Publish now”.'); return; }
    setBusy('Saving…');
    const r = await postJson('/api/admin/blog', {
      action: 'save',
      post: {
        id: d.id, type: d.type, title: d.title, slug: d.slug, summary: d.summary, body: d.body, author: d.author, authorRole: d.authorRole,
        tags: d.tags, coverFile: d.coverFile, coverAlt: d.coverAlt, pdfFile: d.pdfFile, pdfName: d.pdfName, pdfSize: d.pdfSize, featured: d.featured,
        status,
        publishAt: status === 'draft' ? (when === 'later' && d.publishAt ? fromIstLocal(d.publishAt) : null) : when === 'later' ? fromIstLocal(d.publishAt) : (initial.published && initial.publishAt && Date.parse(fromIstLocal(initial.publishAt)!) <= Date.now() ? fromIstLocal(initial.publishAt) : new Date().toISOString()),
      },
    });
    setBusy(null);
    if (r.error || !r.post) { setErr(r.error || 'Could not save.'); return; }
    onClose(message.replace('{title}', (r.post as BlogPost).title));
  };

  const st = initial.id && initial.published ? 'existing' : initial.id ? 'draft' : 'new';
  const tool = 'p-2 rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200';
  const input = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 bg-white';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => onClose()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline"><ArrowLeft className="w-4 h-4" /> All posts</button>
        <span className="text-xs text-slate-500">{busy ? <span className="inline-flex items-center gap-1.5"><Spinner /> {busy}</span> : 'Your writing is kept in this browser until you save.'}</span>
      </div>
      {err && <p role="alert" className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-sm text-crimson-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{err}</p>}

      <div className="grid xl:grid-cols-[1fr_340px] gap-5 items-start">
        {/* -------- main column */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4">
            <label className="block">
              <span className="sr-only">Title</span>
              <input value={d.title} onChange={e => set('title', e.target.value.slice(0, 180))} placeholder="Title of the post or white paper"
                className="w-full text-2xl sm:text-3xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Summary <span className="font-normal text-slate-400">(shown on cards, Google and social shares; 1–2 sentences)</span></span>
              <textarea value={d.summary} onChange={e => set('summary', e.target.value.slice(0, 400))} rows={2} className={input} placeholder="What will the reader learn?" />
              <span className="block text-[11px] text-slate-400 text-right">{d.summary.length}/400</span>
            </label>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
              <div className="flex rounded-lg bg-white border border-slate-200 p-0.5 mr-2" role="tablist">
                <button type="button" role="tab" aria-selected={view === 'write'} onClick={() => setView('write')} className={`px-3 py-1 rounded-md text-sm font-semibold ${view === 'write' ? 'bg-brand-900 text-white' : 'text-slate-600'}`}><PenLine className="w-3.5 h-3.5 inline -mt-0.5" /> Write</button>
                <button type="button" role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')} className={`px-3 py-1 rounded-md text-sm font-semibold ${view === 'preview' ? 'bg-brand-900 text-white' : 'text-slate-600'}`}><Eye className="w-3.5 h-3.5 inline -mt-0.5" /> Preview</button>
              </div>
              {view === 'write' && (
                <>
                  <button type="button" className={tool} title="Section heading" aria-label="Section heading" onClick={() => line('## ', 'Section heading')}><Heading2 className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Sub-heading" aria-label="Sub-heading" onClick={() => line('### ', 'Sub-heading')}><Heading3 className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Bold" aria-label="Bold" onClick={() => wrap('**', '**', 'bold text')}><Bold className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Italic" aria-label="Italic" onClick={() => wrap('*', '*', 'italic text')}><Italic className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Link" aria-label="Link" onClick={() => wrap('[', '](https://)', 'link text')}><Link2 className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Bullet list" aria-label="Bullet list" onClick={() => line('- ', 'List item')}><List className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Numbered list" aria-label="Numbered list" onClick={() => line('1. ', 'First item')}><ListOrdered className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Key finding box" aria-label="Key finding box" onClick={() => line('> **Key finding:** ', 'one sentence to remember')}><Quote className="w-4 h-4" /></button>
                  <button type="button" className={tool} title="Table" aria-label="Table" onClick={() => wrap('\n\n| Column | Column |\n| --- | --- |\n| Value | Value |\n\n')}><Table2 className="w-4 h-4" /></button>
                  <label className={`${tool} cursor-pointer`} title="Insert image" aria-label="Insert image">
                    <ImagePlus className="w-4 h-4" />
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addImage(f); }} />
                  </label>
                  <select aria-label="Insert a template" value="" onChange={e => {
                    const t = TEMPLATES[e.target.value];
                    if (!t) return;
                    if (d.body.trim() && !window.confirm('Add the template below your current text?')) return;
                    setD(x => ({ ...x, type: x.body.trim() ? x.type : t.type, body: x.body.trim() ? `${x.body.trimEnd()}\n\n${t.body}` : t.body }));
                  }} className="ml-auto text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700">
                    <option value="">Insert template…</option>
                    {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                  </select>
                </>
              )}
            </div>
            {view === 'write' ? (
              <textarea ref={ta} value={d.body} onChange={e => set('body', e.target.value)} spellCheck
                placeholder={'Write here. Use the buttons above, or type:\n\n## Section heading\n**bold**, *italic*, [link](https://…)\n- bullet list\n> **Key finding:** a highlighted box'}
                className="block w-full min-h-[520px] p-4 sm:p-5 text-[15px] leading-7 font-mono text-slate-800 focus:outline-none resize-y" />
            ) : (
              <div className="p-5 sm:p-8 min-h-[520px]">
                <h1 className="text-3xl font-bold text-slate-900 leading-tight">{d.title || 'Untitled'}</h1>
                {d.summary && <p className="text-lg text-slate-600 mt-3">{d.summary}</p>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.coverFile && <img src={fileUrl(d.coverFile)} alt="" className="w-full max-h-80 object-cover rounded-2xl my-6" />}
                {d.body.trim() ? <div className="acx-prose mt-6" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="text-slate-400 mt-6">Nothing written yet.</p>}
              </div>
            )}
            <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between">
              <span>{words.toLocaleString('en-IN')} words · about {Math.max(1, Math.round(words / 200))} min read</span>
              <span>Footnotes: write [^1] in the text and “[^1]: source” on its own line.</span>
            </div>
          </div>
        </div>

        {/* -------- settings column */}
        <aside className="space-y-4 xl:sticky xl:top-24">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">Publish</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className={`px-3 py-2 rounded-xl border cursor-pointer text-center font-semibold ${when === 'now' ? 'border-brand-800 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" name="when" className="sr-only" checked={when === 'now'} onChange={() => setWhen('now')} /> Now
              </label>
              <label className={`px-3 py-2 rounded-xl border cursor-pointer text-center font-semibold ${when === 'later' ? 'border-brand-800 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" name="when" className="sr-only" checked={when === 'later'} onChange={() => setWhen('later')} /> Schedule
              </label>
            </div>
            {when === 'later' && (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Goes live on (India time)</span>
                <input type="datetime-local" value={d.publishAt} min={istLocal(new Date().toISOString())} onChange={e => set('publishAt', e.target.value)} className={input} />
              </label>
            )}
            <button type="button" disabled={!!busy} onClick={() => save('published', when === 'later' ? '“{title}” is scheduled.' : '“{title}” is published.')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60">
              {when === 'later' ? <CalendarClock className="w-4 h-4" /> : <Send className="w-4 h-4" />} {when === 'later' ? 'Schedule' : st === 'existing' ? 'Update & publish' : 'Publish now'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => save('draft', st === 'existing' ? '“{title}” is unpublished and saved as a draft.' : 'Draft “{title}” saved.')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
              {st === 'existing' ? <><EyeOff className="w-4 h-4" /> Unpublish (save as draft)</> : <><Save className="w-4 h-4" /> Save draft</>}
            </button>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Type</span>
              <select value={d.type} onChange={e => set('type', e.target.value as PostType)} className={input}>
                {POST_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Web address</span>
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 text-sm overflow-hidden">
                <span className="pl-3 text-slate-400 shrink-0">/blog/</span>
                <input value={d.slug} onChange={e => { setSlugTouched(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 90)); }} className="flex-1 min-w-0 px-1 py-2.5 bg-transparent focus:outline-none" />
              </div>
              {st === 'existing' && <span className="block text-[11px] text-slate-400">Changing it breaks links already shared.</span>}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Tags <span className="font-normal text-slate-400">(comma separated)</span></span>
              <input value={d.tags} onChange={e => set('tags', e.target.value)} placeholder="UGC norms, PhD, Faculty hiring" className={input} />
            </label>
            <div className="grid grid-cols-1 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Author</span>
                <input value={d.author} onChange={e => set('author', e.target.value.slice(0, 80))} className={input} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Author role <span className="font-normal text-slate-400">(optional)</span></span>
                <input value={d.authorRole} onChange={e => set('authorRole', e.target.value.slice(0, 120))} placeholder="Founder, AcadeXMatch" className={input} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={d.featured} onChange={e => set('featured', e.target.checked)} className="rounded" /> Feature at the top of the blog
            </label>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">Cover image</p>
            {d.coverFile ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(d.coverFile)} alt="" className="w-full aspect-[16/9] object-cover rounded-xl border border-slate-200" />
                <input value={d.coverAlt} onChange={e => set('coverAlt', e.target.value)} placeholder="Describe the image (for screen readers)" className={input} />
                <button type="button" onClick={() => set('coverFile', null)} className="text-xs font-semibold text-crimson-700 hover:underline">Remove cover</button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-1 p-5 rounded-xl border-2 border-dashed border-slate-200 text-center cursor-pointer hover:border-brand-300">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">Upload cover</span>
                <span className="text-[11px] text-slate-400">PNG, JPG or WebP, up to 2 MB, 1600×900 works best</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCover(f); }} />
              </label>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">PDF document <span className="font-normal text-slate-400 text-xs">(white paper, report…)</span></p>
            {d.pdfFile ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-50/60 border border-brand-100">
                <FileText className="w-5 h-5 text-brand-800 shrink-0" />
                <div className="min-w-0 flex-1">
                  <a href={fileUrl(d.pdfFile)} target="_blank" className="block text-sm font-semibold text-slate-900 truncate hover:underline">{d.pdfName}</a>
                  <span className="text-[11px] text-slate-500">{fmtSize(d.pdfSize || 0)}</span>
                </div>
                <button type="button" onClick={() => setD(x => ({ ...x, pdfFile: null, pdfName: null, pdfSize: null }))} className="p-1.5 rounded-lg text-slate-500 hover:bg-white" aria-label="Remove PDF"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-1 p-5 rounded-xl border-2 border-dashed border-slate-200 text-center cursor-pointer hover:border-brand-300">
                <Paperclip className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">Attach PDF</span>
                <span className="text-[11px] text-slate-400">Up to 10 MB. Readers get a Download button.</span>
                <input type="file" accept="application/pdf" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPdf(f); }} />
              </label>
            )}
            {d.pdfFile && !d.body.trim() && <p className="text-[11px] text-slate-500">Tip: add a short introduction above so Google can find the paper.</p>}
          </div>
          {st === 'existing' && initial.publishAt && <p className="text-[11px] text-slate-400 px-1">First published {fmtDate(fromIstLocal(initial.publishAt) || undefined)}.</p>}
        </aside>
      </div>
    </div>
  );
}
