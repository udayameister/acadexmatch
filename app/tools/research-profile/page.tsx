'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import ToolPage from '@/components/ToolPage';
import { cardCls, fieldCls } from '@/components/toolsUi';
import { parseOrcid } from '@/lib/orcid';

export default function ResearchProfileStart() {
  const router = useRouter();
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseOrcid(v);
    if (!id) { setErr('That is not a valid ORCID iD. It has 16 characters, like 0000-0002-1825-0097 (the last one can be X).'); return; }
    setErr(''); setBusy(true);
    router.push(`/tools/research-profile/${id}`);
  };
  return (
    <ToolPage slug="research-profile" title="Research profile from ORCID"
      intro={<>Enter your <strong>ORCID iD</strong> and get a profile card with your <strong>publications, citations, h-index, i10-index</strong> and citations per year — with its own link to put on your CV, e-mail signature, LinkedIn or faculty page.</>}
      notes={<>
        <p>Publications, name, biography, keywords and employment come from your <strong>public ORCID record</strong>. Citation counts come from <strong>OpenAlex</strong>, matched by DOI; the h-index (h papers with at least h citations each) and i10-index (papers with 10 or more citations) are computed from the works on your ORCID record only.</p>
        <p>So the numbers can be lower than Google Scholar (which also counts theses, preprints and web pages) and differ from Scopus or Web of Science. Works without a DOI on ORCID are listed but counted as uncited. To improve the card, add DOIs to your ORCID works (ORCID → Works → Add → Search &amp; link, or add by DOI) and set them to public.</p>
        <p>Nothing is stored about you; the profile is fetched when the link is opened and kept in a 12-hour cache.</p>
      </>}>
      <form onSubmit={go} className={`${cardCls} space-y-3`}>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="orcid">ORCID iD or ORCID link</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input id="orcid" className={`${fieldCls} font-mono`} placeholder="0000-0002-1825-0097 or https://orcid.org/0000-0002-1825-0097" value={v} onChange={e => setV(e.target.value)} autoComplete="off" />
          <button className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 shrink-0" disabled={busy || !v.trim()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Make my profile
          </button>
        </div>
        {err && <p className="text-sm text-rose-700">{err}</p>}
        <p className="text-xs text-slate-500">No ORCID iD yet? Register free at <a className="underline" href="https://orcid.org/register" target="_blank" rel="noopener noreferrer">orcid.org/register</a> — most journals, UGC-CARE listings and funding portals now ask for it.</p>
      </form>
    </ToolPage>
  );
}
