'use client';

import VerifiedBadge from '@/components/VerifiedBadge';
import React from 'react';
import { Application } from '@/types';
import { StorageService } from '@/lib/storage';
import { CandidateAvatar, DocumentList } from './CandidateDocuments';
import { X, Mail, Phone, MapPin, CheckCircle2, AlertCircle, XCircle, GraduationCap, BookOpen, FileCheck2 } from 'lucide-react';

interface ApplicantDetailModalProps {
  application: Application;
  onClose: () => void;
}

/** Full applicant dossier for the selection committee: contact, eligibility, screening answers, scores, history. */
export default function ApplicantDetailModal({ application: app, onClose }: ApplicantDetailModalProps) {
  const profile = StorageService.getCandidateProfileByUserId(app.candidateId);
  const m = app.matchBreakdown;
  const avgCommittee = app.reviewerScores.length
    ? Math.round(app.reviewerScores.reduce((s, r) => s + r.totalScore, 0) / app.reviewerScores.length)
    : null;

  const handleReject = () => {
    if (confirm(`Mark ${app.candidateName} as not selected for ${app.jobTitle}?`)) {
      StorageService.updateApplicationStage(app.id, 'rejected', 'Not selected by the Faculty Search Committee');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl my-8">
        <div className="flex items-start justify-between gap-4 p-6 sm:p-8 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <CandidateAvatar userId={app.candidateId} name={app.candidateName} className="w-16 h-16" />
            <div>
            <h3 className="font-serif text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">{app.candidateName} <VerifiedBadge verified={profile?.documentsVerified} /></h3>
            <p className="text-sm text-slate-600 mt-0.5">{[app.currentDesignation, profile?.currentInstitute].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
              <a href={`mailto:${app.candidateEmail}`} className="inline-flex items-center gap-1 hover:text-brand-700"><Mail className="w-3.5 h-3.5" />{app.candidateEmail}</a>
              {app.candidatePhone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{app.candidatePhone}</span>}
              {app.candidateLocation && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{app.candidateLocation}</span>}
            </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Match</div>
              <div className="font-serif text-2xl font-bold text-slate-900">{app.matchScore}%</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">API score</div>
              <div className="font-serif text-2xl font-bold text-slate-900">{profile?.apiScore ?? '—'}</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Committee avg.</div>
              <div className="font-serif text-2xl font-bold text-slate-900">{avgCommittee ?? '—'}</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Stage</div>
              <div className="font-semibold text-slate-900 capitalize mt-1.5">{app.status.replace(/_/g, ' ')}</div>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border flex items-start gap-2.5 ${m.meetsMandatoryNetPhd ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-crimson-50 border-crimson-100 text-crimson-800'}`}>
            {m.meetsMandatoryNetPhd ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <div>
              <div className="font-semibold">{m.meetsMandatoryNetPhd ? 'Meets mandatory Ph.D. / NET criteria' : 'Does not meet a mandatory criterion'}</div>
              <ul className="mt-1 text-xs space-y-0.5">
                {[...m.positiveSignals, ...m.potentialGaps].map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-900 flex items-center gap-1.5 mb-2"><FileCheck2 className="w-4 h-4 text-brand-700" /> Documents &amp; proofs</h4>
            <DocumentList userId={app.candidateId} />
          </div>

          {profile && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5 mb-2"><GraduationCap className="w-4 h-4 text-brand-700" /> Education</h4>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {profile.education.map(e => (
                    <li key={e.id}><span className="font-medium text-slate-800">{e.degree}{e.field && ` in ${e.field}`}</span> — {e.institute}{e.year ? `, ${e.year}` : ''}{e.gradePercentage && ` (${e.gradePercentage})`}</li>
                  ))}
                  {profile.education.length === 0 && <li>Not provided</li>}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5 mb-2"><BookOpen className="w-4 h-4 text-brand-700" /> Publications ({profile.publications.length})</h4>
                <ul className="space-y-1.5 text-xs text-slate-600 max-h-40 overflow-y-auto">
                  {profile.publications.map(p => (
                    <li key={p.id}><span className="font-medium text-slate-800">{p.title}</span> — {p.journalOrConference}{p.year ? ` (${p.year})` : ''}</li>
                  ))}
                  {profile.publications.length === 0 && <li>None listed</li>}
                </ul>
              </div>
            </div>
          )}

          {app.screeningAnswers && app.screeningAnswers.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Screening answers</h4>
              <div className="space-y-3">
                {app.screeningAnswers.map((qa, i) => (
                  <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-medium text-slate-500">{qa.question}</div>
                    <div className="text-slate-800 mt-1 whitespace-pre-line">{qa.answer || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {app.reviewerScores.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Committee evaluations (confidential)</h4>
              <div className="space-y-2">
                {app.reviewerScores.map(r => (
                  <div key={r.reviewerRole} className="p-3.5 rounded-2xl border border-slate-200">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-slate-900">{r.reviewerRole} · {r.reviewerName}</span>
                      <span className="font-mono font-semibold">{r.totalScore}/100</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Research {r.researchPotentialScore}/30 · Teaching {r.teachingPedagogyScore}/25 · API {r.apiScoreValidation}/20 · Interview {r.interviewPerformance}/25 · <span className="font-medium text-slate-700">{r.recommendation}</span>
                    </div>
                    {r.confidentialNotes && <p className="text-xs text-slate-600 mt-1.5 italic">{r.confidentialNotes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="font-semibold text-slate-900 mb-2">History</h4>
            <ol className="space-y-2 border-l-2 border-slate-100 pl-4 text-xs">
              {[...app.stageHistory].reverse().map((h, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-800 capitalize">{h.stage.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500"> · {h.timestamp} · {h.actor}{h.note ? ` — ${h.note}` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="flex justify-between gap-3 p-6 sm:px-8 border-t border-slate-100">
          {app.status !== 'rejected' && app.status !== 'joined' ? (
            <button onClick={handleReject} className="px-4 py-2 rounded-xl text-crimson-700 border border-crimson-100 hover:bg-crimson-50 font-semibold text-sm flex items-center gap-1.5">
              <XCircle className="w-4 h-4" /> Mark not selected
            </button>
          ) : app.status === 'rejected' ? (
            <button onClick={() => { StorageService.updateApplicationStage(app.id, 'screening', 'Reconsidered by committee'); onClose(); }} className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-sm">
              Reconsider
            </button>
          ) : <span />}
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}
