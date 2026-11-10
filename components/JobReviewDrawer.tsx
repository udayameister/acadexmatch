'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Job, JobDetails, JobListGroup, PostRequirement } from '@/types';
import { deadlineState, DEADLINE_BADGE } from '@/lib/deadline';
import { ExternalLink, X } from 'lucide-react';

/*
 * Admin review panel: every field of a vacancy, grouped and labelled, plus any field not listed here (so nothing
 * is hidden) and the raw record. Used by the Vacancies tab and the scraping approval queues.
 */

type Row = [label: string, value: React.ReactNode];

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isEmpty));
const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (${iso.slice(0, 10)})`;
};
const yesNo = (b?: boolean | null) => (b === true ? 'Yes' : b === false ? 'No' : null);

function Ext({ href }: { href?: string | null }) {
  if (!href) return null;
  const url = /^https?:/i.test(href) ? href : /@/.test(href) ? `mailto:${href}` : `https://${href}`;
  return <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-800 underline break-all inline-flex items-center gap-1">{href}<ExternalLink className="w-3 h-3 shrink-0" /></a>;
}
const List = ({ items }: { items?: string[] | null }) => (items?.length ? <ul className="list-disc pl-5 space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null);
const Groups = ({ groups }: { groups?: JobListGroup[] }) => (groups?.length ? (
  <div className="space-y-1.5">{groups.map((g, i) => <div key={i}>{g.group && <div className="font-semibold">{g.group}</div>}<List items={g.items} /></div>)}</div>
) : null);
const Reqs = ({ rows }: { rows?: PostRequirement[] }) => (rows?.length ? (
  <ul className="list-disc pl-5 space-y-0.5">{rows.map((r, i) => <li key={i}>{r.post ? <strong>{r.post}: </strong> : null}{r.text}</li>)}</ul>
) : null);

/** Any value, for fields this panel does not know by name. */
function Generic({ value }: { value: unknown }): React.ReactElement | null {
  if (isEmpty(value)) return null;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? <Ext href={value} /> : <>{value}</>;
  if (typeof value === 'number') return <>{value}</>;
  if (Array.isArray(value)) return <ul className="list-disc pl-5 space-y-0.5">{value.map((v, i) => <li key={i}><Generic value={v} /></li>)}</ul>;
  return <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-0.5">{Object.entries(value as Record<string, unknown>).filter(([, v]) => !isEmpty(v)).map(([k, v]) => (
    <React.Fragment key={k}><dt className="text-slate-500">{humanize(k)}</dt><dd><Generic value={v} /></dd></React.Fragment>
  ))}</dl>;
}
const humanize = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** A row value is empty when it is empty data, or one of the helpers above given nothing to show. */
function emptyValue(v: unknown): boolean {
  if (React.isValidElement(v)) {
    const props = v.props as Record<string, unknown>;
    for (const k of ['items', 'groups', 'rows', 'href', 'value']) if (k in props) return isEmpty(props[k]);
    return false;
  }
  return isEmpty(v);
}

function Section({ title, rows, showEmpty }: { title: string; rows: Row[]; showEmpty: boolean }) {
  const shown = rows.filter(([, v]) => showEmpty || !emptyValue(v));
  if (!shown.length) return null;
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5 text-sm">
        {shown.map(([label, v]) => (
          <React.Fragment key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-900 break-words min-w-0">{emptyValue(v) ? <span className="text-slate-400">Not stated</span> : v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

// Fields shown in the sections below; anything else in the record appears under "Other fields".
const KNOWN_JOB = new Set(['id', 'instituteId', 'instituteName', 'instituteShortName', 'instituteLogo', 'instituteType', 'title', 'designation', 'department', 'specializationTags', 'advertisementNumber', 'location', 'payScale', 'requiredQualifications', 'reservationCategory', 'applicationDeadline', 'deadlineText', 'status', 'featuredUntil', 'urgentUntil', 'isClaimedByInstitute', 'screeningQuestions', 'selectionProcess', 'description', 'responsibilities', 'benefits', 'postedAt', 'applicantCount', 'featured', 'isPremium', 'externalApplyUrl', 'source', 'details', 'autoClosedAt']);
const KNOWN_DETAILS = new Set<keyof JobDetails>(['summary', 'hiringOrganization', 'postGroups', 'departmentGroups', 'numberOfPosts', 'qualifications', 'preferredQualifications', 'experience', 'candidateProfile', 'responsibilities', 'salaryText', 'employmentType', 'locationText', 'ageLimit', 'applicationFee', 'reservation', 'selectionProcess', 'importantDates', 'notificationDate', 'lastDateText', 'interviewText', 'deadlineEstimated', 'applyModes', 'howToApply', 'applicationProcedure', 'applyEmails', 'contactPhones', 'applicationLink', 'officialWebsite', 'notificationLink', 'documentsRequired', 'organizationAddress', 'benefits']);

export default function JobReviewDrawer({ job, onClose, actions, note, statusText }: {
  job: Job;
  /** Overrides the status badge, e.g. "Waiting for approval" for a queued vacancy. */
  statusText?: string;
  onClose: () => void;
  /** Buttons for the footer (approve, edit, close…). */
  actions?: React.ReactNode;
  /** Shown above the details, e.g. "Possible duplicate of …" or the source post for the admin. */
  note?: React.ReactNode;
}) {
  const [showEmpty, setShowEmpty] = React.useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const d: JobDetails = job.details || {};
  const dl = deadlineState(job);
  const extraJob = Object.entries(job).filter(([k, v]) => !KNOWN_JOB.has(k) && !isEmpty(v));
  const extraDetails = Object.entries(d).filter(([k, v]) => !KNOWN_DETAILS.has(k as keyof JobDetails) && !isEmpty(v));
  const rq = job.requiredQualifications;
  const src = job.source;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/50" onClick={onClose} role="presentation">
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="jrd-title" onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col outline-none">
        <header className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DEADLINE_BADGE[dl.kind]}`}>{dl.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 first-letter:uppercase">{statusText || job.status.replace('_', ' ')}</span>
              {job.isPremium && <span className="text-xs px-2 py-0.5 rounded-full border border-gold-300 bg-gold-50 text-gold-900">Premium only</span>}
            </div>
            <h2 id="jrd-title" className="font-serif text-xl font-bold text-slate-900 break-words">{job.title}</h2>
            <p className="text-sm text-slate-600 break-words">{job.instituteName}{job.location.city || job.location.state ? ` · ${[job.location.city, job.location.state].filter(Boolean).join(', ')}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0" aria-label="Close details"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {note}
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="accent-brand-900 w-4 h-4" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> Also show fields that are empty</label>

          <Section title="Vacancy" showEmpty={showEmpty} rows={[
            ['Post name', job.title],
            ['Designation', job.designation],
            ['Posts advertised', <Groups key="p" groups={d.postGroups} />],
            ['Number of posts', d.numberOfPosts],
            ['Department', job.department],
            ['Departments / subjects', <Groups key="g" groups={d.departmentGroups} />],
            ['Specialisation tags', job.specializationTags.length ? job.specializationTags.join(', ') : null],
            ['Advertisement no.', job.advertisementNumber],
            ['Employment type', d.employmentType],
            ['Reservation', job.reservationCategory || d.reservation],
            ['Summary', d.summary],
            ['Description', job.description],
          ]} />

          <Section title="Dates" showEmpty={showEmpty} rows={[
            ['Last date', job.applicationDeadline ? <span>{fmtDate(job.applicationDeadline)} <span className={`ml-1 text-xs font-semibold px-1.5 py-0.5 rounded border ${DEADLINE_BADGE[dl.kind]}`}>{dl.label}</span></span> : null],
            ['Last date as written', d.lastDateText || job.deadlineText],
            ['Estimated from text', d.deadlineEstimated ? 'Yes: check the notification' : null],
            ['Notification date', fmtDate(d.notificationDate)],
            ['Interview / walk-in', d.interviewText],
            ['Important dates', d.importantDates?.length ? <dl className="grid grid-cols-[auto_1fr] gap-x-3">{d.importantDates.map((x, i) => <React.Fragment key={i}><dt className="text-slate-500">{x.label}</dt><dd>{x.value}</dd></React.Fragment>)}</dl> : null],
            ['Posted on', fmtDate(job.postedAt)],
            ['Closed automatically', fmtDate(job.autoClosedAt)],
          ]} />

          <Section title="Institution" showEmpty={showEmpty} rows={[
            ['Name', job.instituteName],
            ['Short name', job.instituteShortName],
            ['Hiring organisation', d.hiringOrganization],
            ['Type', job.instituteType],
            ['Location', [job.location.city, job.location.state].filter(Boolean).join(', ') || null],
            ['Job location (as written)', d.locationText],
            ['Address', d.organizationAddress],
            ['Official website', <Ext key="w" href={d.officialWebsite} />],
            ['Institute ID', job.instituteId],
            ['Claimed by institute', yesNo(job.isClaimedByInstitute)],
          ]} />

          <Section title="Pay" showEmpty={showEmpty} rows={[
            ['Pay scale / level', job.payScale.cpcBand],
            ['Salary (as written)', d.salaryText !== job.payScale.cpcBand ? d.salaryText : null],
            ['Entry pay', job.payScale.entryPay],
            ['Gross monthly (estimate)', job.payScale.grossMonthlyEstimated],
            ['Consolidated pay', yesNo(job.payScale.consolidated)],
            ['Allowances', job.payScale.allowances.length ? job.payScale.allowances.join(', ') : null],
          ]} />

          <Section title="Eligibility" showEmpty={showEmpty} rows={[
            ['Qualifications', d.qualifications?.length ? <Reqs key="q" rows={d.qualifications} /> : rq.minDegree],
            ['Preferred / desirable', <Reqs key="pq" rows={d.preferredQualifications} />],
            ['Experience', d.experience?.length ? <Reqs key="e" rows={d.experience} /> : rq.experienceText],
            ['Minimum experience (years)', rq.minExperienceYears],
            ['NET / SLET required', yesNo(rq.netSletMandatory)],
            ['Ph.D. norms', rq.phdNorms],
            ['Minimum UGC-CARE papers', rq.minUgcCarePubs],
            ['Regulations', rq.ugcRegulationsYear],
            ['Specialisation requirements', <List key="s" items={rq.specializationRequirements} />],
            ['Age limit', d.ageLimit],
            ['Candidate profile', <List key="cp" items={d.candidateProfile} />],
          ]} />

          <Section title="How to apply" showEmpty={showEmpty} rows={[
            ['Apply modes', d.applyModes?.length ? d.applyModes.join(', ') : null],
            ['How to apply', d.howToApply],
            ['Procedure', <List key="ap" items={d.applicationProcedure} />],
            ['E-mail', d.applyEmails?.length ? <ul>{d.applyEmails.map(e => <li key={e.email}><Ext href={e.email} />{e.note ? ` (${e.note})` : ''}</li>)}</ul> : null],
            ['Phone', d.contactPhones?.length ? d.contactPhones.join(', ') : null],
            ['Application link', <Ext key="al" href={d.applicationLink} />],
            ['Official notification', <Ext key="n" href={d.notificationLink} />],
            ['Apply button goes to', <Ext key="x" href={job.externalApplyUrl} />],
            ['Application fee', d.applicationFee],
            ['Documents required', <List key="dr" items={d.documentsRequired} />],
            ['Selection process', <List key="sp" items={d.selectionProcess?.length ? d.selectionProcess : job.selectionProcess} />],
            ['Screening questions', <List key="sq" items={job.screeningQuestions} />],
          ]} />

          <Section title="Role" showEmpty={showEmpty} rows={[
            ['Responsibilities', <List key="r" items={d.responsibilities?.length ? d.responsibilities : job.responsibilities} />],
            ['Benefits', <List key="b" items={d.benefits?.length ? d.benefits : job.benefits} />],
          ]} />

          <Section title="On AcadeXMatch" showEmpty={showEmpty} rows={[
            ['Vacancy ID', job.id],
            ['Status', statusText || job.status.replace('_', ' ')],
            ['Applications', job.applicantCount ?? 0],
            ['Premium only', yesNo(job.isPremium ?? false)],
            ['Featured', job.featured ? 'Yes' : job.featuredUntil ? `Paid, until ${job.featuredUntil}` : 'No'],
            ['Urgent', job.urgentUntil ? `Until ${job.urgentUntil}` : null],
            ['Public page', job.status === 'published' ? <Link key="pp" href={`/jobs/${encodeURIComponent(job.id)}`} target="_blank" className="text-brand-800 underline">/jobs/{job.id}</Link> : null],
          ]} />

          {src && <Section title="Source" showEmpty={showEmpty} rows={[
            ['Kind', src.kind === 'aggregator' ? 'Listing site (facts only)' : src.kind === 'institution' ? "Institution's website" : src.kind],
            ['Site', src.siteName],
            ['Address', <Ext key="su" href={src.url} />],
            ['Page title', src.pageTitle],
            ['Collected on', src.extractedAt],
            ['Read from a PDF', yesNo(src.fromPdf)],
            ['PDF note', src.pdfNote],
          ]} />}

          {(extraJob.length > 0 || extraDetails.length > 0) && (
            <Section title="Other fields" showEmpty={false} rows={[...extraJob, ...extraDetails].map(([k, v]) => [humanize(k), <Generic key={k} value={v} />] as Row)} />
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-slate-600 font-semibold">Raw data (every field as stored)</summary>
            <pre className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed">{JSON.stringify(job, null, 2)}</pre>
          </details>
        </div>

        {actions && <footer className="p-4 border-t border-slate-200 flex flex-wrap justify-end gap-2 bg-ivory">{actions}</footer>}
      </div>
    </div>
  );
}
