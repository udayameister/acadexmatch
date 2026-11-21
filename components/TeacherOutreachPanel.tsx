'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Globe, GraduationCap, Loader2, Mail, Pause, Play, RotateCcw, Save, Search, Send, Square, Trash2, Ban } from 'lucide-react';

interface Finder { running: boolean; filter: { state?: string; category?: string }; done: number; total: number; found: number; skipped: number; pages: number; queued: number; startedAt?: string; finishedAt?: string; lastError?: string }
interface Summary {
  senderConfigured: boolean; sender: string | null;
  settings: { dailyLimit: number; includeFreeMail: boolean; pagesPerSite: number };
  finder: Finder; template: { subject: string; body: string };
  sending: boolean; sendingSince?: string; lastError: string | null; sentToday: number;
  counts: Record<string, number>; visited: number; visitedWithTeachers: number; pagesRead: number; joined: number;
  byState: { state: string; n: number }[]; states: string[]; categories: string[];
}
interface Teacher { email: string; name: string | null; designation: string | null; department: string | null; college: string; state: string | null; source_url: string | null; status: string; found_at: string; sent_at: string | null; error: string | null }

const btn = 'px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50';
const primary = `${btn} bg-brand-900 hover:bg-brand-800 text-white`;
const ghost = `${btn} bg-white border border-slate-200 text-slate-800 hover:bg-slate-50`;
const input = 'px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100';
const card = 'p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4';
const STATUS: Record<string, string> = { new: 'Waiting', sending: 'Sending', sent: 'Invited', failed: 'Refused by mail server', unsubscribed: 'Unsubscribed', removed: 'Removed', joined: 'Already on AcadeXMatch' };

async function api(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/teacher-outreach', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}
const fmt = (n: number) => (n || 0).toLocaleString('en-IN');
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function TeacherOutreachPanel() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<{ state: string; category: string; limit: number }>({ state: '', category: '', limit: 100 });
  const [preview, setPreview] = useState<number | null>(null);
  const [tpl, setTpl] = useState<{ subject: string; body: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [list, setList] = useState<{ rows: Teacher[]; total: number }>({ rows: [], total: 0 });
  const [q, setQ] = useState({ search: '', status: '', state: '', offset: 0 });

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/teacher-outreach', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || `Could not load (${r.status})`); return; }
    setS(d);
    setTpl(t => t || d.template);
  }, []);
  const loadList = useCallback(async () => {
    const p = new URLSearchParams({ list: '1', limit: '50', offset: String(q.offset) });
    if (q.search) p.set('q', q.search);
    if (q.status) p.set('status', q.status);
    if (q.state) p.set('state', q.state);
    const r = await fetch(`/api/admin/teacher-outreach?${p}`, { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) setList(await r.json());
  }, [q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadList(); }, [loadList]);
  // Refresh while the finder runs or invitations are going out.
  useEffect(() => {
    if (!s?.finder.running && !s?.sending) return;
    const t = setInterval(() => { load(); loadList(); }, 8000);
    return () => clearInterval(t);
  }, [s?.finder.running, s?.sending, load, loadList]);
  useEffect(() => {
    setPreview(null);
    const t = setTimeout(() => { api({ action: 'preview', state: filter.state, category: filter.category }).then(d => setPreview(d.colleges)).catch(() => setPreview(null)); }, 300);
    return () => clearTimeout(t);
  }, [filter.state, filter.category]);

  const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 6000); };
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) flash(ok); await Promise.all([load(), loadList()]); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  if (!s) return <div className={card}>{err ? <p className="text-sm text-crimson-700">{err}</p> : <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading teacher invitations…</p>}</div>;

  const c = s.counts;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const waiting = c.new || 0;
  const f = s.finder;

  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><GraduationCap className="w-5 h-5 text-brand-700" /> Teacher invitations</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">Finds teachers&apos; addresses published on college faculty and department pages and sends each person <strong>one</strong> invitation to join AcadeXMatch as a candidate. Office and department addresses stay with the institution outreach.</p>
          </div>
          <a className={ghost} href="/api/admin/teacher-outreach?export=csv"><Download className="w-4 h-4" /> Export CSV</a>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {([
            ['Teachers found', total], ['Waiting', waiting], ['Invited', c.sent || 0], ['Joined after invite', s.joined],
            ['Unsubscribed', c.unsubscribed || 0], ['Colleges visited', s.visited],
          ] as [string, number][]).map(([l, n]) => (
            <div key={l} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <dd className="text-xl font-bold text-slate-900 tabular-nums">{fmt(n)}</dd>
              <dt className="text-xs text-slate-500">{l}</dt>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">{fmt(s.visitedWithTeachers)} of {fmt(s.visited)} colleges visited published teachers&apos; addresses ({fmt(s.pagesRead)} pages read). Invited today: {fmt(s.sentToday)} of {fmt(s.settings.dailyLimit)}.</p>
        {msg && <p className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{msg}</p>}
        {err && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-200 text-crimson-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</p>}
      </section>

      <section className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-950 space-y-2">
        <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> How this tool protects people and the platform</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Each address is emailed once, ever. Every email says where the address was found and has a one-click unsubscribe; unsubscribes join the shared do-not-email list.</li>
          <li>People who already have an AcadeXMatch account, colleges registered on AcadeXMatch and anyone on the do-not-email list are skipped.</li>
          <li>Only addresses on the college&apos;s own domain{s.settings.includeFreeMail ? ', plus Gmail-type addresses printed next to a teaching designation,' : ''} are collected. robots.txt is respected and sites are read slowly.</li>
          <li>Sending uses its own mail account (CANDIDATE_SMTP_*), never the Brevo outreach account or the sign-in mail, because Brevo does not allow addresses collected from websites.</li>
          <li>A teacher&apos;s own address is personal data under the DPDP Act 2023. Keep the daily limit modest, honour every removal request, and delete this list when the campaign is over.</li>
        </ul>
      </section>

      {!s.senderConfigured ? (
        <section className="p-5 rounded-2xl bg-crimson-50 border border-crimson-200 text-sm text-crimson-900 space-y-2">
          <h3 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Sender not set up yet — finding addresses works, sending does not</h3>
          <p>Use a mail account meant for one-to-one outreach (not Brevo, not ZeptoMail, not info@acadexmatch.com), ideally on a separate domain such as <code className="bg-white px-1 rounded">invite.acadexmatch.com</code> with SPF and DKIM set up. Then add these secrets in GoDaddy (Settings → Secrets → Publish) and publish:</p>
          <pre className="bg-white p-3 rounded-lg text-xs overflow-x-auto">{`CANDIDATE_SMTP_HOST   e.g. smtp.your-provider.com
CANDIDATE_SMTP_PORT   587 (or 465)
CANDIDATE_SMTP_USER   the mailbox login
CANDIDATE_SMTP_PASS   its password / app password
CANDIDATE_MAIL_FROM   Udayakumar from AcadeXMatch <udaya@invite.acadexmatch.com>
CANDIDATE_REPLY_TO    (optional) where replies should go`}</pre>
        </section>
      ) : (
        <p className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Sender: {s.sender}</p>
      )}

      <section className={card}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Globe className="w-4 h-4 text-brand-700" /> 1. Find teachers on college websites</h3>
        <p className="text-sm text-slate-600">Visits the faculty and department pages of AISHE colleges that are not on AcadeXMatch (each college once in 180 days, up to {s.settings.pagesPerSite} pages per site).</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600 space-y-1"><span className="block">State</span>
            <select className={input} value={filter.state} onChange={e => setFilter({ ...filter, state: e.target.value })}><option value="">All states</option>{s.states.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs text-slate-600 space-y-1"><span className="block">Type</span>
            <select className={input} value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}><option value="">All types</option>{s.categories.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs text-slate-600 space-y-1"><span className="block">Colleges this run</span>
            <input type="number" min={1} max={1000} className={`${input} w-28`} value={filter.limit} onChange={e => setFilter({ ...filter, limit: Number(e.target.value) })} /></label>
          {f.running
            ? <button className={ghost} disabled={busy === 'stop'} onClick={() => run('stop', () => api({ action: 'stopFinder' }), 'Stopping after the colleges in progress.')}><Square className="w-4 h-4" /> Stop</button>
            : <button className={primary} disabled={busy === 'find' || preview === 0} onClick={() => run('find', () => api({ action: 'startFinder', state: filter.state, category: filter.category, limit: filter.limit }), 'Finder started. It works in the background; you can leave this page.')}>{busy === 'find' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find teachers</button>}
          <span className="text-xs text-slate-500">{preview == null ? '' : `${fmt(preview)} colleges with a website not visited yet`}</span>
        </div>
        {(f.running || f.total > 0) && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-700 transition-all" style={{ width: `${f.total ? (f.done / f.total) * 100 : 0}%` }} /></div>
            <p className="text-xs text-slate-600">{f.running ? 'Running' : 'Last run'}: {fmt(f.done)} of {fmt(f.total)} colleges · {fmt(f.pages)} pages · <strong>{fmt(f.found)} new teachers</strong> · {fmt(f.skipped)} colleges with none{f.finishedAt && !f.running ? ` · finished ${when(f.finishedAt)}` : ''}{f.lastError ? ` · last problem: ${f.lastError}` : ''}</p>
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-700 font-semibold">Finder settings</summary>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="text-xs text-slate-600 space-y-1"><span className="block">Pages per website</span>
              <input type="number" min={2} max={30} className={`${input} w-24`} defaultValue={s.settings.pagesPerSite} onBlur={e => run('set', () => api({ action: 'settings', pagesPerSite: Number(e.target.value) }), 'Saved.')} /></label>
            <label className="text-sm text-slate-700 inline-flex items-center gap-2">
              <input type="checkbox" checked={s.settings.includeFreeMail} onChange={e => run('set', () => api({ action: 'settings', includeFreeMail: e.target.checked }), 'Saved.')} />
              Also collect Gmail / Yahoo addresses printed next to a teaching designation
            </label>
          </div>
        </details>
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-700" /> 2. The invitation</h3>
        <p className="text-xs text-slate-500">You can use {'{{name}}'} (e.g. “Dr. R. Kumar”, or “Sir / Madam” when no name was found), {'{{college}}'} and {'{{department}}'}. A footer saying where the address was found and an unsubscribe link is added to every email.</p>
        {tpl && (
          <>
            <input className={`${input} w-full`} value={tpl.subject} onChange={e => setTpl({ ...tpl, subject: e.target.value })} aria-label="Subject" />
            <textarea className={`${input} w-full font-mono text-[13px]`} rows={12} value={tpl.body} onChange={e => setTpl({ ...tpl, body: e.target.value })} aria-label="Message" />
            <div className="flex flex-wrap items-center gap-2">
              <button className={primary} disabled={busy === 'tpl'} onClick={() => run('tpl', () => api({ action: 'template', ...tpl }), 'Invitation saved.')}><Save className="w-4 h-4" /> Save</button>
              <button className={ghost} disabled={busy === 'reset'} onClick={() => run('reset', async () => { const d = await api({ action: 'resetTemplate' }); setTpl(d.template); }, 'Back to the standard invitation.')}><RotateCcw className="w-4 h-4" /> Standard text</button>
              <span className="mx-2 h-6 w-px bg-slate-200" />
              <input type="email" className={`${input} w-64`} placeholder="Send a test to…" value={testTo} onChange={e => setTestTo(e.target.value)} />
              <button className={ghost} disabled={!s.senderConfigured || !testTo || busy === 'test'} onClick={() => run('test', () => api({ action: 'test', to: testTo, ...tpl }), `Test sent to ${testTo}.`)}>{busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test</button>
            </div>
          </>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Send className="w-4 h-4 text-brand-700" /> 3. Send invitations</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600 space-y-1"><span className="block">Invitations per day</span>
            <input type="number" min={1} max={500} className={`${input} w-28`} defaultValue={s.settings.dailyLimit} onBlur={e => run('set', () => api({ action: 'settings', dailyLimit: Number(e.target.value) }), 'Daily limit saved.')} /></label>
          {s.sending
            ? <button className={ghost} disabled={busy === 'pause'} onClick={() => run('pause', () => api({ action: 'pause' }), 'Sending paused.')}><Pause className="w-4 h-4" /> Pause</button>
            : <button className={primary} disabled={!s.senderConfigured || !waiting || busy === 'start'} onClick={() => { if (window.confirm(`Start inviting ${fmt(waiting)} teachers, at most ${s.settings.dailyLimit} a day? Each person gets one email.`)) run('start', () => api({ action: 'start' }), 'Sending started.'); }}><Play className="w-4 h-4" /> Start sending</button>}
          <span className="text-sm text-slate-600">{s.sending ? `Sending since ${when(s.sendingSince)} · ${fmt(waiting)} waiting` : `${fmt(waiting)} teachers waiting`}</span>
        </div>
        {s.lastError && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-200 text-crimson-900 break-words">{s.lastError}</p>}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900">Teachers found</h3>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} w-64`} placeholder="Search name, email, college, department" value={q.search} onChange={e => setQ({ ...q, search: e.target.value, offset: 0 })} />
          <select className={input} value={q.status} onChange={e => setQ({ ...q, status: e.target.value, offset: 0 })}><option value="">Any status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className={input} value={q.state} onChange={e => setQ({ ...q, state: e.target.value, offset: 0 })}><option value="">All states</option>{s.byState.map(x => <option key={x.state} value={x.state === 'Unknown' ? '' : x.state}>{x.state} ({fmt(x.n)})</option>)}</select>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3">College</th><th className="py-2 pr-3">Status</th><th className="py-2" /></tr></thead>
            <tbody>
              {list.rows.map(t => (
                <tr key={t.email} className="border-b border-slate-50 align-top">
                  <td className="py-2 pr-3"><div className="font-semibold text-slate-900">{t.name || '—'}</div><div className="text-xs text-slate-500">{[t.designation, t.department].filter(Boolean).join(' · ')}</div><div className="text-xs text-brand-800 break-all">{t.email}</div></td>
                  <td className="py-2 pr-3"><div className="text-slate-800">{t.college}</div><div className="text-xs text-slate-500">{t.state}{t.source_url && <> · <a href={t.source_url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">page <ExternalLink className="w-3 h-3" /></a></>}</div></td>
                  <td className="py-2 pr-3 text-xs"><span className="font-semibold text-slate-800">{STATUS[t.status] || t.status}</span>{t.sent_at && <div className="text-slate-500">{when(t.sent_at)}</div>}{t.error && <div className="text-crimson-700 break-words max-w-[220px]">{t.error}</div>}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {(t.status === 'new' || t.status === 'failed') && <button title="Do not invite this person" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" onClick={() => run('rm', () => api({ action: 'remove', email: t.email }), 'Removed from the list.')}><Trash2 className="w-4 h-4" /></button>}
                    {t.status !== 'unsubscribed' && <button title="Never email this address (do-not-email list)" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" onClick={() => run('sup', () => api({ action: 'suppress', value: t.email }), 'Added to the do-not-email list.')}><Ban className="w-4 h-4" /></button>}
                  </td>
                </tr>
              ))}
              {!list.rows.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No teachers found yet. Run the finder above.</td></tr>}
            </tbody>
          </table>
        </div>
        {list.total > 50 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{fmt(q.offset + 1)}–{fmt(Math.min(q.offset + 50, list.total))} of {fmt(list.total)}</span>
            <div className="flex gap-2">
              <button className={ghost} disabled={q.offset === 0} onClick={() => setQ({ ...q, offset: Math.max(0, q.offset - 50) })}>Previous</button>
              <button className={ghost} disabled={q.offset + 50 >= list.total} onClick={() => setQ({ ...q, offset: q.offset + 50 })}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
