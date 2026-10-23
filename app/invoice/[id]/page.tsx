'use client';

import { productLabel } from '@/lib/paymentLabel';
import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { BrandLogo } from '@/components/Navbar';
import { Printer } from 'lucide-react';
import type { Payment, PlanSettings } from '@/types';
import { CONTACT_EMAIL } from '@/lib/contact';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Printable invoice for a paid order (visible to the payer and the admin). */
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const payments = useStorageValue<Payment[]>(() => StorageService.getPayments(), []);
  const s = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const p = payments.find(x => x.id === id);

  if (!p || p.status !== 'paid') {
    return <div className="max-w-xl mx-auto px-4 py-20 text-center text-sm text-slate-600">Invoice not found. <Link href="/account" className="underline font-semibold text-brand-800">My account</Link></div>;
  }
  const gst = s.invoiceGstin && s.gstPercent ? s.gstPercent : 0;
  const taxable = gst ? p.amount / (1 + gst / 100) : p.amount;
  const tax = p.amount - taxable;
  const item = productLabel(p);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 print:py-0">
      <div className="flex justify-end mb-4 print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-900 text-white text-sm font-semibold"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm print:shadow-none print:border-0 space-y-8 text-sm text-slate-700">
        <div className="flex flex-col sm:flex-row justify-between gap-6">
          <div className="space-y-2">
            <BrandLogo />
            <div className="text-xs text-slate-500 whitespace-pre-line">{s.invoiceBusinessName}{s.invoiceAddress ? `\n${s.invoiceAddress}` : ''}{s.invoiceGstin ? `\nGSTIN: ${s.invoiceGstin}` : ''}{`\n${CONTACT_EMAIL}`}</div>
          </div>
          <div className="sm:text-right">
            <h1 className="text-2xl font-bold text-brand-800">{gst ? 'Tax Invoice' : 'Invoice'}</h1>
            <div>No. <strong>{p.invoiceNumber}</strong></div>
            <div>Date {new Date(p.paidAt!).toLocaleDateString('en-IN')}</div>
            {p.testMode && <div className="mt-1 text-xs font-semibold text-crimson-700">TEST MODE — not a real payment</div>}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Billed to</div>
          <div className="font-semibold text-slate-900">{p.userName}</div>
          <div>{p.userEmail}</div>
          {p.instituteName && <div>{p.instituteName}</div>}
        </div>
        <table className="w-full">
          <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200"><tr><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-3">{item}<div className="text-xs text-slate-500">Valid until {p.activeUntil}</div></td><td className="py-3 text-right">{inr(taxable)}</td></tr>
            {gst > 0 && <tr><td className="py-2 text-right text-slate-500">GST @ {gst}%</td><td className="py-2 text-right">{inr(tax)}</td></tr>}
            <tr className="font-bold text-slate-900"><td className="py-3 text-right">Total paid</td><td className="py-3 text-right">{inr(p.amount)}</td></tr>
          </tbody>
        </table>
        <div className="text-xs text-slate-500 space-y-1">
          <div>Paid online via Razorpay · Payment ID {p.razorpayPaymentId} · Order {p.razorpayOrderId}</div>
          <div>This is a computer-generated invoice and does not need a signature.</div>
        </div>
      </div>
    </div>
  );
}
