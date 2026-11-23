'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Copy, Download, Eye, Link2, Loader2, Mail, MousePointerClick, Phone, PhoneCall, Play, RotateCcw, Save, Send, Ban, Building2 } from 'lucide-react';

interface Rec { emails: { to: string; at: string; jobIds: string[]; views: number }[]; clicks: number; lastClick?: string; called?: string; callNote?: string; registrations?: { userId: string; instituteId: string; name: string; email: string; at: string }[]; attached?: { at: string; jobIds: string[] }; skip?: boolean; lastError?: string }
interface Group { key: string; college: string; state: string | null; city: string | null; jobs: { id: string; title: string; postedAt: string; deadline: string | null; views: number; last7: number }[]; views: number; last7: number; emails: { email: string; from: 'notice' | 'website' }[]; phones: string[]; record: Rec; hold: string; claimUrl: string }
interface Settings { auto: boolean; dailyLimit: number; gapDays: number; maxEmails: number; waitDays: number; minViews: number; minDaysLeft: number }
interface Summary {
  senderConfigured: boolean; settings: Settings; template: { subject: string; body: string }; lastError: string | null; sentToday: number; viewsSince: string;
  totals: { institutions: number; vacancies: number; ready: number; withEmail: number; phoneOnly: number; emailed: number; clicked: number; registered: number; claimed: number };
  groups: Group[];
}

const btn = 'px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50';
const primary = `${btn} bg-brand-900 hover:bg-brand-800 text-white`;
const ghost = `${btn} bg-white border border-slate-200 text-slate-800 hover:bg-slate-50`;
const input = 'px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100';
const card = 'p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4';
const fmt = (n: number) => (n || 0).toLocaleString('en-IN');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '');

async function api(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/claim-outreach', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

type View = 'ready' | 'waiting' | 'emailed' | 'calls' | 'registered' | 'all';

export default function ClaimOutreachPanel() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [tpl, setTpl] = useState<{ subject: string; body: string } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [view, setView] = useState<View>('ready');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/claim-outreach', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || `Could not load (${r.status})`); return; }
    setS(d); setTpl(t => t || d.template);
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 6000); };
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) flash(ok); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  const list = useMemo(() => {
    if (!s) return [];
    const q = search.trim().toLowerCase();
    return s.groups.filter(g => {
      if (q && !`${g.college} ${g.state} ${g.jobs.map(j => j.title).join(' ')} ${g.emails.map(e => e.email).join(' ')}`.toLowerCase().includes(q)) return false;
      switch (view) {
        case 'ready': return !g.hold;
        case 'waiting': return /^Waiting|^Got an institution/.test(g.hold);
        case 'emailed': return g.record.emails.length > 0;
        case 'calls': return g.phones.length > 0 && !g.record.attached;
        case 'registered': return !!g.record.registrations?.length || !!g.record.attached;
        default: return true;
      }
    });
  }, [s, view, search]);

  if (!s) return <div className={card}>{err ? <p className="text-sm text-crimson-700">{err}</p> : <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>}</div>;
  const t = s.totals;

  return (
    <div className="space-y-6">
      <section className={card}>
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-brand-700" /> Claim your listing</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">Colleges whose vacancies are already live on AcadeXMatch (imported from their notices) get a short note: <em>“Your Assistant Professor vacancy is already live on AcadeXMatch and candidates are viewing it. Register free to receive applications directly.”</em> We arrive bringing applicants, not a cold pitch.</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {([
            ['Colleges with live vacancies', t.institutions], ['Live vacancies', t.vacancies], ['Ready to email', t.ready], ['Phone only', t.phoneOnly],
            ['Emailed', t.emailed], ['Opened claim link', t.clicked], ['Registered', t.registered], ['Claimed', t.claimed],
          ] as [string, number][]).map(([l, n]) => (
            <div key={l} className="p-3 rounded-xl bg-slate-50 border border-slate-100"><dd className="text-xl font-bold text-slate-900 tabular-nums">{fmt(n)}</dd><dt className="text-[11px] text-slate-500 leading-tight">{l}</dt></div>
          ))}
        </dl>
        {msg && <p className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{msg}</p>}
        {err && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-200 text-crimson-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{err}</p>}
        {!s.senderConfigured && <p className="text-sm p-3 rounded-xl bg-crimson-50 border border-crimson-200 text-crimson-900">The outreach sender (Brevo) is not set up, so nothing can be sent.</p>}
        {s.lastError && <p className="text-sm p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 break-words">Last problem: {s.lastError}</p>}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Play className="w-4 h-4 text-brand-700" /> Automatic emails after vacancies are posted</h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" className="w-4 h-4" checked={s.settings.auto} disabled={!s.senderConfigured || busy === 'auto'}
              onChange={e => { const on = e.target.checked; if (on && !window.confirm(`Email colleges automatically, up to ${s.settings.dailyLimit} a day between 9:00 and 18:00 IST?`)) return; run('auto', () => api({ action: 'settings', auto: on }), on ? 'Automatic emails on.' : 'Automatic emails off.'); }} />
            Send automatically
          </label>
          <span className="text-sm text-slate-600">{s.settings.auto ? `On · ${fmt(s.sentToday)} of ${fmt(s.settings.dailyLimit)} sent today` : 'Off — only the emails you send yourself go out.'}</span>
          {s.settings.auto && <button className={ghost} disabled={busy === 'runNow'} onClick={() => run('runNow', async () => { const d = await api({ action: 'runNow' }); flash(`${d.sent} sent now.`); })}>{busy === 'runNow' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Run now</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            ['dailyLimit', 'Emails per day'], ['waitDays', 'Wait after posting (days)'], ['minDaysLeft', 'Min. days before closing'],
            ['minViews', 'Mention views from'], ['gapDays', 'Days between emails'], ['maxEmails', 'Max. emails per college'],
          ] as [keyof Settings, string][]).map(([k, l]) => (
            <label key={k} className="text-xs text-slate-600 space-y-1"><span className="block">{l}</span>
              <input type="number" className={`${input} w-full`} defaultValue={Number(s.settings[k])} onBlur={e => { if (Number(e.target.value) !== Number(s.settings[k])) run('set', () => api({ action: 'settings', [k]: Number(e.target.value) }), 'Saved.'); }} /></label>
          ))}
        </div>
        <p className="text-xs text-slate-500">A vacancy is mentioned once it has been live for the waiting period, so candidates have had time to see it. The views sentence (“Candidates have viewed it 120 times since …”) uses the real count and appears only from the number above; otherwise the email says candidates across India can already see it. Colleges already registered, unsubscribed addresses and addresses that had an institution-outreach email in the last 14 days are skipped. View counting started {s.viewsSince || 'recently'}.</p>
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-700" /> The email</h3>
        <p className="text-xs text-slate-500">Placeholders: {'{{vacancy}}'} (top vacancy, “and 2 more”), {'{{college}}'}, {'{{views_sentence}}'}, {'{{views}}'}, {'{{vacancy_link}}'}, {'{{claim_link}}'} (required), {'{{deadline}}'}. An unsubscribe footer is added.</p>
        {tpl && (
          <>
            <input className={`${input} w-full`} value={tpl.subject} onChange={e => setTpl({ ...tpl, subject: e.target.value })} aria-label="Subject" />
            <textarea className={`${input} w-full font-mono text-[13px]`} rows={11} value={tpl.body} onChange={e => setTpl({ ...tpl, body: e.target.value })} aria-label="Message" />
            <div className="flex flex-wrap items-center gap-2">
              <button className={primary} disabled={busy === 'tpl'} onClick={() => run('tpl', () => api({ action: 'template', ...tpl }), 'Email saved.')}><Save className="w-4 h-4" /> Save</button>
              <button className={ghost} disabled={busy === 'reset'} onClick={() => run('reset', async () => { const d = await api({ action: 'resetTemplate' }); setTpl(d.template); }, 'Back to the standard email.')}><RotateCcw className="w-4 h-4" /> Standard text</button>
              <button className={ghost} disabled={busy === 'pv'} onClick={() => run('pv', async () => setPreview(await api({ action: 'preview', key: list[0]?.key, ...tpl })))}><Eye className="w-4 h-4" /> Preview</button>
              <span className="mx-1 h-6 w-px bg-slate-200" />
              <input type="email" className={`${input} w-60`} placeholder="Send a test to…" value={testTo} onChange={e => setTestTo(e.target.value)} />
              <button className={ghost} disabled={!s.senderConfigured || !testTo || busy === 'test'} onClick={() => run('test', () => api({ action: 'test', key: list[0]?.key, to: testTo, ...tpl }), `Test sent to ${testTo}.`)}><Send className="w-4 h-4" /> Send test</button>
            </div>
            {preview && <pre className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[13px] whitespace-pre-wrap break-words font-sans"><strong>{preview.subject}</strong>{'\n\n'}{preview.text}</pre>}
          </>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([['ready', `Ready (${t.ready})`], ['waiting', 'Waiting'], ['emailed', 'Emailed'], ['calls', 'Call list'], ['registered', 'Registered / claimed'], ['all', 'All']] as [View, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === v ? 'bg-brand-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={`${input} w-56`} placeholder="Search college, post, email" value={search} onChange={e => setSearch(e.target.value)} />
            <a className={ghost} href="/api/admin/claim-outreach?export=calls"><Download className="w-4 h-4" /> Call list CSV</a>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {list.slice(0, 200).map(g => <GroupRow key={g.key} g={g} senderOk={s.senderConfigured} busy={busy} run={run} />)}
          {!list.length && <li className="py-8 text-center text-sm text-slate-500">Nothing here.</li>}
        </ul>
        {list.length > 200 && <p className="text-xs text-slate-500">Showing 200 of {fmt(list.length)} — use the search.</p>}
      </section>
    </div>
  );
}

function GroupRow({ g, senderOk, busy, run }: { g: Group; senderOk: boolean; busy: string; run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [note, setNote] = useState(g.record.callNote || '');
  const [to, setTo] = useState(g.emails[0]?.email || '');
  const r = g.record;
  const reg = r.registrations?.[r.registrations.length - 1];
  const canForce = /^(Waiting|No new vacancy|Got an institution)/.test(g.hold);
  return (
    <li className="py-4 grid lg:grid-cols-[1fr_auto] gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400 shrink-0" /><span className="truncate">{g.college}</span></p>
        <p className="text-xs text-slate-500">{[g.city, g.state].filter(Boolean).join(', ')} · {g.jobs.length} live vacanc{g.jobs.length === 1 ? 'y' : 'ies'} · <Eye className="inline w-3 h-3" /> {fmt(g.views)} views ({fmt(g.last7)} this week)</p>
        <ul className="text-sm text-slate-700 space-y-0.5">
          {g.jobs.slice(0, 3).map(j => <li key={j.id} className="truncate"><a href={`/jobs/${encodeURIComponent(j.id)}`} target="_blank" rel="noreferrer" className="hover:underline">{j.title}</a> <span className="text-xs text-slate-400">· posted {day(j.postedAt)}{j.deadline ? ` · closes ${day(j.deadline)}` : ''} · {fmt(j.views)} views</span></li>)}
          {g.jobs.length > 3 && <li className="text-xs text-slate-400">and {g.jobs.length - 3} more</li>}
        </ul>
        <p className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
          {g.emails.length ? g.emails.map(e => <span key={e.email} className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{e.email} <span className="text-slate-400">({e.from === 'notice' ? 'from the notice' : 'college website'})</span></span>) : <span className="text-slate-400">No email address</span>}
          {g.phones.map(p => <a key={p} href={`tel:${p.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-brand-800"><Phone className="w-3 h-3" />{p}</a>)}
        </p>
        <p className="text-xs flex flex-wrap gap-x-3 gap-y-1">
          <span className={g.hold ? 'text-amber-700' : 'text-emerald-700 font-semibold'}>{g.hold || 'Ready to email'}</span>
          {r.emails.map(m => <span key={m.at} className="text-slate-500">emailed {day(m.at)} to {m.to}</span>)}
          {r.clicks > 0 && <span className="text-slate-600 inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3" />claim link opened {r.clicks}× (last {day(r.lastClick)})</span>}
          {r.called && <span className="text-slate-600 inline-flex items-center gap-1"><PhoneCall className="w-3 h-3" />called {day(r.called)}{r.callNote ? `: ${r.callNote}` : ''}</span>}
          {r.attached && <span className="text-emerald-700 font-semibold">Claimed {day(r.attached.at)} ({r.attached.jobIds.length} vacancies)</span>}
          {r.lastError && <span className="text-crimson-700">{r.lastError}</span>}
        </p>
        {reg && !r.attached && (
          <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 space-y-2">
            <p><strong>{reg.name}</strong> ({reg.email}) registered from the claim link on {day(reg.at)}. Check in Verification that the account belongs to this college, then attach the vacancies.</p>
            <button className={primary} disabled={busy === `att-${g.key}`} onClick={() => { if (window.confirm(`Move ${g.jobs.length} vacancies of ${g.college} to the institution account of ${reg.name}? Applications will then go to them.`)) run(`att-${g.key}`, () => api({ action: 'attach', key: g.key, instituteId: reg.instituteId }), 'Vacancies attached.'); }}><BadgeCheck className="w-4 h-4" /> Attach {g.jobs.length} vacanc{g.jobs.length === 1 ? 'y' : 'ies'}</button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 lg:items-end lg:w-80">
        {!r.attached && g.emails.length > 0 && (
          <div className="flex gap-2 w-full lg:justify-end">
            {g.emails.length > 1 && <select className={`${input} min-w-0 flex-1`} value={to} onChange={e => setTo(e.target.value)}>{g.emails.map(e => <option key={e.email}>{e.email}</option>)}</select>}
            <button className={primary} disabled={!senderOk || (!!g.hold && !canForce) || busy === `send-${g.key}`}
              onClick={() => { if (window.confirm(`Email ${to} at ${g.college} now?${g.hold ? `\n\nNote: ${g.hold}.` : ''}`)) run(`send-${g.key}`, () => api({ action: 'send', key: g.key, to, force: canForce }), `Sent to ${to}.`); }}>
              {busy === `send-${g.key}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Email now
            </button>
          </div>
        )}
        {g.phones.length > 0 && !r.attached && (
          <div className="flex gap-2 w-full">
            <input className={`${input} min-w-0 flex-1`} placeholder="Call note (who you spoke to, outcome)" value={note} onChange={e => setNote(e.target.value)} />
            <button className={ghost} disabled={busy === `call-${g.key}`} onClick={() => run(`call-${g.key}`, () => api({ action: 'called', key: g.key, note }), 'Call noted.')}><PhoneCall className="w-4 h-4" /> Called</button>
          </div>
        )}
        <div className="flex gap-2">
          <button className={ghost} title="Copy the claim link (for WhatsApp or a phone follow-up)" onClick={() => { navigator.clipboard?.writeText(g.claimUrl).catch(() => undefined); }}><Copy className="w-4 h-4" /><Link2 className="w-4 h-4" /> Claim link</button>
          <button className={ghost} disabled={busy === `skip-${g.key}`} title={r.skip ? 'Include again' : 'Never contact this college about claiming'} onClick={() => run(`skip-${g.key}`, () => api({ action: 'skip', key: g.key, skip: !r.skip }), r.skip ? 'Included again.' : 'Excluded.')}><Ban className="w-4 h-4" /> {r.skip ? 'Include' : 'Exclude'}</button>
        </div>
      </div>
    </li>
  );
}
