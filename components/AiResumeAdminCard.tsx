'use client';

import React, { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { AI_RESUME_DEFAULT_PREMIUM_PRICE_INR, AI_RESUME_DEFAULT_PRICE_INR, type PlanSettings } from '@/types';

interface Status { configured: boolean; models: { chat: string; writer: string; improver: string }; stats: { sessions: number; builds: number; improves: number; messages: number; tokensIn: number; tokensOut: number; failures: number } }

/** Administrator: AI resume builder on/off, prices, AI status and usage. */
export default function AiResumeAdminCard() {
  const saved = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const [st, setSt] = useState<Status | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [prem, setPrem] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/ai-resume', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(setSt).catch(() => setSt(null)); }, []);
  const p = price ?? String(saved.aiResumePriceInr ?? AI_RESUME_DEFAULT_PRICE_INR);
  const q = prem ?? String(saved.aiResumePremiumPriceInr ?? AI_RESUME_DEFAULT_PREMIUM_PRICE_INR);
  const on = saved.aiResumeEnabled !== false;
  const save = (patch: Partial<PlanSettings>, note: string) => {
    StorageService.savePlanSettings({ ...StorageService.getPlanSettings(), ...patch });
    setPrice(null); setPrem(null); setMsg(note); setTimeout(() => setMsg(''), 4000);
  };
  const valid = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100000;
  const input = 'w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white';
  return (
    <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-gold-500" /> AI resume builder</h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${on && st?.configured ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          {!st ? 'Checking…' : !st.configured ? 'Waiting for the AI key' : on ? 'On sale' : 'Switched off'}
        </span>
      </div>
      {st && !st.configured && (
        <p className="text-sm p-3 rounded-xl bg-gold-50 border border-gold-200 text-gold-900">Add <code>ANTHROPIC_API_KEY</code> (from console.anthropic.com) to the GoDaddy secrets (Preview and Publish), then publish. Until then candidates see “coming soon” and cannot pay.</p>
      )}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="text-xs text-slate-600 flex flex-col gap-1">Price per session (₹, incl. GST)<input className={input} inputMode="numeric" value={p} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">Paid Premium plan price (₹)<input className={input} inputMode="numeric" value={q} onChange={e => setPrem(e.target.value.replace(/\D/g, ''))} /></label>
        <button disabled={!valid(p) || !valid(q) || (price === null && prem === null)} onClick={() => save({ aiResumePriceInr: Number(p), aiResumePremiumPriceInr: Number(q) }, 'Prices saved.')} className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Save className="w-4 h-4" /> Save prices</button>
        <button onClick={() => save({ aiResumeEnabled: !on }, on ? 'AI resume builder switched off. Paid sessions resume when you switch it on again.' : 'AI resume builder switched on.')} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">{on ? 'Switch off' : 'Switch on'}</button>
      </div>
      <p className="text-xs text-slate-500">One payment = one session: chat interview, up to 3 AI builds and 3 AI improvements of one resume, valid 30 days. Refunding the payment in Transactions ends the session. The lower price applies to candidates on a paid Premium plan (the free Premium every candidate has now does not count).</p>
      {msg && <p role="status" className="text-sm text-emerald-800">{msg}</p>}
      {st && (
        <div className="text-xs text-slate-600 grid sm:grid-cols-2 gap-2">
          <p>Models: interviewer <code>{st.models.chat}</code>, writer <code>{st.models.writer}</code>, improver <code>{st.models.improver}</code></p>
          <p>Usage: {st.stats.sessions} sessions · {st.stats.messages} chat replies · {st.stats.builds} builds · {st.stats.improves} improvements · {st.stats.failures} AI errors · {(st.stats.tokensIn / 1000).toFixed(0)}k input / {(st.stats.tokensOut / 1000).toFixed(0)}k output tokens</p>
        </div>
      )}
    </section>
  );
}
