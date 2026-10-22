'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StorageService } from '@/lib/storage';
import { useStorageValue } from '@/lib/useAuth';
import { DOCUMENT_CATEGORIES, openDocument, useDocuments } from '@/lib/documents';
import VerifiedBadge from '@/components/VerifiedBadge';
import type { CandidateProfile, Institute, Job, User } from '@/types';
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, ShieldAlert } from 'lucide-react';

const PERSONAL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'rediffmail.com', 'icloud.com', 'protonmail.com', 'aol.com'];
const AISHE_RE = /^(U-\d{4}|C-\d{5}|S-\d{4})$/i;
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Gmail ignores dots and "+tags"; other providers ignore "+tags" only. */
export function normalizeEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  const base = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${base.replace(/\./g, '')}@gmail.com`;
  return `${base}@${domain}`;
}
const normPhone = (p?: string) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function hostOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
/** True when the e-mail domain is the website's domain or a sub-domain of it (or the other way round). */
function sameOrg(emailDomain: string, host: string): boolean {
  if (!emailDomain || !host) return true;
  return emailDomain === host || emailDomain.endsWith(`.${host}`) || host.endsWith(`.${emailDomain}`);
}

function Section({ title, count, hint, children }: { title: string; count: number; hint: string; children: React.ReactNode }) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? count > 0;
  const setOpen = (f: (o: boolean) => boolean) => setToggled(f(open));
  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm">
      <button className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <span className="font-semibold text-slate-900">{title}</span>
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${count ? 'bg-gold-50 text-gold-800 border border-gold-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}`}>{count ? `${count} to review` : 'All clear'}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-3"><p className="text-xs text-slate-500">{hint}</p>{children}</div>}
    </section>
  );
}

function DocsList({ userId }: { userId: string }) {
  const { docs, ready, error } = useDocuments(userId);
  if (!ready) return <p className="text-xs text-slate-500">Loading…</p>;
  if (error) return <p className="text-xs text-crimson-700">{error}</p>;
  const files = docs.filter(d => d.category !== 'photo');
  if (!files.length) return <p className="text-xs text-slate-500">No documents.</p>;
  return (
    <ul className="space-y-1">
      {files.map(d => (
        <li key={d.id} className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 w-40 shrink-0">{DOCUMENT_CATEGORIES.find(c => c.key === d.category)?.title}</span>
          <button className="text-brand-800 hover:underline inline-flex items-center gap-1 truncate" onClick={() => openDocument(d)}>{d.label} <ExternalLink className="w-3 h-3" /></button>
        </li>
      ))}
    </ul>
  );
}

export default function QualityPanel() {
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const profiles = useStorageValue<Record<string, CandidateProfile>>(() => StorageService.getProfilesMap(), {});
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const [docSummary, setDocSummary] = useState<Record<string, { count: number; categories: string[]; lastUploadedAt: string }> | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState<'pending' | 'verified' | 'all'>('pending');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/documents?summary=1', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null)).then(setDocSummary).catch(() => setDocSummary(null));
  }, []);

  const today = istToday();
  const week = daysAgo(7);

  const dupAccounts = useMemo(() => {
    const groups: { reason: string; users: User[] }[] = [];
    const byEmail = new Map<string, User[]>();
    for (const u of users) { const k = normalizeEmail(u.email); byEmail.set(k, [...(byEmail.get(k) || []), u]); }
    for (const [k, list] of byEmail) if (list.length > 1) groups.push({ reason: `Same mailbox (${k})`, users: list });
    const byPhone = new Map<string, User[]>();
    for (const u of users) {
      const ph = normPhone(profiles[u.id]?.phone);
      if (ph) byPhone.set(ph, [...(byPhone.get(ph) || []), u]);
    }
    for (const [k, list] of byPhone) if (list.length > 1) groups.push({ reason: `Same phone number (…${k.slice(-4)})`, users: list });
    return groups;
  }, [users, profiles]);

  const instIssues = useMemo(() => {
    const out: { inst: Institute; issues: string[] }[] = [];
    const aisheCount = new Map<string, number>();
    for (const i of institutes) { const a = (i.aisheCode || '').trim().toUpperCase(); if (a) aisheCount.set(a, (aisheCount.get(a) || 0) + 1); }
    for (const i of institutes) {
      const issues: string[] = [];
      const a = (i.aisheCode || '').trim().toUpperCase();
      if (!a) issues.push('No AISHE code');
      else if (!AISHE_RE.test(a)) issues.push(`AISHE code "${i.aisheCode}" is not in the U-0000 / C-00000 / S-0000 format`);
      else if ((aisheCount.get(a) || 0) > 1) issues.push(`AISHE code ${a} is used by ${aisheCount.get(a)} institutions`);
      const host = hostOf(i.website || '');
      const staff = users.filter(u => u.instituteId === i.id && u.role !== 'candidate' && u.role !== 'super_admin');
      for (const s of staff) {
        const dom = s.email.split('@')[1]?.toLowerCase() || '';
        if (PERSONAL_DOMAINS.includes(dom)) issues.push(`${s.name} uses a personal e-mail (${s.email})`);
        else if (host && !sameOrg(dom, host)) issues.push(`${s.name}'s e-mail domain (${dom}) differs from the website (${host})`);
      }
      if (i.verificationStatus === 'pending') {
        const first = staff.map(s => s.createdAt).filter(Boolean).sort()[0];
        if (first && first.slice(0, 10) <= week) issues.push(`Waiting for verification since ${first.slice(0, 10)}`);
      }
      if (issues.length) out.push({ inst: i, issues });
    }
    return out;
  }, [institutes, users, week]);

  const pastDeadline = jobs.filter(j => j.status === 'published' && j.applicationDeadline && j.applicationDeadline < today);
  const noDeadline = jobs.filter(j => j.status === 'published' && !j.applicationDeadline && !j.deadlineText);
  const dupJobs = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) {
      if (j.status === 'closed') continue;
      const k = `${j.instituteId}|${normTitle(j.title)}|${normTitle(j.department || '')}|${(j.advertisementNumber || '').trim().toLowerCase()}`;
      m.set(k, [...(m.get(k) || []), j]);
    }
    return [...m.values()].filter(l => l.length > 1);
  }, [jobs]);

  const candidatesWithDocs = useMemo(() => {
    if (!docSummary) return [];
    return Object.entries(docSummary)
      .map(([id, s]) => ({ id, s, p: profiles[id], u: users.find(u => u.id === id) }))
      .filter(r => r.u && r.u.role === 'candidate')
      .filter(r => docFilter === 'all' || (docFilter === 'pending' ? !r.p?.documentsVerified : !!r.p?.documentsVerified))
      .sort((a, b) => b.s.lastUploadedAt.localeCompare(a.s.lastUploadedAt));
  }, [docSummary, profiles, users, docFilter]);
  const pendingDocs = docSummary ? Object.keys(docSummary).filter(id => users.find(u => u.id === id)?.role === 'candidate' && !profiles[id]?.documentsVerified).length : 0;

  const verify = (userId: string, on: boolean) => {
    let note: string | undefined;
    if (on) { const n = prompt('Optional note (for example "Ph.D. and NET certificates checked"):', ''); if (n === null) return; note = n; }
    else if (!confirm('Remove the verified badge from this candidate?')) return;
    const r = StorageService.setCandidateVerification(userId, on, note);
    setMsg(r.success ? (on ? 'Marked as verified.' : 'Verification removed.') : r.error || 'Failed.');
  };

  const row = 'flex flex-wrap items-center justify-between gap-2 py-2 border-t border-slate-100 first:border-t-0 text-sm';
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-brand-700" /><h3 className="font-bold text-slate-900">Quality and fraud checks</h3></div>
      {msg && <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800" role="status">{msg}</p>}

      <Section title="Candidate document verification" count={pendingDocs} hint="Open each candidate's proofs, compare them with the profile, then mark the profile as verified. Verified candidates show a badge to institutions and in talent search.">
        <div className="flex gap-1 text-xs" role="tablist">
          {(['pending', 'verified', 'all'] as const).map(f => <button key={f} role="tab" aria-selected={docFilter === f} className={`${btn} ${docFilter === f ? 'bg-brand-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}`} onClick={() => setDocFilter(f)}>{f === 'pending' ? 'Not verified' : f === 'verified' ? 'Verified' : 'All'}</button>)}
        </div>
        {!docSummary ? <p className="text-xs text-slate-500">Loading…</p> : candidatesWithDocs.length === 0 ? <p className="text-sm text-slate-500">No candidates here.</p> : (
          <div>
            {candidatesWithDocs.map(({ id, s, p, u }) => (
              <div key={id} className="py-2 border-t border-slate-100 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button className="flex items-center gap-2 text-left" onClick={() => setExpanded(expanded === id ? null : id)} aria-expanded={expanded === id}>
                    {expanded === id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="font-medium text-slate-900">{u!.name}</span>
                    <span className="text-xs text-slate-500">{u!.email} · {s.count} file{s.count === 1 ? '' : 's'} · {s.categories.map(c => DOCUMENT_CATEGORIES.find(x => x.key === c)?.title.split(' ')[0]).join(', ')}</span>
                    <VerifiedBadge verified={p?.documentsVerified} compact />
                  </button>
                  {p?.documentsVerified
                    ? <button className={`${btn} bg-white border border-slate-200 text-slate-700`} onClick={() => verify(id, false)}>Remove verification</button>
                    : <button className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1`} onClick={() => verify(id, true)} disabled={!p}><BadgeCheck className="w-3.5 h-3.5" /> Mark verified</button>}
                </div>
                {expanded === id && (
                  <div className="mt-2 ml-6 p-3 rounded-xl bg-cream border border-slate-100 space-y-2">
                    {p && <p className="text-xs text-slate-600">Profile: {p.highestDegree || 'degree not given'} · Ph.D. {p.phdStatus?.isCompleted ? `yes${p.phdStatus.institute ? ` (${p.phdStatus.institute})` : ''}` : 'no'} · NET/SET {p.netSletStatus?.isQualified ? p.netSletStatus.examType || 'yes' : 'no'} · {p.experience?.length || 0} experience entries</p>}
                    <DocsList userId={id} />
                    {p?.documentsVerified?.note && <p className="text-xs text-slate-500">Note: {p.documentsVerified.note}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Possible duplicate accounts" count={dupAccounts.length} hint="Accounts that share a mailbox (Gmail ignores dots and +tags) or a phone number. Check before removing — family members can share a phone.">
        {dupAccounts.length === 0 ? <p className="text-sm text-slate-500">None found.</p> : dupAccounts.map(g => (
          <div key={g.reason} className="p-3 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-gold-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {g.reason}</p>
            {g.users.map(u => (
              <div key={u.id} className={row}>
                <span><span className="font-medium text-slate-900">{u.name}</span> <span className="text-xs text-slate-500">{u.email} · {u.role.replace('_', ' ')} · joined {u.createdAt?.slice(0, 10)}</span></span>
                {u.role !== 'super_admin' && <button className={`${btn} bg-white border border-crimson-100 text-crimson-700`} onClick={() => { if (confirm(`Delete the account ${u.email}? This cannot be undone.`)) { const r = StorageService.adminDeleteUser(u.id); setMsg(r.success ? 'Account deleted.' : r.error || 'Failed.'); } }}>Delete account</button>}
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Institution checks" count={instIssues.length} hint="AISHE code format and duplicates, staff e-mail domains compared with the institution website, and verifications waiting more than 7 days.">
        {instIssues.length === 0 ? <p className="text-sm text-slate-500">None found.</p> : instIssues.map(({ inst, issues }) => (
          <div key={inst.id} className="p-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900 text-sm">{inst.name} <span className="text-xs text-slate-500">({inst.verificationStatus})</span></span>
              {inst.verificationStatus === 'pending' && (
                <span className="flex gap-1">
                  <button className={`${btn} bg-emerald-600 text-white`} onClick={() => { StorageService.updateInstituteVerification(inst.id, 'verified'); setMsg(`${inst.name} verified.`); }}>Verify</button>
                  <button className={`${btn} bg-white border border-crimson-100 text-crimson-700`} onClick={() => { if (confirm(`Reject ${inst.name}?`)) { StorageService.updateInstituteVerification(inst.id, 'rejected'); setMsg(`${inst.name} rejected.`); } }}>Reject</button>
                </span>
              )}
            </div>
            <ul className="mt-1 list-disc ml-5 text-xs text-slate-700 space-y-0.5">{issues.map(x => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </Section>

      <Section title="Vacancy checks" count={pastDeadline.length + dupJobs.length + noDeadline.length} hint="Published vacancies past their last date, likely duplicates (same institution, title, department and advertisement number) and published vacancies with no deadline at all.">
        {pastDeadline.length > 0 && (
          <div>
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">Past the last date but still open ({pastDeadline.length})</p>
              <button className={`${btn} bg-brand-900 text-white`} onClick={() => { pastDeadline.forEach(j => StorageService.setJobStatus(j.id, 'closed')); setMsg(`${pastDeadline.length} vacancies closed.`); }}>Close all</button></div>
            {pastDeadline.map(j => <div key={j.id} className={row}><span><a href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:underline">{j.title}</a> <span className="text-xs text-slate-500">{j.instituteName} · last date {j.applicationDeadline}</span></span><button className={`${btn} bg-white border border-slate-200`} onClick={() => StorageService.setJobStatus(j.id, 'closed')}>Close</button></div>)}
          </div>
        )}
        {dupJobs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">Possible duplicates ({dupJobs.length} groups)</p>
            {dupJobs.map(g => (
              <div key={g[0].id} className="p-3 mt-2 rounded-xl border border-slate-200">
                {g.map((j, i) => <div key={j.id} className={row}><span><a href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:underline">{j.title}</a> <span className="text-xs text-slate-500">{j.instituteName} · {j.status} · posted {String(j.postedAt).slice(0, 10)}</span></span>{i > 0 && <button className={`${btn} bg-white border border-crimson-100 text-crimson-700`} onClick={() => { if (confirm('Delete this duplicate vacancy?')) StorageService.deleteJob(j.id); }}>Delete duplicate</button>}</div>)}
              </div>
            ))}
          </div>
        )}
        {noDeadline.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">Published without any last date ({noDeadline.length})</p>
            {noDeadline.map(j => <div key={j.id} className={row}><a href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:underline">{j.title}</a><span className="text-xs text-slate-500">{j.instituteName}</span></div>)}
          </div>
        )}
        {pastDeadline.length + dupJobs.length + noDeadline.length === 0 && <p className="text-sm text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> None found.</p>}
      </Section>
    </div>
  );
}
