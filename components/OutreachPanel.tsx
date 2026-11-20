'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Bot, CheckCircle2, ClipboardCheck, ExternalLink, X, Wrench, Download, Loader2, Mail, Pause, Play, Search, Send, Square, Trash2, Globe, Save, Upload, Image as ImageIcon } from 'lucide-react';

interface Campaign { pausedBy?: 'admin' | 'sender'; id: string; name: string; subject: string; body: string; audience: { state?: string; category?: string }; perCollege: 1 | 2; status: 'draft' | 'awaiting' | 'sending' | 'paused' | 'done' | 'rejected'; auto?: boolean; approvedAt?: string; createdAt: string; startedAt?: string; finishedAt?: string; queued: number; sent: number; failed: number; skipped: number; lastError?: string }
interface Summary {
  withWebsite: number; senderConfigured: boolean; sender: string | null; contacts: Record<string, number>; colleges: number; visited: number; visitedWithEmail: number; suppressed: number;
  settings: { dailyLimit: number; perCollege: 1 | 2; gapDays: number };
  finder: { running: boolean; filter: { state?: string; category?: string }; done: number; total: number; found: number; skipped: number; queued: number; startedAt?: string; finishedAt?: string; lastError?: string };
  campaigns: Campaign[]; sentToday: number; states: string[]; categories: string[]; template: { subject: string; body: string };
  auto: Auto; senderProblem: string | null;
  senderHealth?: { ok: boolean; checkedAt?: string; problem?: string; refusedIps: string[]; range: string | null; waiting: number; nextCheckAt?: string };
}
interface Auto { enabled: boolean; subject: string; body: string; audience: { state?: string; category?: string }; perCollege: 1 | 2; visitPerDay: number; batchSize: number; startHour: number; enabledAt?: string; lastFinderDate?: string; lastBatchDate?: string; note?: string }
interface Recipient { email: string; college: string; state: string | null; role: string | null; source: string | null }
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

      <SenderCard s={s} onCheck={() => run(async () => { const d = await api({ action: 'checkSender' }); if (!d.ok) throw new Error(`Brevo still refuses: ${d.problem || 'unknown reason'}`); flash(d.resumed ? 'Brevo accepts again — sending has resumed.' : 'Brevo accepts the outreach key from this server.'); })} />
      {s.campaigns.filter(c => c.status === 'awaiting').map(c => <ApprovalCard key={c.id} c={c} s={s} run={run} flash={flash} setErr={setErr} />)}
      <AutoCard s={s} run={run} flash={flash} setErr={setErr} />

      <details className="group rounded-2xl border border-slate-200 bg-slate-50/60" open={!s.auto.enabled}>
        <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-2 font-semibold text-slate-900">
          <Wrench className="w-5 h-5 text-brand-700" /> Manual tools <span className="text-xs font-normal text-slate-500">import lists, find emails, contacts, one-off campaigns</span>
          <span className="ml-auto text-xs text-brand-800 group-open:hidden">Show</span><span className="ml-auto text-xs text-brand-800 hidden group-open:inline">Hide</span>
        </summary>
        <div className="p-4 pt-0 space-y-6">
          <ImportCard onDone={load} />
          <FinderCard s={s} run={run} />
          <ContactsCard s={s} total={total} run={run} />
          <CampaignsCard s={s} run={run} flash={flash} setErr={setErr} />
        </div>
      </details>
    </div>
  );
}

const IST_HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;

/** A batch prepared by automatic mode: review, remove anyone, then approve (sends) or decline. */
function ApprovalCard({ c, s, run, flash, setErr }: { c: Campaign; s: Summary; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; flash: (m: string) => void; setErr: (m: string) => void }) {
  const [list, setList] = useState<Recipient[] | null>(null);
  const [busy, setBusy] = useState('');
  const [showMsg, setShowMsg] = useState(false);
  const loadList = useCallback(async () => {
    const r = await fetch(`/api/admin/outreach?batch=${encodeURIComponent(c.id)}`, { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    setList(r.ok ? d.recipients : []);
  }, [c.id]);
  useEffect(() => { loadList(); }, [loadList]);
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const n = list?.length ?? c.queued;
  const days = Math.max(1, Math.ceil(n / Math.max(1, s.settings.dailyLimit)));
  return (
    <section className="p-5 rounded-2xl bg-white border-2 border-gold-300 shadow-sm space-y-4" aria-labelledby={`appr-${c.id}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 id={`appr-${c.id}`} className="font-semibold text-slate-900 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-gold-700" /> Waiting for your approval</h3>
          <p className="text-sm text-slate-600 mt-1">{c.name}: <strong>{n.toLocaleString('en-IN')} college{n === 1 ? '' : 's'}</strong> will receive “{c.subject}”. Nothing is sent until you approve.{n > s.settings.dailyLimit ? ` At ${s.settings.dailyLimit} a day this takes about ${days} days.` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button className={primary} disabled={!s.senderConfigured || !!busy || !n} onClick={() => act('ok', async () => {
            if (!confirm(`Send “${c.subject}” to ${n} colleges now (at most ${s.settings.dailyLimit} a day)? You can pause at any time.`)) return;
            await api({ action: 'approveBatch', id: c.id });
            flash('Approved. Sending has started in the background.');
            await run(async () => undefined);
          })}>{busy === 'ok' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve and send</button>
          <button className={ghost} disabled={!!busy} onClick={() => act('no', async () => {
            if (!confirm('Decline this batch? Nothing is sent. A new batch is prepared on the next day.')) return;
            await api({ action: 'rejectBatch', id: c.id });
            await run(async () => undefined, 'Batch declined. Nothing was sent.');
          })}><X className="w-4 h-4" /> Decline</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={ghost} onClick={() => setShowMsg(v => !v)}><Mail className="w-4 h-4" /> {showMsg ? 'Hide the message' : 'Read the message'}</button>
        <button className={ghost} disabled={!s.senderConfigured || !!busy} onClick={() => act('test', async () => { const r = await api({ action: 'test', campaign: { name: c.name, subject: c.subject, body: c.body, audience: c.audience, perCollege: c.perCollege } }); flash(`Test email sent to ${r.to}.`); })}>{busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}<Send className="w-4 h-4" /> Send me a test</button>
      </div>
      {showMsg && <pre className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-800 whitespace-pre-wrap break-words font-sans max-h-96 overflow-auto"><strong>{c.subject}</strong>{'\n\n'}{c.body}</pre>}
      {list === null ? <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-700" aria-label="Loading recipients" /></div> : !list.length ? <p className="text-sm text-slate-500">Nobody left in this batch.</p> : (
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2 font-semibold">College</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold hidden md:table-cell">Found on</th><th className="px-3 py-2"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.email} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-800 break-words">{r.college}{r.state && <span className="block text-xs text-slate-500">{r.state}</span>}</td>
                  <td className="px-3 py-2 break-all">{r.email}{r.role && <span className="block text-xs text-slate-500">{r.role}</span>}</td>
                  <td className="px-3 py-2 text-xs hidden md:table-cell break-all">{r.source?.startsWith('import:') ? 'Imported list' : r.source ? <a className="text-brand-800 hover:underline" href={r.source} target="_blank" rel="noreferrer">{r.source.replace(/^https?:\/\//, '').slice(0, 50)}</a> : ''}</td>
                  <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-crimson-700 hover:underline whitespace-nowrap" disabled={!!busy} onClick={() => act(`rm-${r.email}`, async () => { await api({ action: 'removeFromBatch', id: c.id, email: r.email }); setList(l => (l || []).filter(x => x.email !== r.email)); })}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Removing someone here only leaves them out of this batch. To never email an address or college again, use “Do not email” in the contacts list under Manual tools.</p>
    </section>
  );
}

/** Automatic mode: visits college websites daily and prepares one batch a day for approval. */
function AutoCard({ s, run, flash, setErr }: { s: Summary; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; flash: (m: string) => void; setErr: (m: string) => void }) {
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [a, setA] = useState<Auto>(s.auto);
  const [edit, setEdit] = useState(!s.auto.enabled);
  const [busy, setBusy] = useState('');
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const save = (enabled: boolean, ok: string) => act(enabled ? 'on' : 'off', async () => {
    const r = await api({ action: 'saveAuto', auto: { ...a, enabled } });
    setA(r.auto); if (enabled) setEdit(false);
    await run(async () => undefined, ok);
  });
  const waiting = s.campaigns.some(c => c.auto && c.status === 'awaiting');
  const busyBatch = s.campaigns.find(c => c.auto && (c.status === 'sending' || c.status === 'paused'));
  const where = [a.audience.state || 'all states', a.audience.category || 'all categories'].join(', ');
  return (
    <section className={card} aria-labelledby="auto-h">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h3 id="auto-h" className="font-semibold text-slate-900 flex items-center gap-2 flex-1"><Bot className="w-5 h-5 text-brand-700" /> Automatic mode
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.auto.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{s.auto.enabled ? 'On' : 'Off'}</span>
        </h3>
        {s.auto.enabled
          ? <div className="flex gap-2">{!edit && <button className={ghost} onClick={() => setEdit(true)}>Change settings</button>}<button className={ghost} disabled={!!busy} onClick={() => save(false, 'Automatic mode is off. Nothing new will be prepared.')}>{busy === 'off' && <Loader2 className="w-4 h-4 animate-spin" />}<Pause className="w-4 h-4" /> Turn off</button></div>
          : null}
      </div>
      <ol className="text-sm text-slate-600 grid sm:grid-cols-3 gap-2">
        <li className="p-3 rounded-xl bg-slate-50 border border-slate-200"><strong className="text-slate-800">1 · Find</strong><br />Every day from {hourLabel(a.startHour)} (IST) it visits the websites of {a.visitPerDay.toLocaleString('en-IN')} more colleges ({where}) and collects their published emails.</li>
        <li className="p-3 rounded-xl bg-slate-50 border border-slate-200"><strong className="text-slate-800">2 · Prepare</strong><br />It then prepares a batch of up to {a.batchSize.toLocaleString('en-IN')} new colleges with your message and emails you to review it.</li>
        <li className="p-3 rounded-xl bg-gold-50 border border-gold-200"><strong className="text-slate-800">3 · You approve</strong><br />Nothing is sent until you click <em>Approve and send</em>. You can remove anyone first, or decline.</li>
      </ol>
      {s.auto.enabled && !edit && (
        <div className="text-sm text-slate-700 space-y-1" role="status">
          {waiting ? <p className="text-gold-900 font-semibold">A batch is waiting for your approval (above).</p>
            : busyBatch ? <p>The approved batch is {busyBatch.status === 'paused' ? 'paused' : 'sending'} ({busyBatch.queued} left). The next batch is prepared after it finishes.</p>
            : <p>Next: {s.auto.lastBatchDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) ? `tomorrow from ${hourLabel(s.auto.startHour)}` : s.finder.running ? 'visiting college websites now; the batch follows' : `today from ${hourLabel(s.auto.startHour)}`}.</p>}
          {s.auto.note && <p className="text-xs text-slate-500">{s.auto.note}</p>}
          {!waiting && !busyBatch && <button className={ghost} disabled={!!busy || s.finder.running} onClick={() => act('prep', async () => { await api({ action: 'prepareBatch' }); await run(async () => undefined, 'Batch prepared. Review it above.'); })}>{busy === 'prep' && <Loader2 className="w-4 h-4 animate-spin" />}<ClipboardCheck className="w-4 h-4" /> Prepare a batch now</button>}
          <p className="text-xs text-slate-500">Message: “{s.auto.subject}”</p>
        </div>
      )}
      {edit && (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-xs text-slate-600 flex flex-col gap-1">Which colleges · State<select className={input} value={a.audience.state || ''} onChange={e => setA({ ...a, audience: { ...a.audience, state: e.target.value || undefined } })}><option value="">All states</option>{s.states.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">Category<select className={input} value={a.audience.category || ''} onChange={e => setA({ ...a, audience: { ...a.audience, category: e.target.value || undefined } })}><option value="">All</option>{s.categories.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">Start time each day (IST)<select className={input} value={a.startHour} onChange={e => setA({ ...a, startHour: Number(e.target.value) })}>{IST_HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">College websites to visit per day<input type="number" min={0} max={2000} className={input} value={a.visitPerDay} onChange={e => setA({ ...a, visitPerDay: Number(e.target.value) })} /></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">Colleges per batch (one batch a day)<input type="number" min={1} max={1000} className={input} value={a.batchSize} onChange={e => setA({ ...a, batchSize: Number(e.target.value) })} /></label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">Addresses per college<select className={input} value={a.perCollege} onChange={e => setA({ ...a, perCollege: Number(e.target.value) as 1 | 2 })}><option value={1}>1 (the best one)</option><option value={2}>2</option></select></label>
          </div>
          <label className="text-xs text-slate-600 flex flex-col gap-1">Subject<input className={input} value={a.subject} maxLength={150} onChange={e => setA({ ...a, subject: e.target.value })} /></label>
          <label className="text-xs text-slate-600 flex flex-col gap-1">Message ({'{{college}}'} and {'{{aishe}}'} are filled in for each college; an unsubscribe line is added automatically)
            <textarea ref={bodyRef} className={`${input} font-mono text-[13px]`} rows={12} value={a.body} maxLength={8000} onChange={e => setA({ ...a, body: e.target.value })} />
          </label>
          <ImageInserter onInsert={line => {
            const el = bodyRef.current;
            const at = el ? el.selectionStart : a.body.length;
            const before = a.body.slice(0, at).replace(/\s*$/, ''), after = a.body.slice(at).replace(/^\s*/, '');
            setA({ ...a, body: `${before}${before ? '\n\n' : ''}${line}${after ? '\n\n' : ''}${after}` });
          }} />
          <p className="text-xs text-slate-500">Emails per day are capped at {s.settings.dailyLimit} (change it under Manual tools → Campaigns). A batch larger than that is sent over several days.</p>
          <div className="flex flex-wrap gap-2">
            <button className={ghost} disabled={!s.senderConfigured || !!busy} onClick={() => act('test', async () => { const r = await api({ action: 'test', campaign: { name: 'Automatic batches', subject: a.subject, body: a.body, audience: a.audience, perCollege: a.perCollege } }); flash(`Test email sent to ${r.to}.`); })}>{busy === 'test' && <Loader2 className="w-4 h-4 animate-spin" />}<Mail className="w-4 h-4" /> Send me a test</button>
            <button className={primary} disabled={!s.senderConfigured || !!busy} onClick={() => save(true, s.auto.enabled ? 'Automatic mode settings saved.' : 'Automatic mode is on. You will get an email when the first batch is ready for approval.')}>{busy === 'on' && <Loader2 className="w-4 h-4 animate-spin" />}<Play className="w-4 h-4" /> {s.auto.enabled ? 'Save settings' : 'Turn on automatic mode'}</button>
            {s.auto.enabled && <button className={ghost} onClick={() => { setA(s.auto); setEdit(false); }}>Cancel</button>}
          </div>
          {!s.senderConfigured && <p className="text-xs text-gold-800">Connect the outreach Brevo account first (see above).</p>}
        </div>
      )}
    </section>
  );
}

function SenderCard({ s, onCheck }: { s: Summary; onCheck: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  const check = async () => { setChecking(true); try { await onCheck(); } finally { setChecking(false); } };
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  if (s.senderConfigured && s.senderProblem) {
    const ips = s.senderHealth?.refusedIps?.length ? s.senderHealth.refusedIps : [s.senderProblem.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0]].filter(Boolean) as string[];
    const range = s.senderHealth?.range;
    return (
      <section role="alert" className="p-5 rounded-2xl bg-crimson-50 border border-crimson-200 text-sm text-crimson-900 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Sending is paused: Brevo refused the emails</h3>
        <p className="break-words">Brevo said: “{s.senderProblem}”</p>
        {s.senderHealth && s.senderHealth.waiting > 0 && <p><strong>{s.senderHealth.waiting.toLocaleString('en-IN')}</strong> colleges are waiting. Nobody was skipped or emailed twice.</p>}
        {/IP/i.test(s.senderProblem) ? (
          <>
            <p>The website server&apos;s outgoing address changes from time to time (Brevo has refused {ips.map((ip, i) => <React.Fragment key={ip}>{i ? ', ' : ''}<code className="bg-white px-1 rounded">{ip}</code></React.Fragment>)}), so authorising one address only works until the next change.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Sign in to the <strong>outreach</strong> Brevo account and open <a className="font-semibold underline inline-flex items-center gap-1" href="https://app.brevo.com/security/authorised_ips" target="_blank" rel="noreferrer">Security → Authorized IPs <ExternalLink className="w-3 h-3" /></a>.</li>
              {range
                ? <li>Click <strong>Authorize IP address</strong>, choose <strong>IPv4 range (CIDR format)</strong> and enter <code className="bg-white px-1 rounded select-all">{range}</code> (the hosting provider&apos;s block). Or click <strong>Deactivate blocking</strong> to allow any address.</li>
                : <li>Click <strong>Deactivate blocking</strong>, or authorise each address above.</li>}
              <li>Then click <strong>Check connection now</strong> below. Sending also resumes on its own within the hour once Brevo accepts.</li>
            </ol>
          </>
        ) : <p>Check the outreach Brevo API key in GoDaddy (OUTREACH_EMAIL_API_KEY) and that the Brevo account is active, then click Check connection now. Sending resumes on its own once Brevo accepts.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className={ghost} onClick={check} disabled={checking}>{checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check connection now</button>
          <span className="text-xs text-crimson-800">Checks with Brevo without sending any email.{s.senderHealth?.checkedAt ? ` Last checked ${when(s.senderHealth.checkedAt)}.` : ''}{s.senderHealth?.nextCheckAt ? ` Next automatic check ${when(s.senderHealth.nextCheckAt)}.` : ''}</span>
        </div>
      </section>
    );
  }
  if (s.senderConfigured) return <p className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0" /><span>Outreach emails are sent from <strong>{s.sender}</strong> through the separate Brevo account. Replies go to info@acadexmatch.com. Sent today: {s.sentToday} of {s.settings.dailyLimit}.</span></p>;
  return (
    <section className="p-5 rounded-2xl bg-gold-50 border border-gold-200 text-sm text-gold-900 space-y-2">
      <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Connect the outreach Brevo account to send</h3>
      <p>You can find contacts now. To send, add the second Brevo account (kept separate from the one that sends sign-in codes and candidate alerts):</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Create a second Brevo account and, under Senders &amp; Domains, add and authenticate <strong>outreach.acadexmatch.com</strong> with the sender <strong>hello@outreach.acadexmatch.com</strong>.</li>
        <li>In that account create an API key (SMTP &amp; API → API keys).</li>
        <li>In GoDaddy, add two settings (environment variables) and publish: <code>OUTREACH_EMAIL_API_KEY</code> = the new key, and <code>OUTREACH_MAIL_FROM</code> = <code>AcadeXMatch &lt;hello@outreach.acadexmatch.com&gt;</code>.</li>
      </ol>
    </section>
  );
}

interface ImportResult { kind: string; file: string; rows: number; added: number; updated: number; unchanged: number; skipped: number; skippedSample: { row: number; reason: string }[] }

function ImportCard({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const upload = async (kind: 'websites' | 'contacts', file: File | undefined) => {
    if (!file) return;
    setBusy(kind); setErr(''); setRes(null);
    try {
      const f = new FormData(); f.append('kind', kind); f.append('file', file);
      const r = await fetch('/api/admin/outreach/import', { method: 'POST', credentials: 'same-origin', body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not import this file.');
      setRes(d); await onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  const picker = (kind: 'websites' | 'contacts', label: string) => (
    <label className={`${ghost} cursor-pointer`}>
      {busy === kind ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {label}
      <input type="file" accept=".csv,.xlsx" className="sr-only" disabled={!!busy} onChange={e => { upload(kind, e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
  return (
    <section className={card} aria-labelledby="import-h">
      <h3 id="import-h" className="font-semibold text-slate-900 flex items-center gap-2"><Upload className="w-5 h-5 text-brand-700" /> Import data (Excel or CSV)</h3>
      <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-600">
        <div className="space-y-2">
          <p><strong className="text-slate-800">College websites</strong> — columns <code>AISHE Code</code> and <code>Website</code>. The finder (step 1) then visits these websites and collects the emails they publish.</p>
          {picker('websites', 'Upload websites')}
        </div>
        <div className="space-y-2">
          <p><strong className="text-slate-800">Contact emails</strong> — columns <code>Email</code> and <code>AISHE Code</code> or <code>College</code> (<code>State</code>, <code>District</code> optional). Added straight to the contacts in step 2. Use only official contact addresses that colleges publish publicly.</p>
          {picker('contacts', 'Upload contacts')}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-crimson-700">{err}</p>}
      {res && (
        <div role="status" className="text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
          <p>{res.file}: {res.rows.toLocaleString('en-IN')} rows · {res.kind === 'websites' ? `${res.updated.toLocaleString('en-IN')} websites added` : `${res.added.toLocaleString('en-IN')} new contacts`} · {res.unchanged.toLocaleString('en-IN')} already there · {res.skipped.toLocaleString('en-IN')} skipped</p>
          {!!res.skippedSample.length && <details><summary className="cursor-pointer text-xs">Why rows were skipped</summary><ul className="text-xs mt-1 list-disc pl-5">{res.skippedSample.map(x => <li key={x.row}>Row {x.row}: {x.reason}</li>)}</ul></details>}
        </div>
      )}
    </section>
  );
}

/** Adds an image line, ![description](https://…), to the campaign message. */
function ImageInserter({ onInsert }: { onInsert: (line: string) => void }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [href, setHref] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [uploaded, setUploaded] = useState('');
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErr('The image is larger than 2 MB. Make it smaller (for example 1200 pixels wide) and upload again.'); return; }
    setUploading(true); setErr('');
    try {
      const f = new FormData(); f.append('file', file);
      const r = await fetch('/api/admin/outreach/image', { method: 'POST', credentials: 'same-origin', body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not upload the image.');
      setSrc(d.url); setUploaded(d.url); setOk(false);
      if (!alt) setAlt(file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 120));
    } catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  };
  if (!open) return <div><button type="button" className={ghost} onClick={() => setOpen(true)}><ImageIcon className="w-4 h-4" /> Insert or upload image</button></div>;
  const insert = () => {
    const u = src.trim(), l = href.trim();
    if (!/^https:\/\/\S+$/i.test(u) && u !== uploaded) { setErr('Upload an image or paste an image link that starts with https://'); return; }
    if (l && !/^https:\/\/\S+$/i.test(l)) { setErr('The click-through link must start with https://'); return; }
    const a = alt.replace(/[\[\]\n]/g, ' ').trim();
    const img = `![${a}](${u.replace(/[()\s]/g, encodeURIComponent)})`;
    onInsert(l ? `[${img}](${l.replace(/[()\s]/g, encodeURIComponent)})` : img);
    setSrc(''); setAlt(''); setHref(''); setErr(''); setOk(false); setUploaded(''); setOpen(false);
  };
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
      <p className="text-xs text-slate-500">Upload an image from your computer, or paste the direct link to an image hosted online (https://, ending in an image such as .png or .jpg). PNG, JPG, GIF or WebP, up to 2 MB; about 1200 pixels wide looks sharp. It is inserted where your cursor is in the message. Email apps sometimes hide images until the reader allows them, so keep the key words in the text as well.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${primary} cursor-pointer`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {uploading ? 'Uploading…' : 'Upload from computer'}
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" disabled={uploading} onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <span className="text-xs text-slate-500">or paste a link below</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <label className="text-xs text-slate-600 flex flex-col gap-1 sm:col-span-3">Image link *<input className={input} value={src} onChange={e => { setSrc(e.target.value); setOk(false); }} placeholder="https://www.ukqaai.com/images/banner.png" /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Description (shown if the image is blocked)<input className={input} value={alt} maxLength={120} onChange={e => setAlt(e.target.value)} placeholder="AcadeXMatch launch offer" /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1 sm:col-span-2">Open this page when clicked (optional)<input className={input} value={href} onChange={e => setHref(e.target.value)} placeholder="https://acadexmatch.com/register" /></label>
      </div>
      {(/^https:\/\/\S+$/i.test(src.trim()) || (uploaded && src === uploaded)) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src.trim()} alt={alt || 'Preview'} onLoad={() => setOk(true)} onError={() => setOk(false)} className={ok ? 'max-h-40 rounded-lg border border-slate-200' : 'hidden'} />
      )}
      {src && !ok && /^https:/i.test(src) && <p className="text-xs text-slate-500">No preview yet. If none appears, the link is not a direct image link (open the image itself and copy that address).</p>}
      {err && <p role="alert" className="text-xs text-crimson-700">{err}</p>}
      <div className="flex gap-2"><button type="button" className={primary} onClick={insert}>Insert</button><button type="button" className={ghost} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button></div>
    </div>
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
      <p className="text-xs text-slate-500">Visits each college website from the AISHE directory (home page and up to three contact pages, respecting robots.txt, a few sites at a time) and saves the addresses the college publishes. Colleges already on AcadeXMatch and colleges checked in the last 90 days are skipped. Colleges with a website: {s.withWebsite.toLocaleString('en-IN')}. So far: {s.visited.toLocaleString('en-IN')} websites checked, {s.visitedWithEmail.toLocaleString('en-IN')} with an email.</p>
      {!s.withWebsite && !f.running && (
        <p className="text-sm p-3 rounded-xl bg-gold-50 border border-gold-200 text-gold-900 flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /><span>None of the colleges in the AISHE directory has a website address yet (the AISHE download has no website column), so there is nothing to visit. Use <strong>Import data</strong> above: add college websites, or add contact emails you already have.</span></p>
      )}
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
      {rows === null ? <Loader2 className="w-5 h-5 animate-spin text-brand-700" /> : !rows.length ? <p className="text-sm text-slate-500">No contacts yet. Run step 1 or import a contact list.</p> : (
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
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const blank = { id: '', name: 'Launch offer for colleges', subject: s.template.subject, body: s.template.body, state: '', category: '', perCollege: s.settings.perCollege as 1 | 2 };
  const [d, setD] = useState(blank);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [settings, setSettings] = useState(s.settings);
  const campaign = () => ({ id: d.id || undefined, name: d.name, subject: d.subject, body: d.body, audience: { state: d.state || undefined, category: d.category || undefined }, perCollege: d.perCollege });
  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const save = async () => { const r = await api({ action: 'saveCampaign', campaign: campaign() }); setD(x => ({ ...x, id: r.campaign.id })); return r.campaign as Campaign; };
  const STATUS: Record<Campaign['status'], string> = { draft: 'Draft', awaiting: 'Waiting for your approval', sending: 'Sending', paused: 'Paused', done: 'Finished', rejected: 'Declined' };
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
          <textarea ref={bodyRef} className={`${input} font-mono text-[13px]`} rows={14} value={d.body} maxLength={8000} onChange={e => setD({ ...d, body: e.target.value })} />
        </label>
        <ImageInserter onInsert={line => {
          const el = bodyRef.current;
          const at = el ? el.selectionStart : d.body.length;
          const before = d.body.slice(0, at).replace(/\s*$/, ''), after = d.body.slice(at).replace(/^\s*/, '');
          setD({ ...d, body: `${before}${before ? '\n\n' : ''}${line}${after ? '\n\n' : ''}${after}` });
        }} />
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
                <div className="font-semibold text-sm text-slate-900 break-words">{c.name} <span className="ml-1 text-xs font-normal text-slate-500">· {STATUS[c.status]}{c.status === 'paused' ? (c.pausedBy === 'admin' ? ' by you' : c.lastError && /40[13]|IP|key/i.test(c.lastError) ? ' (Brevo refused — resumes by itself once fixed)' : '') : ''}</span></div>
                <div className="text-xs text-slate-500 break-words">{c.subject}</div>
                <div className="text-xs text-slate-600 mt-0.5">Sent {c.sent} · waiting {c.queued} · failed {c.failed} · skipped {c.skipped}{c.audience.state ? ` · ${c.audience.state}` : ''}{c.lastError ? ` · last problem: ${c.lastError}` : ''}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {c.status === 'draft' && <button className={ghost} onClick={() => { setD({ id: c.id, name: c.name, subject: c.subject, body: c.body, state: c.audience.state || '', category: c.audience.category || '', perCollege: c.perCollege }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>}
                {c.status === 'sending' && <button className={ghost} onClick={() => run(() => api({ action: 'pauseCampaign', id: c.id }), 'Paused.')}><Pause className="w-4 h-4" /> Pause</button>}
                {c.status === 'paused' && <button className={ghost} disabled={!s.senderConfigured} onClick={() => run(() => api({ action: 'startCampaign', id: c.id }), 'Resumed.')}><Play className="w-4 h-4" /> Resume</button>}
                {c.status !== 'sending' && c.status !== 'awaiting' && <button className={`${ghost} text-crimson-700`} aria-label={`Delete ${c.name}`} onClick={() => confirm(`Delete “${c.name}”?`) && run(() => api({ action: 'deleteCampaign', id: c.id }), 'Deleted.')}><Trash2 className="w-4 h-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
