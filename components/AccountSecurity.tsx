'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, KeyRound, Smartphone, Link2, MonitorSmartphone, Mail } from 'lucide-react';
import { postJson } from '@/components/AuthCard';
import { OtpInput, PasswordField, PhoneField, Spinner, useCountdown } from '@/components/AuthWidgets';
import { passwordProblem } from '@/lib/passwordPolicy';
import { hydrate } from '@/lib/clientSync';
import type { CountryCode } from 'libphonenumber-js/min';

/* Account → Security: sign-in methods, mobile number confirmation, linked Google/Microsoft,
   email change, password, and the list of signed-in devices. */

interface SessionRow { id: string; current: boolean; createdAt: number; lastSeen?: number; device?: string; ip?: string; method?: string }
interface Sec {
  email: string; emailVerified: boolean; phone: string | null; phoneMasked: string; phoneVerified: boolean; hasPassword: boolean;
  identities: { provider: 'google' | 'microsoft'; email: string | null; linkedAt: string }[];
  available: { sms: boolean; providers: ('google' | 'microsoft')[] };
  sessions: SessionRow[];
}

const card = 'p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4';
const btn = 'px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2';
const btn2 = 'px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 disabled:opacity-60';
const NAME = { google: 'Google', microsoft: 'Microsoft' } as const;
const when = (ms?: number) => (ms ? new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p role={m.ok ? 'status' : 'alert'} className={`text-sm flex items-start gap-1.5 ${m.ok ? 'text-emerald-800' : 'text-crimson-700'}`}>{m.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}{m.text}</p>;
}

export default function AccountSecurity() {
  const [sec, setSec] = useState<Sec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/account/security', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load.');
      setSec(d);
    } catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // URL feedback after linking a provider (?linked=google | taken)
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('linked');
    if (p === 'taken') setLinkMsg({ ok: false, text: 'That Google/Microsoft account is already used by another AcadeXMatch account.' });
    else if (p === 'google' || p === 'microsoft') setLinkMsg({ ok: true, text: `${NAME[p]} sign-in added.` });
  }, []);

  if (loadError) return <section id="security" className={card}><p className="text-sm text-crimson-700">{loadError}</p></section>;
  if (!sec) return <section id="security" className={card}><p className="text-sm text-slate-500">Loading security settings…</p></section>;

  return (
    <div id="security" className="space-y-6 scroll-mt-24">
      <PasswordCard sec={sec} reload={load} />
      <PhoneCard sec={sec} reload={load} />
      <LinkedCard sec={sec} reload={load} msg={linkMsg} />
      <EmailChangeCard sec={sec} />
      <SessionsCard sec={sec} reload={load} />
    </div>
  );
}

function PasswordCard({ sec, reload }: { sec: Sec; reload: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(next, { email: sec.email });
    if (weak) { setMsg({ ok: false, text: weak }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setBusy(true);
    const r = await postJson('/api/account/password', { current: cur, next });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: sec.hasPassword ? 'Password changed. Your other devices were signed out.' : 'Password added. You can now also sign in with your email and password.' }); setCur(''); setNext(''); setConfirm(''); reload(); }
    else setMsg({ ok: false, text: r.error || 'Could not save the password.' });
  };
  return (
    <section className={card}>
      <h2 className="font-bold text-slate-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-brand-700" /> {sec.hasPassword ? 'Change password' : 'Add a password'}</h2>
      {!sec.hasPassword && <p className="text-sm text-slate-600">Your account signs in with {sec.identities.map(i => NAME[i.provider]).join(' or ') || 'another method'}. Add a password to also sign in with your email address.</p>}
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-start">
        {sec.hasPassword && <PasswordField id="sec-cur" label="Current password" value={cur} onChange={setCur} />}
        <PasswordField id="sec-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="sec-new2" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <div className="sm:col-span-3"><button type="submit" className={btn} disabled={busy}>{busy ? <Spinner /> : null}{sec.hasPassword ? 'Change password' : 'Add password'}</button></div>
      </form>
      <Msg m={msg} />
    </section>
  );
}

function PhoneCard({ sec, reload }: { sec: Sec; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [country, setCountry] = useState<CountryCode>('IN');
  const [phone, setPhone] = useState(sec.phone || '');
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendIn, setResendIn] = useCountdown();

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    const r = await postJson('/api/auth/otp/request', { purpose: 'verify-phone', phone, country, password });
    setBusy(false);
    if (typeof r.resendIn === 'number') setResendIn(r.resendIn as number);
    if (r.needPassword) setNeedPw(true);
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'Could not send the code.' }); return; }
    setChallenge({ id: String(r.challengeId), sentTo: String(r.sentTo || '') });
    setCode('');
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true); setMsg(null);
    const r = await postJson('/api/auth/otp/verify', { purpose: 'verify-phone', challengeId: challenge.id, code });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'That code is not correct.' }); return; }
    setChallenge(null); setEditing(false); setPassword(''); setNeedPw(false);
    setMsg({ ok: true, text: 'Mobile number confirmed.' });
    hydrate(); reload();
  };

  return (
    <section className={card}>
      <h2 className="font-bold text-slate-900 flex items-center gap-2"><Smartphone className="w-4 h-4 text-brand-700" /> Mobile number</h2>
      <div className="text-sm text-slate-700 flex flex-wrap items-center gap-2">
        {sec.phone ? <span className="font-medium">{sec.phoneMasked}</span> : <span className="text-slate-500">No mobile number yet.</span>}
        {sec.phone && (sec.phoneVerified
          ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmed</span>
          : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gold-50 text-gold-800 border border-gold-200">Not confirmed</span>)}
      </div>
      {!sec.available.sms ? (
        <p className="text-sm text-slate-500">Confirming numbers by SMS will be available soon.</p>
      ) : challenge ? (
        <form onSubmit={verify} className="space-y-3 max-w-sm">
          <p className="text-sm text-slate-600">Enter the 6-digit code sent to {challenge.sentTo}.</p>
          <OtpInput value={code} onChange={setCode} />
          <div className="flex items-center gap-3">
            <button type="submit" className={btn} disabled={busy || code.length < 6}>{busy ? <Spinner /> : null}Confirm</button>
            <button type="button" className="text-sm font-semibold text-brand-700 disabled:text-slate-400" disabled={resendIn > 0 || busy} onClick={() => send()}>{resendIn > 0 ? `New code in ${resendIn}s` : 'Send a new code'}</button>
          </div>
        </form>
      ) : editing || !sec.phoneVerified ? (
        <form onSubmit={send} className="space-y-3 max-w-md">
          <PhoneField id="sec-phone" label={sec.phoneVerified ? 'New mobile number' : 'Mobile number to confirm'} country={country} onCountry={setCountry} value={phone} onChange={setPhone} />
          {(needPw || (sec.phoneVerified && sec.hasPassword)) && <PasswordField id="sec-phone-pw" label="Current password" value={password} onChange={setPassword} hint="Needed to change a confirmed number." />}
          <div className="flex gap-2">
            <button type="submit" className={btn} disabled={busy || resendIn > 0}>{busy ? <Spinner /> : null}{resendIn > 0 ? `Wait ${resendIn}s` : 'Send code by SMS'}</button>
            {editing && <button type="button" className={btn2} onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      ) : (
        <button type="button" className={btn2} onClick={() => { setEditing(true); setPhone(''); }}>Change number</button>
      )}
      <Msg m={msg} />
      <p className="text-xs text-slate-500">A confirmed number can be used to sign in and to recover your account with an SMS code.</p>
    </section>
  );
}

function LinkedCard({ sec, reload, msg: initial }: { sec: Sec; reload: () => void; msg: { ok: boolean; text: string } | null }) {
  const [msg, setMsg] = useState(initial);
  useEffect(() => setMsg(initial), [initial]);
  const all = Array.from(new Set([...sec.available.providers, ...sec.identities.map(i => i.provider)]));
  if (!all.length) return null;
  const unlink = async (p: 'google' | 'microsoft') => {
    const r = await postJson('/api/account/identities', { action: 'unlink', provider: p });
    setMsg(r.ok ? { ok: true, text: `${NAME[p]} sign-in removed.` } : { ok: false, text: r.error || 'Could not remove it.' });
    if (r.ok) reload();
  };
  return (
    <section className={card}>
      <h2 className="font-bold text-slate-900 flex items-center gap-2"><Link2 className="w-4 h-4 text-brand-700" /> Google and Microsoft sign-in</h2>
      <ul className="divide-y divide-slate-100">
        {all.map(p => {
          const linked = sec.identities.find(i => i.provider === p);
          return (
            <li key={p} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{NAME[p]}</div>
                <div className="text-slate-600">{linked ? `Linked${linked.email ? ` (${linked.email})` : ''} on ${new Date(linked.linkedAt).toLocaleDateString('en-IN')}` : 'Not linked'}</div>
              </div>
              {linked
                ? <button type="button" className={btn2} onClick={() => unlink(p)}>Remove</button>
                : sec.available.providers.includes(p) && <a className={btn2} href={`/api/auth/oauth/${p}/start?mode=link`}>Link {NAME[p]}</a>}
            </li>
          );
        })}
      </ul>
      <Msg m={msg} />
    </section>
  );
}

function EmailChangeCard({ sec }: { sec: Sec }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await postJson('/api/auth/email-change', { newEmail: email, password });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: String(r.message || 'Check the new inbox for a confirmation link.') } : { ok: false, text: r.error || 'Could not start the change.' });
    if (r.ok) { setPassword(''); setOpen(false); }
  };
  return (
    <section className={card}>
      <h2 className="font-bold text-slate-900 flex items-center gap-2"><Mail className="w-4 h-4 text-brand-700" /> Change email address</h2>
      <p className="text-sm text-slate-600">Current address: <strong>{sec.email}</strong>. The change takes effect after you click the link we send to the new address; we also tell the old address.</p>
      {open ? (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 items-start">
          <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">New email address</span><input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm" /></label>
          {sec.hasPassword && <PasswordField id="sec-email-pw" label="Current password" value={password} onChange={setPassword} />}
          <div className="sm:col-span-2 flex gap-2"><button type="submit" className={btn} disabled={busy}>{busy ? <Spinner /> : null}Send confirmation link</button><button type="button" className={btn2} onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : <button type="button" className={btn2} onClick={() => setOpen(true)}>Change email address</button>}
      <Msg m={msg} />
    </section>
  );
}

function SessionsCard({ sec, reload }: { sec: Sec; reload: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const others = sec.sessions.filter(s => !s.current).length;
  const act = async (body: Record<string, string>) => {
    const r = await postJson('/api/account/security', body);
    setMsg(r.ok ? { ok: true, text: `Signed out ${r.revoked} session${r.revoked === 1 ? '' : 's'}.` } : { ok: false, text: r.error || 'Could not sign out.' });
    reload();
  };
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><MonitorSmartphone className="w-4 h-4 text-brand-700" /> Signed-in devices</h2>
        {others > 0 && <button type="button" className={btn2} onClick={() => act({ action: 'revoke-others' })}>Sign out all other devices</button>}
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {sec.sessions.map(s => (
          <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{s.device || 'Unknown device'} {s.current && <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200">This device</span>}</div>
              <div className="text-slate-600">Signed in {when(s.createdAt)}{s.method ? ` with ${s.method}` : ''}{s.ip ? ` · network ${s.ip}` : ''}{s.lastSeen ? ` · last active ${when(s.lastSeen)}` : ''}</div>
            </div>
            {!s.current && <button type="button" className={btn2} onClick={() => act({ action: 'revoke', id: s.id })}>Sign out</button>}
          </li>
        ))}
      </ul>
      <Msg m={msg} />
    </section>
  );
}
