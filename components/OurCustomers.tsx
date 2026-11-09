'use client';

import React, { useEffect, useState } from 'react';

interface PublicCustomer { id: string; name: string; website?: string; logoUrl: string }

/** Home-page "Our Customers" logo wall, managed by the admin under Admin console → Customers. */
export default function OurCustomers() {
  const [customers, setCustomers] = useState<PublicCustomer[] | null>(null);

  useEffect(() => {
    fetch('/api/customers', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  if (!customers || customers.length === 0) return null;

  return (
    <section id="customers" aria-labelledby="customers-title" className="scroll-mt-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Trusted by institutions<span className="gold-rule rotate-180" /></p>
          <h2 id="customers-title" className="text-3xl sm:text-4xl font-bold text-brand-800 mt-2">Our Customers</h2>
          <p className="text-slate-600 mt-3">Universities and colleges that recruit their faculty with AcadeXMatch.</p>
        </div>
        <ul className="mt-10 flex flex-wrap justify-center gap-4">
          {customers.map(c => {
            const card = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logoUrl} alt={`${c.name} logo`} loading="lazy" className="max-h-16 max-w-full object-contain grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition duration-300" />
                <span className="mt-3 text-xs font-medium text-slate-600 group-hover:text-brand-900 text-center line-clamp-2">{c.name}</span>
              </>
            );
            const cls = 'group h-full min-h-[9rem] flex flex-col items-center justify-center p-5 rounded-2xl bg-ivory border border-slate-200 hover:border-gold-300 hover:shadow-md hover:shadow-brand-900/5 transition';
            return (
              <li key={c.id} className="w-[calc(50%-0.5rem)] sm:w-48">
                {c.website
                  ? <a href={c.website} target="_blank" rel="noopener noreferrer" className={cls} title={c.name}>{card}</a>
                  : <div className={cls} title={c.name}>{card}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
