import React from 'react';
import type { Job, JobDetails, JobListGroup, PostRequirement } from '@/types';

/* Full advertisement details of a vacancy (Job.details). Shows only what is filled in — nothing is
   guessed — so the same component works for crawled advertisements and for institution posts. */

const MODE_LABEL: Record<string, string> = { online: 'Online', email: 'By e-mail', offline: 'Offline (by post / in person)', 'walk-in': 'Walk-in interview', post: 'By post' };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-7 rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
      <h3 className="font-serif font-bold text-slate-900 text-lg">{title}</h3>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2"><span className="text-gold-600 font-bold">•</span><span>{t}</span></li>
      ))}
    </ul>
  );
}

function Groups({ groups }: { groups: JobListGroup[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {groups.map((g, i) => (
        <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
          {g.group && <div className="text-xs font-bold uppercase tracking-wide text-brand-800 mb-1.5">{g.group}</div>}
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((t, j) => <span key={j} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-xs text-slate-700">{t}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Requirements({ rows }: { rows: PostRequirement[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 first:border-0 align-top">
              <th scope="row" className="py-2 pr-3 text-left font-semibold text-slate-900 w-2/5">{r.post || 'All posts'}</th>
              <td className="py-2 text-slate-700">{r.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2 text-xs sm:text-sm">
      {shown.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="font-semibold text-slate-900">{k}</dt>
          <dd className="text-slate-700 break-words">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

const ext = (href: string, label?: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand-800 underline break-all">{label || href}</a>
);

export function hasJobDetails(d?: JobDetails | null): d is JobDetails {
  return !!d && Object.values(d).some(v => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '' && v !== false));
}

export default function JobDetailsSections({ job }: { job: Job }) {
  const d = job.details;
  if (!hasJobDetails(d)) return null;
  const hasPosts = !!(d.postGroups?.length || d.numberOfPosts);
  const hasReq = !!(d.qualifications?.length || d.preferredQualifications?.length || d.experience?.length || d.ageLimit || d.reservation);
  const dates: { label: string; value: string }[] = d.importantDates?.length ? d.importantDates : [
    ...(d.notificationDate ? [{ label: 'Notification date', value: d.notificationDate }] : []),
    ...(d.lastDateText ? [{ label: 'Last date to apply', value: d.lastDateText }] : []),
    ...(d.interviewText ? [{ label: 'Interview', value: d.interviewText }] : []),
  ];
  const hasApply = !!(d.applyModes?.length || d.howToApply || d.applicationProcedure?.length || d.applyEmails?.length || d.applicationLink || d.applicationFee || d.contactPhones?.length);
  const aggregator = job.source?.kind === 'aggregator';

  return (
    <>
      {aggregator && (
        <div className="p-4 rounded-2xl bg-gold-50 border border-gold-200 text-xs sm:text-sm text-slate-700">
          Please confirm these details with the recruiting institution before applying.
          {d.officialWebsite ? <> Official website of {job.instituteName}: {ext(d.officialWebsite)}.</> : null}
        </div>
      )}

      {hasPosts && (
        <Card title="Posts advertised">
          {d.numberOfPosts && <p className="text-xs sm:text-sm text-slate-700"><strong>Number of posts:</strong> {d.numberOfPosts}</p>}
          {d.postGroups?.length ? <Groups groups={d.postGroups} /> : null}
        </Card>
      )}

      {d.departmentGroups?.length ? (
        <Card title="Departments / subjects with vacancies"><Groups groups={d.departmentGroups} /></Card>
      ) : null}

      {hasReq && (
        <Card title="Eligibility (as stated in the advertisement)">
          {d.qualifications?.length ? <><h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Required qualifications</h4><Requirements rows={d.qualifications} /></> : null}
          {d.preferredQualifications?.length ? <><h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 pt-2">Preferred / desirable</h4><Requirements rows={d.preferredQualifications} /></> : null}
          {d.experience?.length ? <><h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 pt-2">Experience</h4><Requirements rows={d.experience} /></> : null}
          <Rows rows={[['Age limit', d.ageLimit], ['Reservation', d.reservation]]} />
        </Card>
      )}

      {d.candidateProfile?.length ? <Card title="Candidate profile"><Bullets items={d.candidateProfile} /></Card> : null}

      {(d.salaryText || d.employmentType || d.locationText) && (
        <Card title="Pay, type and location">
          <Rows rows={[['Salary', d.salaryText], ['Employment type', d.employmentType ? d.employmentType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : null], ['Job location', d.locationText]]} />
        </Card>
      )}

      {dates.length > 0 && (
        <Card title="Important dates">
          <Rows rows={dates.map(x => [x.label, x.value] as [string, React.ReactNode])} />
          {d.deadlineEstimated && job.applicationDeadline && (
            <p className="text-xs text-slate-500">The closing date {job.applicationDeadline} was worked out from “{d.lastDateText}” and the date the advertisement was posted. Check the exact date with the institution.</p>
          )}
        </Card>
      )}

      {hasApply && (
        <Card title="How to apply">
          <Rows rows={[
            ['Apply mode', d.applyModes?.length ? d.applyModes.map(m => MODE_LABEL[m] || m).join(', ') : null],
            ['Application fee', d.applicationFee],
            ['Apply online', d.applicationLink ? ext(d.applicationLink) : null],
            ['E-mail', d.applyEmails?.length ? <span className="space-y-1 block">{d.applyEmails.map(e => <span key={e.email} className="block"><a href={`mailto:${e.email}`} className="font-semibold text-brand-800 underline">{e.email}</a>{e.note ? <span className="text-slate-500"> — {e.note}</span> : null}</span>)}</span> : null],
            ['Phone', d.contactPhones?.length ? d.contactPhones.join(', ') : null],
          ]} />
          {d.howToApply && <p className="text-xs sm:text-sm text-slate-700">{d.howToApply}</p>}
          {d.applicationProcedure?.length ? <ol className="list-decimal pl-5 space-y-1 text-xs sm:text-sm text-slate-700">{d.applicationProcedure.map((t, i) => <li key={i}>{t}</li>)}</ol> : null}
        </Card>
      )}

      {d.documentsRequired?.length ? <Card title="Documents required"><Bullets items={d.documentsRequired} /></Card> : null}

      {(d.officialWebsite || d.notificationLink || d.organizationAddress || d.hiringOrganization) && (
        <Card title="Recruiting institution">
          <Rows rows={[
            ['Organisation', d.hiringOrganization],
            ['Address', d.organizationAddress],
            ['Official website', d.officialWebsite ? ext(d.officialWebsite) : null],
            ['Notification', d.notificationLink ? ext(d.notificationLink, 'Open the advertisement') : null],
          ]} />
        </Card>
      )}
    </>
  );
}
