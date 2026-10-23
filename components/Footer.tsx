'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { useCurrentUser } from '@/lib/useAuth';
import { DPDPDataRequest } from '@/types';
import { BrandLogo } from './Navbar';
import VisitCounter from './VisitCounter';
import { CONTACT_EMAIL, CONTACT_MAILTO } from '@/lib/contact';
import { Shield, CheckCircle2, Send, Download, X, Mail } from 'lucide-react';

type RequestType = DPDPDataRequest['requestType'];

export default function Footer() {
  const { user } = useCurrentUser();
  const [showDpdpModal, setShowDpdpModal] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>('Right to Erasure (Delete all Academic CV & Personal Data)');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitDpdp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!StorageService.createDPDPRequest(requestType, reason || undefined)) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setShowDpdpModal(false);
      setReason('');
    }, 2500);
  };

  const handleExport = () => {
    const data = StorageService.exportMyData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acadexmatch-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'Candidates',
      links: [
        { href: '/jobs', label: 'Browse vacancies' },
        { href: '/candidate/profile', label: 'Academic profile & API score' },
        { href: '/candidate/resume-parser', label: 'Import from CV' },
        { href: '/candidate/applications', label: 'Track applications' },
      ],
    },
    {
      title: 'Institutions',
      links: [
        { href: '/register', label: 'Register your institute' },
        { href: '/institute/post-job', label: 'Post a vacancy' },
        { href: '/institute/ats', label: 'Applicant pipeline' },
        { href: '/institutes', label: 'Institution directory' },
      ],
    },
    {
      title: 'Platform',
      links: [
        { href: '/about', label: 'About us' },
        { href: '/about#contact', label: 'Contact us' },
        { href: '/#how-it-works', label: 'How it works' },
        { href: '/#faq', label: 'FAQ' },
        { href: '/premium', label: 'Plans & Premium' },
        { href: '/salary-calculator', label: 'Salary calculator' },
        { href: '/login', label: 'Sign in' },
      ],
    },
  ];

  return (
    <>
      <footer className="print:hidden bg-brand-950 text-brand-100/80 w-full mt-24 border-t-2 border-gold-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 space-y-4">
            <BrandLogo inverted />
            <p className="text-sm leading-relaxed max-w-sm">
              The academic recruitment platform for Indian higher education — connecting scholars with universities through transparent, regulation-aware hiring.
            </p>
            <button
              onClick={() => setShowDpdpModal(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-gold-300 transition"
            >
              <Shield className="w-4 h-4 text-emerald-400" /> Your data rights (DPDP Act, 2023)
            </button>
            <a href={CONTACT_MAILTO} className="flex items-center gap-2 text-sm font-medium text-white hover:text-gold-300 transition w-fit">
              <Mail className="w-4 h-4 text-gold-300" /> {CONTACT_EMAIL}
            </a>
          </div>

          {columns.map(col => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5 text-sm">
                {col.links.map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-white transition">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-center text-brand-100/60">
            <span>&copy; {new Date().getFullYear()} AcadeXMatch. Built for Indian higher education.</span>
            <VisitCounter />
            <span>Aligned with UGC Regulations 2018 · AICTE norms · 7th CPC pay matrix</span>
          </div>
        </div>
      </footer>

      {showDpdpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                <h3 className="font-serif font-bold text-slate-900 text-lg">Your data rights</h3>
              </div>
              <button onClick={() => setShowDpdpModal(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!user ? (
              <div className="py-6 text-sm text-slate-600 space-y-4">
                <p>Sign in to download your data, request deletion, or withdraw consent for automated matching.</p>
                <p>Questions about your data? Write to <a href={CONTACT_MAILTO} className="font-semibold text-brand-800 underline">{CONTACT_EMAIL}</a>.</p>
                <Link href="/login" onClick={() => setShowDpdpModal(false)} className="inline-flex px-4 py-2 rounded-xl bg-brand-900 text-white font-semibold hover:bg-brand-800">
                  Sign in
                </Link>
              </div>
            ) : submitted ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-semibold text-slate-900">Request submitted</h4>
                <p className="text-sm text-slate-600 max-w-sm mx-auto">The Data Protection Officer will review it. You can see its status in the admin queue.</p>
              </div>
            ) : (
              <div className="space-y-5 mt-5 text-sm">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">Download my data</div>
                    <div className="text-xs text-slate-500">Account, profile and applications as JSON.</div>
                  </div>
                  <button onClick={handleExport} className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 font-medium flex items-center gap-1.5 shrink-0">
                    <Download className="w-4 h-4" /> Export
                  </button>
                </div>

                <form onSubmit={handleSubmitDpdp} className="space-y-4">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Request</label>
                    <select
                      value={requestType}
                      onChange={e => setRequestType(e.target.value as RequestType)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-brand-500"
                    >
                      <option value="Right to Erasure (Delete all Academic CV & Personal Data)">Delete my account and all personal data</option>
                      <option value="Revoke AI Matching Processing Consent">Withdraw consent for automated matching</option>
                      <option value="Data Portability Export (JSON/PDF)">Request a certified data export</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Notes (optional)</label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Applications already submitted to a selection committee may be retained by the institution as required by its statutory record-keeping rules.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowDpdpModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">
                      Cancel
                    </button>
                    <button type="submit" className="px-5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold flex items-center gap-1.5">
                      <Send className="w-4 h-4" /> Submit
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
