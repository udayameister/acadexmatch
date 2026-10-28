'use client';
import React from 'react';
import type { ApplyMode } from '@/types';
import type { DetailsForm } from '@/lib/jobDetailsText';

/* "Full advertisement details" fields of the post-vacancy form. Every field is optional; whatever
   is filled in is shown on the vacancy page in the same sections as crawled advertisements. */

const box = 'w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-900 leading-relaxed focus:outline-none focus:border-brand-500';
const MODES: [ApplyMode, string][] = [['online', 'Online'], ['email', 'E-mail'], ['post', 'By post'], ['offline', 'In person'], ['walk-in', 'Walk-in interview']];

type Key = Exclude<keyof DetailsForm, 'applyModes'>;

type Setter = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
type FieldProps = { f: DetailsForm; s: Setter; k: Key; label: string; hint?: string; rows?: number; ph?: string; type?: string };

// Defined outside the form so typing does not remount the inputs (which would drop focus).
function Area({ f, s, k, label, hint, rows = 3, ph }: FieldProps) {
  return (
    <div>
      <label htmlFor={`jd-${k}`} className="block font-bold text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-slate-500 mb-1">{hint}</p>}
      <textarea id={`jd-${k}`} rows={rows} value={f[k]} onChange={s(k)} placeholder={ph} className={box} />
    </div>
  );
}
function Line({ f, s, k, label, ph, type = 'text' }: FieldProps) {
  return (
    <div>
      <label htmlFor={`jd-${k}`} className="block font-bold text-slate-700 mb-1">{label}</label>
      <input id={`jd-${k}`} type={type} value={f[k]} onChange={s(k)} placeholder={ph} className={box} />
    </div>
  );
}

export default function JobDetailsFields({ value, onChange }: { value: DetailsForm; onChange: (v: DetailsForm) => void }) {
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const toggleMode = (m: ApplyMode) => onChange({ ...value, applyModes: value.applyModes.includes(m) ? value.applyModes.filter(x => x !== m) : [...value.applyModes, m] });

  return (
    <details className="group p-6 sm:p-7 rounded-3xl bg-white border border-slate-200 shadow-sm text-xs" open={Object.entries(value).some(([, v]) => (Array.isArray(v) ? v.length : v))}>
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <span>
          <span className="font-serif font-bold text-slate-900 text-base block">Full advertisement details (optional)</span>
          <span className="text-[11px] text-slate-500">Type it the way your advertisement is printed — one item per line. Lines ending with “:” start a group; “Post: requirement” ties a requirement to a post.</span>
        </span>
        <span className="text-brand-700 font-bold group-open:rotate-180 transition">▾</span>
      </summary>

      <div className="mt-5 space-y-6">
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">Posts and departments</legend>
          <Line f={value} s={set} k="numberOfPosts" label="Number of posts" ph="e.g. 12, or Not specified" />
          <Area f={value} s={set} k="posts" label="Posts advertised" rows={5} ph={'Academic Posts:\nProfessor\nAssociate Professor\n\nNon-Teaching Posts:\nAssistant Registrar'} />
          <Area f={value} s={set} k="departments" label="Departments / subjects with vacancies" rows={5} ph={'Engineering and Technology:\nComputer Science and Engineering\nData Science\n\nManagement:\nFinance'} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">Eligibility</legend>
          <Area f={value} s={set} k="qualifications" label="Required qualifications (per post)" ph={'Professor: Ph.D. with 10 years experience as per UGC Regulations 2018\nAssistant Registrar: Postgraduate degree'} />
          <Area f={value} s={set} k="preferred" label="Preferred / desirable qualifications" ph="Assistant Professor: NET/SET preferable" />
          <Area f={value} s={set} k="experience" label="Experience (per post)" ph="Professor: 10 years of teaching and research" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Line f={value} s={set} k="ageLimit" label="Age limit" ph="e.g. As per UGC norms" />
            <Line f={value} s={set} k="reservation" label="Reservation" ph="e.g. As per Government of Tamil Nadu rules" />
          </div>
          <Area f={value} s={set} k="profile" label="Candidate profile" ph="Good teaching and communication skills" />
          <Area f={value} s={set} k="responsibilities" label="Responsibilities" ph="Teach UG and PG courses" />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">Pay and selection</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Line f={value} s={set} k="salaryText" label="Salary (as printed)" ph="e.g. As per 7th CPC / Negotiable" />
            <div>
              <label htmlFor="jd-employmentType" className="block font-bold text-slate-700 mb-1">Employment type</label>
              <select id="jd-employmentType" value={value.employmentType} onChange={set('employmentType')} className={box}>
                <option value="">Not stated</option>
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="CONTRACTOR">Contract</option>
                <option value="TEMPORARY">Temporary / guest</option>
              </select>
            </div>
          </div>
          <Area f={value} s={set} k="selection" label="Selection process" ph={'Shortlisting\nDemo lecture\nInterview'} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">Dates</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Line f={value} s={set} k="notificationDate" label="Notification date" type="date" />
            <Line f={value} s={set} k="interviewText" label="Interview / walk-in" ph="e.g. 15 November 2026, 10 am" />
          </div>
          <Area f={value} s={set} k="dates" label="Other important dates" ph={'Last date for hard copy: 20 November 2026'} rows={2} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">How to apply</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Apply mode">
            {MODES.map(([m, label]) => (
              <label key={m} className={`px-3 py-1.5 rounded-full border cursor-pointer font-semibold ${value.applyModes.includes(m) ? 'bg-brand-50 border-brand-300 text-brand-900' : 'bg-white border-slate-200 text-slate-600'}`}>
                <input type="checkbox" className="sr-only" checked={value.applyModes.includes(m)} onChange={() => toggleMode(m)} />{label}
              </label>
            ))}
          </div>
          <Area f={value} s={set} k="howToApply" label="How to apply" rows={2} />
          <Area f={value} s={set} k="procedure" label="Application procedure (steps)" ph={'Download the form\nAttach self-attested copies\nSend to the Registrar'} />
          <Area f={value} s={set} k="emails" label="E-mail addresses to apply" rows={2} ph="recruitment@college.ac.in (teaching posts)" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Line f={value} s={set} k="phones" label="Contact phone numbers" ph="Separate with commas" />
            <Line f={value} s={set} k="applicationFee" label="Application fee" ph="e.g. ₹500 (SC/ST exempt)" />
          </div>
          <Area f={value} s={set} k="documents" label="Documents required" ph={'Detailed CV\nCertificates and mark sheets'} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">Links and address</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Line f={value} s={set} k="applicationLink" label="Online application link" ph="https://" />
            <Line f={value} s={set} k="officialWebsite" label="Official website" ph="https://" />
          </div>
          <Line f={value} s={set} k="notificationLink" label="Advertisement / notification (PDF or image link)" ph="https://" />
          <Area f={value} s={set} k="address" label="Address for applications" rows={3} />
          <Area f={value} s={set} k="benefits" label="Benefits of joining" ph={'Campus housing\nResearch seed grant'} />
        </fieldset>
      </div>
    </details>
  );
}
