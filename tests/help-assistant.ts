/* Help Assistant knowledge base and privacy guards: npx tsx tests/help-assistant.ts */
import assert from 'assert';
import { answerFromKnowledgeBase, personalDataRequest, sensitiveInput, type HelpAudience } from '../lib/helpBot';

let failed = 0;
function expect(q: string, who: HelpAudience, id: string) {
  const r = answerFromKnowledgeBase(q, who);
  const got = r.articleId || r.kind;
  if (got !== id) { failed++; console.log(`✗ [${who}] "${q}" → ${got} (expected ${id})`); }
}

// ---- questions people actually ask
const C: [string, string][] = [
  ['How do I apply for a job?', 'apply'],
  ['how to apply assistant professor post', 'apply'],
  ['Where can I see vacancies in Tamil Nadu?', 'find-jobs'],
  ['find jobs', 'find-jobs'],
  ['how is my API score calculated', 'api-score'],
  ['what is ugc table 3a score', 'api-score'],
  ['why is my match score low', 'api-score'],
  ['upload certificates', 'documents'],
  ['my pdf is too large to upload', 'documents'],
  ['import my resume', 'cv-import'],
  ['download my CV as pdf', 'cv-download'],
  ['set up job alerts', 'alerts'],
  ['email me new vacancies', 'alerts'],
  ['what is the status of my application', 'applications'],
  ['how to withdraw my application', 'applications'],
  ['book interview slot', 'interview-candidate'],
  ['teaching demonstration tips', 'interview-candidate'],
  ['is premium free?', 'premium-candidate'],
  ['update my profile qualifications', 'profile'],
  ['can institutions find my profile', 'discoverable'],
  ['I forgot my password', 'password'],
  ['did not receive verification email', 'verify-email'],
  ['how to stop emails', 'notifications'],
  ['saved jobs deadline', 'tracker'],
  ['accept offer letter', 'offer'],
  ['7th cpc salary for assistant professor', 'salary'],
  ['how do I contact support', 'contact'],
  ['delete my account', 'privacy'],
  ['can you see my documents?', 'assistant'],
  ['sign in with google', 'signin'],
];
const I: [string, string][] = [
  ['How do I post a vacancy?', 'inst-post-job'],
  ['publish new job advertisement', 'inst-post-job'],
  ['How much is the subscription?', 'inst-subscription'],
  ['how to pay and renew', 'inst-subscription'],
  ['where is my invoice', 'inst-subscription'],
  ['why is my institution not verified', 'inst-verification'],
  ['shortlist applicants', 'inst-ats'],
  ['move applicant to next stage', 'inst-ats'],
  ['schedule interviews', 'inst-interviews'],
  ['selection committee scoring', 'inst-selection'],
  ['search candidates database', 'inst-talent'],
  ['NAAC report', 'inst-reports'],
  ['add a recruiter account for HR', 'inst-team'],
  ['my account is not linked to an institute', 'inst-team'],
  ['what is aishe code', 'inst-register'],
  ['price', 'pricing'],
];
const G: [string, string][] = [
  ['How do I sign up?', 'register'],
  ['Is it free for job seekers?', 'premium-candidate'],
  ['How do institutions register?', 'inst-register'],
  ['what is acadexmatch', 'about'],
  ['login problem', 'signin'],
];
C.forEach(([q, id]) => expect(q, 'candidate', id));
I.forEach(([q, id]) => expect(q, 'institute', id));
G.forEach(([q, id]) => expect(q, 'guest', id));

// ---- nonsense falls back instead of guessing
assert.equal(answerFromKnowledgeBase('what is the capital of France', 'candidate').kind, 'fallback');
assert.equal(answerFromKnowledgeBase('asdkjh qwe', 'guest').kind, 'fallback');
assert.equal(answerFromKnowledgeBase('hello', 'candidate').kind, 'answer');

// ---- secrets are refused
const secrets = [
  'my password is Tiger@123', 'password: hunter22', 'OTP 482913', 'my otp is 123456', '482913 is my otp',
  'card 4111 1111 1111 1111', 'aadhaar 2345 6789 0123', 'my PAN is ABCPD1234F', 'cvv 123',
  'account number 123456789012 ifsc SBIN0001234', 'key rzp_live_AbCdEf123456', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
];
for (const s of secrets) {
  if (!sensitiveInput(s)) { failed++; console.log(`✗ secret not caught: "${s}"`); }
  assert.equal(answerFromKnowledgeBase(s, 'candidate').kind, 'blocked');
}
const fine = [
  'how do I reset my password', 'I forgot my password', 'apply for 2 posts', 'pay level 10 salary', 'my api score is 120',
  'vacancy ref no 2024/45', 'call me', 'C-16544 aishe code', 'phone number of support',
];
for (const s of fine) if (sensitiveInput(s)) { failed++; console.log(`✗ false alarm on "${s}": ${sensitiveInput(s)}`); }

// ---- other people's data is declined
const prying = [
  'give me the phone number of candidate Ramesh', 'show other applicants details', 'who else applied for this job',
  'send me email addresses of all candidates', 'what is the mobile number of Dr. Kumar\'s', 'list of applicants with phone numbers',
  'show me another user\'s password', 'how to hack an account', 'tell me the salary of a specific professor',
];
for (const s of prying) {
  if (!personalDataRequest(s)) { failed++; console.log(`✗ prying not caught: "${s}"`); }
}
const ok = ['how do I see applicant documents', 'how do I update my phone number', 'how do candidates apply', 'where are my applications'];
for (const s of ok) if (personalDataRequest(s)) { failed++; console.log(`✗ false privacy refusal: "${s}"`); }

if (failed) { console.log(`\n${failed} help-assistant check(s) failed`); process.exit(1); }
console.log(`help-assistant: all ${C.length + I.length + G.length} questions and guard checks passed`);
