import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using AcadeXMatch, the academic recruitment platform for Indian higher education.',
  alternates: { canonical: '/terms' },
  openGraph: { url: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="28 October 2026">
      <p>These terms apply to everyone who uses acadexmatch.com (“AcadeXMatch”, “we”). By creating an account or using the site you agree to them. Please also read our <Link href="/privacy">Privacy Policy</Link>.</p>

      <h2>1. What AcadeXMatch does</h2>
      <p>AcadeXMatch lists academic vacancies, helps candidates build academic profiles and apply, and gives institutions tools to publish vacancies and run selections. Some vacancies are collected from public advertisements; the recruiting institution alone decides eligibility, selection, pay and appointment. Always confirm the details with the institution before applying.</p>

      <h2>2. Accounts</h2>
      <ul>
        <li>Give accurate information and keep your sign-in details secret. You are responsible for activity on your account.</li>
        <li>Candidate accounts are for individuals. Institution accounts may be used only by authorised staff of that institution.</li>
        <li>You may sign in with a password, an SMS code sent to your confirmed mobile number, or Google / Microsoft where offered. We never ask for your password by email, SMS or phone.</li>
        <li>Tell us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you think someone else has used your account.</li>
      </ul>

      <h2>3. Plans and payments</h2>
      <p>Candidate Premium features are free for every candidate. Institutions and recruiters pay for their plan as shown on the <Link href="/premium">Plans</Link> page. Online payments are processed by Razorpay; refunds are handled as described there or as agreed with us in writing.</p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not post false vacancies, false qualifications, other people’s documents or anything unlawful.</li>
        <li>Do not scrape, overload or try to break into the site, or use it to send spam.</li>
        <li>Institutions may use candidates’ data only to recruit for the vacancy the candidate applied to or was invited to.</li>
      </ul>
      <p>We may suspend accounts or remove content that breaks these terms.</p>

      <h2>5. Content</h2>
      <p>You keep the rights to what you upload and allow us to store and show it for the purposes above. Match scores and academic (API) scores are estimates to help you; they are not a decision by any institution or regulator.</p>

      <h2>6. Liability</h2>
      <p>We work to keep the site accurate and available but cannot guarantee that every vacancy, date or rule is correct or that the site is always available. To the extent the law allows, we are not liable for losses from relying on listings or from decisions made by institutions.</p>

      <h2>7. Changes and contact</h2>
      <p>We may update these terms; the date above shows the latest version, and we will tell account holders about important changes. These terms are governed by the laws of India. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
