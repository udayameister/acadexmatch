import type { Application, Institute, Job } from '@/types';

export const OFFER_PLACEHOLDERS = [
  'candidateName', 'designation', 'department', 'institute', 'pay', 'joiningDate', 'acceptBy', 'reportTo', 'advertisementNumber', 'jobTitle',
] as const;

export const DEFAULT_OFFER_TEMPLATE = `Dear {candidateName},

With reference to your application for the post of {jobTitle}{advertisementNumber}, and the recommendation of the Selection Committee, we are pleased to offer you appointment as {designation} in the {department}, {institute}.

Pay: {pay}.

You are requested to join on or before {joiningDate} and report to {reportTo}. Please confirm your acceptance by {acceptBy}.

At the time of joining, please bring the originals of your educational qualifications, experience certificates and the other documents listed in your application, along with a relieving letter from your current employer, if applicable.

This offer is subject to verification of your documents and to the rules of the institution in force from time to time.

We look forward to welcoming you.`;

function longDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Fills the institute's template (or the default) with the offer's details. */
export function renderOfferText(app: Application, job: Job | undefined, inst: Institute | undefined): string {
  const o = app.offerDetails!;
  const values: Record<string, string> = {
    candidateName: app.candidateName,
    designation: o.designation,
    department: job?.department || app.department || 'department',
    institute: inst?.name || app.instituteName,
    pay: o.grossPay || 'as per the rules of the institution',
    joiningDate: longDate(o.joiningDate),
    acceptBy: o.acceptBy ? longDate(o.acceptBy) : 'the date mentioned by the institution',
    reportTo: o.reportTo || 'the Head of the Department',
    advertisementNumber: job?.advertisementNumber ? ` (Advertisement No. ${job.advertisementNumber})` : '',
    jobTitle: app.jobTitle,
  };
  const tpl = (inst?.offerTemplate || '').trim() || DEFAULT_OFFER_TEMPLATE;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

export { longDate };
