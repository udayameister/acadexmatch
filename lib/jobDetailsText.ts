import type { ApplyMode, JobDetails, JobListGroup, PostRequirement } from '@/types';

/* Plain-text ⇄ JobDetails conversion used by the post-vacancy form, so institutions can type the
   advertisement the way it is printed: one item per line, "Heading:" lines start a group, and
   "Post: requirement" lines tie a requirement to a post. */

const lines = (t: string) => t.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s+/, '').trim()).filter(Boolean);
const one = (t: string) => t.replace(/\s+/g, ' ').trim() || null;

export function textToList(t: string): string[] { return lines(t); }

/** "Academic Posts:" starts a group; other lines are items (commas inside a line are kept). */
export function textToGroups(t: string): JobListGroup[] {
  const out: JobListGroup[] = [];
  for (const l of lines(t)) {
    const head = l.match(/^(.{2,120}):$/);
    if (head) { out.push({ group: head[1].trim(), items: [] }); continue; }
    if (!out.length) out.push({ group: null, items: [] });
    out[out.length - 1].items.push(l);
  }
  return out.filter(g => g.items.length);
}

/** "Assistant Professor: Ph.D. as per UGC" → { post, text }; a line without a colon applies to all posts. */
export function textToRequirements(t: string): PostRequirement[] {
  return lines(t).map(l => {
    const m = l.match(/^([^:]{2,120}):\s*(.+)$/);
    return m && !/^https?$/i.test(m[1]) ? { post: m[1].trim(), text: m[2].trim() } : { post: null, text: l };
  });
}

export function textToPairs(t: string): { label: string; value: string }[] {
  return lines(t).map(l => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: '' }; }).filter(p => p.label && p.value);
}

/** "hr@college.ac.in (teaching posts)" per line. */
export function textToEmails(t: string): { email: string; note: string | null }[] {
  const out: { email: string; note: string | null }[] = [];
  for (const l of lines(t)) {
    const m = l.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*(?:\((.+)\)|[-–—:]\s*(.+))?/);
    if (m && !out.some(e => e.email === m[1].toLowerCase())) out.push({ email: m[1].toLowerCase(), note: one(m[2] || m[3] || '') });
  }
  return out;
}

export const groupsToText = (g?: JobListGroup[]) => (g || []).map(x => [x.group ? `${x.group}:` : '', ...x.items].filter(Boolean).join('\n')).join('\n\n');
export const reqToText = (r?: PostRequirement[]) => (r || []).map(x => (x.post ? `${x.post}: ${x.text}` : x.text)).join('\n');
export const listToText = (l?: string[]) => (l || []).join('\n');
export const pairsToText = (p?: { label: string; value: string }[]) => (p || []).map(x => `${x.label}: ${x.value}`).join('\n');
export const emailsToText = (e?: { email: string; note?: string | null }[]) => (e || []).map(x => (x.note ? `${x.email} (${x.note})` : x.email)).join('\n');

/** Raw form fields (all strings) of the "full advertisement" section. */
export interface DetailsForm {
  summary: string; numberOfPosts: string; posts: string; departments: string;
  qualifications: string; preferred: string; experience: string; profile: string; responsibilities: string;
  salaryText: string; employmentType: string; ageLimit: string; applicationFee: string; reservation: string;
  selection: string; dates: string; notificationDate: string; interviewText: string;
  applyModes: ApplyMode[]; howToApply: string; procedure: string; emails: string; phones: string;
  applicationLink: string; officialWebsite: string; notificationLink: string; documents: string;
  address: string; benefits: string;
}

export const EMPTY_DETAILS_FORM: DetailsForm = {
  summary: '', numberOfPosts: '', posts: '', departments: '', qualifications: '', preferred: '', experience: '',
  profile: '', responsibilities: '', salaryText: '', employmentType: '', ageLimit: '', applicationFee: '',
  reservation: '', selection: '', dates: '', notificationDate: '', interviewText: '', applyModes: [], howToApply: '',
  procedure: '', emails: '', phones: '', applicationLink: '', officialWebsite: '', notificationLink: '',
  documents: '', address: '', benefits: '',
};

const url = (t: string) => { const v = t.trim(); if (!v) return null; return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`; };

/** Builds JobDetails from the form; empty fields are left out entirely. */
export function formToDetails(f: DetailsForm): JobDetails | undefined {
  const d: JobDetails = {};
  const set = <K extends keyof JobDetails>(k: K, v: JobDetails[K] | null | undefined) => {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
    d[k] = v;
  };
  set('summary', one(f.summary));
  set('numberOfPosts', one(f.numberOfPosts));
  set('postGroups', textToGroups(f.posts));
  set('departmentGroups', textToGroups(f.departments));
  set('qualifications', textToRequirements(f.qualifications));
  set('preferredQualifications', textToRequirements(f.preferred));
  set('experience', textToRequirements(f.experience));
  set('candidateProfile', textToList(f.profile));
  set('responsibilities', textToList(f.responsibilities));
  set('salaryText', one(f.salaryText));
  set('employmentType', one(f.employmentType));
  set('ageLimit', one(f.ageLimit));
  set('applicationFee', one(f.applicationFee));
  set('reservation', one(f.reservation));
  set('selectionProcess', textToList(f.selection));
  set('importantDates', textToPairs(f.dates));
  set('notificationDate', one(f.notificationDate));
  set('interviewText', one(f.interviewText));
  set('applyModes', f.applyModes);
  set('howToApply', one(f.howToApply));
  set('applicationProcedure', textToList(f.procedure));
  set('applyEmails', textToEmails(f.emails));
  set('contactPhones', f.phones.split(/[,;\n]/).map(p => p.trim()).filter(Boolean));
  set('applicationLink', url(f.applicationLink));
  set('officialWebsite', url(f.officialWebsite));
  set('notificationLink', url(f.notificationLink));
  set('documentsRequired', textToList(f.documents));
  set('organizationAddress', one(f.address.split(/\r?\n/).join(', ')));
  set('benefits', textToList(f.benefits));
  return Object.keys(d).length ? d : undefined;
}

/** Fills the form from saved details (for editing). */
export function detailsToForm(d?: JobDetails | null): DetailsForm {
  if (!d) return { ...EMPTY_DETAILS_FORM };
  return {
    summary: d.summary || '', numberOfPosts: d.numberOfPosts || '', posts: groupsToText(d.postGroups), departments: groupsToText(d.departmentGroups),
    qualifications: reqToText(d.qualifications), preferred: reqToText(d.preferredQualifications), experience: reqToText(d.experience),
    profile: listToText(d.candidateProfile), responsibilities: listToText(d.responsibilities), salaryText: d.salaryText || '',
    employmentType: d.employmentType || '', ageLimit: d.ageLimit || '', applicationFee: d.applicationFee || '', reservation: d.reservation || '',
    selection: listToText(d.selectionProcess), dates: pairsToText(d.importantDates), notificationDate: d.notificationDate || '',
    interviewText: d.interviewText || '', applyModes: d.applyModes || [], howToApply: d.howToApply || '', procedure: listToText(d.applicationProcedure),
    emails: emailsToText(d.applyEmails), phones: (d.contactPhones || []).join(', '), applicationLink: d.applicationLink || '',
    officialWebsite: d.officialWebsite || '', notificationLink: d.notificationLink || '', documents: listToText(d.documentsRequired),
    address: d.organizationAddress || '', benefits: listToText(d.benefits),
  };
}

/** All searchable text of the details (posts, departments, qualifications...). */
export function detailsSearchText(d?: JobDetails | null): string {
  if (!d) return '';
  return [
    d.summary, d.hiringOrganization, d.locationText, d.salaryText,
    ...(d.postGroups || []).flatMap(g => [g.group, ...g.items]),
    ...(d.departmentGroups || []).flatMap(g => [g.group, ...g.items]),
    ...[...(d.qualifications || []), ...(d.preferredQualifications || []), ...(d.experience || [])].map(r => `${r.post || ''} ${r.text}`),
  ].filter(Boolean).join(' ');
}
