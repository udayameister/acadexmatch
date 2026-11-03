/*
 * AcadeXMatch Help Assistant: knowledge base, matcher and privacy guards.
 *
 * The assistant answers "how do I…" questions about the platform from the articles below. By design it never
 * reads account data: it receives only the question and which audience is asking (candidate, institution or
 * visitor), so it cannot reveal anyone's personal details. Questions that contain a password, sign-in code,
 * card number or ID number are stopped before they are sent, and requests for other people's details are declined.
 */

export type HelpAudience = 'candidate' | 'institute' | 'guest';

export interface HelpLink { label: string; href: string }

export interface HelpArticle {
  id: string;
  /** Who the article is for; 'all' = everyone. */
  for: HelpAudience[] | 'all';
  title: string;
  /** Words and phrases people use for this topic. */
  keywords: string[];
  /** Plain text; lines starting with "• " show as a list. */
  answer: string;
  links?: HelpLink[];
}

export interface HelpReply {
  kind: 'answer' | 'fallback' | 'blocked' | 'privacy' | 'greeting';
  text: string;
  links?: HelpLink[];
  /** Follow-up questions to offer as buttons. */
  suggestions?: string[];
  articleId?: string;
}

export const SUPPORT_EMAIL = 'info@acadexmatch.com';

// ------------------------------------------------------------------ knowledge base

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------- everyone
  {
    id: 'about', for: 'all', title: 'What is AcadeXMatch?',
    keywords: ['what is acadexmatch', 'acadexmatch', 'about acadexmatch', 'about', 'platform', 'portal', 'who are you', 'what do you do', 'how it works'],
    answer: 'AcadeXMatch is a faculty recruitment platform for higher education in India. Candidates find teaching and research vacancies with pay scale and eligibility, and apply. Colleges, universities and research institutions post vacancies and manage applicants, interviews and selection in one place.',
    links: [{ label: 'How it works', href: '/#how-it-works' }, { label: 'About us', href: '/about' }],
  },
  {
    id: 'register', for: 'all', title: 'Creating an account',
    keywords: ['register', 'sign up', 'signup', 'create account', 'new account', 'join', 'open account', 'registration'],
    answer: 'Go to Sign up and choose whether you are a candidate (job seeker) or an institution. Candidates can also sign up with Google. After signing up, confirm your email address with the link we send you.\n• Candidate accounts are free, including Premium.\n• Institutions pick their institute from the AISHE directory and use an official email address.',
    links: [{ label: 'Sign up', href: '/register' }],
  },
  {
    id: 'signin', for: 'all', title: 'Signing in',
    keywords: ['sign in', 'signin', 'login', 'log in', 'cannot login', 'can not log in', 'google', 'gmail', 'continue with google', 'sign in failed'],
    answer: 'Sign in with your email address and password, or with "Continue with Google" if you signed up with the same Gmail address.\n• If sign-in fails, check the email address for typos and try "Forgot password".\n• After several wrong attempts, sign-in pauses for a short time. Wait a few minutes and try again.\n• Still stuck? Email us from your registered address and we will help.',
    links: [{ label: 'Sign in', href: '/login' }, { label: 'Forgot password', href: '/forgot-password' }],
  },
  {
    id: 'password', for: 'all', title: 'Forgot or change password',
    keywords: ['forgot password', 'reset password', 'change password', 'new password', 'password reset', 'lost password', 'reset code'],
    answer: 'Forgot it: open "Forgot password", enter your email address and type the code we email you. Then choose a new password within 10 minutes.\nTo change it while signed in: My account → Security.\nNever share your password or reset code with anyone, including AcadeXMatch staff or this assistant.',
    links: [{ label: 'Forgot password', href: '/forgot-password' }, { label: 'My account', href: '/account' }],
  },
  {
    id: 'verify-email', for: 'all', title: 'Confirming your email address',
    keywords: ['verify email', 'confirm email', 'verification email', 'email not received', 'did not get email', 'no email', 'activation link', 'spam'],
    answer: 'Open the confirmation link we emailed when you signed up. If you cannot find it, check the Spam or Promotions folder, then request a new link from My account.\nSome features, such as applying or posting vacancies, need a confirmed email address.',
    links: [{ label: 'My account', href: '/account' }],
  },
  {
    id: 'security', for: 'all', title: 'Account security',
    keywords: ['security', 'hacked', 'someone else', 'sign out all devices', 'logout other devices', 'suspicious', 'phishing', 'safe'],
    answer: 'In My account → Security you can change your password and sign out all other devices.\nAcadeXMatch never asks for your password, sign-in codes or bank details by phone, email or chat. If you think someone else used your account, change your password, sign out other devices and email us.',
    links: [{ label: 'My account', href: '/account' }],
  },
  {
    id: 'notifications', for: 'all', title: 'Emails and notifications',
    keywords: ['notification', 'notifications', 'emails', 'unsubscribe', 'stop emails', 'too many emails', 'email settings', 'message history'],
    answer: 'Choose which emails you receive in My account → Notifications, where you can also see the messages we have sent you. Every optional email also has an unsubscribe link.',
    links: [{ label: 'Notification settings', href: '/account/notifications' }],
  },
  {
    id: 'pricing', for: 'all', title: 'Prices and plans',
    keywords: ['price', 'pricing', 'cost', 'fee', 'fees', 'charges', 'plan', 'plans', 'how much', 'free', 'paid', 'subscription cost'],
    answer: 'Candidates: free, and Premium is included free for every candidate.\nInstitutions: Institution Premium, a yearly subscription priced by AISHE category (read from the AISHE code):\n• University (U-): ₹30,000\n• College (C-): ₹20,000\n• R&D institution (R-): ₹10,000\n• Standalone institution (S-): ₹5,000',
    links: [{ label: 'Plans', href: '/premium' }],
  },
  {
    id: 'privacy', for: 'all', title: 'Your data and privacy',
    keywords: ['privacy', 'personal data', 'my data', 'data protection', 'dpdp', 'who can see', 'delete account', 'close account', 'remove account', 'delete my data'],
    answer: 'Institutions see your profile and documents only when you apply to them. Talent search shows only candidates who opted in, without contact details or documents.\nTo close your account or ask for a copy of your data, email us from your registered email address. The Privacy policy explains what we keep and why.',
    links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms', href: '/terms' }],
  },
  {
    id: 'assistant', for: 'all', title: 'What this assistant can see',
    keywords: ['what can you see', 'can you see my', 'are you human', 'are you ai', 'bot', 'chatbot', 'assistant', 'is this chat private', 'do you store'],
    answer: 'I am the AcadeXMatch Help Assistant. I answer questions about using the platform.\n• I cannot see your account, applications, documents or payments, or anyone else\'s.\n• Please do not type passwords, sign-in codes, card numbers or ID numbers here.\n• This chat is not saved: it clears when you sign out or close the tab.\nFor anything about your own account, email our team.',
  },
  {
    id: 'contact', for: 'all', title: 'Contacting the AcadeXMatch team',
    keywords: ['contact', 'support', 'change email', 'change my email', 'wrong email', 'help desk', 'human', 'talk to someone', 'customer care', 'phone number', 'email you', 'complaint', 'agent', 'call'],
    answer: `Email ${SUPPORT_EMAIL} from your registered email address and describe the problem (the page and what you clicked). Do not include your password or any code.`,
    links: [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` }],
  },
  {
    id: 'salary', for: 'all', title: 'Salary calculator',
    keywords: ['salary', 'pay', 'pay scale', 'pay matrix', '7th cpc', 'cpc', 'da', 'hra', 'in hand', 'take home', 'agp', 'academic level'],
    answer: 'The Salary calculator estimates monthly pay under the 7th CPC academic pay matrix used by UGC and AICTE. Choose the academic level and cell, then adjust the DA rate, city (for HRA) and deductions. It is an estimate: the institution\'s offer letter is final.',
    links: [{ label: 'Salary calculator', href: '/salary-calculator' }],
  },
  {
    id: 'events', for: 'all', title: 'FDPs, workshops, seminars and conferences',
    keywords: ['fdp', 'faculty development programme', 'faculty development program', 'workshop', 'seminar', 'conference', 'call for papers', 'advertise event', 'post event', 'post fdp', 'post conference', 'event listing', 'webinar'],
    answer: 'Upcoming FDPs, workshops and seminars are on the Events page, and conferences have their own Conferences page. Both are also on the home page.\nOrganisers can advertise their event:\n• FDP, workshop or seminar: ₹1,000 per listing\n• Conference: ₹2,000 per listing\nFill in the details, pay online, and our team checks the listing. It stays on the site until the event ends.',
    links: [{ label: 'Events', href: '/events' }, { label: 'Conferences', href: '/conferences' }, { label: 'Advertise an event', href: '/events/post' }],
  },
  {
    id: 'institutions-list', for: 'all', title: 'Institution profiles',
    keywords: ['institutions', 'colleges', 'universities', 'institution list', 'institute profile', 'which colleges'],
    answer: 'The Institutions page lists the institutions on AcadeXMatch, each with its profile and open vacancies.',
    links: [{ label: 'Institutions', href: '/institutes' }],
  },

  // ---------------- candidates
  {
    id: 'resume-checker', for: ['candidate', 'guest'], title: 'Resume checker (ATS score) and resume builder',
    keywords: ['resume checker', 'resume check', 'ats score', 'ats', 'check my resume', 'check my cv', 'resume score', 'cv score', 'resume builder', 'build resume', 'build cv', 'resume template', 'cv template', 'job description match', 'keyword gap', 'skill gap', 'resume intelligence', 'improve resume', 'improve cv'],
    answer: 'The Resume checker is free for candidates. Upload your resume (PDF, Word .docx or text, up to 5 MB) and, if you like, paste a job description or choose an AcadeXMatch vacancy. You get:\n• an ATS score out of 100 with what to fix first\n• missing skills and keywords for that job\n• formatting checks and stronger wording for your bullet points\n• for academic CVs, an indicative UGC eligibility check\n• matching vacancies\nThe Resume builder has four ATS-friendly templates and downloads as PDF or Word. Your resumes are private to you, and you can delete them at any time.',
    links: [{ label: 'Resume checker', href: '/candidate/resume-checker' }],
  },
  {
    id: 'find-jobs', for: ['candidate', 'guest'], title: 'Finding vacancies',
    keywords: ['find job', 'search job', 'vacancy', 'vacancies', 'jobs', 'openings', 'assistant professor', 'associate professor', 'professor', 'filter', 'state', 'discipline', 'department', 'job board'],
    answer: 'Open Find Jobs and search by post, subject or institution, then narrow the list with the filters. Each vacancy shows the pay scale, eligibility (degree, NET/SET/PhD) and last date. Signed in as a candidate, you also see your match score.',
    links: [{ label: 'Find Jobs', href: '/jobs' }],
  },
  {
    id: 'apply', for: ['candidate', 'guest'], title: 'Applying for a vacancy',
    keywords: ['apply', 'application', 'how to apply', 'how do i apply', 'apply for a job', 'apply for job', 'apply for a vacancy', 'apply for the post', 'one click', 'one-click apply', 'submit application', 'apply button', 'external link'],
    answer: 'Open the vacancy and choose Apply. With Premium (free for every candidate) you apply in one click through AcadeXMatch, answer any screening questions and track the status.\nSome vacancies found from institutions\' websites must be applied for on the institution\'s own site. Use "Track" to keep them in your tracker.\nTip: complete your profile and upload certificates first, since institutions see them when you apply.',
    links: [{ label: 'Find Jobs', href: '/jobs' }, { label: 'My profile', href: '/candidate/profile' }],
  },
  {
    id: 'premium-candidate', for: ['candidate', 'guest'], title: 'Candidate Premium',
    keywords: ['premium', 'upgrade', 'premium benefits', 'premium vacancies', 'premium vacancy', 'free for job seekers', 'job seeker', 'job seekers', 'is it free', 'free for candidates', 'free for me', 'premium free', 'activate premium', 'premium features', 'membership'],
    answer: 'Premium is free for every candidate and is already active on candidate accounts. It includes:\n• One-click apply and Premium-only vacancies\n• Application tracking, interview schedule and status updates\n• Explainable match score and AI match against your CV, with CV import\n• UGC academic (API) score\n• Personalised top-match recommendations',
    links: [{ label: 'Plans', href: '/premium' }],
  },
  {
    id: 'profile', for: ['candidate'], title: 'Completing your academic profile',
    keywords: ['profile', 'edit profile', 'update profile', 'qualification', 'experience', 'publications', 'complete profile', 'profile incomplete', 'net', 'set', 'phd details'],
    answer: 'Open Profile and fill in qualifications, NET/SET/SLET, PhD, teaching and research experience, publications and awards. Institutions see this profile when you apply, and your academic score updates as you edit. Upload your photo and certificates on the same page.',
    links: [{ label: 'My profile', href: '/candidate/profile' }],
  },
  {
    id: 'documents', for: ['candidate'], title: 'Uploading certificates and documents',
    keywords: ['upload', 'document', 'documents', 'file format', 'file formats', 'formats allowed', 'jpg', 'png', 'certificate', 'certificates', 'photo', 'pdf', 'file size', 'upload failed', 'too large', 'proof'],
    answer: 'Upload documents in Profile → Documents.\n• Certificates: PDF, JPG, PNG or WebP, up to 5 MB each\n• Profile photo: JPG, PNG or WebP, up to 2 MB\nIf a file is too large, compress the PDF or scan at a lower resolution. Institutions see your documents only when you apply to them.',
    links: [{ label: 'My profile', href: '/candidate/profile' }],
  },
  {
    id: 'cv-import', for: ['candidate'], title: 'Importing your CV',
    keywords: ['cv import', 'import cv', 'resume', 'upload cv', 'parse', 'resume parser', 'autofill profile', 'fill profile from cv'],
    answer: 'CV Import fills your academic profile automatically from your CV. Upload it, check the details it finds, then save them to your profile. Publications can also be imported on the Profile page.',
    links: [{ label: 'CV Import', href: '/candidate/resume-parser' }],
  },
  {
    id: 'cv-download', for: ['candidate'], title: 'Downloading your academic CV',
    keywords: ['download cv', 'my cv', 'print cv', 'cv pdf', 'generate cv', 'resume pdf', 'biodata'],
    answer: 'Your academic CV is made from your profile. Open Academic CV and choose "Save as PDF" in the print window to download it.',
    links: [{ label: 'Academic CV', href: '/candidate/cv' }],
  },
  {
    id: 'api-score', for: ['candidate', 'guest'], title: 'UGC academic (API) score and match score',
    keywords: ['api score', 'academic score', 'ugc', 'table 3a', 'score', 'match score', 'match', 'percentage', 'why low score', 'explainable'],
    answer: 'Academic (API) score: calculated from your profile using UGC Regulations Table 3A (publications, books, projects, guidance and so on). Add missing entries to your profile to update it.\nMatch score: how well a vacancy fits your profile (qualification, NET/PhD, experience, subject and research area). "Why this match?" on a vacancy explains each part. It is guidance only: the institution\'s selection is final.',
    links: [{ label: 'My profile', href: '/candidate/profile' }],
  },
  {
    id: 'applications', for: ['candidate'], title: 'Application status and withdrawing',
    keywords: ['status', 'application status', 'my applications', 'shortlisted', 'rejected', 'withdraw', 'cancel application', 'track application', 'stage'],
    answer: 'Applications shows each application and its stage: Applied, Screening, Eligible, Shortlisted, Interview scheduled, Committee review, Offer and Joined, or Not selected. You also get an email at key steps, such as an interview being scheduled or a decision.\nTo withdraw, open Applications and choose Withdraw. This cannot be undone.',
    links: [{ label: 'My applications', href: '/candidate/applications' }],
  },
  {
    id: 'tracker', for: ['candidate'], title: 'Tracker and saved vacancies',
    keywords: ['tracker', 'saved', 'save job', 'applied on college website', 'applied on institution website', 'applied outside', 'track external', 'saved jobs', 'saved vacancies', 'save vacancy', 'bookmark', 'deadline', 'last date', 'reminder', 'outside acadexmatch'],
    answer: 'Tracker lists vacancies you saved, sorted by last date, and applications you made on institutions\' own websites. You can also add a vacancy from outside AcadeXMatch, so all your deadlines are in one place.',
    links: [{ label: 'Tracker', href: '/candidate/tracker' }],
  },
  {
    id: 'alerts', for: ['candidate'], title: 'Job alerts',
    keywords: ['alert', 'alerts', 'job alert', 'notify me', 'email me jobs', 'new vacancies', 'saved search'],
    answer: 'Save a search and we email you new vacancies that match it: instantly (as soon as a match is posted), daily (about 8 AM) or weekly. Create alerts on the Alerts page, or use "Email me new matches" on Find Jobs. You can keep up to 10 alerts.\nAll candidates with a confirmed email address also get a short email when new vacancies or events are approved. You can turn either off under My account → Notifications.',
    links: [{ label: 'Job alerts', href: '/candidate/alerts' }],
  },
  {
    id: 'interview-candidate', for: ['candidate'], title: 'Interviews',
    keywords: ['interview', 'interview slot', 'book slot', 'interview date', 'interview time', 'reschedule', 'interview preparation', 'demo class', 'teaching demonstration'],
    answer: 'When an institution offers interview times, choose a slot (or change it) in Applications, and add it to your calendar. You get an email with the details and reminders the day before and one hour before.\nInterview preparation has checklists, a question bank, a teaching demonstration planner and timed practice.',
    links: [{ label: 'My applications', href: '/candidate/applications' }, { label: 'Interview preparation', href: '/candidate/interview-prep' }],
  },
  {
    id: 'discoverable', for: ['candidate'], title: 'Being found by institutions',
    keywords: ['discoverable', 'talent search', 'visible to institutions', 'find my profile', 'institutions find me', 'see my profile', 'search my profile', 'invite', 'invitation', 'recruiters find me', 'hide profile'],
    answer: 'In Profile you can choose to be discoverable. Institutions with a subscription can then find you in talent search and invite you to apply. They see your academic details but not your email, phone or documents. Those are shared only when you apply. Untick the option at any time to hide your profile.',
    links: [{ label: 'My profile', href: '/candidate/profile' }],
  },
  {
    id: 'offer', for: ['candidate'], title: 'Offers of appointment',
    keywords: ['offer', 'offer letter', 'appointment order', 'selected', 'joining', 'accept offer'],
    answer: 'If you are selected, the institution issues an offer of appointment. It appears with that application in Applications, where you can respond to it. Contact the institution with questions about its terms.',
    links: [{ label: 'My applications', href: '/candidate/applications' }],
  },

  // ---------------- institutions
  {
    id: 'inst-register', for: ['institute', 'guest'], title: 'Registering an institution',
    keywords: ['register institution', 'institute registration', 'i am a college', 'we are a college', 'we are a university', 'join as institution', 'institution join', 'college join', 'college registration', 'aishe', 'aishe code', 'institution account', 'add institution', 'not listed', 'official email'],
    answer: 'Choose Sign up → Institution. Type your institute\'s name or AISHE code and pick it from the AISHE directory to fill in the details. Sign up with an official email address of your institution. Not listed? Type the details yourself.\nThe AcadeXMatch team then verifies the institution against AISHE before vacancies can be posted.',
    links: [{ label: 'Sign up', href: '/register' }],
  },
  {
    id: 'inst-verification', for: ['institute'], title: 'Institution verification',
    keywords: ['verification', 'verify institution', 'pending verification', 'not verified', 'awaiting verification', 'verification required', 'approve'],
    answer: 'New institutions are checked against the AISHE directory by the AcadeXMatch team. While verification is pending, you cannot post vacancies. If it is taking long, email us from your official address with your AISHE code.',
    links: [{ label: 'Dashboard', href: '/institute/dashboard' }],
  },
  {
    id: 'inst-subscription', for: ['institute'], title: 'Institution Premium subscription and payment',
    keywords: ['subscription', 'subscribe', 'payment', 'pay', 'renew', 'expired', 'activate', 'razorpay', 'invoice', 'receipt', 'gst', 'bill', 'institution premium'],
    answer: 'Institution accounts are Premium only. The yearly price depends on your AISHE category: University ₹30,000, College ₹20,000, R&D ₹10,000, Standalone ₹5,000.\nYour institute administrator can pay online (Razorpay) from the dashboard and the tools open immediately, or send a subscription request. Invoices and receipts are on My account.',
    links: [{ label: 'Plans', href: '/premium' }, { label: 'My account', href: '/account' }],
  },
  {
    id: 'inst-post-job', for: ['institute'], title: 'Posting a vacancy',
    keywords: ['post job', 'post vacancy', 'new vacancy', 'advertisement', 'publish job', 'create job', 'add vacancy', 'notification', 'reservation', 'roster', 'screening questions', 'premium vacancy'],
    answer: 'Open Post a Vacancy and fill in the post title, department, advertisement number, last date, reservation category, pay scale, minimum degree, publications and experience required, research areas and whether NET/SLET is mandatory.\n• Add two departmental screening questions.\n• Tick "Premium vacancy" to accept applications only through AcadeXMatch, or add a link on your website for other applicants.\nYou need a verified institution and an active subscription.',
    links: [{ label: 'Post a Vacancy', href: '/institute/post-job' }],
  },
  {
    id: 'inst-ats', for: ['institute'], title: 'Managing applicants',
    keywords: ['applicants', 'pipeline', 'ats', 'shortlist', 'screening', 'move stage', 'reject applicant', 'applicant list', 'dossier', 'export'],
    answer: 'Applicants shows everyone who applied, vacancy by vacancy, in an eight-stage pipeline: Applied, Screening, Eligible, Shortlisted, Interview scheduled, Committee review, Offer, Joined. Open an applicant to see the profile, documents, match score and screening answers, then move them to the next stage. Candidates see the stage on their Applications page.',
    links: [{ label: 'Applicants', href: '/institute/ats' }],
  },
  {
    id: 'inst-interviews', for: ['institute'], title: 'Scheduling interviews',
    keywords: ['interview', 'interviews', 'slots', 'schedule interview', 'interview slot', 'invite for interview', 'reminder'],
    answer: 'In Interviews, add interview times for a vacancy and invite shortlisted applicants. Each one picks a slot, and booked candidates get reminders the day before and one hour before.',
    links: [{ label: 'Interviews', href: '/institute/interviews' }],
  },
  {
    id: 'inst-selection', for: ['institute'], title: 'Selection committee and offers',
    keywords: ['selection', 'committee', 'score applicants', 'ranking', 'merit list', 'offer letter', 'appointment', 'select candidate'],
    answer: 'Committee members score applicants from the applicant pipeline ("Score") after the interview. Selection combines all members\' scores into a ranking, and from there you send offers of appointment.',
    links: [{ label: 'Selection', href: '/institute/selection' }, { label: 'Applicants', href: '/institute/ats' }],
  },
  {
    id: 'inst-talent', for: ['institute'], title: 'Talent search',
    keywords: ['talent', 'talent search', 'find candidates', 'search candidates', 'candidate search', 'candidates database', 'invite candidate', 'headhunt', 'candidate database', 'resume database'],
    answer: 'Talent search finds Premium candidates who chose to be discoverable. Filter by subject, API score, experience, PhD and NET, then invite them to apply. Contact details and documents are shared only when a candidate applies.',
    links: [{ label: 'Talent search', href: '/institute/talent' }],
  },
  {
    id: 'inst-reports', for: ['institute'], title: 'Reports',
    keywords: ['report', 'reports', 'naac', 'nba', 'statistics', 'analytics', 'funnel', 'download report'],
    answer: 'Reports shows how your vacancies are performing, with the selection funnel and figures by vacancy, for planning and for NAAC / NBA documentation.',
    links: [{ label: 'Reports', href: '/institute/reports' }],
  },
  {
    id: 'inst-team', for: ['institute'], title: 'Colleagues and recruiter accounts',
    keywords: ['recruiter', 'add user', 'colleague', 'account is not linked', 'linked to an institute', 'linked to my institute', 'not linked to', 'team', 'hr', 'another login', 'not linked', 'link account', 'staff account', 'multiple users'],
    answer: 'One subscription covers your whole institute. To add a colleague (for example HR or a recruiter) to your institute, or if your account says it is not linked to an institute, email us from your official address with the colleague\'s name and official email.',
    links: [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` }],
  },
];

// ------------------------------------------------------------------ privacy guards

/** Things that must never be typed into a chat. Returns a reason, or null. */
export function sensitiveInput(text: string): string | null {
  const t = text.normalize('NFKC');
  const digits = t.replace(/[\s-]/g, '');
  if (/\b(?:my\s+)?(?:pass(?:word|wd|code)?|pwd)\s*(?:is|=|:)\s*\S+/i.test(t)) return 'a password';
  if (/\b(?:otp|one[\s-]?time\s*(?:password|code)|verification\s*code|sign[\s-]?in\s*code|reset\s*code|pin)\b\D{0,15}\d{4,8}\b/i.test(t)) return 'a sign-in or verification code';
  if (/\b\d{4,8}\b\s*(?:is\s+)?(?:my\s+)?(?:otp|code|pin)\b/i.test(t)) return 'a sign-in or verification code';
  if (/(?:^|\D)\d{13,19}(?:\D|$)/.test(digits) && luhn(digits.match(/\d{13,19}/)![0])) return 'a card number';
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(t) && /aadha?ar|uid/i.test(t)) return 'an Aadhaar number';
  if (/\b[2-9]\d{3}\s\d{4}\s\d{4}\b/.test(t)) return 'an Aadhaar number';
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(t)) return 'a PAN number';
  if (/\b(?:cvv|cvc)\b\D{0,6}\d{3,4}\b/i.test(t)) return 'card security details';
  if (/\b(?:account|a\/c)\s*(?:no|number)?\.?\s*[:#]?\s*\d{9,18}\b/i.test(t) || /\bifsc\b/i.test(t) && /\d{9,18}/.test(t)) return 'a bank account number';
  if (/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{30,}|\brzp_(?:live|test)_[A-Za-z0-9]{8,}|\bxkeysib-[a-f0-9]{20,}/i.test(t)) return 'a secret key';
  return null;
}

function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Requests for someone else's personal details, or for account data the assistant does not hold. */
export function personalDataRequest(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const about = /\b(phone|mobile|contact|number|email|e-mail|address|whatsapp|salary|aadhaar|pan|password|documents?|cv|resume|details|profile|marks|data)\b/;
  const other = /\b(other|another|someone|somebody|particular|specific)\s+(candidate|applicant|user|person|professor|faculty|institute|institution|college|recruiter|people)s?\b|\bsomeone else|\bof\s+(dr|prof|mr|mrs|ms)\b|\b(dr|prof)\.?\s+[a-z]+'s\b/;
  if (other.test(t) && about.test(t)) return true;
  if (/\bwho (else )?(has )?applied\b|\b(list|names) of (all )?(the )?(candidates|applicants|users)\b|\bother (candidates|applicants|users)\b/.test(t)) return true;
  if (/\b(phone|mobile|contact|email|e-mail|whatsapp|address)\b.{0,20}\bof\s+(the\s+)?(candidate|applicant|user|person|student|faculty|professor|dr|prof|mr|mrs|ms)\b/.test(t)) return true;
  if (/\b(give|send|share|show|tell|find|get|export|download)\b.*\b(phone numbers?|emails?|email addresses|contact details|mobile numbers?|addresses|passwords?)\b.*\b(candidates|applicants|users|people|everyone|all)\b/.test(t)) return true;
  if (/\b(give|send|share|show|export|download|get)\b.*\b(candidate|applicant|user)s?\b.*\b(phone|mobile|email|contact|address|whatsapp)/.test(t)) return true;
  if (/\b(hack|bypass|scrape|dump|leak)\b/.test(t)) return true;
  return false;
}

// ------------------------------------------------------------------ matching

const STOP = new Set('a an the i me my we our you your is are am was be been do does did can could would should will to of in on for at by with from and or not no it this that how what when where why which who please pls plz kindly help want need get about there here have has any some us'.split(' '));

const SYNONYMS: Record<string, string> = {
  login: 'signin', logon: 'signin', signin: 'signin', 'log-in': 'signin',
  signup: 'register', registration: 'register', registered: 'register', registering: 'register', enrol: 'register', enroll: 'register',
  pwd: 'password', passwd: 'password',
  job: 'vacancy', jobs: 'vacancy', vacancies: 'vacancy', posts: 'vacancy', position: 'vacancy', positions: 'vacancy', opening: 'vacancy', openings: 'vacancy',
  institute: 'institution', institutes: 'institution', institutions: 'institution', college: 'institution', colleges: 'institution', university: 'institution', universities: 'institution',
  resume: 'cv', biodata: 'cv',
  applying: 'apply', applied: 'apply', applications: 'application',
  certificates: 'certificate', documents: 'document', docs: 'document', uploads: 'upload', uploading: 'upload',
  interviews: 'interview', slots: 'slot',
  alerts: 'alert', notifications: 'notification', emails: 'email', mail: 'email', mails: 'email',
  payment: 'pay', paying: 'pay', paid: 'pay', subscribe: 'subscription', subscriptions: 'subscription',
  recruiters: 'recruiter', applicants: 'applicant', candidates: 'candidate',
  verified: 'verification', verify: 'verification', verifying: 'verification',
  premium: 'premium', reports: 'report', scores: 'score', saved: 'save', saving: 'save', seekers: 'seeker',
};

function stem(w: string): string {
  if (SYNONYMS[w]) return SYNONYMS[w];
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return SYNONYMS[w] || w;
}

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9₹\s-]/g, ' ').split(/[\s-]+/).filter(w => w && !STOP.has(w)).map(stem);
}

interface Indexed { a: HelpArticle; kw: { words: string[]; phrase: string }[]; title: Set<string>; body: Set<string> }
let INDEX: Indexed[] | null = null;
let IDF: Map<string, number> | null = null;

function index(): Indexed[] {
  if (INDEX) return INDEX;
  INDEX = HELP_ARTICLES.map(a => ({
    a,
    // One entry per distinct word set, so synonyms (college / university / institute) don't add up.
    kw: a.keywords.map(k => ({ words: [...new Set(tokens(k))], phrase: k.toLowerCase() }))
      .filter((k, i, all) => k.phrase.includes(' ') || all.findIndex(o => !o.phrase.includes(' ') && o.words.join(' ') === k.words.join(' ')) === i),
    title: new Set(tokens(a.title)),
    body: new Set(tokens(a.answer)),
  }));
  const df = new Map<string, number>();
  for (const x of INDEX) {
    const all = new Set([...x.kw.flatMap(k => k.words), ...x.title, ...x.body]);
    all.forEach(w => df.set(w, (df.get(w) || 0) + 1));
  }
  IDF = new Map([...df].map(([w, n]) => [w, Math.log(1 + INDEX!.length / n)]));
  return INDEX;
}

function forAudience(a: HelpArticle, who: HelpAudience): boolean {
  return a.for === 'all' || a.for.includes(who);
}

/** Articles ranked for a question, best first. */
export function searchHelp(question: string, who: HelpAudience, limit = 3): { article: HelpArticle; score: number }[] {
  const idx = index();
  const q = tokens(question);
  const qs = new Set(q);
  const lower = ` ${question.toLowerCase().replace(/\s+/g, ' ')} `;
  const scored = idx.map(x => {
    let s = 0;
    for (const k of x.kw) {
      if (k.phrase.includes(' ') && lower.includes(k.phrase)) s += 4 + k.words.length;
      // A phrase that is mostly small words ("can you see my") must match as a phrase, not as one leftover word.
      else if (k.words.length && (k.words.length >= 2 || !k.phrase.includes(' ')) && k.words.every(w => qs.has(w))) s += 2.5 * k.words.length;
    }
    for (const w of qs) {
      const idf = IDF!.get(w) || 0;
      if (x.title.has(w)) s += 1.5 * idf;
      else if (x.body.has(w)) s += 0.4 * idf;
    }
    // Prefer articles written for this audience over general ones.
    if (s > 0 && x.a.for !== 'all' && x.a.for.includes(who)) s *= 1.25;
    if (!forAudience(x.a, who)) s *= 0.35;
    return { article: x.a, score: s };
  });
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export const SUGGESTIONS: Record<HelpAudience, string[]> = {
  candidate: ['How do I apply for a vacancy?', 'How is my API score calculated?', 'How do I upload certificates?', 'Set up job alerts'],
  institute: ['How do I post a vacancy?', 'How much is Institution Premium?', 'How do I schedule interviews?', 'Why is my institution not verified?'],
  guest: ['How do I sign up?', 'Is it free for job seekers?', 'How do institutions register?', 'I forgot my password'],
};

const SMALL_TALK: [RegExp, string][] = [
  [/^\s*(hi|hello|hey|hai|namaste|vanakkam|good (morning|afternoon|evening))\b[\s!.]*$/i, 'Hello! What would you like help with?'],
  [/^\s*(thanks|thank you|thx|ok thanks|great|super|nice)\b[\s!.]*$/i, 'You\'re welcome. Anything else I can help with?'],
  [/^\s*(bye|goodbye|see you)\b[\s!.]*$/i, 'Goodbye, and all the best!'],
];

export function greeting(who: HelpAudience, firstName?: string): HelpReply {
  const hello = firstName ? `Hello ${firstName}!` : 'Hello!';
  const what = who === 'candidate'
    ? 'I can help you find vacancies, complete your profile, apply and track applications.'
    : who === 'institute'
      ? 'I can help you post vacancies, manage applicants, schedule interviews and run selection.'
      : 'I can help you sign up, find vacancies or register your institution.';
  return {
    kind: 'greeting',
    text: `${hello} I'm the AcadeXMatch Help Assistant. ${what}\nI can't see your account or anyone else's details, so please don't type passwords or codes here.`,
    suggestions: SUGGESTIONS[who],
  };
}

/** Full answer from the knowledge base (no network, no account data). */
export function answerFromKnowledgeBase(question: string, who: HelpAudience): HelpReply {
  const q = question.trim().slice(0, 500);
  const secret = sensitiveInput(q);
  if (secret) return blockedReply(secret);
  if (personalDataRequest(q)) return privacyReply(who);
  for (const [re, text] of SMALL_TALK) if (re.test(q)) return { kind: 'answer', text, suggestions: SUGGESTIONS[who] };

  if (/\b(can|do|will) you (see|access|read|store|save|keep|know|view)\b|\bare you (a )?(human|bot|ai|real|person)\b/i.test(q)) {
    const a = HELP_ARTICLES.find(x => x.id === 'assistant')!;
    return { kind: 'answer', text: a.answer, links: a.links, articleId: a.id, suggestions: SUGGESTIONS[who] };
  }
  const hits = searchHelp(q, who, 4);
  if (!hits.length || hits[0].score < 2) return fallbackReply(who);
  const best = hits[0].article;
  const more = hits.slice(1).filter(h => h.score >= Math.max(2, hits[0].score * 0.45)).map(h => h.article.title);
  return { kind: 'answer', text: best.answer, links: best.links, suggestions: more.length ? more : undefined, articleId: best.id };
}

export function blockedReply(what: string): HelpReply {
  return {
    kind: 'blocked',
    text: `Your message looks like it contains ${what}, so I haven't sent it. Please never share passwords, sign-in codes, card, bank or ID numbers in a chat. AcadeXMatch staff will never ask for them. Ask your question without those details.`,
  };
}

export function privacyReply(who: HelpAudience): HelpReply {
  return {
    kind: 'privacy',
    text: who === 'institute'
      ? 'I can\'t look up or share anyone\'s personal details. You can see an applicant\'s profile, documents and contact details in Applicants once they have applied to your vacancy.'
      : 'I can\'t look up or share anyone\'s personal details, or see your own account. I can explain how to do things on AcadeXMatch. For something about your own account, email our team from your registered address.',
    links: who === 'institute' ? [{ label: 'Applicants', href: '/institute/ats' }] : [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` }],
  };
}

export function fallbackReply(who: HelpAudience): HelpReply {
  return {
    kind: 'fallback',
    text: `I'm not sure about that one. Try asking in a different way, pick a topic below, or email our team at ${SUPPORT_EMAIL}.`,
    links: [{ label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` }],
    suggestions: SUGGESTIONS[who],
  };
}

/** Article titles map back to questions when a suggestion button is pressed. */
export function articleByTitle(title: string): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.title === title);
}
