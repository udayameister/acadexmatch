import React from 'react';
import { ExternalLink } from 'lucide-react';
import { listAdvisors, publicAdvisor, type PublicAdvisor } from '@/lib/server/advisory';

const initials = (n: string) => n.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

/** About page: the advisory board (server-rendered; shown only when the administrator has added members). */
export default async function AdvisoryBoard() {
  let members: PublicAdvisor[] = [];
  try { members = (await listAdvisors()).filter(a => a.visible).map(publicAdvisor); } catch { members = []; }
  if (!members.length) return null;
  return (
    <section id="advisory-board" className="max-w-6xl mx-auto px-4 sm:px-8 pb-16 scroll-mt-24" aria-labelledby="advisory-heading">
      <p className="text-sm font-semibold text-brand-700 inline-flex items-center gap-3"><span className="gold-rule" />Guidance</p>
      <h2 id="advisory-heading" className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-2">Advisory board</h2>
      <p className="text-slate-600 mt-2 max-w-3xl">Academics and leaders who guide AcadeXMatch on fair, regulation-aware faculty recruitment.</p>
      <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map(m => (
          <li key={m.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center gap-4">
              {m.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.photoUrl} alt={`Photo of ${m.name}`} width={64} height={64} loading="lazy" className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0" />
                : <span aria-hidden="true" className="w-16 h-16 rounded-full bg-brand-50 text-brand-800 border border-brand-100 grid place-items-center font-serif text-xl font-bold shrink-0">{initials(m.name)}</span>}
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 break-words">{m.name}</h3>
                <p className="text-xs font-semibold text-gold-800 uppercase tracking-wide mt-0.5">{m.boardRole}</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mt-3 break-words">{[m.designation, m.organization].filter(Boolean).join(', ')}</p>
            {m.bio && <p className="text-sm text-slate-600 mt-2 leading-relaxed break-words">{m.bio}</p>}
            {m.profileUrl && <a href={m.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-auto pt-3 text-sm font-semibold text-brand-800 hover:underline inline-flex items-center gap-1">Profile <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">of {m.name} (opens in a new tab)</span></a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
