export type UserRole = 'candidate' | 'institute_admin' | 'super_admin' | 'recruiter';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  instituteId?: string;
  avatar?: string;
  createdAt: string;
  /** Candidate subscription plan. Missing means 'free'. */
  plan?: CandidatePlan;
  /** Last day (YYYY-MM-DD) of Premium access; open-ended when missing. */
  premiumUntil?: string;
  /** False until the user clicks the link in the verification email. Missing = verified (older accounts). */
  emailVerified?: boolean;
}

export type CandidatePlan = 'free' | 'premium';

export interface UpgradeRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedAt: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string;
}

export interface PlanSettings {
  premiumPriceLabel: string;
  premiumDurationMonths: number;
  upgradeInstructions: string;
  institutionPriceLabel: string;
  institutionDurationMonths: number;
  institutionInstructions: string;
  /** Amounts charged online through Razorpay, in rupees, inclusive of GST. */
  premiumPriceInr?: number;
  institutionPriceInr?: number;
  /** GST rate included in the prices (e.g. 18). Shown on invoices when a GSTIN is set. */
  gstPercent?: number;
  invoiceBusinessName?: string;
  invoiceAddress?: string;
  invoiceGstin?: string;
  /** Candidate Premium plan options. When missing, a single yearly plan from premiumPriceInr is used. */
  premiumPlans?: PremiumPlanOption[];
  /** Paid vacancy promotions for institutions. */
  featuredPriceInr?: number;
  featuredDays?: number;
  urgentPriceInr?: number;
  urgentDays?: number;
}

export type PaymentProduct = 'candidate_premium' | 'institution_premium' | 'featured_listing' | 'urgent_listing';

/** A candidate Premium plan option (monthly, yearly or the discounted research-scholar plan). */
export interface PremiumPlanOption {
  key: 'monthly' | 'yearly' | 'scholar';
  label: string;
  months: number;
  priceInr: number;
  enabled: boolean;
  /** Eligibility or other note shown under the plan. */
  note?: string;
}

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  product: PaymentProduct;
  instituteId?: string;
  instituteName?: string;
  /** Amount in rupees (GST inclusive). */
  amount: number;
  currency: 'INR';
  months: number;
  /** Candidate plan key (monthly / yearly / scholar). */
  plan?: PremiumPlanOption['key'];
  /** Vacancy promoted by a listing payment, and for how many days. */
  jobId?: string;
  jobTitle?: string;
  days?: number;
  status: 'created' | 'paid' | 'failed';
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  createdAt: string;
  paidAt?: string;
  invoiceNumber?: string;
  /** Plan end date after activation. */
  activeUntil?: string;
  testMode?: boolean;
  /** 'razorpay' (online checkout, the default) or 'offline' (bank transfer, UPI, cheque… recorded by the admin). */
  source?: 'razorpay' | 'offline';
  /** How the buyer paid, e.g. "upi", "card", "netbanking", "wallet", "bank_transfer". */
  method?: string;
  /** Readable detail of the method, e.g. "Visa card ····4242", "HDFC net banking", "UTR 1234". */
  methodDetail?: string;
  /** Razorpay charges for this payment (rupees), and the GST on those charges. */
  gatewayFee?: number;
  gatewayTax?: number;
  /** Why the payment failed (from Razorpay). */
  failureReason?: string;
  /** Money returned to the buyer. The payment stays 'paid'; these record the refunds. */
  refunds?: PaymentRefund[];
  refundedAmount?: number;
  /** Everything that happened to this payment, oldest first. */
  events?: PaymentEvent[];
}

export interface PaymentRefund {
  id: string;
  amount: number;
  at: string;
  status: 'processed' | 'pending' | 'failed';
  note?: string;
  /** Refund made outside Razorpay and recorded by the admin. */
  manual?: boolean;
}

export interface PaymentEvent {
  at: string;
  type: 'created' | 'paid' | 'failed' | 'refund' | 'access_ended' | 'note';
  note?: string;
}

export interface InstituteSubscription {
  status: 'pending' | 'active' | 'declined' | 'inactive';
  /** Last day (YYYY-MM-DD) of the paid period; open-ended when missing. */
  activeUntil?: string;
  requestedAt?: string;
  requestedBy?: string;
  note?: string;
  activatedAt?: string;
}

/** Stored account record. Password material never leaves StorageService. */
export interface UserAccount extends User {
  passwordHash: string;
  salt: string;
}

export type InstitutionType = 
  | 'IIT / NIT / IISc / IIIT (Institute of National Importance)'
  | 'Central University (Govt. of India)'
  | 'State Public University'
  | 'Deemed-to-be University'
  | 'Premier Private University'
  | 'Autonomous Engineering College';

export interface Institute {
  id: string;
  name: string;
  shortName: string;
  type: InstitutionType;
  location: {
    city: string;
    state: string;
    pincode: string;
    campusType: 'Urban' | 'Suburban' | 'Residential Mega Campus';
  };
  accreditation: {
    naacGrade: 'A++' | 'A+' | 'A' | 'B++' | 'Under Review';
    naacScore?: number;
    nirfRankOverall?: number;
    nirfRankUniversity?: number;
    nirfRankEngineering?: number;
    aicteApproved: boolean;
    ugc2f12bStatus: boolean;
    nbaAccreditedDepts: string[];
  };
  departments: string[];
  aisheCode: string;
  establishedYear: number;
  website: string;
  logo: string;
  bannerImage: string;
  verificationStatus: 'verified' | 'pending' | 'rejected';
  verifiedAt?: string;
  /** Institution Premium subscription. Institutions have no free plan. */
  subscription?: InstituteSubscription;
  /** Offer letter wording with {placeholders}; the default template is used when empty. */
  offerTemplate?: string;
  offerSignatory?: string;
  offerSignatoryTitle?: string;
  about: string;
  contactEmail: string;
  contactPhone: string;
  stats: {
    facultyCount: number;
    studentCount: number;
    patentsFiled: number;
    hIndexAverage: number;
  };
}

export type DesignationType =
  | 'Assistant Professor (Level 10 - 7th CPC)'
  | 'Assistant Professor (Level 11 - 7th CPC)'
  | 'Assistant Professor (Level 12 - 7th CPC)'
  | 'Associate Professor (Level 13A - 7th CPC)'
  | 'Professor (Level 14 - 7th CPC)'
  | 'Senior Professor (Level 15 - 7th CPC)'
  | 'Chair Professor / Eminent Scholar'
  | 'Postdoctoral Research Fellow'
  | 'Professor of Practice (Industry Track)'
  | 'Dean / Director / Head of School';

export type ReservationCategory =
  | 'Unreserved (UR / General)'
  | 'OBC - Non Creamy Layer'
  | 'Scheduled Caste (SC)'
  | 'Scheduled Tribe (ST)'
  | 'Economically Weaker Section (EWS)'
  | 'Persons with Benchmark Disabilities (PwD)'
  | 'Open to All Categories';

/**
 * A vacancy. Fields that may be unknown are nullable: vacancies collected by the web scraper
 * carry only values found on the source page, and null means "not stated in the source".
 */
export interface Job {
  id: string;
  instituteId: string;
  instituteName: string;
  instituteShortName: string;
  instituteLogo: string;
  instituteType: InstitutionType | null;
  title: string;
  designation: DesignationType | null;
  department: string | null;
  specializationTags: string[];
  advertisementNumber: string | null;
  location: {
    city: string | null;
    state: string | null;
  };
  payScale: {
    cpcBand: string | null; // e.g. "Level 10 (₹57,700 - ₹1,82,400)" or the exact text from the source
    entryPay: string | null; // e.g. "₹57,700"
    grossMonthlyEstimated: string | null; // e.g. "₹1,08,000/mo (with 50% DA + HRA)"
    consolidated?: boolean;
    allowances: string[];
  };
  requiredQualifications: {
    /** Minimum qualification; for scraped vacancies the exact text from the source. */
    minDegree: string | null;
    netSletMandatory: boolean | null;
    phdNorms: 'UGC 2009/2016 Compliant' | 'Any Recognized' | 'Not Required for Industry Track' | null;
    minExperienceYears: number | null;
    /** Exact experience requirement text from the source, when scraped. */
    experienceText?: string | null;
    minUgcCarePubs: number | null;
    ugcRegulationsYear: 'UGC 2018 Regulations' | 'AICTE 2019/2023 Gazette' | null;
    specializationRequirements: string[];
  };
  reservationCategory: ReservationCategory | null;
  applicationDeadline: string | null; // YYYY-MM-DD
  /** Exact deadline text from the source when it is not a plain date (e.g. "Rolling advertisement"). */
  deadlineText?: string | null;
  status: 'published' | 'closed' | 'draft' | 'under_review';
  /** Paid promotion: shown first with a "Featured" label until this date (YYYY-MM-DD). */
  featuredUntil?: string | null;
  /** Paid promotion: "Urgent hiring" label until this date (YYYY-MM-DD). */
  urgentUntil?: string | null;
  isClaimedByInstitute: boolean;
  screeningQuestions: string[];
  selectionProcess: string[];
  description: string | null;
  responsibilities: string[];
  benefits: string[];
  postedAt: string;
  applicantCount: number;
  featured?: boolean;
  /** Only Premium candidates can apply to this vacancy. */
  isPremium?: boolean;
  /** The institution's own application page, used by Free candidates. */
  externalApplyUrl?: string;
  /** Present on vacancies collected by the web scraper. */
  source?: {
    url: string;
    pageTitle?: string | null;
    extractedAt: string;
    /** Text of the listing as found on the page, for checking. */
    rawText?: string | null;
    numberOfPosts?: string | null;
    salaryText?: string | null;
    /** Some details were read from a PDF notice. */
    fromPdf?: boolean;
    /** Why details could not be read from the PDF notice (scanned, too large, several posts...). */
    pdfNote?: string | null;
    /** 'aggregator' when the page is a third-party listing site rather than the institution's own website. */
    kind?: 'institution' | 'aggregator';
    siteName?: string | null;
  };
  /** Full advertisement details (all optional). Filled by the crawler or by the institution's post form. */
  details?: JobDetails;
  /** Set when the vacancy was closed automatically after its last date. */
  autoClosedAt?: string;
}

/** A heading with the items listed under it, e.g. "Academic Posts" → Director, Professor… */
export interface JobListGroup {
  group: string | null;
  items: string[];
}

/** One requirement line for one post, e.g. { post: 'Director', text: 'Ph.D.' }. post is null for general lines. */
export interface PostRequirement {
  post: string | null;
  text: string;
}

export type ApplyMode = 'online' | 'email' | 'offline' | 'walk-in' | 'post';

/**
 * Every detail an academic recruitment advertisement can state. Each field is optional and holds only what the
 * advertisement (or the institution) actually states — nothing is filled in from defaults.
 */
export interface JobDetails {
  /** Introductory summary of the advertisement. */
  summary?: string | null;
  hiringOrganization?: string | null;
  /** Posts advertised, grouped (Academic / Non-teaching / Medical …). */
  postGroups?: JobListGroup[];
  /** Departments, disciplines or specialisations, grouped by post or school. */
  departmentGroups?: JobListGroup[];
  numberOfPosts?: string | null;
  qualifications?: PostRequirement[];
  preferredQualifications?: PostRequirement[];
  experience?: PostRequirement[];
  candidateProfile?: string[];
  responsibilities?: string[];
  salaryText?: string | null;
  employmentType?: string | null;
  locationText?: string | null;
  ageLimit?: string | null;
  applicationFee?: string | null;
  reservation?: string | null;
  selectionProcess?: string[];
  /** Dates as stated, e.g. { label: 'Last Date to Apply', value: 'Within 7 days from the date of this advertisement' }. */
  importantDates?: { label: string; value: string }[];
  notificationDate?: string | null;
  lastDateText?: string | null;
  interviewText?: string | null;
  /** True when applicationDeadline was worked out from text such as "within 7 days" (approximate). */
  deadlineEstimated?: boolean;
  applyModes?: ApplyMode[];
  howToApply?: string | null;
  applicationProcedure?: string[];
  applyEmails?: { email: string; note?: string | null }[];
  contactPhones?: string[];
  applicationLink?: string | null;
  officialWebsite?: string | null;
  notificationLink?: string | null;
  documentsRequired?: string[];
  organizationAddress?: string | null;
  benefits?: string[];
}

export interface EducationItem {
  id: string;
  degree: string;
  field: string;
  institute: string;
  year: number;
  gradePercentage: string;
  distinctionOrRank?: string;
}

export interface ExperienceItem {
  id: string;
  designation: string;
  instituteOrCompany: string;
  department: string;
  startDate: string;
  endDate: string | 'Present';
  isCurrent: boolean;
  type: 'Teaching' | 'Research / Postdoc' | 'Industry / R&D';
  keyAccomplishments?: string;
}

export interface PublicationItem {
  id: string;
  title: string;
  journalOrConference: string;
  year: number;
  doi?: string;
  ugcCareListed: boolean;
  scopusIndexed: boolean;
  sciScieIndexed: boolean;
  impactFactor?: number;
  authors: string;
  citationsCount?: number;
  type: 'Journal' | 'Conference' | 'Book Chapter' | 'Patent';
}

export interface CandidateProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  location: {
    city: string;
    state: string;
  };
  currentDesignation: string;
  currentInstitute: string;
  highestDegree: string;
  netSletStatus: {
    isQualified: boolean;
    examType?: 'UGC-NET (JRF)' | 'UGC-NET (LS)' | 'CSIR-NET (JRF)' | 'CSIR-NET (LS)' | 'SLET/SET' | 'GATE';
    qualifiedYear?: number;
    subject?: string;
    rollNumber?: string;
  };
  phdStatus: {
    isCompleted: boolean;
    institute?: string;
    thesisTitle?: string;
    graduationYear?: number;
    isUgc2009_2016Compliant: boolean;
    supervisorName?: string;
  };
  education: EducationItem[];
  experience: ExperienceItem[];
  publications: PublicationItem[];
  researchInterests: string[];
  skills: string[];
  scholarLinks: {
    googleScholar?: string;
    orcid?: string;
    scopusId?: string;
    researchGate?: string;
  };
  apiScore: number; // Academic Performance Index calculated as per UGC criteria
  profileCompleteness: number; // 0-100 percentage
  resumeFileName?: string;
  resumeParsedAt?: string;
  avatar?: string;
  bio?: string;
  teachingPhilosophy?: string;
  awardLevel?: 'none' | 'state' | 'national';
  aiMatchingConsent?: boolean;
  /** Premium candidates can let subscribed institutions find them in talent search. */
  discoverable?: boolean;
  /** Set by the platform administrator after checking the uploaded proofs. */
  documentsVerified?: { at: string; by: string; note?: string } | null;
}

export type ApplicationStage =
  | 'applied'
  | 'screening'
  | 'eligible'
  | 'shortlisted'
  | 'interview_scheduled'
  | 'committee_review'
  | 'offer'
  | 'joined'
  | 'rejected';

export interface ReviewerScoreItem {
  reviewerId: string;
  reviewerName: string;
  reviewerRole: 'Dean (Academic)' | 'Head of Department' | 'External Subject Expert 1' | 'External Subject Expert 2' | 'Vice Chancellor Nominee';
  researchPotentialScore: number; // out of 30
  teachingPedagogyScore: number;  // out of 25
  apiScoreValidation: number;     // out of 20
  interviewPerformance: number;   // out of 25
  totalScore: number;             // out of 100
  recommendation: 'Strongly Recommend' | 'Recommend' | 'Reserve / Waitlist' | 'Not Recommended';
  confidentialNotes: string;
  submittedAt: string;
}

export interface MatchBreakdown {
  overallScore: number; // 0-100%
  qualificationMatch: number; // 0-100%
  researchSynergy: number; // 0-100%
  ugcCarePubsFit: number; // 0-100%
  experienceMatch: number; // 0-100%
  meetsMandatoryNetPhd: boolean;
  positiveSignals: string[];
  potentialGaps: string[];
}

export interface StageHistoryItem {
  stage: ApplicationStage;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface InterviewSlot {
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:30 AM IST"
  platform: 'Google Meet' | 'Microsoft Teams' | 'Zoom' | 'In-Person (Campus Selection Board Room)';
  meetingLink?: string;
  roomVenue?: string;
  committeeMembers: string[];
  instructions: string;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  jobTitle: string;
  department: string;
  instituteId: string;
  instituteName: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateLocation: string;
  currentDesignation: string;
  highestDegree: string;
  matchScore: number;
  matchBreakdown: MatchBreakdown;
  status: ApplicationStage;
  stageHistory: StageHistoryItem[];
  reviewerScores: ReviewerScoreItem[];
  interviewSlot?: InterviewSlot;
  appliedDate: string;
  screeningAnswers?: { question: string; answer: string }[];
  offerDetails?: {
    designation: string;
    grossPay: string;
    joiningDate: string;
    offerLetterGenerated: boolean;
    /** Extra fields for the generated offer letter. */
    reportTo?: string;
    acceptBy?: string;
    letterNumber?: string;
    issuedAt?: string;
    signatory?: string;
    signatoryTitle?: string;
    response?: 'accepted' | 'declined';
    respondedAt?: string;
  };
  /** Set when the institution invites this applicant to pick an interview slot. */
  slotInvite?: { invitedAt: string; invitedBy: string; message?: string };
  /** The interview slot this applicant booked (see InterviewSlotOffer). */
  bookedSlotId?: string;
}

/** A time an institution offers for interviews; one applicant per slot. */
export interface InterviewSlotOffer {
  id: string;
  instituteId: string;
  jobId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24 h, IST)
  durationMin: number;
  platform: InterviewSlot['platform'];
  meetingLink?: string;
  roomVenue?: string;
  committeeMembers: string[];
  instructions: string;
  createdAt: string;
  /** Application that booked this slot; hidden from other candidates. */
  bookedByAppId?: string | null;
  booked?: boolean;
}

/** An institution's invitation to a discoverable candidate to apply for a vacancy. */
export interface TalentInvite {
  id: string;
  instituteId: string;
  instituteName: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  /** Kept for the institution's own list. */
  candidateName: string;
  message: string;
  sentBy: string;
  sentAt: string;
  status: 'sent' | 'interested' | 'declined' | 'applied';
  respondedAt?: string;
}

/** A notice the platform administrator publishes on the site (and optionally emails). */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'everyone' | 'candidates' | 'premium' | 'free' | 'institutions';
  link?: string;
  createdAt: string;
  createdBy: string;
  expiresAt?: string | null;
  emailed?: number;
  active: boolean;
}

export interface DPDPDataRequest {
  id: string;
  userId?: string;
  userEmail: string;
  userName: string;
  requestType: 'Right to Erasure (Delete all Academic CV & Personal Data)' | 'Data Portability Export (JSON/PDF)' | 'Revoke AI Matching Processing Consent';
  status: 'Pending' | 'Under Review' | 'Completed' | 'Rejected';
  requestedAt: string;
  completedAt?: string;
  reason?: string;
  dpoActionNotes?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: UserRole;
  action: string;
  target: string;
  ipAddress?: string;
  complianceCategory: 
    | 'DPDP_CONSENT' 
    | 'INSTITUTE_VERIFICATION' 
    | 'SELECTION_COMMITTEE' 
    | 'PII_ACCESS'
    | 'AUTHENTICATION'
    | 'JOB_MODERATION'
    | 'COMMITTEE_SCORING'
    | 'INTERVIEW_COLLOQUIUM';
}

/** Filters used on the vacancy search page and saved in job alerts. */
export interface JobSearchFilters {
  search: string;
  state: string;
  designation: string;
  instituteType: string;
  reservationCategory: string;
  netSletOnly: boolean;
  phdOnly: boolean;
}

export type AlertFrequency = 'daily' | 'weekly';

/** A saved search that emails new matching vacancies to the candidate. */
export interface JobAlert {
  id: string;
  userId: string;
  name: string;
  filters: JobSearchFilters;
  frequency: AlertFrequency;
  active: boolean;
  createdAt: string;
  /** When the last email with new vacancies was sent (set by the server). */
  lastSentAt?: string;
  /** How many vacancies the last email listed. */
  lastSentCount?: number;
}

export type TrackedStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

/** A vacancy the candidate follows: saved for its deadline, or applied to outside AcadeXMatch. */
export interface TrackedJob {
  id: string;
  userId: string;
  /** Set when the vacancy is listed on AcadeXMatch. */
  jobId?: string;
  title: string;
  institute: string;
  /** YYYY-MM-DD, or empty when not known. */
  deadline: string;
  url?: string;
  status: TrackedStatus;
  appliedOn?: string;
  /** Reference / application number from the institution's portal. */
  reference?: string;
  notes?: string;
  addedAt: string;
  updatedAt?: string;
}

/** A partner offer shown to candidates (coaching, FDP providers and similar). */
export interface Partner {
  id: string;
  name: string;
  url: string;
  category: 'NET / SET coaching' | 'Faculty development' | 'Research services' | 'Other';
  description: string;
  offer?: string;
  active: boolean;
  createdAt: string;
}
