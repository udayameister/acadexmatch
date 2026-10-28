'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import ScrapePipelinePanel from '@/components/ScrapePipelinePanel';
import CustomersPanel from '@/components/CustomersPanel';
import EmailsPanel from '@/components/EmailsPanel';
import GrowthPanel from '@/components/GrowthPanel';
import QualityPanel from '@/components/QualityPanel';
import { AnnouncementsPanel } from '@/components/Announcements';
import { PartnersPanel } from '@/components/Partners';
import { UsersPanel, InstitutionsPanel, VacanciesPanel, ApplicationsPanel, SitePanel, PremiumPanel } from '@/components/AdminManagement';
import { Institute, DPDPDataRequest, AuditLog, User } from '@/types';
import { 
  ShieldCheck, 
  Building2, 
  CheckCircle2, 
  Lock, 
  Activity, 
  AlertTriangle,
  Users,
  Briefcase,
  ClipboardList,
  Settings2,
  Trash2,
  Crown,
  Globe,
  Award,
  Mail,
  TrendingUp,
  ShieldAlert,
  Megaphone,
  Handshake,
} from 'lucide-react';

type AdminTab = 'growth' | 'quality' | 'announcements' | 'partners' | 'users' | 'institutions' | 'customers' | 'vacancies' | 'scraping' | 'applications' | 'premium' | 'verification' | 'dpdp' | 'audit' | 'emails' | 'site';

export default function AdminCompliancePage() {
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [dpdpRequests, setDpdpRequests] = useState<DPDPDataRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [allJobCount, setAllJobCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
  const [upgradeCount, setUpgradeCount] = useState(0);
  const [scrapePending, setScrapePending] = useState(0);

  useEffect(() => {
    const check = () => fetch('/api/scrape-pipeline', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.queue) setScrapePending(d.queue.filter((q: { status: string }) => q.status === 'pending').length); })
      .catch(() => undefined);
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [activeTab]);
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  useEffect(() => {
    const sync = () => {
      const order = { pending: 0, rejected: 1, verified: 2 } as const;
      setInstitutes([...StorageService.getInstitutes()].sort((a, b) => order[a.verificationStatus] - order[b.verificationStatus]));
      setDpdpRequests(StorageService.getDPDPRequests());
      setAuditLogs(StorageService.getAuditLogs());
      setUsers(StorageService.getUsers());
      setJobCount(StorageService.getPublishedJobs().length);
      setAllJobCount(StorageService.getJobs().length);
      setAppCount(StorageService.getAllApplications().length);
      setUpgradeCount(StorageService.getUpgradeRequests().filter(r => r.status === 'pending').length + StorageService.getInstitutes().filter(i => i.subscription?.status === 'pending').length);
    };
    sync();
    window.addEventListener('acad-storage-updated', sync);
    return () => window.removeEventListener('acad-storage-updated', sync);
  }, []);

  const pendingInstitutes = institutes.filter(i => i.verificationStatus === 'pending').length;
  const openRequests = dpdpRequests.filter(r => r.status === 'Pending' || r.status === 'Under Review').length;
  const visibleLogs = auditFilter === 'ALL' ? auditLogs : auditLogs.filter(l => l.complianceCategory === auditFilter);

  const handleRejectDpdp = (reqId: string) => {
    StorageService.updateDPDPStatus(reqId, 'Rejected', 'Request declined by the Data Protection Officer.');
    setActionSuccess('Request declined.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const exportAuditCsv = () => {
    const header = 'timestamp,actor,role,category,action,target';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = visibleLogs.map(l => [l.timestamp, l.actor, l.actorRole, l.complianceCategory, l.action, l.target].map(esc).join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVerifyInstitute = (instId: string, status: 'verified' | 'rejected') => {
    StorageService.updateInstituteVerification(instId, status);
    setActionSuccess(`${institutes.find(i => i.id === instId)?.name || 'Institute'} marked ${status}.`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleCompleteDpdp = (req: DPDPDataRequest) => {
    const isErasure = req.requestType.startsWith('Right to Erasure');
    if (isErasure && !confirm(`Permanently delete the account, profile and applications of ${req.userEmail}? This cannot be undone.`)) return;
    const note = isErasure
      ? 'Account, profile and applications permanently erased.'
      : req.requestType.startsWith('Revoke')
      ? 'Automated matching disabled for this profile.'
      : 'Data export prepared and shared with the data principal.';
    StorageService.updateDPDPStatus(req.id, 'Completed', note);
    setActionSuccess('Request completed.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
      
      {/* Header - Full Width */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-900 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200 mb-1">
            <ShieldCheck className="w-4 h-4 text-brand-700" /> Platform administrator
          </div>
          <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900">
            Admin console
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1 font-medium">
            Full control of the platform: add, edit and remove users, institutions, vacancies and applications; verify institutions; handle data-rights requests; review activity and site visits.
          </p>
        </div>

        {actionSuccess && (
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs flex items-center gap-2 animate-in fade-in shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-bold">{actionSuccess}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Registered users', users.length, `${users.filter(u => u.role === 'candidate').length} candidates · ${users.filter(u => u.role === 'institute_admin').length} institute admins`],
          ['Institutions awaiting verification', pendingInstitutes, `${institutes.filter(i => i.verificationStatus === 'verified').length} verified`],
          ['Open data requests', openRequests, `${dpdpRequests.length} total`],
          ['Published vacancies', jobCount, 'Across all institutions'],
        ].map(([label, value, sub]) => (
          <div key={label as string} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="font-serif text-3xl font-bold text-slate-900 mt-1">{value}</div>
            <div className="text-xs text-slate-400 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 text-xs" role="tablist" aria-label="Admin sections">
        {([
          ['growth', TrendingUp, 'Growth'],
          ['users', Users, `Users (${users.length})`],
          ['institutions', Building2, `Institutions (${institutes.length})`],
          ['customers', Award, 'Our customers'],
          ['vacancies', Briefcase, `Vacancies (${allJobCount})`],
          ['scraping', Globe, `Job scraping${scrapePending ? ` (${scrapePending} to approve)` : ''}`],
          ['applications', ClipboardList, `Applications (${appCount})`],
          ['premium', Crown, `Premium${upgradeCount ? ` (${upgradeCount} new)` : ''}`],
          ['quality', ShieldAlert, 'Quality checks'],
          ['verification', CheckCircle2, `Verification (${pendingInstitutes} pending)`],
          ['dpdp', Lock, `Data rights (${openRequests} open)`],
          ['audit', Activity, `Audit log (${auditLogs.length})`],
          ['announcements', Megaphone, 'Announcements'],
          ['partners', Handshake, 'Partners'],
          ['emails', Mail, 'Emails'],
          ['site', Settings2, 'Site & visits'],
        ] as [AdminTab, typeof Users, string][]).map(([key, Icon, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2 ${
              activeTab === key
                ? 'bg-brand-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'growth' && <GrowthPanel />}
      {activeTab === 'quality' && <QualityPanel />}
      {activeTab === 'announcements' && <AnnouncementsPanel />}
      {activeTab === 'partners' && <PartnersPanel />}
      {activeTab === 'users' && <UsersPanel />}
      {activeTab === 'institutions' && <InstitutionsPanel />}
      {activeTab === 'vacancies' && <VacanciesPanel />}
      {activeTab === 'applications' && <ApplicationsPanel />}
      {activeTab === 'site' && <SitePanel />}
      {activeTab === 'scraping' && <ScrapePipelinePanel />}
      {activeTab === 'customers' && <CustomersPanel />}
      {activeTab === 'emails' && <EmailsPanel />}
      {activeTab === 'premium' && <PremiumPanel />}

      {/* TAB 1: AISHE & NAAC Verification Queue */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 text-xs text-gold-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-gold-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 font-bold">Statutory Rule: </strong>
              Verify the AISHE code on the official AISHE portal before approving. Only verified institutions can publish vacancies.
            </div>
          </div>

          <div className="space-y-3">
            {institutes.map((inst) => (
              <div
                key={inst.id}
                className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif font-bold text-slate-900 text-base truncate">
                      {inst.name}
                    </h3>
                    <span className="font-mono text-[12px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      AISHE: {inst.aisheCode}
                    </span>
                    <span className="text-[12px] font-bold bg-gold-50 text-gold-800 px-2 py-0.5 rounded border border-gold-200">
                      NAAC {inst.accreditation.naacGrade}
                    </span>
                  </div>

                  <p className="text-slate-600 text-xs font-medium">
                    {inst.type} • {inst.location.city}, {inst.location.state}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1 font-medium">
                    <span>Contact: {inst.contactEmail || '—'}</span>
                    <span>•</span>
                    <span>UGC 2(f)/12(B): <strong className="text-slate-700">{inst.accreditation.ugc2f12bStatus ? 'Approved' : 'Pending'}</strong></span>
                    <span>•</span>
                    <span>AICTE: <strong className="text-slate-700">{inst.accreditation.aicteApproved ? 'Approved' : 'Exempt / University'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[12px] font-bold uppercase px-3 py-1 rounded-full border ${
                    inst.verificationStatus === 'verified'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : inst.verificationStatus === 'rejected'
                      ? 'bg-crimson-50 text-crimson-700 border-crimson-100'
                      : 'bg-gold-50 text-gold-800 border-gold-300'
                  }`}>
                    {inst.verificationStatus}
                  </span>

                  {inst.verificationStatus !== 'verified' ? (
                    <>
                      {inst.verificationStatus === 'pending' && (
                        <button
                          onClick={() => handleVerifyInstitute(inst.id, 'rejected')}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-crimson-50 text-crimson-700 border border-crimson-100 font-bold transition"
                        >
                          Reject
                        </button>
                      )}
                      <button
                        onClick={() => handleVerifyInstitute(inst.id, 'verified')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-1 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleVerifyInstitute(inst.id, 'rejected')}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-crimson-50 text-slate-600 hover:text-crimson-600 border border-slate-200 transition text-xs font-bold"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: DPDP Act Data Rights Desk */}
      {activeTab === 'dpdp' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200 text-xs text-brand-900 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-950 font-bold">DPDP Act, 2023: </strong>
              Completing an erasure request permanently deletes the user&apos;s account, profile and applications. Completing a consent withdrawal switches off automated matching for that profile.
            </div>
          </div>

          <div className="space-y-3">
            {dpdpRequests.length === 0 && (
              <p className="p-8 text-center text-xs text-slate-500 rounded-3xl bg-white border border-slate-200">No data-rights requests yet.</p>
            )}
            {dpdpRequests.map((req) => (
              <div
                key={req.id}
                className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{req.userName}</span>
                      <span className="text-slate-500 font-mono">({req.userEmail})</span>
                    </div>
                    <div className="text-brand-900 font-bold mt-0.5">
                      Request: {req.requestType}
                    </div>
                  </div>

                  <span className={`text-[12px] font-bold uppercase px-3 py-1 rounded-full border self-start ${
                    req.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-gold-50 text-gold-800 border-gold-300'
                  }`}>
                    {req.status}
                  </span>
                </div>

                {req.reason && (
                  <p className="text-slate-600 text-xs italic bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    &quot;{req.reason}&quot;
                  </p>
                )}

                {req.dpoActionNotes && (
                  <div className="p-3 rounded-2xl bg-emerald-50 text-xs text-emerald-900 border border-emerald-200">
                    <strong className="text-emerald-950">DPO Action: </strong>{req.dpoActionNotes}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-3">
                    Requested on: {req.requestedAt}
                    <button
                      onClick={() => { if (confirm('Delete this request record?')) StorageService.deleteDPDPRequest(req.id); }}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-crimson-700"
                      aria-label={`Delete request from ${req.userEmail}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </span>

                  {(req.status === 'Pending' || req.status === 'Under Review') && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRejectDpdp(req.id)}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-bold transition text-xs"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleCompleteDpdp(req)}
                        className="px-4 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-bold transition flex items-center gap-1 text-xs shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Audit trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between font-medium">
            <div className="flex items-center gap-2">
              <span>Filter:</span>
              <select aria-label="Filter audit log" value={auditFilter} onChange={e => setAuditFilter(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1">
                <option value="ALL">All categories</option>
                {Array.from(new Set(auditLogs.map(l => l.complianceCategory))).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={exportAuditCsv} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-brand-900">
                Export CSV ({visibleLogs.length})
              </button>
              <button
                onClick={() => { if (confirm('Clear the entire audit log? Export it first if you need a record.')) StorageService.clearAuditLogs(); }}
                className="px-3 py-1.5 rounded-lg bg-white border border-crimson-100 hover:bg-crimson-50 font-bold text-crimson-700 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear log
              </button>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {visibleLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-900 font-bold">{log.action}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-700 font-sans">{log.target}</span>
                  </div>
                  <div className="text-slate-500 text-[12px] font-sans font-medium">
                    Actor: <strong className="text-slate-900">{log.actor}</strong> ({log.actorRole.replace('_', ' ')})
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-500 text-[12px] self-end sm:self-center">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                    {log.complianceCategory}
                  </span>
                  <span>{log.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
