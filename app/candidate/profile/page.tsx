'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PublicationImport from '@/components/PublicationImport';
import { useSearchParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { getUgcTable3ABreakdown, verifyJournalUgcCareStatus, computeProfileCompleteness, computeExperienceYears } from '@/lib/scoring';
import { CandidateProfile, PublicationItem, EducationItem, ExperienceItem } from '@/types';
import ResumeParserModal from '@/components/ResumeParserModal';
import { DocumentUploader, DocumentChecklist, CandidateAvatar } from '@/components/CandidateDocuments';
import { useDocuments, missingRequired } from '@/lib/documents';
import { usePlan, PremiumLock } from '@/components/Premium';
import { Sparkles, BookOpen, Briefcase, GraduationCap, CheckCircle2, Plus, Save, Trash2, ArrowLeft, ShieldCheck, User, Link2, Award, FileCheck2, Upload, Download } from 'lucide-react';

const inputCls = 'w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
const NET_TYPES = ['UGC-NET (JRF)', 'UGC-NET (LS)', 'CSIR-NET (JRF)', 'CSIR-NET (LS)', 'SLET/SET', 'GATE'] as const;

function Section({ icon: Icon, title, subtitle, children, id }: { icon: typeof User; title: string; subtitle?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 p-6 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <div>
          <h2 className="font-serif font-bold text-slate-900 text-lg">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileEditor() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCvModal, setShowCvModal] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [interestsText, setInterestsText] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [newPub, setNewPub] = useState({ title: '', journal: '', year: new Date().getFullYear(), authors: '', doi: '', type: 'Journal' as PublicationItem['type'] });

  const load = () => {
    const p = StorageService.getCandidateProfile();
    setProfile(p);
    setInterestsText(p?.researchInterests.join(', ') || '');
    setSkillsText(p?.skills.join(', ') || '');
    setDirty(false);
  };

  useEffect(load, []);

  const breakdown = useMemo(() => (profile ? getUgcTable3ABreakdown(profile) : null), [profile]);
  const completeness = profile ? computeProfileCompleteness(profile) : 0;
  const { docs, ready: docsReady } = useDocuments(profile?.userId);
  const { isPremium } = usePlan();

  // Links such as /candidate/profile#documents land on the upload section once the page has rendered.
  useEffect(() => {
    if (profile && window.location.hash === '#documents') {
      setTimeout(() => document.getElementById('documents')?.scrollIntoView({ block: 'start' }), 150);
    }
  }, [profile?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || !breakdown) return null;

  const hasExperience = profile.experience.length > 0;
  const missingDocs = docsReady ? missingRequired(docs, hasExperience) : [];
  const isWelcome = Boolean(searchParams.get('welcome'));
  const goToDocuments = () => document.getElementById('documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const update = (patch: Partial<CandidateProfile>) => {
    setProfile(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };

  const handleSave = () => {
    const saved = StorageService.updateCandidateProfile({
      ...profile,
      researchInterests: interestsText.split(',').map(s => s.trim()).filter(Boolean),
      skills: skillsText.split(',').map(s => s.trim()).filter(Boolean),
    });
    setProfile(saved);
    setDirty(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  // Education
  const addEducation = () =>
    update({ education: [...profile.education, { id: `edu-${Date.now()}`, degree: '', field: '', institute: '', year: new Date().getFullYear(), gradePercentage: '' }] });
  const editEducation = (id: string, patch: Partial<EducationItem>) => update({ education: profile.education.map(e => (e.id === id ? { ...e, ...patch } : e)) });
  const removeEducation = (id: string) => update({ education: profile.education.filter(e => e.id !== id) });

  // Experience
  const addExperience = () =>
    update({
      experience: [
        ...profile.experience,
        { id: `exp-${Date.now()}`, designation: '', instituteOrCompany: '', department: '', startDate: '', endDate: 'Present', isCurrent: true, type: 'Teaching' },
      ],
    });
  const editExperience = (id: string, patch: Partial<ExperienceItem>) => update({ experience: profile.experience.map(e => (e.id === id ? { ...e, ...patch } : e)) });
  const removeExperience = (id: string) => update({ experience: profile.experience.filter(e => e.id !== id) });

  // Publications
  const addPublication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPub.title.trim() || !newPub.journal.trim()) return;
    const est = verifyJournalUgcCareStatus(newPub.journal);
    const pub: PublicationItem = {
      id: `pub-${Date.now()}`,
      title: newPub.title.trim(),
      journalOrConference: newPub.journal.trim(),
      year: Number(newPub.year),
      authors: newPub.authors.trim() || profile.name,
      doi: newPub.doi.trim() || undefined,
      ugcCareListed: est.isUgcCare,
      scopusIndexed: est.isScopus,
      sciScieIndexed: est.isSci,
      type: newPub.type,
    };
    update({ publications: [pub, ...profile.publications] });
    setNewPub({ title: '', journal: '', year: new Date().getFullYear(), authors: '', doi: '', type: 'Journal' });
  };
  const editPublication = (id: string, patch: Partial<PublicationItem>) => update({ publications: profile.publications.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  const removePublication = (id: string) => update({ publications: profile.publications.filter(p => p.id !== id) });

  const rows: [string, number, number][] = [
    ['Graduation', breakdown.graduationScore, 15],
    ['Post-graduation', breakdown.postGraduationScore, 25],
    ['Ph.D.', breakdown.phdScore, 30],
    ['NET / JRF / SLET', breakdown.netJrfScore, 7],
    ['Research papers', breakdown.publicationsScore, 10],
    ['Teaching / post-doc experience', breakdown.experienceScore, 10],
    ['Awards', breakdown.awardsScore, 3],
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <Link href="/candidate/dashboard" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 font-medium mb-2">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <CandidateAvatar userId={profile.userId} name={profile.name} className="w-14 h-14 sm:w-16 sm:h-16" />
            <div>
              <h1 className="font-serif text-2xl sm:text-4xl font-bold text-slate-900">Academic profile</h1>
              <p className="text-slate-500 text-sm mt-1">Institutions see this profile when you apply. Your academic score updates as you edit.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/candidate/cv" className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-sm font-semibold flex items-center gap-1.5 transition">
            <FileCheck2 className="w-4 h-4 text-brand-700" /> CV as PDF
          </Link>
          {isPremium ? (
          <button onClick={() => setShowCvModal(true)} className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-sm font-semibold flex items-center gap-1.5 transition">
            <Sparkles className="w-4 h-4 text-brand-700" /> Import from CV
          </button>
          ) : (
            <PremiumLock compact title="Import from CV" />
          )}
          <button onClick={handleSave} disabled={!dirty} className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> Save changes
          </button>
        </div>
      </div>

      {isWelcome && (
        <div className="p-5 sm:p-6 rounded-2xl bg-blush border border-brand-100 space-y-4">
          <div>
            <div className="font-semibold text-brand-950 text-lg">Welcome to AcadeXMatch! Your account is ready.</div>
            <p className="text-sm text-slate-600">Two more steps complete your application profile.</p>
          </div>
          <ol className="grid sm:grid-cols-2 gap-3">
            <li className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${profile.education.length ? 'bg-emerald-600 text-white' : 'bg-brand-900 text-white'}`}>{profile.education.length ? <CheckCircle2 className="w-4 h-4" /> : 1}</span>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Fill in your academic details</div>
                  <p className="text-xs text-slate-500">{isPremium ? 'Import your CV or enter' : 'Enter your'} degrees, experience and publications below.</p>
                </div>
              </div>
              {isPremium ? (
              <button onClick={() => setShowCvModal(true)} className="self-start px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-700" /> Import my CV
              </button>
              ) : (
                <button onClick={() => document.getElementById('personal-details')?.scrollIntoView({ behavior: 'smooth' })} className="self-start px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold">Fill in details</button>
              )}
            </li>
            <li className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${docsReady && missingDocs.length === 0 ? 'bg-emerald-600 text-white' : 'bg-brand-900 text-white'}`}>{docsReady && missingDocs.length === 0 ? <CheckCircle2 className="w-4 h-4" /> : 2}</span>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Upload your documents as proof</div>
                  <p className="text-xs text-slate-500">Profile photo, qualification certificates, experience certificates and any other certificates (PDF or image).</p>
                </div>
              </div>
              <button onClick={goToDocuments} className="self-start px-3.5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Upload documents
              </button>
            </li>
          </ol>
        </div>
      )}

      {!isWelcome && docsReady && missingDocs.length > 0 && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
          <div className="flex items-start gap-3">
            <FileCheck2 className="w-5 h-5 text-gold-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900 text-sm">Proof documents needed</div>
              <p className="text-xs text-slate-600">Still missing: {missingDocs.map(m => m.title.toLowerCase()).join(', ')}.</p>
            </div>
          </div>
          <button onClick={goToDocuments} className="px-3.5 py-2 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0">
            <Upload className="w-3.5 h-3.5" /> Upload now
          </button>
        </div>
      )}

      {savedNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Profile saved.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <Section id="personal-details" icon={User} title="Personal details">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full name (with title)</label>
                <input value={profile.name} onChange={e => update({ name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email (account)</label>
                <input value={profile.email} disabled className={`${inputCls} bg-slate-50 text-slate-500`} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={profile.phone} onChange={e => update({ phone: e.target.value })} placeholder="+91 98xxx xxxxx" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input value={profile.location.city} onChange={e => update({ location: { ...profile.location, city: e.target.value } })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input value={profile.location.state} onChange={e => update({ location: { ...profile.location, state: e.target.value } })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Current designation</label>
                <input value={profile.currentDesignation} onChange={e => update({ currentDesignation: e.target.value })} placeholder="Assistant Professor" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Current institution</label>
                <input value={profile.currentInstitute} onChange={e => update({ currentInstitute: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Highest degree</label>
                <input value={profile.highestDegree} onChange={e => update({ highestDegree: e.target.value })} placeholder="Ph.D. in Computer Science" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Research summary</label>
              <textarea rows={3} value={profile.bio || ''} onChange={e => update({ bio: e.target.value })} className={inputCls} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Research interests (comma separated)</label>
                <input value={interestsText} onChange={e => { setInterestsText(e.target.value); setDirty(true); }} placeholder="Machine Learning, VLSI, Power Systems" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Skills (comma separated)</label>
                <input value={skillsText} onChange={e => { setSkillsText(e.target.value); setDirty(true); }} placeholder="Python, MATLAB, LaTeX" className={inputCls} />
              </div>
            </div>
          </Section>

          <Section id="documents" icon={FileCheck2} title="Documents & proofs" subtitle="Upload proof for what you list on this profile. Institutions you apply to can view these files.">
            <DocumentUploader userId={profile.userId} hasExperience={hasExperience} />
          </Section>

          <Section icon={ShieldCheck} title="Statutory qualifications" subtitle="Used for UGC / AICTE eligibility checks on every vacancy.">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer">
                  <input type="checkbox" checked={profile.phdStatus.isCompleted} onChange={e => update({ phdStatus: { ...profile.phdStatus, isCompleted: e.target.checked } })} className="w-4 h-4 accent-brand-700" />
                  Ph.D. awarded
                </label>
                {profile.phdStatus.isCompleted && (
                  <div className="space-y-2">
                    <input placeholder="Awarding institution" value={profile.phdStatus.institute || ''} onChange={e => update({ phdStatus: { ...profile.phdStatus, institute: e.target.value } })} className={inputCls} />
                    <input placeholder="Thesis title" value={profile.phdStatus.thesisTitle || ''} onChange={e => update({ phdStatus: { ...profile.phdStatus, thesisTitle: e.target.value } })} className={inputCls} />
                    <input type="number" placeholder="Year awarded" value={profile.phdStatus.graduationYear || ''} onChange={e => update({ phdStatus: { ...profile.phdStatus, graduationYear: Number(e.target.value) || undefined } })} className={inputCls} />
                    <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={profile.phdStatus.isUgc2009_2016Compliant} onChange={e => update({ phdStatus: { ...profile.phdStatus, isUgc2009_2016Compliant: e.target.checked } })} className="mt-0.5 w-4 h-4 accent-brand-700" />
                      Awarded under UGC 2009/2016 regulations (regular mode, external evaluation, open viva) — exempts from NET
                    </label>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer">
                  <input type="checkbox" checked={profile.netSletStatus.isQualified} onChange={e => update({ netSletStatus: { ...profile.netSletStatus, isQualified: e.target.checked } })} className="w-4 h-4 accent-brand-700" />
                  NET / SLET qualified
                </label>
                {profile.netSletStatus.isQualified && (
                  <div className="space-y-2">
                    <select value={profile.netSletStatus.examType || ''} onChange={e => update({ netSletStatus: { ...profile.netSletStatus, examType: (e.target.value || undefined) as CandidateProfile['netSletStatus']['examType'] } })} className={inputCls}>
                      <option value="">Select exam…</option>
                      {NET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input placeholder="Subject" value={profile.netSletStatus.subject || ''} onChange={e => update({ netSletStatus: { ...profile.netSletStatus, subject: e.target.value } })} className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Year" value={profile.netSletStatus.qualifiedYear || ''} onChange={e => update({ netSletStatus: { ...profile.netSletStatus, qualifiedYear: Number(e.target.value) || undefined } })} className={inputCls} />
                      <input placeholder="Roll / certificate no." value={profile.netSletStatus.rollNumber || ''} onChange={e => update({ netSletStatus: { ...profile.netSletStatus, rollNumber: e.target.value } })} className={inputCls} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section icon={GraduationCap} title="Education" subtitle="Include your bachelor's and master's grades — they count towards your Table 3A score.">
            <div className="space-y-3">
              {profile.education.map(ed => (
                <div key={ed.id} className="p-4 rounded-2xl border border-slate-200 grid sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Degree</label>
                    <input value={ed.degree} onChange={e => editEducation(ed.id, { degree: e.target.value })} placeholder="M.Tech" className={inputCls} />
                  </div>
                  <div className="sm:col-span-4">
                    <label className={labelCls}>Field</label>
                    <input value={ed.field} onChange={e => editEducation(ed.id, { field: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-5">
                    <label className={labelCls}>Institution</label>
                    <input value={ed.institute} onChange={e => editEducation(ed.id, { institute: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Year</label>
                    <input type="number" value={ed.year || ''} onChange={e => editEducation(ed.id, { year: Number(e.target.value) })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-7">
                    <label className={labelCls}>Grade (e.g. 82.5% or 8.7 CGPA)</label>
                    <input value={ed.gradePercentage} onChange={e => editEducation(ed.id, { gradePercentage: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <button onClick={() => removeEducation(ed.id)} aria-label="Remove education" className="p-2.5 rounded-xl text-slate-400 hover:text-crimson-600 hover:bg-crimson-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={addEducation} className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-300 text-sm font-medium text-slate-600 hover:text-brand-700 flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> Add degree
              </button>
            </div>
          </Section>

          <Section icon={Briefcase} title="Experience" subtitle={`Total: ${computeExperienceYears(profile.experience)} years (${computeExperienceYears(profile.experience, true)} academic).`}>
            <div className="space-y-3">
              {profile.experience.map(ex => (
                <div key={ex.id} className="p-4 rounded-2xl border border-slate-200 grid sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-4">
                    <label className={labelCls}>Designation</label>
                    <input value={ex.designation} onChange={e => editExperience(ex.id, { designation: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-5">
                    <label className={labelCls}>Institution / organisation</label>
                    <input value={ex.instituteOrCompany} onChange={e => editExperience(ex.id, { instituteOrCompany: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Type</label>
                    <select value={ex.type} onChange={e => editExperience(ex.id, { type: e.target.value as ExperienceItem['type'] })} className={inputCls}>
                      <option>Teaching</option>
                      <option>Research / Postdoc</option>
                      <option>Industry / R&amp;D</option>
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label className={labelCls}>Start date</label>
                    <input type="date" value={ex.startDate} onChange={e => editExperience(ex.id, { startDate: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-4">
                    <label className={labelCls}>End date</label>
                    <input type="date" disabled={ex.isCurrent} value={ex.isCurrent ? '' : ex.endDate} onChange={e => editExperience(ex.id, { endDate: e.target.value })} className={`${inputCls} disabled:bg-slate-50`} />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600 pb-3 cursor-pointer">
                    <input type="checkbox" checked={ex.isCurrent} onChange={e => editExperience(ex.id, { isCurrent: e.target.checked, endDate: e.target.checked ? 'Present' : '' })} className="w-4 h-4 accent-brand-700" />
                    Current
                  </label>
                  <div className="sm:col-span-2 flex justify-end">
                    <button onClick={() => removeExperience(ex.id)} aria-label="Remove experience" className="p-2.5 rounded-xl text-slate-400 hover:text-crimson-600 hover:bg-crimson-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={addExperience} className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-300 text-sm font-medium text-slate-600 hover:text-brand-700 flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> Add position
              </button>
            </div>
          </Section>

          <Section icon={BookOpen} title={`Publications (${profile.publications.length})`} subtitle="Indexing is estimated from the venue — tick or untick to match the official UGC-CARE list.">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowImport(true)} className="px-4 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-900 border border-brand-200 text-xs font-bold inline-flex items-center gap-1.5"><Download className="w-4 h-4" /> Import from ORCID, DOI or Google Scholar</button>
              <span className="text-xs text-slate-500">or add one by hand below</span>
            </div>
            {showImport && (
              <PublicationImport
                existing={profile.publications}
                defaultOrcid={profile.scholarLinks?.orcid}
                fallbackAuthor={profile.name}
                onClose={() => setShowImport(false)}
                onAdd={(pubs, orcid) => {
                  update({ publications: [...pubs, ...profile.publications], ...(orcid && !profile.scholarLinks?.orcid ? { scholarLinks: { ...profile.scholarLinks, orcid } } : {}) });
                  setShowImport(false);
                }}
              />
            )}
            <form onSubmit={addPublication} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid sm:grid-cols-12 gap-3">
              <input placeholder="Paper title" value={newPub.title} onChange={e => setNewPub({ ...newPub, title: e.target.value })} className={`${inputCls} sm:col-span-12`} />
              <input placeholder="Journal / conference" value={newPub.journal} onChange={e => setNewPub({ ...newPub, journal: e.target.value })} className={`${inputCls} sm:col-span-6`} />
              <select value={newPub.type} onChange={e => setNewPub({ ...newPub, type: e.target.value as PublicationItem['type'] })} className={`${inputCls} sm:col-span-3`}>
                <option>Journal</option><option>Conference</option><option>Book Chapter</option><option>Patent</option>
              </select>
              <input type="number" placeholder="Year" value={newPub.year} onChange={e => setNewPub({ ...newPub, year: Number(e.target.value) })} className={`${inputCls} sm:col-span-3`} />
              <input placeholder="Authors" value={newPub.authors} onChange={e => setNewPub({ ...newPub, authors: e.target.value })} className={`${inputCls} sm:col-span-6`} />
              <input placeholder="DOI" value={newPub.doi} onChange={e => setNewPub({ ...newPub, doi: e.target.value })} className={`${inputCls} sm:col-span-4`} />
              <button type="submit" className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-sm font-semibold flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>

            <div className="space-y-3">
              {profile.publications.map(pub => (
                <div key={pub.id} className="p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm leading-snug">{pub.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pub.authors && `${pub.authors} · `}<span className="text-slate-700">{pub.journalOrConference}</span>{pub.year ? ` (${pub.year})` : ''} · {pub.type}
                        {pub.doi && <> · DOI {pub.doi}</>}
                      </p>
                    </div>
                    <button onClick={() => removePublication(pub.id)} aria-label="Remove publication" className="p-1.5 rounded-lg text-slate-400 hover:text-crimson-600 hover:bg-crimson-50 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                    {([['ugcCareListed', 'UGC-CARE'], ['scopusIndexed', 'Scopus'], ['sciScieIndexed', 'SCI / SCIE']] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={pub[key]} onChange={e => editPublication(pub.id, { [key]: e.target.checked })} className="w-3.5 h-3.5 accent-brand-700" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {profile.publications.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No publications yet.</p>}
            </div>
          </Section>

          <Section icon={Link2} title="Scholarly links & recognition">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>ORCID iD</label>
                <input value={profile.scholarLinks.orcid || ''} onChange={e => update({ scholarLinks: { ...profile.scholarLinks, orcid: e.target.value } })} placeholder="0000-0000-0000-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Google Scholar URL</label>
                <input value={profile.scholarLinks.googleScholar || ''} onChange={e => update({ scholarLinks: { ...profile.scholarLinks, googleScholar: e.target.value } })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Scopus Author ID</label>
                <input value={profile.scholarLinks.scopusId || ''} onChange={e => update({ scholarLinks: { ...profile.scholarLinks, scopusId: e.target.value } })} className={inputCls} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Highest award received</label>
                <select value={profile.awardLevel || 'none'} onChange={e => update({ awardLevel: e.target.value as CandidateProfile['awardLevel'] })} className={inputCls}>
                  <option value="none">None</option>
                  <option value="state">State / university level</option>
                  <option value="national">National / international</option>
                </select>
              </div>
              <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer pt-5">
                <input type="checkbox" checked={profile.aiMatchingConsent !== false} onChange={e => update({ aiMatchingConsent: e.target.checked })} className="mt-0.5 w-4 h-4 accent-brand-700" />
                Allow automated match scoring of my profile against vacancies
              </label>
              <label className={`sm:col-span-2 flex items-start gap-2.5 text-sm cursor-pointer ${isPremium ? 'text-slate-600' : 'text-slate-400'}`}>
                <input type="checkbox" disabled={!isPremium} checked={!!profile.discoverable && isPremium} onChange={e => update({ discoverable: e.target.checked })} className="mt-0.5 w-4 h-4 accent-brand-700" />
                <span>Let subscribed institutions find my profile in talent search and invite me to apply. They see my name, designation, degrees, research interests, publication count and API score — not my contact details or documents.{!isPremium && ' (Premium)'}</span>
              </label>
            </div>
          </Section>
        </div>

        {/* Score card */}
        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-24 space-y-6">
            {isPremium ? (
            <>
            <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-medium text-gold-700 block">UGC Regulations 2018 · Table 3A</span>
                  <h3 className="font-serif font-bold text-slate-900 text-lg">Academic score</h3>
                </div>
                <div className="text-right">
                  <span className="font-serif text-4xl font-bold text-brand-900">{breakdown.totalScore}</span>
                  <span className="text-xs text-slate-400 block">/ 100</span>
                </div>
              </div>
              <div className="space-y-3">
                {rows.map(([label, v, max]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-mono font-medium text-slate-900">{v} / {max}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                An estimate from your profile. Universities typically shortlist on this score and verify documents independently.
              </p>
            </div>
            </>
            ) : (
              <PremiumLock title="UGC Table 3A academic score" text="Premium calculates your academic (API) score from your degrees, NET/JRF, publications, experience and awards, and updates it as you edit." />
            )}

            <DocumentChecklist userId={profile.userId} hasExperience={hasExperience} />

            <div className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-3">
              <div className="flex justify-between items-baseline">
                <h3 className="font-semibold text-slate-900">Profile completeness</h3>
                <span className="font-serif text-2xl font-bold text-emerald-700">{completeness}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completeness}%` }} />
              </div>
              <button onClick={handleSave} disabled={!dirty} className="w-full mt-2 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Award className="w-4 h-4" /> {dirty ? 'Save changes' : 'All changes saved'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <ResumeParserModal isOpen={showCvModal} onClose={() => setShowCvModal(false)} onProfileUpdated={load} />
    </div>
  );
}

export default function CandidateProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileEditor />
    </Suspense>
  );
}
