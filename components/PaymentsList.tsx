'use client';

import React from 'react';
import Link from 'next/link';
import { Payment } from '@/types';
import { FileText } from 'lucide-react';
import { paymentState, PAYMENT_STATE_LABEL, PAYMENT_STATE_STYLE } from '@/lib/paymentLabel';

const PRODUCT: Record<Payment['product'], string> = {
  candidate_premium: 'Candidate Premium',
  institution_premium: 'Institution Premium',
  featured_listing: 'Featured vacancy',
  urgent_listing: 'Urgent hiring label',
};


export function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Table of payments with invoice links. `showPayer` adds the payer column (admin view). */
export default function PaymentsList({ payments, showPayer = false, emptyText = 'No payments yet.' }: { payments: Payment[]; showPayer?: boolean; emptyText?: string }) {
  const rows = [...payments].sort((a, b) => (b.paidAt || b.createdAt).localeCompare(a.paidAt || a.createdAt));
  if (rows.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            {showPayer && <th className="px-4 py-2.5">Paid by</th>}
            <th className="px-4 py-2.5">Plan</th>
            <th className="px-4 py-2.5 text-right">Amount</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Invoice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(p => (
            <tr key={p.id}>
              <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{(p.paidAt || p.createdAt).slice(0, 10)}</td>
              {showPayer && <td className="px-4 py-2.5"><div className="font-medium text-slate-900">{p.userName}</div><div className="text-xs text-slate-500">{p.userEmail}</div></td>}
              <td className="px-4 py-2.5 text-slate-700">
                {PRODUCT[p.product]}{p.instituteName ? ` · ${p.instituteName}` : ''}
                <div className="text-xs text-slate-500">{p.days ? `${p.days} days` : `${p.months} months`}{p.activeUntil ? ` · until ${p.activeUntil}` : ''}{p.methodDetail ? ` · ${p.methodDetail}` : ''}{p.testMode ? ' · test' : ''}</div>
                {p.status === 'failed' && p.failureReason && <div className="text-xs text-crimson-700">{p.failureReason}</div>}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{inr(p.amount)}{p.refundedAmount ? <div className="text-xs font-normal text-gold-800">−{inr(p.refundedAmount)} refunded</div> : null}</td>
              <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${PAYMENT_STATE_STYLE[paymentState(p)]}`}>{PAYMENT_STATE_LABEL[paymentState(p)]}</span></td>
              <td className="px-4 py-2.5">
                {p.status === 'paid' && p.invoiceNumber
                  ? <Link href={`/invoice/${p.id}`} target="_blank" className="inline-flex items-center gap-1 text-brand-800 font-semibold hover:underline"><FileText className="w-3.5 h-3.5" />{p.invoiceNumber}</Link>
                  : <span className="text-slate-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
