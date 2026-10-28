'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useCurrentUser, useStorageValue } from '@/lib/useAuth';
import { useProfilePhoto } from '@/lib/documents';
import type { CandidateProfile, PublicationItem } from '@/types';
import { Printer, Mail, Phone, MapPin, Link2, ArrowLeft } from 'lucide-react';

const PUB_ORDER: PublicationItem['type'][] = ['Journal', 'Conference', 'Book Chapter', 'Patent'];
const PUB_HEAD: Record<PublicationItem['type'], string> = { Journal: 'Journal articles', Conference: 'Conference papers', 'Book Chapter': 'Books and book chapters', Patent: 'Patents' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand-800 border-b-2 border-gold-400 pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function indexing(p: PublicationItem): string {
  return [p.ugcCareListed && 'UGC-CARE', p.scopusIndexed && 'Scopus', p.sciScieIndexed && 'SCI/SCIE', p.impactFactor ? `IF ${p.impactFactor}` : '', p.citationsCount ? `${p.citationsCount} citations` : ''].filter(Boolean).join(' · ');
}

export default function CvPage() {
  const { user } = useCurrentUser();
  const profile = useStorageValue<CandidateProfile | null>(() => StorageService.getCandidateProfile(), null);
  const photo = useProfilePhoto(user?.id);
  const [opts, setOpts] = useState({ photo: true, contact: true, api: true, philosophy: false });
  if (!user || !profile) return null;
  const p = profile;
  const edu = [...p.education].sort((a, b) => (b.year || 0) - (a.year || 0));
  const exp = [...p.experience].sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0) || String(b.startDate).localeCompare(String(a.startDate)));
  const pubs = [...p.publications].sort((a, b) => (b.year || 0) - (a.year || 0));
  const links = Object.entries(p.scholarLinks || {}).filter(([, v]) => v) as [string, string][];
  const linkName: Record<string, string> = { googleScholar: 'Google Scholar', orcid: 'ORCID', scopusId: 'Scopus ID', researchGate: 'ResearchGate' };
  const empty = edu.length === 0 && exp.length === 0 && pubs.length === 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 py-8 print:p-0 print:max-w-none">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <Link href="/candidate/profile" className="text-xs font-semibold text-brand-700 hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Edit profile</Link>
          <h1 className="text-2xl font-bold text-brand-800 mt-1">Academic CV</h1>
          <p className="text-xs text-slate-500">Made from your AcadeXMatch profile. Choose “Save as PDF” in the print window to download it.</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold shrink-0"><Printer className="w-4 h-4" /> Print / Save as PDF</button>
      </div>
      <div className="no-print flex flex-wrap gap-4 text-xs text-slate-700 mb-5 p-3 rounded-xl bg-white border border-slate-200">
        {([['photo', 'Photo'], ['contact', 'Phone and email'], ['api', 'API score'], ['philosophy', 'Teaching philosophy']] as [keyof typeof opts, string][]).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={opts[k]} onChange={e => setOpts({ ...opts, [k]: e.target.checked })} /> {l}</label>
        ))}
      </div>
      {empty && <p className="no-print mb-4 p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900">Your profile has no education, experience or publications yet. <Link href="/candidate/profile" className="underline font-semibold">Add them</Link> to build a complete CV.</p>}

      <article className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-10 print:border-0 print:shadow-none print:rounded-none print:p-0 text-[13px] leading-relaxed text-slate-800 space-y-6">
        <div className="flex items-start gap-5">
          {opts.photo && photo && <img src={photo} alt="" className="w-24 h-28 object-cover rounded-lg border border-slate-200 shrink-0" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold text-brand-900 leading-tight">{p.name}</h1>
            {(p.currentDesignation || p.currentInstitute) && <div className="text-[14px] text-slate-700 mt-0.5">{[p.currentDesignation, p.currentInstitute].filter(Boolean).join(', ')}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-slate-600">
              {opts.contact && p.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{p.email}</span>}
              {opts.contact && p.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{p.phone}</span>}
              {(p.location?.city || p.location?.state) && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[p.location.city, p.location.state].filter(Boolean).join(', ')}</span>}
            </div>
            {links.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[12px] text-slate-600">{links.map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />{linkName[k] || k}: {v}</span>)}</div>}
          </div>
        </div>

        {p.bio && <Section title="Profile"><p>{p.bio}</p></Section>}

        {(p.phdStatus?.isCompleted || p.netSletStatus?.isQualified || (opts.api && p.apiScore > 0) || pubs.length > 0) && (
          <Section title="Eligibility at a glance">
            <ul className="grid sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-1">
              {p.phdStatus?.isCompleted && <li><strong>Ph.D.</strong>{p.phdStatus.institute ? `, ${p.phdStatus.institute}` : ''}{p.phdStatus.graduationYear ? ` (${p.phdStatus.graduationYear})` : ''}{p.phdStatus.isUgc2009_2016Compliant ? ' — UGC 2009/2016 Regulations compliant' : ''}</li>}
              {p.netSletStatus?.isQualified && <li><strong>{p.netSletStatus.examType || 'NET/SLET'}</strong>{p.netSletStatus.subject ? ` in ${p.netSletStatus.subject}` : ''}{p.netSletStatus.qualifiedYear ? ` (${p.netSletStatus.qualifiedYear})` : ''}</li>}
              {opts.api && p.apiScore > 0 && <li><strong>Academic Performance Indicator (API):</strong> {p.apiScore}</li>}
              {pubs.length > 0 && <li><strong>Publications:</strong> {pubs.length} ({pubs.filter(x => x.ugcCareListed).length} UGC-CARE, {pubs.filter(x => x.scopusIndexed).length} Scopus)</li>}
            </ul>
            {p.phdStatus?.thesisTitle && <p className="mt-1.5"><span className="text-slate-500">Thesis:</span> <em>{p.phdStatus.thesisTitle}</em>{p.phdStatus.supervisorName ? ` (supervisor: ${p.phdStatus.supervisorName})` : ''}</p>}
          </Section>
        )}

        {edu.length > 0 && (
          <Section title="Education">
            <table className="w-full"><tbody>
              {edu.map(e => (
                <tr key={e.id} className="align-top">
                  <td className="w-16 py-1 text-slate-500 tabular-nums">{e.year || ''}</td>
                  <td className="py-1"><strong>{e.degree}</strong>{e.field ? `, ${e.field}` : ''} — {e.institute}{e.gradePercentage ? ` · ${e.gradePercentage}` : ''}{e.distinctionOrRank ? ` · ${e.distinctionOrRank}` : ''}</td>
                </tr>
              ))}
            </tbody></table>
          </Section>
        )}

        {exp.length > 0 && (
          <Section title="Experience">
            <div className="space-y-2.5">
              {exp.map(x => (
                <div key={x.id} className="break-inside-avoid">
                  <div className="flex flex-wrap justify-between gap-x-4"><span><strong>{x.designation}</strong>{x.department ? `, ${x.department}` : ''} — {x.instituteOrCompany}</span><span className="text-slate-500 tabular-nums whitespace-nowrap">{x.startDate} – {x.isCurrent ? 'Present' : x.endDate}</span></div>
                  <div className="text-[12px] text-slate-500">{x.type}</div>
                  {x.keyAccomplishments && <p className="text-[12.5px] mt-0.5">{x.keyAccomplishments}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {p.researchInterests.length > 0 && <Section title="Research interests"><p>{p.researchInterests.join(' · ')}</p></Section>}

        {pubs.length > 0 && (
          <Section title="Publications">
            <div className="space-y-3">
              {PUB_ORDER.filter(t => pubs.some(x => x.type === t)).map(t => (
                <div key={t}>
                  <h3 className="font-semibold text-slate-900 mb-1">{PUB_HEAD[t]}</h3>
                  <ol className="list-decimal pl-5 space-y-1">
                    {pubs.filter(x => x.type === t).map(x => (
                      <li key={x.id} className="break-inside-avoid">
                        {x.authors ? `${x.authors}. ` : ''}<strong>{x.title}</strong>. <em>{x.journalOrConference}</em>{x.year ? `, ${x.year}` : ''}.{x.doi ? ` DOI: ${x.doi}.` : ''}
                        {indexing(x) && <span className="text-[11.5px] text-slate-500"> [{indexing(x)}]</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Section>
        )}

        {p.skills.length > 0 && <Section title="Skills"><p>{p.skills.join(' · ')}</p></Section>}
        {opts.philosophy && p.teachingPhilosophy && <Section title="Teaching philosophy"><p className="whitespace-pre-line">{p.teachingPhilosophy}</p></Section>}

        <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 flex justify-between gap-4">
          <span>I declare that the information above is true to the best of my knowledge.</span>
          <span>{new Date().toLocaleDateString('en-IN')}</span>
        </div>
      </article>
    </div>
  );
}
