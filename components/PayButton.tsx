'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import { hydrate } from '@/lib/clientSync';
import type { PaymentProduct } from '@/types';

interface RazorpayOptions {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  prefill?: { name?: string; email?: string }; theme?: { color?: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
declare global { interface Window { Razorpay?: new (o: RazorpayOptions) => { open(): void; on(e: string, cb: (r: unknown) => void): void } } }

let scriptPromise: Promise<boolean> | null = null;
function loadCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  scriptPromise ||= new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/** Is online payment available? (null while checking) */
export function useOnlinePayment(): { configured: boolean; testMode: boolean; webhook: boolean } | null {
  const [state, setState] = useState<{ configured: boolean; testMode: boolean; webhook: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/payments/order', { cache: 'no-store' }).then(r => r.json()).then(d => setState({ configured: !!d.configured, testMode: !!d.testMode, webhook: !!d.webhook })).catch(() => setState({ configured: false, testMode: false, webhook: false }));
  }, []);
  return state;
}

/** Pays through Razorpay checkout and activates the plan when the server has verified the payment. */
export default function PayButton({ product, label, description, className = '', plan, jobId, onPaid }: { product: PaymentProduct; label: string; description: string; className?: string; plan?: string; jobId?: string; onPaid?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pay = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/payments/order', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, plan, jobId }) });
      const order = await r.json();
      if (!r.ok) throw new Error(order.error || 'Could not start the payment.');
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error('Could not load Razorpay checkout. Check your internet connection and try again.');
      const rzp = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
        name: 'AcadeXMatch', description,
        prefill: { name: order.name, email: order.email },
        theme: { color: '#800000' },
        handler: async resp => {
          setMsg({ ok: true, text: 'Payment received. Confirming…' });
          const v = await fetch('/api/payments/verify', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resp) });
          const d = await v.json().catch(() => ({}));
          if (v.ok && d.ok) {
            await hydrate();
            onPaid?.();
            setMsg({ ok: true, text: `Payment confirmed — active until ${d.payment?.activeUntil}. A receipt has been emailed to you.` });
          } else {
            setMsg({ ok: false, text: d.error || 'We could not confirm the payment yet. If money was deducted it will be confirmed automatically.' });
          }
          setBusy(false);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on('payment.failed', () => { setMsg({ ok: false, text: 'The payment failed or was declined. No money was taken; please try again.' }); setBusy(false); });
      rzp.open();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={pay} disabled={busy} className={`w-full inline-flex justify-center items-center gap-2 px-5 py-3 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm shadow-sm disabled:opacity-60 ${className}`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} {label}
      </button>
      {msg && <p className={`text-sm flex items-start gap-1.5 ${msg.ok ? 'text-emerald-800' : 'text-crimson-700'}`} role="status">{msg.ok && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}{msg.text}</p>}
      <p className="text-[11px] text-slate-500 text-center">Secure payment by Razorpay — UPI, cards, net banking and wallets.</p>
    </div>
  );
}
