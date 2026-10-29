'use client';

import { AdminPromotionControls } from '@/components/Promotions';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSelection, RowCheck, BulkBar, type Selection } from '@/components/Selection';
import { StorageService, isDeadlinePassed, isPremiumUser, isInstituteSubscribed, expiredOpenJobs, DEFAULT_PREMIUM_PLANS, DEFAULT_PROMOTION, isJobFeatured, isJobUrgent, INSTITUTION_CATEGORIES, categoryPricesOf } from '@/lib/storage';
import { PlanPill } from '@/components/Premium';
import { useStorageValue, useCurrentUser } from '@/lib/useAuth';
import { useVisitStats } from '@/components/VisitCounter';
import { CandidateAvatar, DocumentList } from '@/components/CandidateDocuments';
import { useDocuments, deleteDocument, readLegacyBrowserDocuments, uploadDocumentFor } from '@/lib/documents';
import { hydrate, hasLegacyBrowserData, importLegacyBrowserData } from '@/lib/clientSync';
import {
  Application, ApplicationStage, DesignationType, Institute, InstitutionType, Job, ReservationCategory, User, UserRole,
  PlanSettings, UpgradeRequest, Payment,
  PremiumPlanOption,
  InstitutionCategoryPrices,
} from '@/types';
import TransactionsLedger from '@/components/TransactionsLedger';
import { useOnlinePayment } from '@/components/PayButton';
import {
  Plus, Pencil, Trash2, KeyRound, Search, X, ExternalLink, Download, Upload, RotateCcw, Eye, Star, AlertTriangle, FileCheck2,
  Crown, Check,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────── shared bits

export const ROLE_LABEL: Record<UserRole, string> = {
  candidate: 'Candidate',
  institute_admin: 'Institute admin',
  recruiter: 'Recruiter',
  super_admin: 'Platform admin',
};

const INSTITUTION_TYPES: InstitutionType[] = [
  'IIT / NIT / IISc / IIIT (Institute of National Importance)',
  'Central University (Govt. of India)',
  'State Public University',
  'Deemed-to-be University',
  'Premier Private University',
  'Autonomous Engineering College',
];

const NAAC_GRADES: Institute['accreditation']['naacGrade'][] = ['A++', 'A+', 'A', 'B++', 'Under Review'];

const DESIGNATIONS: DesignationType[] = [
  'Assistant Professor (Level 10 - 7th CPC)',
  'Assistant Professor (Level 11 - 7th CPC)',
  'Assistant Professor (Level 12 - 7th CPC)',
  'Associate Professor (Level 13A - 7th CPC)',
  'Professor (Level 14 - 7th CPC)',
  'Senior Professor (Level 15 - 7th CPC)',
  'Chair Professor / Eminent Scholar',
  'Postdoctoral Research Fellow',
  'Professor of Practice (Industry Track)',
  'Dean / Director / Head of School',
];

const RESERVATIONS: ReservationCategory[] = [
  'Open to All Categories',
  'Unreserved (UR / General)',
  'OBC - Non Creamy Layer',
  'Scheduled Caste (SC)',
  'Scheduled Tribe (ST)',
  'Economically Weaker Section (EWS)',
  'Persons with Benchmark Disabilities (PwD)',
];

const PAY_LEVELS = [
  { value: 'Level 10 (Entry Pay ₹57,700 - ₹1,82,400)', entryPay: '₹57,700', gross: '₹1,02,000/mo' },
  { value: 'Level 11 (Entry Pay ₹68,900 - ₹2,05,500)', entryPay: '₹68,900', gross: '₹1,22,000/mo' },
  { value: 'Level 12 (Entry Pay ₹79,800 - ₹2,11,500)', entryPay: '₹79,800', gross: '₹1,42,000/mo' },
  { value: 'Level 13A (Entry Pay ₹1,31,400 - ₹2,17,100)', entryPay: '₹1,31,400', gross: '₹2,32,000/mo' },
  { value: 'Level 14 (Entry Pay ₹1,44,200 - ₹2,18,200)', entryPay: '₹1,44,200', gross: '₹2,55,000/mo' },
  { value: 'Level 15 (Entry Pay ₹1,82,200 - ₹2,24,100)', entryPay: '₹1,82,200', gross: '₹3,20,000/mo' },
];

const MIN_DEGREES: string[] = [
  'Ph.D. Mandatory', 'Ph.D. with First Class Master', 'Master with NET/SLET', 'PostDoc Preferred',
];

const STAGES: { key: ApplicationStage; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'committee_review', label: 'Committee review' },
  { key: 'offer', label: 'Offer extended' },
  { key: 'joined', label: 'Joined' },
  { key: 'rejected', label: 'Not selected' },
];

const inputCls = 'w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const selectCls = 'px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold transition disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition';
const iconBtn = 'p-1.5 rounded-lg text-slate-500 hover:text-brand-900 hover:bg-brand-50 transition';
const dangerIconBtn = 'p-1.5 rounded-lg text-slate-500 hover:text-crimson-700 hover:bg-crimson-50 transition';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-brand-950/40 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-8 rounded-2xl bg-white border border-slate-200 shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className={iconBtn}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2">{text}</p>;
}

function Toolbar({ query, setQuery, placeholder, children }: { query: string; setQuery: (v: string) => void; placeholder: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${inputCls} pl-9`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export { useSelection, RowCheck, BulkBar } from '@/components/Selection';
export type { Selection } from '@/components/Selection';

const bulkBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition';
const bulkDanger = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white text-xs font-semibold transition';
const bulkSelect = 'px-2 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold border border-white/20 [&>option]:text-slate-900';

function TableShell({ head, children, empty, sel }: { head: string[]; children: React.ReactNode; empty: boolean; sel?: Selection }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cream text-left text-xs text-slate-600">
          <tr>
            {sel && (
              <th className="pl-4 pr-1 py-3 w-8">
                <input type="checkbox" className="w-4 h-4 accent-brand-900 cursor-pointer" aria-label="Select all shown" checked={sel.allOn} onChange={sel.toggleAll} />
              </th>
            )}
            {head.map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="p-8 text-center text-sm text-slate-500">Nothing to show.</p>}
    </div>
  );
}

function useFlash(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return [msg, (m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3000);
  }];
}

function Flash({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl bg-brand-950 text-white text-sm shadow-xl" role="status">{msg}</div>;
}

// ─────────────────────────────────────────────────────────── Users

export function UsersPanel() {
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const { user: me } = useCurrentUser();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [viewingDocs, setViewingDocs] = useState<User | null>(null);
  const [planFor, setPlanFor] = useState<User | null>(null);
  const [flash, setFlash] = useFlash();

  const instName = (id?: string) => institutes.find(i => i.id === id)?.shortName || '—';
  const visible = users.filter(u =>
    (roleFilter === 'all' || u.role === roleFilter) &&
    `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()));

  const remove = (u: User) => {
    if (!confirm(`Delete ${u.name} (${u.email})? Their profile and applications are removed too. This cannot be undone.`)) return;
    const r = StorageService.adminDeleteUser(u.id);
    setFlash(r.success ? 'Account deleted.' : r.error!);
  };

  const sel = useSelection(visible.map(u => u.id));
  const bulkDelete = () => {
    if (!confirm(`Delete ${sel.count} account${sel.count === 1 ? '' : 's'}? Their profiles, applications and documents are removed too. This cannot be undone.`)) return;
    let done = 0; const skipped: string[] = [];
    sel.ids.forEach(id => { const r = StorageService.adminDeleteUser(id); if (r.success) done++; else skipped.push(r.error || id); });
    sel.clear();
    setFlash(`Deleted ${done}.${skipped.length ? ` Skipped ${skipped.length}: ${[...new Set(skipped)].join(' ')}` : ''}`);
  };
  const bulkPlan = (plan: 'free' | 'premium') => {
    const cands = users.filter(u => sel.has(u.id) && u.role === 'candidate');
    if (!cands.length) { setFlash('Plans apply to candidate accounts only.'); return; }
    const months = StorageService.getPlanSettings().premiumDurationMonths;
    if (!confirm(plan === 'premium' ? `Give Premium for ${months} months to ${cands.length} candidate${cands.length === 1 ? '' : 's'}?` : `Move ${cands.length} candidate${cands.length === 1 ? '' : 's'} to the Free plan?`)) return;
    cands.forEach(u => StorageService.setUserPlan(u.id, plan, plan === 'premium' ? months : undefined));
    sel.clear();
    setFlash(`${cands.length} candidate${cands.length === 1 ? '' : 's'} now on ${plan === 'premium' ? 'Premium' : 'Free'}.`);
  };

  return (
    <div className="space-y-4">
      <Toolbar query={query} setQuery={setQuery} placeholder="Search name or email">
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as 'all' | UserRole)} className={selectCls} aria-label="Filter by role">
          <option value="all">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Add user</button>
      </Toolbar>

      <BulkBar sel={sel} noun="account">
        <button className={bulkBtn} onClick={() => bulkPlan('premium')}><Crown className="w-3.5 h-3.5" /> Give Premium</button>
        <button className={bulkBtn} onClick={() => bulkPlan('free')}>Set Free plan</button>
        <button className={bulkDanger} onClick={bulkDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      </BulkBar>

      <TableShell sel={sel} head={['Name', 'Email', 'Role', 'Plan', 'Institute', 'Joined', '']} empty={visible.length === 0}>
        {visible.map(u => (
          <tr key={u.id} className={sel.has(u.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
            <RowCheck sel={sel} id={u.id} label={u.name} />
            <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{u.name}{u.id === me?.id && <span className="ml-2 text-[12px] px-1.5 py-0.5 rounded bg-gold-100 text-gold-800">You</span>}</td>
            <td className="px-4 py-3 text-slate-600">{u.email}</td>
            <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'super_admin' ? 'bg-brand-900 text-white' : 'bg-brand-50 text-brand-800'}`}>{ROLE_LABEL[u.role]}</span></td>
            <td className="px-4 py-3 whitespace-nowrap">{u.role === 'candidate' ? <PlanPill user={u} /> : <span className="text-slate-400">—</span>}{u.role === 'candidate' && u.plan === 'premium' && u.premiumUntil && <div className={`text-[12px] mt-0.5 ${isPremiumUser(u) ? 'text-slate-500' : 'text-crimson-700'}`}>{isPremiumUser(u) ? 'until' : 'expired'} {u.premiumUntil}</div>}</td>
            <td className="px-4 py-3 text-slate-600">{instName(u.instituteId)}</td>
            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{u.createdAt}</td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1">
                {u.role === 'candidate' && <button className={iconBtn} title="Plan" aria-label={`Change plan of ${u.name}`} onClick={() => setPlanFor(u)}><Crown className="w-4 h-4" /></button>}
                {u.role === 'candidate' && <button className={iconBtn} title="Documents" aria-label={`Documents of ${u.name}`} onClick={() => setViewingDocs(u)}><FileCheck2 className="w-4 h-4" /></button>}
                <button className={iconBtn} title="Edit" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}><Pencil className="w-4 h-4" /></button>
                <button className={iconBtn} title="Reset password" aria-label={`Reset password for ${u.name}`} onClick={() => setResetting(u)}><KeyRound className="w-4 h-4" /></button>
                <button className={dangerIconBtn} title="Delete" aria-label={`Delete ${u.name}`} onClick={() => remove(u)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>

      {editing && <UserForm user={editing === 'new' ? null : editing} institutes={institutes} onClose={() => setEditing(null)} onDone={m => { setEditing(null); setFlash(m); }} />}
      {planFor && <PlanForm user={planFor} onClose={() => setPlanFor(null)} onDone={m => { setPlanFor(null); setFlash(m); }} />}
      {viewingDocs && <UserDocumentsModal user={viewingDocs} onClose={() => setViewingDocs(null)} />}
      {resetting && <ResetPasswordForm user={resetting} onClose={() => setResetting(null)} onDone={m => { setResetting(null); setFlash(m); }} />}
      <Flash msg={flash} />
    </div>
  );
}

function UserForm({ user, institutes, onClose, onDone }: { user: User | null; institutes: Institute[]; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<UserRole>(user?.role || 'candidate');
  const [instituteId, setInstituteId] = useState(user?.instituteId || institutes[0]?.id || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsInst = role === 'institute_admin' || role === 'recruiter';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = user
      ? StorageService.adminUpdateUser(user.id, { name, email, role, instituteId: needsInst ? instituteId : undefined })
      : await StorageService.adminCreateUser({ name, email, password, role, instituteId: needsInst ? instituteId : undefined });
    setBusy(false);
    if (r.success) onDone(user ? 'Account updated.' : 'Account created.');
    else setError(r.error || 'Something went wrong.');
  };

  return (
    <Modal title={user ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input required className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Email"><input required type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select className={inputCls} value={role} onChange={e => setRole(e.target.value as UserRole)}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {needsInst && (
          <Field label="Institute">
            <select className={inputCls} value={instituteId} onChange={e => setInstituteId(e.target.value)}>
              {institutes.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
        )}
        {!user && <Field label="Password (min. 8 characters)"><input required minLength={8} type="text" autoComplete="new-password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} /></Field>}
        <ErrorNote text={error} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{user ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PlanForm({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (m: string) => void }) {
  const settings = StorageService.getPlanSettings();
  const [plan, setPlan] = useState<'free' | 'premium'>(isPremiumUser(user) ? 'premium' : 'free');
  const [months, setMonths] = useState(String(settings.premiumDurationMonths));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = StorageService.setUserPlan(user.id, plan, plan === 'premium' ? Number(months) || 0 : undefined);
    if (r.success) onDone(plan === 'premium' ? `${user.name} is now Premium.` : `${user.name} is now on the Free plan.`);
    else setError(r.error || 'Something went wrong.');
  };
  return (
    <Modal title={`Plan · ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-slate-600 flex items-center gap-2">Current: <PlanPill user={user} />{user.premiumUntil && <span className="text-xs">({isPremiumUser(user) ? 'until' : 'expired'} {user.premiumUntil})</span>}</div>
        <div className="grid grid-cols-2 gap-3">
          {(['free', 'premium'] as const).map(p => (
            <label key={p} className={`p-4 rounded-xl border cursor-pointer ${plan === p ? 'border-brand-900 bg-brand-50' : 'border-slate-200 bg-white'}`}>
              <input type="radio" name="plan" className="sr-only" checked={plan === p} onChange={() => setPlan(p)} />
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">{p === 'premium' && <Crown className="w-4 h-4 text-gold-500" />}{p === 'free' ? 'Free' : 'Premium'}</div>
              <div className="text-xs text-slate-500 mt-0.5">{p === 'free' ? 'Listings and external apply only' : 'All services and Premium vacancies'}</div>
            </label>
          ))}
        </div>
        {plan === 'premium' && (
          <Field label="Duration">
            <select className={inputCls} value={months} onChange={e => setMonths(e.target.value)}>
              {[1, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m === 1 ? '1 month' : `${m} months`}{isPremiumUser(user) ? ' (added to current end date)' : ''}</option>)}
              <option value="0">No end date</option>
            </select>
          </Field>
        )}
        <ErrorNote text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>Save plan</button>
        </div>
      </form>
    </Modal>
  );
}

function UserDocumentsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { docs } = useDocuments(user.id);
  const photo = docs.find(d => d.category === 'photo');
  return (
    <Modal title={`Documents · ${user.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <CandidateAvatar userId={user.id} name={user.name} className="w-16 h-16" />
          <div className="text-sm">
            <div className="font-semibold text-slate-900">{user.name}</div>
            <div className="text-slate-500">{user.email}</div>
            {photo && <button className="mt-1 text-xs text-crimson-700 hover:underline" onClick={() => { if (confirm('Delete this profile photo?')) deleteDocument(photo.id); }}>Delete photo</button>}
          </div>
        </div>
        <DocumentList userId={user.id} allowDelete />
        <p className="text-xs text-slate-500">Documents are stored in this browser only.</p>
      </div>
    </Modal>
  );
}

function ResetPasswordForm({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (m: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await StorageService.adminResetPassword(user.id, password);
    if (r.success) onDone(`Password reset for ${user.email}.`);
    else setError(r.error || 'Something went wrong.');
  };
  return (
    <Modal title={`Reset password · ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password (min. 8 characters)"><input required minLength={8} type="text" autoComplete="new-password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <ErrorNote text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>Reset password</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────── Institutions

export function InstitutionsPanel() {
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Institute | 'new' | null>(null);
  const [subFor, setSubFor] = useState<Institute | null>(null);
  const [flash, setFlash] = useFlash();

  const visible = institutes.filter(i => `${i.name} ${i.shortName} ${i.aisheCode} ${i.location.city}`.toLowerCase().includes(query.toLowerCase()));

  const sel = useSelection(visible.map(i => i.id));
  const bulkDelete = () => {
    const n = jobs.filter(j => sel.has(j.instituteId)).length;
    if (!confirm(`Delete ${sel.count} institute${sel.count === 1 ? '' : 's'}? ${n} vacanc${n === 1 ? 'y' : 'ies'} and their applications are removed too. Staff accounts stay but are unlinked.`)) return;
    const count = sel.count;
    sel.ids.forEach(id => StorageService.adminDeleteInstitute(id));
    sel.clear();
    setFlash(`Deleted ${count} institute${count === 1 ? '' : 's'}.`);
  };
  const bulkStatus = (status: Institute['verificationStatus']) => {
    const count = sel.count;
    sel.ids.forEach(id => StorageService.adminUpdateInstitute(id, { verificationStatus: status, verifiedAt: status === 'verified' ? new Date().toISOString() : undefined }));
    sel.clear();
    setFlash(`${count} institute${count === 1 ? '' : 's'} marked ${status}.`);
  };
  const bulkSubscription = (active: boolean) => {
    const months = StorageService.getPlanSettings().institutionDurationMonths;
    if (!confirm(active ? `Activate Institution Premium for ${months} months for ${sel.count} institute${sel.count === 1 ? '' : 's'}? Confirm payment has been received.` : `Deactivate the subscription of ${sel.count} institute${sel.count === 1 ? '' : 's'}?`)) return;
    const count = sel.count;
    sel.ids.forEach(id => StorageService.setInstituteSubscription(id, active, active ? months : undefined));
    sel.clear();
    setFlash(active ? `Subscription activated for ${count}.` : `Subscription deactivated for ${count}.`);
  };

  const remove = (i: Institute) => {
    const n = jobs.filter(j => j.instituteId === i.id).length;
    if (!confirm(`Delete ${i.name}? Its ${n} vacanc${n === 1 ? 'y' : 'ies'} and their applications are removed too. Staff accounts stay but are unlinked.`)) return;
    StorageService.adminDeleteInstitute(i.id);
    setFlash('Institute deleted.');
  };

  return (
    <div className="space-y-4">
      <Toolbar query={query} setQuery={setQuery} placeholder="Search name, AISHE code or city">
        <button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Add institute</button>
      </Toolbar>
      <BulkBar sel={sel} noun="institute">
        <select className={bulkSelect} aria-label="Set verification status" value="" onChange={e => { if (e.target.value) bulkStatus(e.target.value as Institute['verificationStatus']); }}>
          <option value="">Set status…</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option>
        </select>
        <button className={bulkBtn} onClick={() => bulkSubscription(true)}><Crown className="w-3.5 h-3.5" /> Activate subscription</button>
        <button className={bulkBtn} onClick={() => bulkSubscription(false)}>Deactivate subscription</button>
        <button className={bulkDanger} onClick={bulkDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      </BulkBar>

      <TableShell sel={sel} head={['Institute', 'AISHE', 'City', 'NAAC', 'Vacancies', 'Subscription', 'Status', '']} empty={visible.length === 0}>
        {visible.map(i => (
          <tr key={i.id} className={sel.has(i.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
            <RowCheck sel={sel} id={i.id} label={i.name} />
            <td className="px-4 py-3"><div className="font-medium text-slate-900">{i.name}</div><div className="text-xs text-slate-500">{i.type}</div></td>
            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{i.aisheCode}</td>
            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{i.location.city}{i.location.state ? `, ${i.location.state}` : ''}</td>
            <td className="px-4 py-3 text-slate-600">{i.accreditation.naacGrade}</td>
            <td className="px-4 py-3 text-slate-600">{jobs.filter(j => j.instituteId === i.id).length}</td>
            <td className="px-4 py-3 whitespace-nowrap"><SubscriptionPill inst={i} /></td>
            <td className="px-4 py-3">
              <select
                aria-label={`Status of ${i.name}`}
                value={i.verificationStatus}
                onChange={e => { StorageService.adminUpdateInstitute(i.id, { verificationStatus: e.target.value as Institute['verificationStatus'], verifiedAt: e.target.value === 'verified' ? new Date().toISOString() : undefined }); setFlash('Status updated.'); }}
                className={`text-xs rounded-lg border px-2 py-1 ${i.verificationStatus === 'verified' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : i.verificationStatus === 'pending' ? 'bg-gold-50 border-gold-200 text-gold-800' : 'bg-crimson-50 border-crimson-100 text-crimson-700'}`}
              >
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1">
                <button className={iconBtn} title="Subscription" aria-label={`Subscription of ${i.name}`} onClick={() => setSubFor(i)}><Crown className="w-4 h-4" /></button>
                <Link href={`/institutes/${i.id}`} className={iconBtn} title="View page" aria-label={`View ${i.name}`}><ExternalLink className="w-4 h-4" /></Link>
                <button className={iconBtn} title="Edit" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}><Pencil className="w-4 h-4" /></button>
                <button className={dangerIconBtn} title="Delete" aria-label={`Delete ${i.name}`} onClick={() => remove(i)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>
      {subFor && <SubscriptionForm inst={subFor} onClose={() => setSubFor(null)} onDone={m => { setSubFor(null); setFlash(m); }} />}
      {editing && <InstituteForm inst={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={m => { setEditing(null); setFlash(m); }} />}
      <Flash msg={flash} />
    </div>
  );
}

export function SubscriptionPill({ inst }: { inst: Institute }) {
  const sub = inst.subscription;
  if (isInstituteSubscribed(inst)) {
    return <span className="inline-flex flex-col"><span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 border border-gold-300 self-start"><Crown className="w-3 h-3" />Active</span><span className="text-[12px] text-slate-500 mt-0.5">{sub?.activeUntil ? `until ${sub.activeUntil}` : 'no end date'}</span></span>;
  }
  if (sub?.status === 'pending') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gold-50 text-gold-800 border border-gold-200">Payment pending</span>;
  if (sub?.status === 'active') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-crimson-50 text-crimson-700 border border-crimson-100">Expired {sub.activeUntil}</span>;
  if (sub?.status === 'declined') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-crimson-50 text-crimson-700 border border-crimson-100">Declined</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">None</span>;
}

function SubscriptionForm({ inst, onClose, onDone }: { inst: Institute; onClose: () => void; onDone: (m: string) => void }) {
  const settings = StorageService.getPlanSettings();
  const active = isInstituteSubscribed(inst);
  const [months, setMonths] = useState(String(settings.institutionDurationMonths));
  return (
    <Modal title={`Institution Premium · ${inst.shortName}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2 text-slate-600">Current: <SubscriptionPill inst={inst} /></div>
        {inst.subscription?.requestedBy && <p className="text-xs text-slate-500">Requested by {inst.subscription.requestedBy}{inst.subscription.requestedAt ? ` on ${inst.subscription.requestedAt}` : ''}{inst.subscription.note ? ` · “${inst.subscription.note}”` : ''}</p>}
        <Field label={active ? 'Extend by' : 'Activate for'}>
          <select className={inputCls} value={months} onChange={e => setMonths(e.target.value)}>
            {[1, 3, 6, 12, 24, 36].map(m => <option key={m} value={m}>{m === 1 ? '1 month' : `${m} months`}</option>)}
            <option value="0">No end date</option>
          </select>
        </Field>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {inst.subscription?.status === 'pending' && <button className={btnGhost} onClick={() => { StorageService.declineInstituteSubscription(inst.id); onDone('Request declined.'); }}>Decline request</button>}
          {active && <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-crimson-100 hover:bg-crimson-50 text-crimson-700 text-sm font-medium" onClick={() => { if (confirm(`Deactivate ${inst.name}'s subscription? Their staff lose access to institution tools.`)) { StorageService.setInstituteSubscription(inst.id, false); onDone('Subscription deactivated.'); } }}>Deactivate</button>}
          <button className={btnPrimary} onClick={() => { StorageService.setInstituteSubscription(inst.id, true, Number(months) || 0); onDone(active ? 'Subscription extended.' : 'Subscription activated.'); }}><Check className="w-4 h-4" /> {active ? 'Extend' : 'Activate'}</button>
        </div>
      </div>
    </Modal>
  );
}

function InstituteForm({ inst, onClose, onDone }: { inst: Institute | null; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({
    name: inst?.name || '',
    shortName: inst?.shortName || '',
    type: inst?.type || INSTITUTION_TYPES[5],
    aisheCode: inst?.aisheCode || '',
    city: inst?.location.city || '',
    state: inst?.location.state || '',
    website: inst?.website || '',
    contactEmail: inst?.contactEmail || '',
    contactPhone: inst?.contactPhone || '',
    naacGrade: inst?.accreditation.naacGrade || 'Under Review',
    nirf: inst?.accreditation.nirfRankOverall?.toString() || '',
    established: inst?.establishedYear?.toString() || '',
    departments: inst?.departments.join(', ') || '',
    about: inst?.about || '',
    status: inst?.verificationStatus || 'verified',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const depts = f.departments.split(',').map(s => s.trim()).filter(Boolean);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inst) {
      StorageService.adminUpdateInstitute(inst.id, {
        name: f.name.trim(), shortName: f.shortName.trim() || f.name.trim(), type: f.type as InstitutionType,
        aisheCode: f.aisheCode.trim().toUpperCase(), website: f.website.trim(), contactEmail: f.contactEmail.trim(), contactPhone: f.contactPhone.trim(),
        location: { ...inst.location, city: f.city.trim(), state: f.state.trim() },
        accreditation: { ...inst.accreditation, naacGrade: f.naacGrade as Institute['accreditation']['naacGrade'], nirfRankOverall: f.nirf ? Number(f.nirf) : undefined },
        establishedYear: f.established ? Number(f.established) : inst.establishedYear,
        departments: depts, about: f.about.trim(),
        verificationStatus: f.status as Institute['verificationStatus'],
      });
      onDone('Institute updated.');
    } else {
      const r = StorageService.adminCreateInstitute({
        name: f.name, shortName: f.shortName, type: f.type as InstitutionType, aisheCode: f.aisheCode, city: f.city, state: f.state,
        website: f.website, contactEmail: f.contactEmail, contactPhone: f.contactPhone,
        naacGrade: f.naacGrade as Institute['accreditation']['naacGrade'], nirfRankOverall: f.nirf ? Number(f.nirf) : undefined,
        establishedYear: f.established ? Number(f.established) : undefined, departments: depts, about: f.about,
        verificationStatus: f.status as Institute['verificationStatus'],
      });
      if (r.success) onDone('Institute added.'); else setError(r.error || 'Something went wrong.');
    }
  };

  return (
    <Modal title={inst ? 'Edit institute' : 'Add institute'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name" className="sm:col-span-2"><input required className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Short name"><input className={inputCls} value={f.shortName} onChange={set('shortName')} placeholder="e.g. MITS" /></Field>
        <Field label="AISHE code"><input required className={inputCls} value={f.aisheCode} onChange={set('aisheCode')} /></Field>
        <Field label="Type" className="sm:col-span-2"><select className={inputCls} value={f.type} onChange={set('type')}>{INSTITUTION_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="City"><input required className={inputCls} value={f.city} onChange={set('city')} /></Field>
        <Field label="State"><input required className={inputCls} value={f.state} onChange={set('state')} /></Field>
        <Field label="Website"><input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} className={inputCls} value={f.website} onChange={set('website')} placeholder="https://" /></Field>
        <Field label="Contact email"><input type="email" className={inputCls} value={f.contactEmail} onChange={set('contactEmail')} /></Field>
        <Field label="Contact phone"><input className={inputCls} value={f.contactPhone} onChange={set('contactPhone')} /></Field>
        <Field label="Established year"><input type="number" className={inputCls} value={f.established} onChange={set('established')} /></Field>
        <Field label="NAAC grade"><select className={inputCls} value={f.naacGrade} onChange={set('naacGrade')}>{NAAC_GRADES.map(g => <option key={g}>{g}</option>)}</select></Field>
        <Field label="NIRF rank (overall)"><input type="number" className={inputCls} value={f.nirf} onChange={set('nirf')} /></Field>
        <Field label="Departments (comma separated)" className="sm:col-span-2"><input className={inputCls} value={f.departments} onChange={set('departments')} /></Field>
        <Field label="About" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.about} onChange={set('about')} /></Field>
        <Field label="Verification status"><select className={inputCls} value={f.status} onChange={set('status')}><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></Field>
        <div className="sm:col-span-2"><ErrorNote text={error} /></div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>{inst ? 'Save changes' : 'Add institute'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────── Vacancies

export function VacanciesPanel() {
  const jobs = useStorageValue<Job[]>(() => StorageService.getJobs(), []);
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Job['status']>('all');
  const [editing, setEditing] = useState<Job | 'new' | null>(null);
  const [flash, setFlash] = useFlash();

  const visible = useMemo(() => jobs.filter(j =>
    (statusFilter === 'all' || j.status === statusFilter) &&
    `${j.title} ${j.instituteName} ${j.department} ${j.advertisementNumber}`.toLowerCase().includes(query.toLowerCase())), [jobs, query, statusFilter]);

  const sel = useSelection(visible.map(j => j.id));
  const bulkDelete = () => {
    const apps = jobs.filter(j => sel.has(j.id)).reduce((n, j) => n + (j.applicantCount || 0), 0);
    if (!confirm(`Delete ${sel.count} vacanc${sel.count === 1 ? 'y' : 'ies'}? ${apps} application${apps === 1 ? '' : 's'} to them are removed too.`)) return;
    const count = sel.count;
    sel.ids.forEach(id => StorageService.deleteJob(id));
    sel.clear();
    setFlash(`Deleted ${count} vacanc${count === 1 ? 'y' : 'ies'}.`);
  };
  const bulkPatch = (patch: Partial<Job>, msg: string) => {
    const count = sel.count;
    sel.ids.forEach(id => (patch.status ? StorageService.setJobStatus(id, patch.status) : StorageService.updateJob(id, patch)));
    sel.clear();
    setFlash(`${count} vacanc${count === 1 ? 'y' : 'ies'} ${msg}.`);
  };

  const expired = expiredOpenJobs(jobs);
  const closeExpired = () => {
    const n = StorageService.closeExpiredJobs().length;
    setFlash(`Closed ${n} vacanc${n === 1 ? 'y' : 'ies'} whose last date has passed.`);
  };

  const remove = (j: Job) => {
    if (!confirm(`Delete "${j.title}"? All ${j.applicantCount || 0} application(s) to it are removed too.`)) return;
    StorageService.deleteJob(j.id);
    setFlash('Vacancy deleted.');
  };

  return (
    <div className="space-y-4">
      <Toolbar query={query} setQuery={setQuery} placeholder="Search title, institute, department">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | Job['status'])} className={selectCls} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="under_review">Under review</option>
          <option value="closed">Closed</option>
        </select>
        <button className={btnPrimary} onClick={() => setEditing('new')} disabled={institutes.length === 0}><Plus className="w-4 h-4" /> Add vacancy</button>
      </Toolbar>
      {expired.length > 0 && (
        <div className="p-3.5 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2" role="status">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{expired.length} published vacanc{expired.length === 1 ? 'y is' : 'ies are'} past the last date. They close automatically once a day; you can close them now.</span>
          <button className={btnPrimary} onClick={closeExpired}>Close now</button>
        </div>
      )}
      <BulkBar sel={sel} noun="vacancy">
        <select className={bulkSelect} aria-label="Set status" value="" onChange={e => { if (e.target.value) bulkPatch({ status: e.target.value as Job['status'] }, `set to ${e.target.value.replace('_', ' ')}`); }}>
          <option value="">Set status…</option><option value="published">Published</option><option value="draft">Draft</option><option value="under_review">Under review</option><option value="closed">Closed</option>
        </select>
        <button className={bulkBtn} onClick={() => bulkPatch({ isPremium: true }, 'made Premium-only')}><Crown className="w-3.5 h-3.5" /> Premium only</button>
        <button className={bulkBtn} onClick={() => bulkPatch({ isPremium: false }, 'opened to all candidates')}>Open to all</button>
        <button className={bulkBtn} onClick={() => bulkPatch({ featured: true }, 'featured')}><Star className="w-3.5 h-3.5" /> Feature</button>
        <button className={bulkBtn} onClick={() => bulkPatch({ featured: false }, 'unfeatured')}>Unfeature</button>
        <button className={bulkDanger} onClick={bulkDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      </BulkBar>

      <TableShell sel={sel} head={['Vacancy', 'Institute', 'Deadline', 'Applicants', 'Status', '']} empty={visible.length === 0}>
        {visible.map(j => (
          <tr key={j.id} className={sel.has(j.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
            <RowCheck sel={sel} id={j.id} label={j.title} />
            <td className="px-4 py-3 max-w-xs">
              <div className="font-medium text-slate-900 line-clamp-2">{j.isPremium && <Crown className="inline w-3.5 h-3.5 text-gold-600 mr-1 -mt-0.5" aria-label="Premium vacancy" />}{(j.featured || isJobFeatured(j)) && <Star className="inline w-3.5 h-3.5 fill-gold-400 text-gold-500 mr-1 -mt-0.5" aria-label={isJobFeatured(j) ? `Paid featured until ${j.featuredUntil}` : 'Featured'} />}{isJobUrgent(j) && <span className="text-[12px] font-bold text-crimson-700 mr-1">URGENT</span>}{j.title}</div>
              <div className="text-xs text-slate-500 truncate">{j.department}</div>
            </td>
            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{j.instituteShortName}</td>
            <td className={`px-4 py-3 whitespace-nowrap ${isDeadlinePassed(j) ? 'text-crimson-700' : 'text-slate-600'}`}>{j.applicationDeadline}</td>
            <td className="px-4 py-3 text-slate-600">{j.applicantCount || 0}</td>
            <td className="px-4 py-3">
              {j.status === 'closed' && j.autoClosedAt && <div className="text-[12px] text-slate-500 mb-1">Auto-closed {j.autoClosedAt.slice(0, 10)}</div>}
              <select aria-label={`Status of ${j.title}`} value={j.status} onChange={e => { StorageService.setJobStatus(j.id, e.target.value as Job['status']); setFlash('Status updated.'); }} className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="under_review">Under review</option>
                <option value="closed">Closed</option>
              </select>
            </td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1">
                <button className={iconBtn} title={j.featured ? 'Unfeature' : 'Feature'} aria-label={j.featured ? 'Remove from featured' : 'Mark as featured'} onClick={() => { StorageService.updateJob(j.id, { featured: !j.featured }); setFlash(j.featured ? 'Removed from featured.' : 'Marked as featured.'); }}><Star className={`w-4 h-4 ${j.featured ? 'fill-gold-400 text-gold-500' : ''}`} /></button>
                <AdminPromotionControls job={j} onDone={setFlash} />
                <Link href={`/jobs/${j.id}`} className={iconBtn} title="View" aria-label={`View ${j.title}`}><ExternalLink className="w-4 h-4" /></Link>
                <button className={iconBtn} title="Edit" aria-label={`Edit ${j.title}`} onClick={() => setEditing(j)}><Pencil className="w-4 h-4" /></button>
                <button className={dangerIconBtn} title="Delete" aria-label={`Delete ${j.title}`} onClick={() => remove(j)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </td>
          </tr>
        ))}
      </TableShell>
      {editing && <JobForm job={editing === 'new' ? null : editing} institutes={institutes} onClose={() => setEditing(null)} onDone={m => { setEditing(null); setFlash(m); }} />}
      <Flash msg={flash} />
    </div>
  );
}

function JobForm({ job, institutes, onClose, onDone }: { job: Job | null; institutes: Institute[]; onClose: () => void; onDone: (m: string) => void }) {
  const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  // Empty string = "Not specified" (null). Existing vacancies keep their values; only new ones get defaults.
  const isNew = !job;
  const [f, setF] = useState({
    instituteId: job?.instituteId || institutes[0]?.id || '',
    title: job?.title || '',
    designation: isNew ? DESIGNATIONS[0] : (job.designation || ''),
    department: job?.department || '',
    advertisementNumber: job?.advertisementNumber || '',
    pay: isNew ? PAY_LEVELS[0].value : (job.payScale.cpcBand || ''),
    deadline: isNew ? inThirtyDays : (job.applicationDeadline || ''),
    reservation: isNew ? RESERVATIONS[0] : (job.reservationCategory || ''),
    minDegree: isNew ? MIN_DEGREES[0] : (job.requiredQualifications.minDegree || ''),
    net: isNew ? 'no' : job.requiredQualifications.netSletMandatory === null ? '' : job.requiredQualifications.netSletMandatory ? 'yes' : 'no',
    premium: job?.isPremium ?? false,
    externalApplyUrl: job?.externalApplyUrl || '',
    minExp: isNew ? '0' : (job.requiredQualifications.minExperienceYears ?? '').toString(),
    minPubs: isNew ? '0' : (job.requiredQualifications.minUgcCarePubs ?? '').toString(),
    tags: job?.specializationTags.join(', ') || '',
    description: job?.description || '',
    responsibilities: job?.responsibilities.join('\n') || '',
    status: job?.status || 'published',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const payOptions = !f.pay || PAY_LEVELS.some(p => p.value === f.pay) ? PAY_LEVELS : [{ value: f.pay, entryPay: job?.payScale.entryPay || '', gross: job?.payScale.grossMonthlyEstimated || '' }, ...PAY_LEVELS];
  const minDegreeOptions: string[] = !f.minDegree || MIN_DEGREES.includes(f.minDegree) ? MIN_DEGREES : [f.minDegree, ...MIN_DEGREES];
  // A scraped vacancy's institute may not be a platform institute; keep it selectable.
  const instOptions = job && !institutes.some(i => i.id === job.instituteId)
    ? [{ id: job.instituteId, name: `${job.instituteName} (from source)` }, ...institutes]
    : institutes;
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v) || 0));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const inst = institutes.find(i => i.id === f.instituteId);
    const keepSourceInstitute = !!job && f.instituteId === job.instituteId && !inst;
    if (!inst && !keepSourceInstitute) return setError('Choose an institute.');
    if (!f.title.trim()) return setError('Title is required.');
    const pay = f.pay ? payOptions.find(p => p.value === f.pay) : undefined;
    const tags = f.tags.split(',').map(s => s.trim()).filter(Boolean);
    const instFields: Partial<Job> = inst
      ? { instituteId: inst.id, instituteName: inst.name, instituteShortName: inst.shortName, instituteType: inst.type, instituteLogo: inst.logo, location: { city: inst.location.city || null, state: inst.location.state || null } }
      : {};
    const patch: Partial<Job> = {
      ...instFields,
      title: f.title.trim(), designation: (f.designation || null) as DesignationType | null, department: f.department.trim() || null,
      advertisementNumber: f.advertisementNumber.trim() || null, specializationTags: tags,
      payScale: {
        ...(job?.payScale || { allowances: [] }),
        cpcBand: pay?.value || null,
        entryPay: pay ? (pay.entryPay || null) : null,
        grossMonthlyEstimated: pay ? (pay.gross || null) : null,
      },
      requiredQualifications: {
        ...(job?.requiredQualifications || { phdNorms: null, ugcRegulationsYear: null, specializationRequirements: [] }),
        minDegree: f.minDegree || null,
        netSletMandatory: f.net === '' ? null : f.net === 'yes',
        minExperienceYears: num(f.minExp),
        minUgcCarePubs: num(f.minPubs),
        specializationRequirements: tags.length ? tags : (job?.requiredQualifications.specializationRequirements || []),
      },
      reservationCategory: (f.reservation || null) as ReservationCategory | null,
      applicationDeadline: f.deadline || null,
      description: f.description.trim() || null,
      responsibilities: f.responsibilities.split('\n').map(s => s.trim()).filter(Boolean),
      status: f.status as Job['status'],
      isPremium: f.premium,
      externalApplyUrl: f.externalApplyUrl.trim() || undefined,
    };
    if (job) {
      StorageService.updateJob(job.id, patch);
      onDone('Vacancy updated.');
    } else {
      const newJob: Job = {
        id: `job-${Date.now().toString(36)}`,
        isClaimedByInstitute: true,
        screeningQuestions: [],
        selectionProcess: ['Screening', 'Shortlisting', 'Interview', 'Selection committee'],
        benefits: [],
        postedAt: new Date().toISOString().slice(0, 10),
        applicantCount: 0,
        ...patch,
      } as Job;
      StorageService.addJob(newJob);
      onDone('Vacancy added.');
    }
  };

  return (
    <Modal title={job ? 'Edit vacancy' : 'Add vacancy'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="Institute" className="sm:col-span-2"><select className={inputCls} value={f.instituteId} onChange={set('instituteId')}>{instOptions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
        <Field label="Title" className="sm:col-span-2"><input required className={inputCls} value={f.title} onChange={set('title')} /></Field>
        <Field label="Designation"><select className={inputCls} value={f.designation} onChange={set('designation')}><option value="">Not specified</option>{DESIGNATIONS.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Department"><input className={inputCls} value={f.department} onChange={set('department')} /></Field>
        <Field label="7th CPC pay level"><select className={inputCls} value={f.pay} onChange={set('pay')}><option value="">Not specified</option>{payOptions.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}</select></Field>
        <Field label="Advertisement no."><input className={inputCls} value={f.advertisementNumber} onChange={set('advertisementNumber')} /></Field>
        <Field label="Application deadline"><input type="date" className={inputCls} value={f.deadline} onChange={set('deadline')} /></Field>
        <Field label="Reservation"><select className={inputCls} value={f.reservation} onChange={set('reservation')}><option value="">Not specified</option>{RESERVATIONS.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Minimum qualification"><select className={inputCls} value={f.minDegree} onChange={set('minDegree')}><option value="">Not specified</option>{minDegreeOptions.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Status"><select className={inputCls} value={f.status} onChange={set('status')}><option value="published">Published</option><option value="draft">Draft</option><option value="under_review">Under review</option><option value="closed">Closed</option></select></Field>
        <Field label="Min. experience (years)"><input type="number" min={0} className={inputCls} value={f.minExp} onChange={set('minExp')} placeholder="Not specified" /></Field>
        <Field label="Min. UGC-CARE / Scopus papers"><input type="number" min={0} className={inputCls} value={f.minPubs} onChange={set('minPubs')} placeholder="Not specified" /></Field>
        <Field label="NET / SLET mandatory"><select className={inputCls} value={f.net} onChange={set('net')}><option value="">Not specified</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.premium} onChange={e => setF({ ...f, premium: e.target.checked })} className="accent-brand-900" /> <Crown className="w-4 h-4 text-gold-500" /> Premium vacancy (only Premium candidates can apply)</label>
        <Field label="External application link (used by Free candidates)" className="sm:col-span-2"><input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} className={inputCls} value={f.externalApplyUrl} onChange={set('externalApplyUrl')} placeholder="https://institute.ac.in/careers/apply — leave blank to use the institute website" /></Field>
        <Field label="Specialisations (comma separated)" className="sm:col-span-2"><input className={inputCls} value={f.tags} onChange={set('tags')} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.description} onChange={set('description')} /></Field>
        <Field label="Responsibilities (one per line)" className="sm:col-span-2"><textarea rows={3} className={inputCls} value={f.responsibilities} onChange={set('responsibilities')} /></Field>
        <div className="sm:col-span-2"><ErrorNote text={error} /></div>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary}>{job ? 'Save changes' : 'Add vacancy'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────── Applications

export function ApplicationsPanel() {
  const apps = useStorageValue<Application[]>(() => StorageService.getAllApplications(), []);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | ApplicationStage>('all');
  const [flash, setFlash] = useFlash();

  const visible = apps.filter(a =>
    (stageFilter === 'all' || a.status === stageFilter) &&
    `${a.candidateName} ${a.candidateEmail} ${a.jobTitle} ${a.instituteName}`.toLowerCase().includes(query.toLowerCase()));

  const sel = useSelection(visible.map(a => a.id));
  const bulkDelete = () => {
    if (!confirm(`Delete ${sel.count} application${sel.count === 1 ? '' : 's'}?`)) return;
    const count = sel.count;
    sel.ids.forEach(id => StorageService.deleteApplication(id));
    sel.clear();
    setFlash(`Deleted ${count} application${count === 1 ? '' : 's'}.`);
  };
  const bulkStage = (stage: ApplicationStage) => {
    const count = sel.count;
    sel.ids.forEach(id => StorageService.updateApplicationStage(id, stage, 'Stage changed by platform administrator'));
    sel.clear();
    setFlash(`${count} application${count === 1 ? '' : 's'} moved to ${STAGES.find(x => x.key === stage)?.label}.`);
  };

  const remove = (a: Application) => {
    if (!confirm(`Delete ${a.candidateName}'s application to "${a.jobTitle}"?`)) return;
    StorageService.deleteApplication(a.id);
    setFlash('Application deleted.');
  };

  return (
    <div className="space-y-4">
      <Toolbar query={query} setQuery={setQuery} placeholder="Search candidate, vacancy or institute">
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as 'all' | ApplicationStage)} className={selectCls} aria-label="Filter by stage">
          <option value="all">All stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Toolbar>
      <BulkBar sel={sel} noun="application">
        <select className={bulkSelect} aria-label="Move to stage" value="" onChange={e => { if (e.target.value) bulkStage(e.target.value as ApplicationStage); }}>
          <option value="">Move to stage…</option>
          {STAGES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
        </select>
        <button className={bulkDanger} onClick={bulkDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
      </BulkBar>

      <TableShell sel={sel} head={['Candidate', 'Vacancy', 'Institute', 'Match', 'Applied', 'Stage', '']} empty={visible.length === 0}>
        {visible.map(a => (
          <tr key={a.id} className={sel.has(a.id) ? 'bg-brand-50/60' : 'hover:bg-ivory'}>
            <RowCheck sel={sel} id={a.id} label={`${a.candidateName}'s application`} />
            <td className="px-4 py-3"><div className="font-medium text-slate-900">{a.candidateName}</div><div className="text-xs text-slate-500">{a.candidateEmail}</div></td>
            <td className="px-4 py-3 text-slate-600 max-w-xs"><span className="line-clamp-2">{a.jobTitle}</span></td>
            <td className="px-4 py-3 text-slate-600">{a.instituteName}</td>
            <td className="px-4 py-3 text-slate-900 font-semibold">{a.matchScore}%</td>
            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{a.appliedDate}</td>
            <td className="px-4 py-3">
              <select aria-label={`Stage of ${a.candidateName}`} value={a.status} onChange={e => { StorageService.updateApplicationStage(a.id, e.target.value as ApplicationStage, 'Stage changed by platform administrator'); setFlash('Stage updated.'); }} className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1">
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </td>
            <td className="px-4 py-3"><div className="flex justify-end"><button className={dangerIconBtn} title="Delete" aria-label={`Delete application of ${a.candidateName}`} onClick={() => remove(a)}><Trash2 className="w-4 h-4" /></button></div></td>
          </tr>
        ))}
      </TableShell>
      <Flash msg={flash} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Site & data

function StorageStatusLine() {
  const [st, setSt] = useState<{ backend: 'mysql' | 'file'; ok: boolean; error?: string; rows?: number; blobs?: number } | null>(null);
  useEffect(() => { fetch('/api/admin/storage', { cache: 'no-store', credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).then(setSt).catch(() => setSt(null)); }, []);
  if (!st) return null;
  if (st.backend === 'file') return <p className="mt-2 text-sm text-gold-800 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2">Data is stored in files on this computer (<code>data</code> folder). This is normal for local testing; on the hosting server the MySQL database is used automatically.</p>;
  return st.ok
    ? <p className="mt-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">Data is stored safely in the MySQL database ({st.rows} data records, {st.blobs} uploaded files). Updating the site does not affect it.</p>
    : <p className="mt-2 text-sm text-crimson-700 bg-crimson-50 border border-crimson-100 rounded-lg px-3 py-2">Cannot reach the database: {st.error}</p>;
}

export function SitePanel() {
  const [refresh, setRefresh] = useState(0);
  const stats = useVisitStats(false);
  const [localStats, setLocalStats] = useState(stats);
  const shown = localStats ?? stats;
  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useFlash();
  const max = Math.max(1, ...(shown?.last7.map(d => d.count) || [1]));

  const resetVisits = async () => {
    if (!confirm('Reset the visit counter to zero?')) return;
    const r = await fetch('/api/visits', { method: 'DELETE', credentials: 'same-origin' });
    if (r.ok) { setLocalStats(await r.json()); setFlash('Visit counter reset.'); StorageService.addAuditLog('Visit counter reset', 'visits', 'AUTHENTICATION'); }
    else setFlash('Could not reset the counter.');
  };

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [legacy, setLegacy] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  useEffect(() => { setLegacy(hasLegacyBrowserData()); }, []);

  const exportBackup = async () => {
    try {
      const data = await StorageService.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acadexmatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setFlash((e as Error).message); }
  };

  const importBackup = async (file: File) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await file.text());
      if (data?.app !== 'AcadeXMatch') throw new Error('not a backup');
    } catch {
      setFlash('That file is not an AcadeXMatch backup.');
      return;
    }
    if (importMode === 'replace' && !confirm('Replace ALL data on the server with this backup? Accounts, vacancies and applications not in the backup will be removed.')) return;
    try {
      const r = await fetch('/api/admin/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, mode: importMode }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Import failed.');
      await hydrate();
      setFlash(importMode === 'replace' ? `Restored ${d.restored} data collections.` : `Added from backup: ${Object.entries(d.added || {}).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ') || 'nothing new'}.`);
    } catch (e) { setFlash((e as Error).message); }
  };

  /** Moves data (and document files) that the older browser-only version kept in this browser. */
  const moveLegacy = async () => {
    if (!confirm('Copy the accounts, vacancies, applications and documents saved in this browser by the older version to the server? Records already on the server are kept.')) return;
    try {
      setMoving('Copying records…');
      const r = await importLegacyBrowserData('merge');
      const docs = await readLegacyBrowserDocuments();
      let moved = 0;
      for (let i = 0; i < docs.length; i++) {
        setMoving(`Uploading documents ${i + 1} of ${docs.length}…`);
        try { await uploadDocumentFor(docs[i].userId, docs[i], docs[i].blob); moved++; } catch { /* owner may not exist on the server */ }
      }
      setMoving(null);
      setFlash(`Moved: ${Object.entries(r.added).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ') || 'no new records'}; ${moved} document${moved === 1 ? '' : 's'}.`);
    } catch (e) { setMoving(null); setFlash((e as Error).message); }
  };

  const resetAll = async () => {
    if (!confirm('Delete ALL users, institutes, vacancies, applications, documents and logs on the server and restore the sample data? Download a backup first if you may need it.')) return;
    if (!confirm('Are you sure? Everyone will be signed out. This cannot be undone.')) return;
    await StorageService.resetAllData();
    window.location.href = '/login';
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Eye className="w-4 h-4 text-gold-500" /> Website visits</h3>
            <p className="text-xs text-slate-500 mt-1">One visit is counted per browser per 30 minutes of activity, across all visitors.{shown && ` Counting since ${shown.since}.`}</p>
          </div>
          <button className={btnGhost} onClick={resetVisits}><RotateCcw className="w-4 h-4" /> Reset</button>
        </div>
        {shown ? (
          <>
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div className="p-4 rounded-xl bg-cream"><div className="text-xs text-slate-500">Total visits</div><div className="text-3xl font-bold text-slate-900">{shown.total.toLocaleString('en-IN')}</div></div>
              <div className="p-4 rounded-xl bg-blush"><div className="text-xs text-slate-500">Today</div><div className="text-3xl font-bold text-slate-900">{shown.today.toLocaleString('en-IN')}</div></div>
            </div>
            <div className="mt-6">
              <div className="text-xs font-semibold text-slate-700 mb-2">Last 7 days</div>
              <div className="flex items-end gap-2 h-32" role="img" aria-label="Visits over the last 7 days">
                {shown.last7.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[12px] text-slate-600">{d.count}</span>
                    <div className="w-full rounded-t-md bg-brand-900" style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }} />
                    <span className="text-[12px] text-slate-500">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm text-slate-500">Visit statistics are unavailable. They need the app to be running with <code>npm run dev</code> or <code>npm start</code>.</p>
        )}
      </section>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
        <div>
          <h3 className="font-bold text-slate-900">Backup &amp; restore</h3>
          <StorageStatusLine />
          <p className="text-xs text-slate-500 mt-1">Download a backup regularly as an extra copy. A backup contains every account, vacancy, application and setting (uploaded document files stay in the database).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnPrimary} onClick={exportBackup}><Download className="w-4 h-4" /> Download backup</button>
          <select className={selectCls} value={importMode} onChange={e => setImportMode(e.target.value as 'merge' | 'replace')} aria-label="Import mode">
            <option value="merge">Add from backup (keep current data)</option>
            <option value="replace">Replace everything with backup</option>
          </select>
          <button className={btnGhost} onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" /> Import backup file</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
        </div>
        {legacy && (
          <div className="p-4 rounded-xl bg-gold-50 border border-gold-200">
            <div className="text-sm font-semibold text-slate-900">Data from the older version found in this browser</div>
            <p className="text-xs text-slate-600 mt-1">Before the server database, AcadeXMatch kept data in each browser. Copy it to the server so everyone can see it.</p>
            <button className={`${btnPrimary} mt-3`} onClick={moveLegacy} disabled={!!moving}>{moving || 'Move this browser’s data to the server'}</button>
          </div>
        )}
        <div className="p-4 rounded-xl bg-crimson-50 border border-crimson-100">
          <div className="flex gap-2 text-sm text-crimson-700 font-semibold"><AlertTriangle className="w-4 h-4 mt-0.5" /> Danger zone</div>
          <p className="text-xs text-slate-600 mt-1">Erase every account, institute, vacancy, application, document and log on the server and start again from the sample data. Everyone is signed out; the default admin login works again afterwards.</p>
          <button className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white text-sm font-semibold" onClick={resetAll}><Trash2 className="w-4 h-4" /> Reset all data</button>
        </div>
      </section>
      <Flash msg={flash} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Premium

export function PremiumPanel() {
  const requests = useStorageValue<UpgradeRequest[]>(() => StorageService.getUpgradeRequests(), []);
  const users = useStorageValue<User[]>(() => StorageService.getUsers(), []);
  const saved = useStorageValue<PlanSettings>(() => StorageService.getPlanSettings(), StorageService.getPlanSettings());
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [flash, setFlash] = useFlash();
  const form = settings ?? saved;
  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending');
  const members = users.filter(u => isPremiumUser(u));
  const candidates = users.filter(u => u.role === 'candidate');
  const institutes = useStorageValue<Institute[]>(() => StorageService.getInstitutes(), []);
  const [subFor, setSubFor] = useState<Institute | null>(null);
  const instPending = institutes.filter(i => i.subscription?.status === 'pending');
  const instActive = institutes.filter(i => isInstituteSubscribed(i));
  const online = useOnlinePayment();

  const resolve = (r: UpgradeRequest, approve: boolean) => {
    if (approve && !confirm(`Activate Premium for ${r.userName} for ${saved.premiumDurationMonths} months? Confirm payment has been received.`)) return;
    StorageService.resolveUpgradeRequest(r.id, approve);
    setFlash(approve ? 'Premium activated.' : 'Request declined.');
  };

  const plans = form.premiumPlans?.length ? form.premiumPlans : DEFAULT_PREMIUM_PLANS;
  const setPlan = (key: string, patch: Partial<PremiumPlanOption>) => setSettings({ ...form, premiumPlans: plans.map(p => (p.key === key ? { ...p, ...patch } : p)) });

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPlans = plans.map(p => ({ ...p, months: Math.max(1, Math.round(Number(p.months) || 1)), priceInr: Math.max(1, Math.round(Number(p.priceInr) || 0)), label: p.label.trim() || p.key }));
    if (!cleanPlans.some(p => p.enabled)) { setFlash('Keep at least one Premium plan switched on.'); return; }
    const yearly = cleanPlans.find(p => p.key === 'yearly' && p.enabled) || cleanPlans.find(p => p.enabled)!;
    StorageService.savePlanSettings({
      ...form,
      premiumPlans: cleanPlans,
      featuredPriceInr: Math.max(1, Math.round(Number(form.featuredPriceInr) || DEFAULT_PROMOTION.featuredPriceInr)),
      featuredDays: Math.max(1, Math.round(Number(form.featuredDays) || DEFAULT_PROMOTION.featuredDays)),
      urgentPriceInr: Math.max(1, Math.round(Number(form.urgentPriceInr) || DEFAULT_PROMOTION.urgentPriceInr)),
      urgentDays: Math.max(1, Math.round(Number(form.urgentDays) || DEFAULT_PROMOTION.urgentDays)),
      premiumDurationMonths: yearly.months,
      institutionDurationMonths: Math.max(1, Number(form.institutionDurationMonths) || 12),
      premiumPriceInr: yearly.priceInr,
      institutionPriceInr: Math.max(1, Math.round(Number(form.institutionPriceInr) || 0)),
      institutionCategoryPrices: Object.fromEntries(INSTITUTION_CATEGORIES.map(c => [c.key, Math.max(1, Math.round(Number(categoryPricesOf(form)[c.key]) || 0))])) as InstitutionCategoryPrices,
      gstPercent: Math.min(28, Math.max(0, Number(form.gstPercent) || 0)),
    });
    setSettings(null);
    setFlash('Plan settings saved.');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          ['Premium members', members.length],
          ['Free candidates', candidates.length - members.length],
          ['Pending upgrade requests', pending.length],
          ['Premium vacancies', StorageService.getJobs().filter(j => j.isPremium).length],
          ['Subscribed institutions', instActive.length],
          ['Institution requests', instPending.length],
        ].map(([l, v]) => (
          <div key={l as string} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm"><div className="text-xs text-slate-500">{l}</div><div className="text-3xl font-bold text-slate-900 mt-1">{v}</div></div>
        ))}
      </div>

      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">Payments &amp; transactions</h3>
          {online && (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className={`px-2.5 py-1 rounded-full border ${online.configured ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gold-50 text-gold-900 border-gold-200'}`}>{online.configured ? 'Connected' : 'Not set up — using manual requests'}</span>
              {online.configured && <span className={`px-2.5 py-1 rounded-full border ${online.testMode ? 'bg-gold-50 text-gold-900 border-gold-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>{online.testMode ? 'Test mode' : 'Live mode'}</span>}
              {online.configured && <span className={`px-2.5 py-1 rounded-full border ${online.webhook ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{online.webhook ? 'Webhook on' : 'Webhook off'}</span>}
            </div>
          )}
        </div>
        {online && !online.configured && <p className="text-xs text-slate-500">To take payments online, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (and RAZORPAY_WEBHOOK_SECRET) as secrets in your hosting — or in .env.local on your computer — and restart the site. Offline payments can be recorded below meanwhile.</p>}
        <TransactionsLedger online={!!online?.configured} />
      </section>

      <section className="space-y-3">
        <h3 className="font-bold text-slate-900">Institution subscription requests</h3>
        <TableShell head={['Institute', 'Requested by', 'Verification', 'Notes', '']} empty={instPending.length === 0}>
          {instPending.map(i => (
            <tr key={i.id} className="hover:bg-ivory">
              <td className="px-4 py-3"><div className="font-medium text-slate-900">{i.name}</div><div className="text-xs text-slate-500">AISHE {i.aisheCode}</div></td>
              <td className="px-4 py-3 text-slate-600"><div>{i.subscription?.requestedBy}</div><div className="text-xs text-slate-500">{i.subscription?.requestedAt}</div></td>
              <td className="px-4 py-3 text-slate-600 capitalize">{i.verificationStatus}</td>
              <td className="px-4 py-3 text-slate-600 max-w-xs">{i.subscription?.note || '—'}</td>
              <td className="px-4 py-3"><div className="flex justify-end"><button className={btnPrimary} onClick={() => setSubFor(i)}><Crown className="w-4 h-4" /> Review</button></div></td>
            </tr>
          ))}
        </TableShell>
        {subFor && <SubscriptionForm inst={subFor} onClose={() => setSubFor(null)} onDone={m => { setSubFor(null); setFlash(m); }} />}
      </section>

      <section className="space-y-3">
        <h3 className="font-bold text-slate-900">Candidate upgrade requests</h3>
        <TableShell head={['Candidate', 'Requested', 'Message', '']} empty={pending.length === 0}>
          {pending.map(r => (
            <tr key={r.id} className="hover:bg-ivory">
              <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.userName}</div><div className="text-xs text-slate-500">{r.userEmail}</div></td>
              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.requestedAt}</td>
              <td className="px-4 py-3 text-slate-600 max-w-sm">{r.note || '—'}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button className={btnGhost} onClick={() => resolve(r, false)}>Decline</button>
                  <button className={btnPrimary} onClick={() => resolve(r, true)}><Check className="w-4 h-4" /> Activate Premium</button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Resolved requests ({history.length})</summary>
            <ul className="mt-2 space-y-1">
              {history.map(r => (
                <li key={r.id} className="flex items-center gap-3 text-xs text-slate-600">
                  <span className={r.status === 'approved' ? 'text-emerald-700 font-semibold' : 'text-crimson-700 font-semibold'}>{r.status}</span>
                  <span>{r.userName} ({r.userEmail})</span><span>{r.resolvedAt}</span>
                  <button className="text-slate-400 hover:text-crimson-700" aria-label="Delete record" onClick={() => StorageService.deleteUpgradeRequest(r.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Crown className="w-4 h-4 text-gold-500" /> Premium members</h3>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {members.length === 0 && <li className="py-3 text-slate-500">No Premium members yet. Grant Premium from the Users tab or approve a request.</li>}
            {members.map(u => (
              <li key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                <span><span className="font-medium text-slate-900">{u.name}</span> <span className="text-slate-500">{u.email}</span></span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{u.premiumUntil ? `until ${u.premiumUntil}` : 'no end date'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900">Plan settings</h3>
          <p className="text-xs text-slate-500 mt-1">Shown to candidates on the Plans page.</p>
          <form onSubmit={saveSettings} className="mt-4 space-y-4">
            <Field label="Premium price (as displayed)"><input required className={inputCls} value={form.premiumPriceLabel} onChange={e => setSettings({ ...form, premiumPriceLabel: e.target.value })} /></Field>
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1.5">Candidate Premium plans (₹, incl. GST)</div>
              <div className="space-y-2">
                {plans.map(p => (
                  <div key={p.key} className="p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="grid grid-cols-[auto_1fr_5rem_6rem] gap-2 items-center">
                      <input type="checkbox" className="w-4 h-4 accent-brand-900" aria-label={`Offer the ${p.label} plan`} checked={p.enabled} onChange={e => setPlan(p.key, { enabled: e.target.checked })} />
                      <input className={inputCls} aria-label="Plan name" value={p.label} onChange={e => setPlan(p.key, { label: e.target.value })} />
                      <input type="number" min={1} className={inputCls} aria-label="Months" title="Months" value={p.months} onChange={e => setPlan(p.key, { months: Number(e.target.value) })} />
                      <input type="number" min={1} className={inputCls} aria-label="Price in rupees" title="Price (₹)" value={p.priceInr} onChange={e => setPlan(p.key, { priceInr: Number(e.target.value) })} />
                    </div>
                    <input className={inputCls} aria-label="Note shown under the plan" placeholder="Note shown under the plan (optional)" value={p.note || ''} onChange={e => setPlan(p.key, { note: e.target.value })} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Columns: on/off · name · months · price. The yearly plan is also used when you approve an offline upgrade request.</p>
            </div>
            <Field label="How to upgrade (instructions for candidates)"><textarea rows={3} className={inputCls} value={form.upgradeInstructions} onChange={e => setSettings({ ...form, upgradeInstructions: e.target.value })} /></Field>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Institution Premium</div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1.5">Price by AISHE category (₹ per subscription, incl. GST)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {INSTITUTION_CATEGORIES.map(c => (
                  <Field key={c.key} label={`${c.label} (${c.prefix}-)`}>
                    <input required type="number" min={1} className={inputCls} value={categoryPricesOf(form)[c.key]}
                      onChange={e => setSettings({ ...form, institutionCategoryPrices: { ...categoryPricesOf(form), [c.key]: Number(e.target.value) } })} />
                  </Field>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">The category is read from the institute’s AISHE code: C- college, S- standalone, U- university, R- R&amp;D. Checkout, sign-up and the Premium page use these prices.</p>
            </div>
            <Field label="Institution price label (used only when the AISHE code has no known category)"><input required className={inputCls} value={form.institutionPriceLabel} onChange={e => setSettings({ ...form, institutionPriceLabel: e.target.value })} /></Field>
            <Field label="Default institution subscription (months)"><input required type="number" min={1} className={inputCls} value={form.institutionDurationMonths} onChange={e => setSettings({ ...form, institutionDurationMonths: Number(e.target.value) })} /></Field>
            <Field label="Instructions shown to institutions"><textarea rows={3} className={inputCls} value={form.institutionInstructions} onChange={e => setSettings({ ...form, institutionInstructions: e.target.value })} /></Field>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Online payment and invoices</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Institution Premium, other codes (₹, incl. GST)"><input required type="number" min={1} className={inputCls} value={form.institutionPriceInr} onChange={e => setSettings({ ...form, institutionPriceInr: Number(e.target.value) })} /></Field>
              <Field label="GST %"><input required type="number" min={0} max={28} step="0.01" className={inputCls} value={form.gstPercent} onChange={e => setSettings({ ...form, gstPercent: Number(e.target.value) })} /></Field>
            </div>
            <div className="pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vacancy promotions (paid by institutions)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Featured price (₹)"><input type="number" min={1} className={inputCls} value={form.featuredPriceInr ?? DEFAULT_PROMOTION.featuredPriceInr} onChange={e => setSettings({ ...form, featuredPriceInr: Number(e.target.value) })} /></Field>
              <Field label="Featured days"><input type="number" min={1} className={inputCls} value={form.featuredDays ?? DEFAULT_PROMOTION.featuredDays} onChange={e => setSettings({ ...form, featuredDays: Number(e.target.value) })} /></Field>
              <Field label="Urgent label price (₹)"><input type="number" min={1} className={inputCls} value={form.urgentPriceInr ?? DEFAULT_PROMOTION.urgentPriceInr} onChange={e => setSettings({ ...form, urgentPriceInr: Number(e.target.value) })} /></Field>
              <Field label="Urgent days"><input type="number" min={1} className={inputCls} value={form.urgentDays ?? DEFAULT_PROMOTION.urgentDays} onChange={e => setSettings({ ...form, urgentDays: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Business name on invoices"><input required className={inputCls} value={form.invoiceBusinessName} onChange={e => setSettings({ ...form, invoiceBusinessName: e.target.value })} /></Field>
            <Field label="Business address on invoices"><textarea rows={2} className={inputCls} value={form.invoiceAddress} onChange={e => setSettings({ ...form, invoiceAddress: e.target.value })} /></Field>
            <Field label="GSTIN (leave empty if not registered)"><input className={inputCls} value={form.invoiceGstin} onChange={e => setSettings({ ...form, invoiceGstin: e.target.value.toUpperCase() })} /></Field>
            <div className="flex justify-end"><button type="submit" className={btnPrimary} disabled={!settings}>Save settings</button></div>
          </form>
        </section>
      </div>
      <Flash msg={flash} />
    </div>
  );
}
