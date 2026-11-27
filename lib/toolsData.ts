/*
 * Data for two free tools, kept by the administrator in Admin → Tools data:
 *  - the research funding and fellowship calendar (calls with deadlines);
 *  - the NET / SET exam hub (exams with their official sites and syllabus, and dated notices).
 * The seed below was checked by hand on 27 Nov 2026 against the linked pages; every entry records where it came
 * from and when it was checked, and the pages tell readers to confirm on the official site before applying.
 */

export type Discipline = 'all' | 'science' | 'engineering' | 'medical' | 'social-sciences' | 'humanities' | 'agriculture';
export const DISCIPLINES: [Discipline, string][] = [['all', 'All subjects'], ['science', 'Science'], ['engineering', 'Engineering & technology'], ['medical', 'Medical & health'], ['social-sciences', 'Social sciences'], ['humanities', 'Humanities'], ['agriculture', 'Agriculture']];
export type CallKind = 'grant' | 'fellowship' | 'award' | 'other';
export const CALL_KINDS: [CallKind, string][] = [['grant', 'Research grant'], ['fellowship', 'Fellowship'], ['award', 'Award'], ['other', 'Other']];

export interface FundingCall {
  id: string;
  funder: string;
  title: string;
  kind: CallKind;
  disciplines: Discipline[];
  who: string;          // eligibility in one line
  amount: string;       // e.g. "Up to ₹60 lakh + overheads, 3 years"
  opens: string;        // YYYY-MM-DD or ''
  deadline: string;     // YYYY-MM-DD or '' (rolling)
  rolling: boolean;
  link: string;         // official page
  source: string;       // where the details were read, if not the official page
  checked: string;      // YYYY-MM-DD
  notes: string;
}

export type NoticeKind = 'notification' | 'application' | 'correction' | 'admit-card' | 'exam' | 'answer-key' | 'result' | 'syllabus' | 'other';
export const NOTICE_KINDS: [NoticeKind, string][] = [['notification', 'Notification'], ['application', 'Applications'], ['correction', 'Correction window'], ['admit-card', 'Admit card / city slip'], ['exam', 'Exam'], ['answer-key', 'Answer key'], ['result', 'Result'], ['syllabus', 'Syllabus'], ['other', 'Notice']];

export interface Exam {
  id: string;
  name: string;         // "UGC-NET"
  full: string;         // "National Eligibility Test (UGC)"
  body: string;         // conducting body
  scope: string;        // "All India" / "Kerala"
  site: string;         // official website
  syllabus: string;     // official syllabus page ('' if none)
  frequency: string;    // "Twice a year (June and December cycles)"
  qualifies: string;    // what it qualifies for
}

export interface ExamNotice {
  id: string;
  examId: string;
  title: string;
  kind: NoticeKind;
  date: string;         // YYYY-MM-DD (start)
  endDate: string;      // YYYY-MM-DD or ''
  link: string;
  source: string;
  checked: string;
  note: string;
}

export interface ToolsData { calls: FundingCall[]; exams: Exam[]; notices: ExamNotice[]; updatedAt: string }

const C = '2026-11-27';
const call = (c: Omit<FundingCall, 'opens' | 'rolling' | 'source' | 'notes' | 'checked'> & Partial<FundingCall>): FundingCall =>
  ({ opens: '', rolling: false, source: '', notes: '', checked: C, ...c });

export const SEED_CALLS: FundingCall[] = [
  call({ id: 'icssr-senior-fellowship-2026', funder: 'ICSSR', title: 'ICSSR Senior Fellowship 2026–27 (2nd call)', kind: 'fellowship', disciplines: ['social-sciences', 'humanities'], who: 'Indian social science researchers with a substantial record of research and publications', amount: '', opens: '2026-10-21', deadline: '2026-11-30', link: 'https://icssr.org/announcements/2nd-call-applications-icssrs-senior-fellowship-2026', source: 'https://www.lawof.in/icssr-senior-fellowship-2026-27-deadline-extended-till-30-november-2026-apply-now', notes: 'Deadline extended from 20 November. Apply at app.icssr.org.' }),
  call({ id: 'icmr-first-in-world-2026', funder: 'ICMR', title: 'First in World Challenge Grants 2026 (investigator-initiated)', kind: 'grant', disciplines: ['medical'], who: 'Scientists and faculty at recognised Indian institutions, individually or as a team led by a PI', amount: '', deadline: '2026-11-30', link: 'https://www.icmr.gov.in/icmrobject/uploads/Call/1790846907_call_fiw_2026.pdf', source: 'https://phdtalks.org/2026/10/call-for-proposals-first-in-world.html', notes: 'Closes 5:30 pm.' }),
  call({ id: 'anrf-pmecrg-2026', funder: 'ANRF', title: 'Prime Minister Early Career Research Grant (PMECRG) 2026', kind: 'grant', disciplines: ['science', 'engineering', 'medical', 'agriculture'], who: 'Indian citizens with a Ph.D. (or MD/MS/MDS/MVSc) in a regular post, within two years of joining, under 42 (relaxation for SC/ST/OBC/PwD and women)', amount: 'Up to ₹60 lakh + overheads over 3 years', deadline: '2026-12-02', link: 'https://anrfonline.in/ANRF/ecrg_anrf?HomePage=New', source: 'https://phdtalks.org/2026/11/prime-minister-early-career-research-grant-2026.html', notes: 'Closes 5:00 pm.' }),
  call({ id: 'anrf-maha-re-2026', funder: 'ANRF', title: 'MAHA Renewable Energy Programme — call for proposals', kind: 'grant', disciplines: ['science', 'engineering'], who: 'Research institutions and academic organisations', amount: 'Up to ₹10 crore per project', deadline: '2026-12-18', link: 'https://www.anrfonline.in/ANRF/mahare_anrf?HomePage=New', source: 'https://phdtalks.org/2026/11/anrf-maha-renewable-energy-programme.html' }),
  call({ id: 'anrf-ai-se-2026', funder: 'ANRF', title: 'AI for Science and Engineering (Mission AI-SE) — call for proposals', kind: 'grant', disciplines: ['science', 'engineering'], who: 'Consortium-based proposals; see the call for eligibility', amount: '', deadline: '2026-12-21', link: 'https://anrfonline.in/ANRF/aise_anrf', source: 'https://phdtalks.org/2026/11/anrf-ai-for-science-and-engineering-call-for-proposals.html' }),
  call({ id: 'drdo-dia-coe-2026', funder: 'DRDO (DFTM)', title: 'Research proposals on problems under DRDO Industry Academia Centres of Excellence (DIA-CoEs)', kind: 'grant', disciplines: ['science', 'engineering'], who: 'Academia and national research institutes', amount: '', deadline: '2026-12-31', link: 'https://drdo.gov.in/drdo/en/announcement/call-proposals-dftm-invites-research-proposals-research-problems-dia-coes', source: 'https://phdtalks.org/2026/09/dftm-drdo-call-for-proposals-dia-coes.html' }),
  call({ id: 'anrf-ramanujan', funder: 'ANRF', title: 'Ramanujan Fellowship', kind: 'fellowship', disciplines: ['science', 'engineering', 'medical', 'agriculture'], who: 'Indian or Indian-origin scientists and engineers under 40 working abroad who want to return to India, with a Ph.D. and no permanent post in India', amount: '', deadline: '', rolling: true, link: 'https://anrfonline.in/ANRF/Ramanujan_fellowship?HomePage=New', source: 'https://www.indiascienceandtechnology.gov.in/latest-updates', notes: 'Nominations accepted through the year; the India Science & Technology portal lists the current call as open until 31 December 2026.' }),
  call({ id: 'icmr-small-extramural-2027', funder: 'ICMR', title: 'Small Extramural (Anveshan) Grants 2027', kind: 'grant', disciplines: ['medical'], who: 'Researchers in regular posts at Indian institutions as PI; contractual or temporary faculty under conditions in the call', amount: '₹10 lakh to under ₹2 crore, up to 3 years', deadline: '2027-01-20', link: 'https://www.icmr.gov.in/icmrobject/uploads/Call/1793963029_1_smallanveshangrants2027.pdf', source: 'https://phdtalks.org/2026/11/icmr-anveshan-extramural-grants-2027.html', notes: 'Closes 5:00 pm IST.' }),
  call({ id: 'icssr-major-minor-2026', funder: 'ICSSR', title: 'Major and Minor Research Projects 2026–27', kind: 'grant', disciplines: ['social-sciences', 'humanities'], who: 'Indian scholars, researchers and academics (see the scheme guidelines)', amount: '', deadline: '2026-09-18', link: 'https://icssr.org/announcements/call-project-proposals-under-scheme-major-and-minor-research-projects-2026-27', notes: 'Closed (extended from 31 August).' }),
  call({ id: 'icssr-nstc-taiwan-2026', funder: 'ICSSR with NSTC (Taiwan)', title: 'ICSSR–NSTC joint call for research proposals 2026', kind: 'grant', disciplines: ['social-sciences', 'humanities'], who: 'Ph.D. holders in a research or academic post, applying jointly with a Taiwanese partner', amount: 'Up to ₹12 lakh per project (5 projects)', opens: '2026-06-01', deadline: '2026-08-03', link: 'https://icssr.org/announcements/icssr-nstc-taiwan-joint-call-research-proposals-2026', notes: 'Closed; results expected December 2026.' }),
];

/** Official places to look for calls that are not in the list yet. */
export const FUNDING_PORTALS: { name: string; url: string }[] = [
  { name: 'ANRF (Anusandhan National Research Foundation)', url: 'https://www.anrfonline.in/ANRF/HomePage' },
  { name: 'India Science & Technology portal — ongoing calls', url: 'https://www.indiascienceandtechnology.gov.in/latest-updates' },
  { name: 'DST — call for proposals', url: 'https://www.dst.gov.in/offerings/call-for-proposals' },
  { name: 'ICSSR — announcements', url: 'https://icssr.org/announcements' },
  { name: 'ICMR — calls', url: 'https://www.icmr.gov.in' },
  { name: 'UGC', url: 'https://www.ugc.gov.in' },
];

export const SEED_EXAMS: Exam[] = [
  { id: 'ugc-net', name: 'UGC-NET', full: 'National Eligibility Test (UGC)', body: 'National Testing Agency (NTA)', scope: 'All India', site: 'https://ugcnet.nta.nic.in', syllabus: 'https://www.ugcnetonline.in/syllabus-new.php', frequency: 'Twice a year (June and December cycles)', qualifies: 'Assistant Professor, JRF and Ph.D. admission — 83 subjects' },
  { id: 'csir-net', name: 'CSIR-UGC NET', full: 'Joint CSIR-UGC National Eligibility Test', body: 'National Testing Agency (NTA) for CSIR', scope: 'All India', site: 'https://csirnet.nta.nic.in', syllabus: 'https://csirhrdg.res.in', frequency: 'Twice a year (June and December cycles)', qualifies: 'JRF, Assistant Professor and Ph.D. admission in science subjects' },
  { id: 'kerala-set', name: 'Kerala SET', full: 'State Eligibility Test, Kerala', body: 'LBS Centre for Science and Technology', scope: 'Kerala', site: 'https://lbscentre.in', syllabus: '', frequency: 'Twice a year (January and July sessions)', qualifies: 'Higher secondary and non-vocational teachers in Kerala' },
  { id: 'mh-set', name: 'MH-SET', full: 'Maharashtra State Eligibility Test', body: 'Savitribai Phule Pune University', scope: 'Maharashtra and Goa', site: 'https://setexam.unipune.ac.in', syllabus: 'https://setexam.unipune.ac.in', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Maharashtra and Goa' },
  { id: 'kset', name: 'KSET', full: 'Karnataka State Eligibility Test', body: 'Karnataka Examinations Authority (KEA)', scope: 'Karnataka', site: 'https://cetonline.karnataka.gov.in/kea/', syllabus: '', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Karnataka' },
  { id: 'ap-set', name: 'AP SET', full: 'Andhra Pradesh State Eligibility Test', body: 'Andhra University', scope: 'Andhra Pradesh', site: 'https://apset.net.in', syllabus: 'https://apset.net.in', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Andhra Pradesh' },
  { id: 'ts-set', name: 'TS SET', full: 'Telangana State Eligibility Test', body: 'Osmania University', scope: 'Telangana', site: 'https://www.telanganaset.org', syllabus: 'https://www.telanganaset.org', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Telangana' },
  { id: 'wb-set', name: 'WB SET', full: 'West Bengal State Eligibility Test', body: 'West Bengal College Service Commission', scope: 'West Bengal', site: 'https://wbcsconline.in', syllabus: '', frequency: 'Usually once a year', qualifies: 'Assistant Professor in West Bengal' },
  { id: 'gset', name: 'GSET', full: 'Gujarat State Eligibility Test', body: 'The Maharaja Sayajirao University of Baroda', scope: 'Gujarat', site: 'https://gujaratset.ac.in', syllabus: 'https://gujaratset.ac.in', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Gujarat' },
  { id: 'mp-set', name: 'MP SET', full: 'Madhya Pradesh State Eligibility Test', body: 'Madhya Pradesh Public Service Commission', scope: 'Madhya Pradesh', site: 'https://mppsc.mp.gov.in', syllabus: '', frequency: 'Usually once a year', qualifies: 'Assistant Professor in Madhya Pradesh' },
];

const n = (x: Omit<ExamNotice, 'endDate' | 'source' | 'note' | 'checked'> & Partial<ExamNotice>): ExamNotice => ({ endDate: '', source: '', note: '', checked: C, ...x });
const BS = 'https://www.business-standard.com/education/news/nta-ugc-net-december-2026-schedule-out-check-subject-wise-exam-dates-nc-126111900880_1.html';
const KA = 'https://news.kollegeapply.com/news/csir-net-december-2026-subject-wise-exam-schedule-out-check-complete-schedule-here';
export const SEED_NOTICES: ExamNotice[] = [
  n({ id: 'ugc-net-dec26-apply', examId: 'ugc-net', title: 'UGC-NET December 2026: online applications', kind: 'application', date: '2026-10-08', endDate: '2026-10-31', link: 'https://ugcnet.nta.nic.in', source: BS }),
  n({ id: 'ugc-net-dec26-correct', examId: 'ugc-net', title: 'UGC-NET December 2026: application correction window', kind: 'correction', date: '2026-11-02', endDate: '2026-11-04', link: 'https://ugcnet.nta.nic.in', source: BS }),
  n({ id: 'ugc-net-dec26-exam', examId: 'ugc-net', title: 'UGC-NET December 2026: exam (CBT)', kind: 'exam', date: '2026-12-14', endDate: '2026-12-21', link: 'https://ugcnet.nta.nic.in', source: BS, note: 'On 14–18 and 21 December, two shifts a day (9 am–12 noon and 3–6 pm). Subject-wise schedule on the NTA site. City slip about 21 days and admit card 3–10 days before your exam.' }),
  n({ id: 'csir-net-dec26-ls', examId: 'csir-net', title: 'CSIR NET December 2026: Life Sciences and Biotechnology', kind: 'exam', date: '2026-12-19', link: 'https://csirnet.nta.nic.in', source: KA, note: 'Shift 2, 3–6 pm.' }),
  n({ id: 'csir-net-dec26-chem-earth', examId: 'csir-net', title: 'CSIR NET December 2026: Chemical Sciences; Earth, Atmospheric, Ocean and Planetary Sciences', kind: 'exam', date: '2026-12-22', link: 'https://csirnet.nta.nic.in', source: KA, note: 'Shift 1, 9 am–12 noon.' }),
  n({ id: 'csir-net-dec26-math-phy', examId: 'csir-net', title: 'CSIR NET December 2026: Mathematical Sciences; Physical Sciences', kind: 'exam', date: '2026-12-27', link: 'https://csirnet.nta.nic.in', source: KA, note: 'Shift 2, 3–6 pm.' }),
  n({ id: 'csir-net-syllabus-2026', examId: 'csir-net', title: 'CSIR NET: notice on the revised syllabus', kind: 'syllabus', date: '2026-04-13', link: 'https://csirhrdg.res.in/SiteContent/ManagedContent/ATContent/Notice_En_Syb_13April2026.pdf' }),
  n({ id: 'mh-set-2026-exam', examId: 'mh-set', title: 'MH-SET 2026: exam', kind: 'exam', date: '2026-10-25', link: 'https://setexam.unipune.ac.in', source: 'https://news.careers360.com/mh-set-2026-sppu-postpones-eligibility-test-3rd-time-exam-scheduled-oct-25-state-eligibility-test-assistant-professor-recruitment', note: 'Held after three postponements (from 26 July).' }),
  n({ id: 'kset-2026-exam', examId: 'kset', title: 'KSET 2026: exam (offline, OMR)', kind: 'exam', date: '2026-10-11', link: 'https://cetonline.karnataka.gov.in/kea/', source: 'https://freepressjournal.in/education/karnataka-kset-2026-registration-begins-for-assistant-professor-eligibility-test-at-kearecruitmentkarnatakagovin-exam-on-october-11' }),
  n({ id: 'ap-set-2026-exam', examId: 'ap-set', title: 'AP SET 2026: exam', kind: 'exam', date: '2026-03-28', endDate: '2026-03-29', link: 'https://apset.net.in', source: 'https://www.pw.live/ugc-net/exams/ap-set-exam-date-2026' }),
  n({ id: 'kerala-set-jan26-exam', examId: 'kerala-set', title: 'Kerala SET January 2026 session: exam', kind: 'exam', date: '2026-02-22', link: 'https://lbsedp.lbscentre.in/setjan26/', source: 'https://www.adda247.com/teaching-jobs-exam/kerala-set-exam' }),
];

export const SEED: ToolsData = { calls: SEED_CALLS, exams: SEED_EXAMS, notices: SEED_NOTICES, updatedAt: `${C}T00:00:00.000Z` };

// ------------------------------------------------------------------ helpers shared by the pages and the admin

export const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const DAY = 86400000;
export function daysBetween(from: string, to: string): number { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY); }
export function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export type CallStatus = 'open' | 'upcoming' | 'rolling' | 'closed';
export function callStatus(c: FundingCall, today = todayIst()): CallStatus {
  if (c.rolling && (!c.deadline || c.deadline >= today)) return 'rolling';
  if (c.deadline && c.deadline < today) return 'closed';
  if (c.opens && c.opens > today) return 'upcoming';
  return 'open';
}

/** Open calls by nearest deadline, then upcoming, rolling, and closed (most recent first). */
export function sortCalls(calls: FundingCall[], today = todayIst()): FundingCall[] {
  const rank: Record<CallStatus, number> = { open: 0, upcoming: 1, rolling: 2, closed: 3 };
  return [...calls].sort((a, b) => {
    const sa = callStatus(a, today), sb = callStatus(b, today);
    if (sa !== sb) return rank[sa] - rank[sb];
    if (sa === 'closed') return b.deadline.localeCompare(a.deadline);
    return (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.title.localeCompare(b.title);
  });
}

export function noticeWhen(x: ExamNotice, today = todayIst()): 'upcoming' | 'ongoing' | 'past' {
  const end = x.endDate || x.date;
  if (end < today) return 'past';
  if (x.date <= today) return 'ongoing';
  return 'upcoming';
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const isDate = (s: unknown) => typeof s === 'string' && (s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s));
const httpUrl = (s: unknown) => typeof s === 'string' && (s === '' || /^https?:\/\/[^\s]+$/i.test(s));
const str = (v: unknown, max = 600) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Validates and cleans one call sent by the admin form. Throws with a readable message. */
export function cleanCall(raw: Partial<FundingCall>): FundingCall {
  const c: FundingCall = {
    id: str(raw.id, 80) || slug(`${raw.funder || ''} ${raw.title || ''}`) || `call-${Date.now()}`,
    funder: str(raw.funder, 120), title: str(raw.title, 240),
    kind: (CALL_KINDS.map(k => k[0]) as string[]).includes(String(raw.kind)) ? raw.kind as CallKind : 'grant',
    disciplines: (Array.isArray(raw.disciplines) ? raw.disciplines : []).filter(d => DISCIPLINES.some(x => x[0] === d)) as Discipline[],
    who: str(raw.who, 400), amount: str(raw.amount, 160), opens: str(raw.opens, 10), deadline: str(raw.deadline, 10), rolling: !!raw.rolling,
    link: str(raw.link, 500), source: str(raw.source, 500), checked: str(raw.checked, 10) || todayIst(), notes: str(raw.notes, 600),
  };
  if (!c.funder || !c.title) throw new Error('Funder and title are needed.');
  if (!c.link || !httpUrl(c.link)) throw new Error('The official link must start with http:// or https://.');
  if (!httpUrl(c.source)) throw new Error('The source link must start with http:// or https://.');
  if (!isDate(c.opens) || !isDate(c.deadline) || !isDate(c.checked)) throw new Error('Dates must be in the form YYYY-MM-DD.');
  if (!c.deadline && !c.rolling) throw new Error('Give a deadline, or tick “open through the year”.');
  if (!c.disciplines.length) c.disciplines = ['all'];
  return c;
}

export function cleanExam(raw: Partial<Exam>): Exam {
  const e: Exam = {
    id: str(raw.id, 60) || slug(String(raw.name || '')) || `exam-${Date.now()}`,
    name: str(raw.name, 60), full: str(raw.full, 160), body: str(raw.body, 160), scope: str(raw.scope, 80),
    site: str(raw.site, 300), syllabus: str(raw.syllabus, 300), frequency: str(raw.frequency, 120), qualifies: str(raw.qualifies, 200),
  };
  if (!e.name || !e.body) throw new Error('Exam name and conducting body are needed.');
  if (!e.site || !httpUrl(e.site) || !httpUrl(e.syllabus)) throw new Error('Links must start with http:// or https://.');
  return e;
}

export function cleanNotice(raw: Partial<ExamNotice>, exams: Exam[]): ExamNotice {
  const x: ExamNotice = {
    id: str(raw.id, 80) || `${raw.examId}-${slug(String(raw.title || ''))}`.slice(0, 80) || `notice-${Date.now()}`,
    examId: str(raw.examId, 60), title: str(raw.title, 240),
    kind: (NOTICE_KINDS.map(k => k[0]) as string[]).includes(String(raw.kind)) ? raw.kind as NoticeKind : 'other',
    date: str(raw.date, 10), endDate: str(raw.endDate, 10), link: str(raw.link, 500), source: str(raw.source, 500), checked: str(raw.checked, 10) || todayIst(), note: str(raw.note, 600),
  };
  if (!exams.some(e => e.id === x.examId)) throw new Error('Choose the exam this notice belongs to.');
  if (!x.title) throw new Error('A title is needed.');
  if (!x.date || !isDate(x.date) || !isDate(x.endDate) || !isDate(x.checked)) throw new Error('Dates must be in the form YYYY-MM-DD.');
  if (x.endDate && x.endDate < x.date) throw new Error('The end date is before the start date.');
  if (!x.link || !httpUrl(x.link) || !httpUrl(x.source)) throw new Error('Links must start with http:// or https://.');
  return x;
}

/** iCalendar file (all-day events) so people can add deadlines and exam dates to Google / Outlook calendars. */
export function ics(events: { uid: string; title: string; date: string; endDate?: string; url: string; description?: string }[]): string {
  const e = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const d = (s: string) => s.replace(/-/g, '');
  const next = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AcadeXMatch//Free tools//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT', `UID:${ev.uid}@acadexmatch.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(ev.date)}`, `DTEND;VALUE=DATE:${d(next(ev.endDate || ev.date))}`,
      `SUMMARY:${e(ev.title)}`, `URL:${ev.url}`, `DESCRIPTION:${e(`${ev.description ? `${ev.description}\n` : ''}${ev.url}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(l => (l.length > 74 ? l.match(/.{1,74}/g)!.join('\r\n ') : l)).join('\r\n') + '\r\n';
}
