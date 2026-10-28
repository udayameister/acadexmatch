'use client';

import React, { useState } from 'react';
import { StorageService, DEFAULT_PROMOTION, isJobFeatured, isJobUrgent } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import PayButton, { useOnlinePayment } from '@/components/PayButton';
import type { Job, PlanSettings } from '@/types';
import { Flame, Megaphone, Star, X } from 'lucide-react';

/** "Featured" and "Urgent hiring" labels for a vacancy (paid promotion or the admin's editorial pick). */
export function PromotionBadges({ job }: { job: Job }) {
  const featured = job.featured || isJobFeatured(job);
  const urgent = isJobUrgent(job);
  if (!featured && !urgent) return null;
  return (
    <>
      {featured && <span className="text-xs font-bold bg-gold-50 text-gold-800 px-2.5 py-1 rounded-lg border border-gold-300 inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-gold-400 text-gold-500" aria-hidden="true" />Featured</span>}
      {urgent && <span className="text-xs font-bold bg-crimson-50 text-crimson-700 px-2.5 py-1 rounded-lg border border-crimson-100 inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5" aria-hidden="true" />Urgent hiring</span>}
    </>
  );
}

/** Sort order for listings: featured first, then urgent, otherwise unchanged. */
export function promotionRank(job: Job): number {
  return (job.featured || isJobFeatured(job) ? 2 : 0) + (isJobUrgent(job) ? 1 : 0);
}

/** Institution staff: buy a Featured placement or an Urgent hiring label for a published vacancy. */
export function PromoteButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const s = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const online = useOnlinePayment();
  if (job.status !== 'published') return null;
  const opts = [
    { product: 'featured_listing' as const, title: 'Featured vacancy', icon: Star, price: s.featuredPriceInr ?? DEFAULT_PROMOTION.featuredPriceInr, days: s.featuredDays ?? DEFAULT_PROMOTION.featuredDays, until: job.featuredUntil, active: isJobFeatured(job), text: 'Shown at the top of the vacancy list and on the home page, with a gold Featured label.' },
    { product: 'urgent_listing' as const, title: 'Urgent hiring label', icon: Flame, price: s.urgentPriceInr ?? DEFAULT_PROMOTION.urgentPriceInr, days: s.urgentDays ?? DEFAULT_PROMOTION.urgentDays, until: job.urgentUntil, active: isJobUrgent(job), text: 'A red “Urgent hiring” label that tells candidates you are filling the post quickly.' },
  ];
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-gold-800 hover:text-gold-900 font-semibold"><Megaphone className="w-3.5 h-3.5" /> Promote</button>
      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Promote ${job.title}`} onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Promote “{job.title}”</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              {opts.map(o => (
                <div key={o.product} className="p-4 rounded-2xl border border-slate-200 flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900"><o.icon className="w-4 h-4 text-gold-600" />{o.title}</div>
                  <div className="text-2xl font-bold text-brand-900 tabular-nums">₹{o.price.toLocaleString('en-IN')}<span className="text-sm font-normal text-slate-500"> / {o.days} days</span></div>
                  <p className="text-xs text-slate-600 flex-1">{o.text}</p>
                  {o.active && <p className="text-xs text-emerald-800">Running until {o.until}. Buying again adds {o.days} days.</p>}
                  {online === null ? <div className="h-10" /> : online.configured
                    ? <PayButton product={o.product} jobId={job.id} label={`Pay ₹${o.price.toLocaleString('en-IN')}`} description={`${o.title} — ${job.title}`} />
                    : <p className="text-xs text-slate-600 bg-cream rounded-lg p-2">Online payment is not set up yet. Write to the AcadeXMatch team and they will activate it for you after payment.</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Admin: switch promotions on or off without payment. */
export function AdminPromotionControls({ job, onDone }: { job: Job; onDone: (m: string) => void }) {
  const set = (kind: 'featured' | 'urgent', on: boolean) => {
    const days = on ? Number(prompt(`Number of days for the ${kind === 'featured' ? 'Featured placement' : 'Urgent hiring label'}:`, kind === 'featured' ? '30' : '14')) : 0;
    if (on && !(days > 0)) return;
    const r = StorageService.setJobPromotion(job.id, kind, days);
    onDone(r.success ? (on ? `${kind === 'featured' ? 'Featured' : 'Urgent'} until ${days} days from today.` : 'Promotion removed.') : r.error || 'Failed.');
  };
  const btn = 'p-2 rounded-lg border border-slate-200 hover:bg-slate-50';
  return (
    <button className={btn} title={isJobUrgent(job) ? `Urgent until ${job.urgentUntil} — click to remove` : 'Add Urgent hiring label'} aria-label={isJobUrgent(job) ? 'Remove urgent label' : 'Add urgent label'} onClick={() => set('urgent', !isJobUrgent(job))}>
      <Flame className={`w-4 h-4 ${isJobUrgent(job) ? 'text-crimson-700' : ''}`} />
    </button>
  );
}
