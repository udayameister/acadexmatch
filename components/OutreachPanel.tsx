'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Download, Loader2, Mail, Pause, Play, Search, Send, Square, Trash2, Globe, Save } from 'lucide-react';

interface Campaign { id: string; name: string; subject: string; body: string; audience: { state?: string; category?: string }; perCollege: 1 | 2; status: 'draft' | 'sending' | 'paused' | 'done'; createdAt: string; startedAt?: string; finishedAt?: string; queued: number; sent: number; failed: number; skipped: number; lastError?: string }
interface Summary {
  senderConfigured: boolean; sender: string | null; contacts: Record<string, number>; colleges: number; visited: number; visitedWithEmail: number; suppressed: number;
  settings: { dailyLimit: number; perCollege: 1 | 2; gapDays: number };
  finder: { running: boolean; filter: { state?: string; category?: string }; done: number; total: number; found: number; skipped: number; queued: number; startedAt?: string; finishedAt?: string; lastError?: string };
  campaigns: Campaign[]; sentToday: number; states: string[]; categories: string[]; template: { subject: string; body: string };
}
interface Contact { email: string; aishe_code: string; college: string; state: string | null; role: string | null; source_url: string | null; status: string; sends: number; last_sent_at: string | null }

const btn = 'px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50';
const primary = `${btn} bg-brand-900 hover:bg-brand-800 text-white`;
const ghost = `${btn} bg-white border border-slate-200 text-slate-800 hover:bg-slate-50`;
const input = 'px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100';
const card = 'p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4';

async function api(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/outreach', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}

/** Administrator: find colleges' published contact emails and send outreach campaigns through a separate Brevo account. */
export default function OutreachPanel() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/outreach', { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setS(d); else setErr(d.error || 'Could not load.');
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!s || !(s.finder.running || s.campaigns.some(c => c.status === 'sending'))) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [s, load]);
  const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 5000); };
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) flash(ok); await load(); } catch (e) { setErr((e as Error).message); } };

  if (err && !s) return <p className="text-sm text-crimson-700">{err}</p>;
  if (!s) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-700" aria-label="Loading" /></div>;
  const total = Object.values(s.contacts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2"><Mail className="w-5 h-5 text-brand-700" /> Email outreach to colleges</h2>
        <p className="text-sm text-slate-500 max-w-3xl">Find the contact emails colleges publish on their own websites, then send them your message through a separate Brevo account. Institutions already on AcadeXMatch are never contacted, every email has an unsubscribe link, and unsubscribed addresses are never emailed again.</p>
      </div>
      {msg && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="status">{msg}</p>}
      {err && <p className="text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2" role="alert">{err}</p>}

      <SenderCard s={s} />
      <FinderCard s={s} run={run} />
      <ContactsCard s={s} total={total} run={run} />
      <CampaignsCard s={s} run={run} flash={flash} setErr={setErr} />
    </div>
  );
}

function SenderCard({ s }: { s: Summary }) {
  if (s.senderConfigured) return <p className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" /><span>Outreach emails are sent from <strong>{s.sender}</strong> through the separate Brevo account. Replies go to info@acadexmatch.com. Sent today: {s.sentToday} of {s.settings.dailyLimit}.</span></p>;
  return (
    <section className="p-5 rounded-2xl bg-gold-50 border border-gold-200 text-sm text-gold-900 space-y-2">
      <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Connect the outreach Brevo account to send</h3>
      <p>You can find contacts now. To send, add the second Brevo account (kept separate from the one that sends sign-in codes and candidate alerts):</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Create a second Brevo account and, under Senders &amp; Domains, add and authenticate <strong>acadexmatch.com</strong> with the sender <strong>outreach@acadexmatch.com</strong>.</li>
        <li>In that account create an API key (SMTP &amp; API → API keys).</li>
        <li>In GoDaddy, add two settings (environment variables) and publish: <code>OUTREACH_EMAIL_API_KEY</code> = the new key, and <code>OUTREACH_MAIL_FROM</code> = <code>AcadeXMatch &lt;outreach@acadexmatch.com&gt;</code>.</li>
      </ol>
    </section>
  );
}

function FinderCard({ s, run }: { s: Summary; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [state, setState] = useState(s.finder.filter.state || '');
  const [category, setCategory] = useState(s.finder.filter.category || '');
  const [limit, setLimit] = useState(200);
  const [count, setCount] = useState<number | null>(null);
  const f = s.finder;
  const pct = f.total ? Math.round((f.done / f.total) * 100) : 0;
  return (
    <section className={card} aria-labelledby="finder-h">
      <h3 id="finder-h" className="font-semibold text-slate-900 flex items-center gap-2"><Globe className="w-5 h-5 text-brand-700" /> Step 1 · Find contact emails</h3>
      <p className="text-xs text-slate-500">Visits each college website from the AISHE directory (home page and up to three contact pages, respecting robots.txt, a few sites at a time) and saves the addresses the college publishes. Colleges already on AcadeXMatch and colleges checked in the last 90 days are skipped. So far: {s.visited.toLocaleString('en-IN')} websites checked, {s.visitedWithEmail.toLocaleString('en-IN')} with an email.</p>
      {f.running ? (
        <div className="space-y-2" role="status">
          <div className="flex justify-between text-sm"><span>Checking websites{f.filter.state ? ` in ${f.filter.state}` : ''}… {f.done} of {f.total}</span><span className="font-semibold">{f.found} new emails</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${pct}%` }} /></div>
          <button className={ghost} onClick={() => run(() => api({ action: 'stopFinder' }), 'Stopping after the current websites.')}><Square className="w-4 h-4" /> Stop</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600 flex flex-col gap-1">State<select className={input} value={state} onChange={e => { setState(e.target.value); setCount(null); }}><option value="">All states</option>{s.states.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">Category<select className={input} value={category} onChange={e => { setCategory(e.target.value); setCount(null); }}><option value="">All</option>{s.categories.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">How many colleges<input type="number" min={1} max={2000} className={`${input} w-28`} value={limit} onChange={e => setLimit(Number(e.target.value))} /></label>
            <button className={ghost} onClick={() => run(async () => setCount((await api({ action: 'finderPreview', filter: { state, category } })).count))}>Check how many</button>
            <button className={primary} onClick={() => run(() => api({ action: 'startFinder', filter: { state: state || undefined, category: category || undefined }, limit }), 'Contact finder started. You can leave this page; it keeps running.')}><Play className="w-4 h-4" /> Find emails</button>
          </div>
          {count !== null && <p className="text-sm text-slate-700">{count.toLocaleString('en-IN')} colleges with a website can be checked{state ? ` in ${state}` : ''}. One run checks up to {Math.min(limit, 2000)}; about 1,000 per hour.</p>}
          {f.finishedAt && <p className="text-xs text-slate-500">Last run: {f.done} websites checked, {f.found} new emails ({new Date(f.finishedAt).toLocaleString('en-IN')}).{f.lastError ? ` Last problem: ${f.lastError}` : ''}</p>}
        </>
      )}
    </section>
  );
}

function ContactsCard({ s, total, run }: { s: Summary; total: number; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [count, setCount] = useState(0);
  const [block, setBlock] = useState('');
  const search = useCallback(async () => {
    const r = await fetch(`/api/admin/outreach?contacts=1&limit=50&q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}`, { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({ rows: [], total: 0 }));
    setRows(d.rows || []); setCount(d.total || 0);
  }, [q, state]);
  useEffect(() => { search(); }, [search, s.finder.found, s.suppressed]);
  const LABEL: Record<string, string> = { new: 'Not contacted', sent: 'Emailed', failed: 'Failed', unsubscribed: 'Do not email' };
  return (
    <section className={card} aria-labelledby="contacts-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="contacts-h" className="font-semibold text-slate-900">Step 2 · Contacts</h3>
          <p className="text-xs text-slate-500">{total.toLocaleString('en-IN')} addresses from {s.colleges.toLocaleString('en-IN')} colleges · {Object.entries(s.contacts).map(([k, v]) => `${LABEL[k] || k}: ${v}`).join(' · ') || 'none yet'} · {s.suppressed} on the do-not-email list</p>
        </div>
        <a className={ghost} href={`/api/admin/outreach?export=csv${state ? `&state=${encodeURIComponent(state)}` : ''}`}><Download className="w-4 h-4" /> Export CSV</a>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[12rem]"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" aria-hidden="true" /><input className={`${input} w-full pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search email, college or AISHE code" aria-label="Search contacts" /></label>
        <select className={input} value={state} onChange={e => setState(e.target.value)} aria-label="State"><option value="">All states</option>{s.states.map(x => <option key={x}>{x}</option>)}</select>
      </div>
      {rows === null ? <Loader2 className="w-5 h-5 animate-spin text-brand-700" /> : !rows.length ? <p className="text-sm text-slate-500">No contacts yet. Run step 1.</p> : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">College</th><th className="py-2 pr-3">Found on</th><th className="py-2 pr-3">Status</th><th /></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.email} className="border-t border-slate-100">
                  <td className="py-2 pr-3"><div className="font-medium text-slate-900 break-all">{r.email}</div><div className="text-xs text-slate-500">{r.role}</div></td>
                  <td className="py-2 pr-3"><div className="text-slate-800">{r.college}</div><div className="text-xs text-slate-500">{r.aishe_code} · {r.state}</div></td>
                  <td className="py-2 pr-3 text-xs">{r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="text-brand-800 hover:underline break-all">{r.source_url.replace(/^https?:\/\//, '').slice(0, 40)}</a> : '—'}</td>
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">{LABEL[r.status] || r.status}{r.sends ? ` (${r.sends}×)` : ''}</td>
                  <td className="py-2 text-right">{r.status !== 'unsubscribed' && <button className="text-xs text-crimson-700 hover:underline inline-flex items-center gap-1" onClick={() => run(() => api({ action: 'suppress', value: r.email }), `${r.email} will not be emailed.`)}><Ban className="w-3.5 h-3.5" /> Do not email</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > rows.length && <p className="text-xs text-slate-500 mt-2">Showing {rows.length} of {count.toLocaleString('en-IN')}. Search or export to see more.</p>}
        </div>
      )}
      <form className="flex flex-wrap gap-2 items-center" onSubmit={e => { e.preventDefault(); run(() => api({ action: 'suppress', value: block }), `${block} added to the do-not-email list.`).then(() => setBlock('')); }}>
        <input className={`${input} flex-1 min-w-[14rem]`} value={block} onChange={e => setBlock(e.target.value)} placeholder="Never email: someone@college.ac.in or @college.ac.in" aria-label="Add to do-not-email list" />
        <button className={ghost} disabled={!block}><Ban className="w-4 h-4" /> Add to do-not-email list</button>
      </form>
    </section>
  );
}

function CampaignsCard({ s, run, flash, setErr }: { s: Summary; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; flash: (m: string) => void; setErr: (m: string) => void }) {
  const blank = { id: '', name: 'Launch offer for colleges', subject: s.template.subject, body: s.template.body, state: '', category: '', perCollege: s.settings.perCollege as 1 | 2 };
  const [d, setD] = useState(blank);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [settings, setSettings] = useState(s.settings);
  const campaign = () => ({ id: d.id || undefined, name: d.name, subject: d.subject, body: d.body, audience: { state: d.state || undefined, category: d.category || undefined }, perCollege: d.perCollege });
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const save = async () => { const r = await api({ action: 'saveCampaign', campaign: campaign() }); setD(x => ({ ...x, id: r.campaign.id })); return r.campaign as Campaign; };
  const STATUS: Record<Campaign['status'], string> = { draft: 'Draft', sending: 'Sending', paused: 'Paused', done: 'Finished' };
  return (
    <section className={card} aria-labelledby="camp-h">
      <h3 id="camp-h" className="font-semibold text-slate-900 flex items-center gap-2"><Send className="w-5 h-5 text-brand-700" /> Step 3 · Campaigns</h3>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <label className="text-xs text-slate-600 flex flex-col gap-1">Emails per day (all campaigns)<input type="number" min={1} max={2000} className={input} value={settings.dailyLimit} onChange={e => setSettings({ ...settings, dailyLimit: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Wait before emailing the same college again (days)<input type="number" min={1} max={365} className={input} value={settings.gapDays} onChange={e => setSettings({ ...settings, gapDays: Number(e.target.value) })} /></label>
        <div className="flex items-end"><button className={ghost} onClick={() => run(() => api({ action: 'settings', settings }), 'Sending limits saved.')}><Save className="w-4 h-4" /> Save limits</button></div>
      </div>
      <p className="text-xs text-slate-500">Start slowly (100 a day) for the first week: Brevo and the receiving mail servers judge a new sender by its first emails.</p>

      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">{d.id ? 'Edit draft' : 'New campaign'}</h4>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Name (only you see it)<input className={input} value={d.name} maxLength={80} onChange={e => setD({ ...d, name: e.target.value })} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Subject<input className={input} value={d.subject} maxLength={150} onChange={e => setD({ ...d, subject: e.target.value })} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Message (plain text; {'{{college}}'} and {'{{aishe}}'} are filled in for each college; an unsubscribe line is added automatically)
          <textarea className={`${input} font-mono text-[13px]`} rows={14} value={d.body} maxLength={8000} onChange={e => setD({ ...d, body: e.target.value })} />
        </label>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-600 flex flex-col gap-1">State<select className={input} value={d.state} onChange={e => { setD({ ...d, state: e.target.value }); setCount(null); }}><option value="">All states</option>{s.states.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs text-slate-600 flex flex-col gap-1">Category<select className={input} value={d.category} onChange={e => { setD({ ...d, category: e.target.value }); setCount(null); }}><option value="">All</option>{s.categories.map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs text-slate-600 flex flex-col gap-1">Addresses per college<select className={input} value={d.perCollege} onChange={e => { setD({ ...d, perCollege: Number(e.target.value) as 1 | 2 }); setCount(null); }}><option value={1}>1 (the best one)</option><option value={2}>2</option></select></label>
          <button className={ghost} onClick={() => act('count', async () => setCount((await api({ action: 'previewCampaign', campaign: campaign() })).count))}>{busy === 'count' && <Loader2 className="w-4 h-4 animate-spin" />}How many will receive it?</button>
        </div>
        {count !== null && <p className="text-sm text-slate-700">{count.toLocaleString('en-IN')} colleges would receive it now (at {settings.dailyLimit} a day: about {Math.max(1, Math.ceil(count / Math.max(1, settings.dailyLimit)))} day{count > settings.dailyLimit ? 's' : ''}).</p>}
        <div className="flex flex-wrap gap-2">
          <button className={ghost} onClick={() => act('save', async () => { await save(); flash('Draft saved.'); await run(async () => undefined); })}>{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}<Save className="w-4 h-4" /> Save draft</button>
          <button className={ghost} disabled={!s.senderConfigured} onClick={() => act('test', async () => { const r = await api({ action: 'test', campaign: campaign() }); flash(`Test email sent to ${r.to}. Check how it looks before starting.`); })}>{busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}<Mail className="w-4 h-4" /> Send me a test</button>
          <button className={primary} disabled={!s.senderConfigured} onClick={() => act('start', async () => {
            const n = (await api({ action: 'previewCampaign', campaign: campaign() })).count as number;
            if (!n) { setErr('No college would receive this campaign. Find contacts first or change the filters.'); return; }
            if (!confirm(`Start sending “${d.subject}” to ${n} colleges, at most ${settings.dailyLimit} a day? You can pause at any time.`)) return;
            const c = await save();
            await api({ action: 'startCampaign', id: c.id });
            setD(blank); setCount(null);
            flash('Campaign started. It sends in the background; you can leave this page.');
            await run(async () => undefined);
          })}>{busy === 'start' && <Loader2 className="w-4 h-4 animate-spin" />}<Play className="w-4 h-4" /> Start sending</button>
        </div>
        {!s.senderConfigured && <p className="text-xs text-gold-800">Sending is available once the outreach Brevo account is connected (see above).</p>}
      </div>

      {!!s.campaigns.length && (
        <ul className="space-y-2">
          {s.campaigns.map(c => (
            <li key={c.id} className="p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-900 break-words">{c.name} <span className="ml-1 text-xs font-normal text-slate-500">· {STATUS[c.status]}</span></div>
                <div className="text-xs text-slate-500 break-words">{c.subject}</div>
                <div className="text-xs text-slate-600 mt-0.5">Sent {c.sent} · waiting {c.queued} · failed {c.failed} · skipped {c.skipped}{c.audience.state ? ` · ${c.audience.state}` : ''}{c.lastError ? ` · last problem: ${c.lastError}` : ''}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {c.status === 'draft' && <button className={ghost} onClick={() => { setD({ id: c.id, name: c.name, subject: c.subject, body: c.body, state: c.audience.state || '', category: c.audience.category || '', perCollege: c.perCollege }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>}
                {c.status === 'sending' && <button className={ghost} onClick={() => run(() => api({ action: 'pauseCampaign', id: c.id }), 'Paused.')}><Pause className="w-4 h-4" /> Pause</button>}
                {c.status === 'paused' && <button className={ghost} disabled={!s.senderConfigured} onClick={() => run(() => api({ action: 'startCampaign', id: c.id }), 'Resumed.')}><Play className="w-4 h-4" /> Resume</button>}
                {c.status !== 'sending' && <button className={`${ghost} text-crimson-700`} aria-label={`Delete ${c.name}`} onClick={() => confirm(`Delete “${c.name}”?`) && run(() => api({ action: 'deleteCampaign', id: c.id }), 'Deleted.')}><Trash2 className="w-4 h-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
