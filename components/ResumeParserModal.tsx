'use client';

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import CvParserPanel from './CvParserPanel';

interface ResumeParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
}

export default function ResumeParserModal({ isOpen, onClose, onProfileUpdated }: ResumeParserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-6 sm:p-8 text-slate-800 shadow-2xl my-8">
        <div className="flex items-start justify-between pb-4 mb-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-brand-50 text-brand-700 border border-brand-200">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-serif font-bold text-slate-900 text-lg">Import from CV</h3>
              <p className="text-xs text-slate-500">Fill your academic profile automatically from your CV.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <CvParserPanel
          compact
          onSaved={() => {
            onProfileUpdated?.();
            setTimeout(onClose, 900);
          }}
        />
      </div>
    </div>
  );
}
