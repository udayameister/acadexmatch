'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { StorageService, premiumPlansOf } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { hydrate } from '@/lib/clientSync';
import { productLabel, paymentState, PaymentState, PAYMENT_STATE_LABEL, PAYMENT_STATE_STYLE } from '@/lib/paymentLabel';
import type { Job, Payment, PaymentProduct, PlanSettings, User } from '@/types';
import { Download, FileText, Plus, RefreshCw, Search, Undo2, X, Receipt, Landmark } from 'lucide-react';

/*
 * Admin ledger of every transaction: online (Razorpay) and offline payments, failures and refunds,
 * with totals, filters, a CSV export and the actions that change a transaction.
 */

const field = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition disabled:opacity-50';
const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';

const PRODUCT: Record<PaymentProduct, string> = {
  candidate_premium: 'Candidate Premium',
  institution_premium: 'Institution Premium',
  featured_listing: 'Featured vacancy',
  urgent_listing: 'Urgent hiring label',
};

const rs = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (p: Payment) => p.paidAt || p.createdAt;
const istDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const istDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const fees = (p: Payment) => (p.gatewayFee || 0);

async function adminPayments(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; checked?: number; paid?: number; failed?: number }> {
  const r = await fetch('/api/admin/payments', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  await hydrate();
  return { ok: r.ok && d.ok !== false, ...d };
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Payment[]) {
  const head = ['Date (IST)', 'Invoice', 'Status', 'Buyer', 'Buyer email', 'Institute', 'Product', 'Item', 'Amount (INR)', 'Refunded (INR)', 'Razorpay fee (INR)', 'GST on fee (INR)', 'Net received (INR)', 'Method', 'Method detail', 'Source', 'Razorpay order', 'Razorpay payment', 'Active until', 'Failure reason', 'Test mode'];
  const lines = rows.map(p => {
    const paid = p.status === 'paid';
    const net = paid ? p.amount - (p.refundedAmount || 0) - fees(p) : 0;
    return [istDateTime(when(p)), p.invoiceNumber, PAYMENT_STATE_LABEL[paymentState(p)], p.userName, p.userEmail, p.instituteName, PRODUCT[p.product], productLabel(p),
      p.amount, p.refundedAmount || 0, p.gatewayFee ?? '', p.gatewayTax ?? '', paid ? Math.round(net * 100) / 100 : '', p.method, p.methodDetail, p.source || 'razorpay',
      p.razorpayOrderId, p.razorpayPaymentId, p.activeUntil, p.failureReason, p.testMode ? 'yes' : ''].map(csvCell).join(',');
  });
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `acadexmatch-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-2xl my-8 rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Details({ p, onClose, online }: { p: Payment; onClose: () => void; online: boolean }) {
  const left = Math.round((p.amount - (p.refundedAmount || 0)) * 100) / 100;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [endAccess, setEndAccess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const viaRazorpay = p.source !== 'offline' && online;
  const full = !amount || Number(amount) >= left;

  const refund = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = amount ? Number(amount) : left;
    if (!confirm(`${viaRazorpay ? 'Refund' : 'Record a refund of'} ${rs(a)} to ${p.userName}${viaRazorpay ? ' through Razorpay' : ''}? This cannot be undone.`)) return;
    setBusy(true);
    const r = await adminPayments({ action: 'refund', paymentId: p.id, amount: amount || undefined, note, endAccess: full && endAccess, manual: !viaRazorpay });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Refund recorded and the buyer has been emailed.' } : { ok: false, text: r.error || 'Refund failed.' });
    if (r.ok) { setAmount(''); setNote(''); }
  };

  const rows: [string, React.ReactNode][] = [
    ['Status', <span key="s" className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_STATE_STYLE[paymentState(p)]}`}>{PAYMENT_STATE_LABEL[paymentState(p)]}</span>],
    ['Buyer', <span key="b">{p.userName} · <a className="text-brand-800 underline" href={`mailto:${p.userEmail}`}>{p.userEmail}</a></span>],
    ['Item', productLabel(p)],
    ['Amount', rs(p.amount)],
    ...(p.refundedAmount ? [['Refunded', rs(p.refundedAmount)] as [string, React.ReactNode]] : []),
    ...(p.gatewayFee !== undefined ? [['Razorpay fee', `${rs(p.gatewayFee)} (incl. ${rs(p.gatewayTax || 0)} GST)`] as [string, React.ReactNode]] : []),
    ['Method', p.methodDetail || p.method || (p.source === 'offline' ? 'Offline' : '—')],
    ['Source', p.source === 'offline' ? 'Recorded by admin (offline)' : `Razorpay${p.testMode ? ' — test mode' : ''}`],
    ...(p.razorpayOrderId ? [['Razorpay order', <code key="o" className="text-xs">{p.razorpayOrderId}</code>] as [string, React.ReactNode]] : []),
    ...(p.razorpayPaymentId ? [['Razorpay payment', <code key="pp" className="text-xs">{p.razorpayPaymentId}</code>] as [string, React.ReactNode]] : []),
    ...(p.activeUntil ? [['Active until', p.activeUntil] as [string, React.ReactNode]] : []),
    ...(p.failureReason ? [['Failure reason', p.failureReason] as [string, React.ReactNode]] : []),
    ...(p.invoiceNumber ? [['Invoice', <Link key="i" href={`/invoice/${p.id}`} target="_blank" className="text-brand-800 font-semibold underline">{p.invoiceNumber}</Link>] as [string, React.ReactNode]] : []),
  ];

  return (
    <Dialog title={`Transaction ${p.invoiceNumber || p.razorpayOrderId || p.id}`} onClose={onClose}>
      <div className="space-y-5 text-sm">
        <dl className="grid sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-2">
          {rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">{v}</dd></React.Fragment>)}
        </dl>

        <div>
          <h4 className="font-semibold text-slate-900 mb-2">History</h4>
          <ol className="space-y-2 border-l-2 border-brand-100 pl-4">
            {(p.events?.length ? p.events : [{ at: p.createdAt, type: 'created' as const }, ...(p.paidAt ? [{ at: p.paidAt, type: 'paid' as const }] : [])]).map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-700" />
                <div className="text-xs text-slate-500">{istDateTime(e.at)}</div>
                <div className="text-slate-800"><span className="font-semibold capitalize">{e.type.replace('_', ' ')}</span>{'note' in e && e.note ? ` — ${e.note}` : ''}</div>
              </li>
            ))}
          </ol>
        </div>

        {p.refunds && p.refunds.length > 0 && (
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Refunds</h4>
            <ul className="space-y-1">
              {p.refunds.map(r => <li key={r.id} className="flex flex-wrap justify-between gap-2"><span>{rs(r.amount)} · {istDateTime(r.at)}{r.note ? ` · ${r.note}` : ''}</span><span className="text-xs text-slate-500">{r.manual ? 'recorded manually' : r.id} · {r.status}</span></li>)}
            </ul>
          </div>
        )}

        {p.status === 'paid' && left > 0 && (
          <form onSubmit={refund} className="p-4 rounded-xl bg-ivory border border-slate-200 space-y-3">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2"><Undo2 className="w-4 h-4" /> {viaRazorpay ? 'Refund through Razorpay' : 'Record a refund'}</h4>
            {!viaRazorpay && <p className="text-xs text-slate-500">{p.source === 'offline' ? 'This was paid offline. Return the money yourself, then record it here.' : 'Razorpay is not connected: return the money from the Razorpay dashboard, then record it here.'}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-700">Amount (leave empty for the full {rs(left)})
                <input type="number" min={1} max={left} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={`${field} mt-1`} placeholder={String(left)} />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Reason (shown to the buyer)
                <input value={note} maxLength={200} onChange={e => setNote(e.target.value)} className={`${field} mt-1`} placeholder="e.g. Duplicate payment" />
              </label>
            </div>
            {full && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={endAccess} onChange={e => setEndAccess(e.target.checked)} className="w-4 h-4 accent-brand-700" /> Also take back the time this payment added to the plan</label>}
            <button disabled={busy} className={btnPrimary}>{busy ? 'Working…' : viaRazorpay ? 'Refund now' : 'Record refund'}</button>
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-800' : 'text-crimson-700'}`} role="status">{msg.text}</p>}
          </form>
        )}
      </div>
    </Dialog>
  );
}

function OfflineForm({ onClose }: { onClose: () => void }) {
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const settings = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const plans = premiumPlansOf(settings).filter(p => p.enabled);
  const [f, setF] = useState({ email: '', product: 'institution_premium' as PaymentProduct, plan: plans[0]?.key || '', months: '', jobId: '', amount: '', method: 'bank_transfer', reference: '', paidOn: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const buyer = users.find(u => u.email.toLowerCase() === f.email.trim().toLowerCase());
  const buyerJobs = jobs.filter(j => buyer?.instituteId && j.instituteId === buyer.instituteId && j.status === 'published');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const suggested = f.product === 'candidate_premium' ? plans.find(p => p.key === f.plan)?.priceInr
    : f.product === 'institution_premium' ? settings.institutionPriceInr
      : f.product === 'featured_listing' ? settings.featuredPriceInr : settings.urgentPriceInr;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await adminPayments({ action: 'offline', ...f, amount: f.amount || suggested });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: 'Payment recorded, plan activated and receipt emailed.' }); setTimeout(onClose, 1200); }
    else setMsg({ ok: false, text: r.error || 'Could not record the payment.' });
  };

  return (
    <Dialog title="Record an offline payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <p className="text-xs text-slate-500">For money received outside Razorpay — bank transfer (NEFT/RTGS/IMPS), UPI to your account, cheque or cash. The plan is activated and the buyer gets an invoice and receipt.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">Buyer’s account email *
            <input required type="email" list="acx-buyers" value={f.email} onChange={set('email')} className={`${field} mt-1`} />
            <datalist id="acx-buyers">{users.filter(u => u.role !== 'super_admin').map(u => <option key={u.id} value={u.email}>{u.name}</option>)}</datalist>
            {f.email && <span className={`block mt-1 font-normal ${buyer ? 'text-slate-500' : 'text-crimson-700'}`}>{buyer ? `${buyer.name} · ${buyer.role.replace('_', ' ')}` : 'No account with this email yet.'}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700">What was bought *
            <select value={f.product} onChange={set('product')} className={`${field} mt-1`}>
              {(Object.keys(PRODUCT) as PaymentProduct[]).map(k => <option key={k} value={k}>{PRODUCT[k]}</option>)}
            </select>
          </label>
          {f.product === 'candidate_premium' && (
            <label className="block text-xs font-semibold text-slate-700">Plan
              <select value={f.plan} onChange={set('plan')} className={`${field} mt-1`}>{plans.map(p => <option key={p.key} value={p.key}>{p.label} — {p.months} months · ₹{p.priceInr}</option>)}</select>
            </label>
          )}
          {f.product === 'institution_premium' && (
            <label className="block text-xs font-semibold text-slate-700">Months
              <input type="number" min={1} max={60} value={f.months} onChange={set('months')} placeholder={String(settings.institutionDurationMonths)} className={`${field} mt-1`} />
            </label>
          )}
          {(f.product === 'featured_listing' || f.product === 'urgent_listing') && (
            <label className="block text-xs font-semibold text-slate-700">Vacancy *
              <select required value={f.jobId} onChange={set('jobId')} className={`${field} mt-1`}>
                <option value="">{buyer ? (buyerJobs.length ? 'Choose…' : 'No published vacancies') : 'Enter the buyer first'}</option>
                {buyerJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-semibold text-slate-700">Amount received (₹) *
            <input type="number" min={1} step="0.01" value={f.amount} onChange={set('amount')} placeholder={suggested ? String(suggested) : ''} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">Paid by
            <select value={f.method} onChange={set('method')} className={`${field} mt-1`}>
              <option value="bank_transfer">Bank transfer (NEFT/RTGS/IMPS)</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">UTR / cheque / reference no.
            <input value={f.reference} maxLength={80} onChange={set('reference')} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-slate-700">Date received
            <input type="date" value={f.paidOn} onChange={set('paidOn')} className={`${field} mt-1`} />
          </label>
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">Internal note
            <input value={f.note} maxLength={200} onChange={set('note')} className={`${field} mt-1`} placeholder="e.g. PO 4512 from the registrar" />
          </label>
        </div>
        <button disabled={busy || !buyer} className={btnPrimary}><Landmark className="w-4 h-4" /> {busy ? 'Saving…' : 'Record payment & activate'}</button>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-800' : 'text-crimson-700'}`} role="status">{msg.text}</p>}
      </form>
    </Dialog>
  );
}

export default function TransactionsLedger({ online }: { online: boolean }) {
  const payments = useStorageValue<Payment[]>(() => StorageService.getPayments(), []);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'all' | PaymentState>('all');
  const [product, setProduct] = useState<'all' | PaymentProduct>('all');
  const [source, setSource] = useState<'all' | 'razorpay' | 'offline'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return payments
      .filter(p => state === 'all' || paymentState(p) === state)
      .filter(p => product === 'all' || p.product === product)
      .filter(p => source === 'all' || (p.source || 'razorpay') === source)
      .filter(p => { const d = istDate(when(p)); return (!from || d >= from) && (!to || d <= to); })
      .filter(p => !needle || [p.userName, p.userEmail, p.instituteName, p.invoiceNumber, p.razorpayOrderId, p.razorpayPaymentId, p.jobTitle, p.methodDetail].some(v => v?.toLowerCase().includes(needle)))
      .sort((a, b) => when(b).localeCompare(when(a)));
  }, [payments, q, state, product, source, from, to]);

  const paid = rows.filter(p => p.status === 'paid');
  const gross = paid.reduce((a, p) => a + p.amount, 0);
  const refunded = paid.reduce((a, p) => a + (p.refundedAmount || 0), 0);
  const feeTotal = paid.reduce((a, p) => a + fees(p), 0);
  const pending = payments.filter(p => p.status === 'created').length;
  const selected = payments.find(p => p.id === open);

  const sync = async () => {
    setSyncing(true);
    const r = await adminPayments({ action: 'reconcile' });
    setSyncing(false);
    setSyncMsg(r.ok ? `Checked ${r.checked} unfinished order${r.checked === 1 ? '' : 's'}: ${r.paid} confirmed as paid, ${r.failed} closed.` : r.error || 'Could not reach Razorpay.');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        {[
          ['Collected', rs(gross), `${paid.length} paid`],
          ['Refunded', rs(refunded), `${paid.filter(p => p.refundedAmount).length} refunds`],
          ['Razorpay fees', rs(feeTotal), 'incl. GST'],
          ['Net received', rs(gross - refunded - feeTotal), 'collected − refunds − fees'],
          ['Unfinished orders', String(pending), 'checked every 10 min'],
        ].map(([l, v, s]) => (
          <div key={l} className="p-3 rounded-xl bg-ivory border border-slate-200"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold text-slate-900">{v}</div><div className="text-[11px] text-slate-500">{s}</div></div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        <div className="relative col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buyer, email, invoice or payment ID" aria-label="Search transactions" className={`${field} pl-9`} />
        </div>
        <select aria-label="Status" value={state} onChange={e => setState(e.target.value as typeof state)} className={field}>
          <option value="all">All statuses</option>{(Object.keys(PAYMENT_STATE_LABEL) as PaymentState[]).map(k => <option key={k} value={k}>{PAYMENT_STATE_LABEL[k]}</option>)}
        </select>
        <select aria-label="Product" value={product} onChange={e => setProduct(e.target.value as typeof product)} className={field}>
          <option value="all">All products</option>{(Object.keys(PRODUCT) as PaymentProduct[]).map(k => <option key={k} value={k}>{PRODUCT[k]}</option>)}
        </select>
        <select aria-label="Source" value={source} onChange={e => setSource(e.target.value as typeof source)} className={field}>
          <option value="all">Online + offline</option><option value="razorpay">Online (Razorpay)</option><option value="offline">Offline</option>
        </select>
        <input type="date" aria-label="From date" title="From" value={from} onChange={e => setFrom(e.target.value)} className={field} />
        <input type="date" aria-label="To date" title="To" value={to} onChange={e => setTo(e.target.value)} className={field} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{rows.length} transaction{rows.length === 1 ? '' : 's'}{rows.length !== payments.length ? ` of ${payments.length}` : ''}</span>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => downloadCsv(rows)} disabled={!rows.length}><Download className="w-4 h-4" /> Download CSV</button>
          {online && <button className={btn} onClick={sync} disabled={syncing}><RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Check with Razorpay</button>}
          <button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Record offline payment</button>
        </div>
      </div>
      {syncMsg && <p className="text-sm text-slate-600" role="status">{syncMsg}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">{payments.length ? 'No transactions match these filters.' : 'No transactions yet. Payments appear here as soon as a buyer starts a checkout.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Buyer</th><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map(p => (
                <tr key={p.id} className="hover:bg-ivory cursor-pointer" onClick={() => setOpen(p.id)}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{istDate(when(p))}</td>
                  <td className="px-4 py-2.5"><div className="font-medium text-slate-900">{p.userName}</div><div className="text-xs text-slate-500">{p.userEmail}</div></td>
                  <td className="px-4 py-2.5 text-slate-700">{PRODUCT[p.product]}<div className="text-xs text-slate-500 max-w-[16rem] truncate">{p.instituteName || p.jobTitle || ''}{p.testMode ? ' · test' : ''}</div></td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{p.methodDetail || (p.status === 'failed' ? <span className="text-crimson-700">{p.failureReason || 'Failed'}</span> : '—')}{p.source === 'offline' && <div className="text-[11px] text-slate-400">offline</div>}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap"><div className="font-semibold text-slate-900">{rs(p.amount)}</div>{p.refundedAmount ? <div className="text-xs text-gold-800">−{rs(p.refundedAmount)}</div> : null}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${PAYMENT_STATE_STYLE[paymentState(p)]}`}>{PAYMENT_STATE_LABEL[paymentState(p)]}</span></td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    {p.status === 'paid' && p.invoiceNumber
                      ? <Link href={`/invoice/${p.id}`} target="_blank" className="inline-flex items-center gap-1 text-brand-800 font-semibold hover:underline whitespace-nowrap"><FileText className="w-3.5 h-3.5" />{p.invoiceNumber}</Link>
                      : <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-800" onClick={() => setOpen(p.id)}><Receipt className="w-3.5 h-3.5" /> Details</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Click a row for its full history, Razorpay IDs and refunds. Every change is also written to the audit log.</p>

      {selected && <Details p={selected} online={online} onClose={() => setOpen(null)} />}
      {adding && <OfflineForm onClose={() => setAdding(false)} />}
    </div>
  );
}
