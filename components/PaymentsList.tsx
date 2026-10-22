'use client';

import React from 'react';
import Link from 'next/link';
import { Payment } from '@/types';
import { FileText } from 'lucide-react';

const PRODUCT: Record<Payment['product'], string> = {
  candidate_premium: 'Candidate Premium',
  institution_premium: 'Institution Premium',
  featured_listing: 'Featured vacancy',
  urgent_listing: 'Urgent hiring label',
};

const STATUS: Record<Payment['status'], string> = {
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  created: 'bg-slate-50 text-slate-600 border-slate-200',
  failed: 'bg-crimson-50 text-crimson-700 border-crimson-100',
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
                <div className="text-xs text-slate-500">{p.months} months{p.activeUntil ? ` · until ${p.activeUntil}` : ''}{p.testMode ? ' · test' : ''}</div>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{inr(p.amount)}</td>
              <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS[p.status]}`}>{p.status === 'created' ? 'not completed' : p.status}</span></td>
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
