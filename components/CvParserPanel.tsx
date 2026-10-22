'use client';

import React, { useRef, useState } from 'react';
import { StorageService } from '@/lib/storage';
import { parseAcademicResume, extractTextFromFile, ParsedResumeResult } from '@/lib/ai-engine';
import { CandidateProfile } from '@/types';
import { Sparkles, FileText, CheckCircle2, ArrowRight, Upload, AlertTriangle } from 'lucide-react';

interface CvParserPanelProps {
  onSaved?: (profile: CandidateProfile) => void;
  compact?: boolean;
}

/** Upload or paste a CV, review the extracted fields, then merge them into the signed-in candidate's profile. */
export default function CvParserPanel({ onSaved, compact }: CvParserPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [cvText, setCvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResumeResult | null>(null);
  const [saved, setSaved] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setSaved(false);
    if (file.size > 10 * 1024 * 1024) {
      setError('File is larger than 10 MB.');
      return;
    }
    setIsReading(true);
    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) throw new Error('No selectable text found. Scanned PDFs are not supported — paste the text instead.');
      setCvText(text);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
    } finally {
      setIsReading(false);
    }
  };

  const handleParse = async () => {
    setIsParsing(true);
    setError(null);
    setSaved(false);
    try {
      setResult(await parseAcademicResume(cvText));
    } catch {
      setError('Something went wrong while parsing this CV.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = () => {
    const current = StorageService.getCandidateProfile();
    if (!result || !current) return;
    const parsed = result.candidateProfile;
    // Keep existing values where the parser found nothing; append lists rather than discarding manual entries.
    const merged: CandidateProfile = {
      ...current,
      ...parsed,
      email: current.email,
      name: parsed.name || current.name,
      location: parsed.location?.city ? parsed.location : current.location,
      education: parsed.education?.length ? parsed.education : current.education,
      experience: parsed.experience?.length ? parsed.experience : current.experience,
      publications: [
        ...(parsed.publications || []),
        ...current.publications.filter(p => !(parsed.publications || []).some(np => np.title.toLowerCase() === p.title.toLowerCase())),
      ],
      researchInterests: parsed.researchInterests?.length ? parsed.researchInterests : current.researchInterests,
      skills: parsed.skills?.length ? parsed.skills : current.skills,
      scholarLinks: { ...current.scholarLinks, ...parsed.scholarLinks },
      netSletStatus: parsed.netSletStatus?.isQualified ? parsed.netSletStatus : current.netSletStatus,
      phdStatus: parsed.phdStatus?.isCompleted ? parsed.phdStatus : current.phdStatus,
      resumeFileName: fileName || current.resumeFileName,
      resumeParsedAt: new Date().toISOString(),
    } as CandidateProfile;
    const savedProfile = StorageService.updateCandidateProfile(merged);
    setSaved(true);
    onSaved?.(savedProfile);
  };

  const p = result?.candidateProfile;

  return (
    <div className={`grid grid-cols-1 ${compact ? '' : 'lg:grid-cols-2'} gap-6 items-start`}>
      {/* Input */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 transition text-center space-y-2"
        >
          <Upload className="w-6 h-6 text-brand-600 mx-auto" />
          <div className="text-sm font-semibold text-slate-900">
            {isReading ? 'Reading file…' : fileName ? fileName : 'Upload your CV'}
          </div>
          <div className="text-xs text-slate-500">PDF, TXT or Markdown · up to 10 MB · drag &amp; drop or click</div>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,.md,text/plain,application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <FileText className="w-3.5 h-3.5 text-brand-600" /> Or paste CV text
          </label>
          <textarea
            rows={compact ? 8 : 14}
            value={cvText}
            onChange={e => {
              setCvText(e.target.value);
              setResult(null);
            }}
            placeholder={'Dr. Your Name\nEmail · Phone · ORCID\n\nEDUCATION\nPh.D. in Computer Science (2019 - 2023)\nIndian Institute of Technology ...\n\nEXPERIENCE\nAssistant Professor (July 2023 - Present)\n...\n\nPUBLICATIONS\n1. "Paper title", Journal name, 2024. DOI: ...\n\nRESEARCH INTERESTS\n...'}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 font-mono text-xs leading-relaxed focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-crimson-50 border border-crimson-100 text-crimson-700 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">Parsed in your browser — your CV is never uploaded to a server.</span>
          <button
            onClick={handleParse}
            disabled={isParsing || isReading || cvText.trim().length < 40}
            className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50 shrink-0"
          >
            {isParsing ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-gold-300" />
            )}
            Extract details
          </button>
        </div>
      </div>

      {/* Output */}
      <div>
        {result && p ? (
          <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 space-y-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-serif font-bold text-slate-900 text-lg">{p.name || 'Name not detected'}</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {[p.currentDesignation, p.currentInstitute].filter(Boolean).join(' · ') || 'Current position not detected'}
                </p>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-gold-50 border border-gold-200 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Est. API</span>
                  <span className="font-mono font-bold text-gold-700">{p.apiScore}/100</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-brand-50 border border-brand-200 text-center">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Coverage</span>
                  <span className="font-mono font-bold text-brand-700">{result.confidenceScore}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ['Education', result.extractedSections.educationFound],
                ['Experience', result.extractedSections.experienceFound],
                ['Publications', result.extractedSections.publicationsFound],
              ].map(([label, n]) => (
                <div key={label as string} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="font-mono text-lg font-bold text-slate-900">{n}</div>
                  <div className="text-slate-500">{label}</div>
                </div>
              ))}
            </div>

            <ul className="space-y-2 text-xs">
              {result.ugcComplianceInsights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {ins}
                </li>
              ))}
            </ul>

            {result.missingFields.length > 0 && (
              <div className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-xs text-gold-800">
                <strong className="font-semibold">Not found — add these on your profile:</strong> {result.missingFields.join(', ')}
              </div>
            )}

            {(p.publications?.length || 0) > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {p.publications!.map(pub => (
                  <div key={pub.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-900 line-clamp-1">{pub.title}</div>
                    <div className="text-[11px] text-slate-500 flex justify-between gap-2">
                      <span className="truncate">{pub.journalOrConference}{pub.year ? ` (${pub.year})` : ''}</span>
                      {(pub.scopusIndexed || pub.sciScieIndexed) && <span className="text-emerald-700 font-semibold shrink-0">Likely indexed</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">You can edit everything on your profile afterwards.</span>
              <button
                onClick={handleSave}
                disabled={saved}
                className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white font-semibold text-sm flex items-center gap-1.5 shadow-sm transition disabled:bg-emerald-700 shrink-0"
              >
                {saved ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                {saved ? 'Saved to profile' : 'Save to my profile'}
              </button>
            </div>
          </div>
        ) : (
          !compact && (
            <div className="p-10 text-center rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="font-serif font-bold text-slate-900 text-lg">Extracted details appear here</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                We detect your degrees, appointments, publications, NET/SLET status and research interests, then estimate your UGC Table 3A academic score.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
