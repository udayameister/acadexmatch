import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How AcadeXMatch collects, uses and protects personal data, and your rights under the Digital Personal Data Protection Act, 2023.',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="28 October 2026">
      <p>This policy explains what personal data AcadeXMatch collects, why, and the choices you have. It follows the principles of the Digital Personal Data Protection Act, 2023 (DPDP Act).</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong>: name, email address, mobile number, role, and for institution staff the institution you work for.</li>
        <li><strong>Sign-in data</strong>: a salted hash of your password (never the password itself); if you use Google or Microsoft, their account id and the email they share (never your Google or Microsoft password); the browser type and network address of sign-ins, used for security alerts.</li>
        <li><strong>Profile and applications</strong>: the qualifications, experience, publications, documents and answers you add, and the applications you make.</li>
        <li><strong>Payments</strong>: payment records from Razorpay (we do not receive or store card numbers).</li>
        <li><strong>Messages</strong>: a record of the emails and SMS codes we send you (without the codes or links themselves).</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account, keep it secure and let you sign in and recover it.</li>
        <li>To match candidates with vacancies and to share your application with the institution you apply to.</li>
        <li>To send the emails you need (confirmations, application and interview updates) and the alerts you choose. News and offers are sent only if you opt in.</li>
        <li>To meet legal obligations and to prevent fraud and abuse.</li>
      </ul>

      <h2>Who receives it</h2>
      <ul>
        <li>The institution you apply to (and its selection committee) sees your application and profile. If you switch on talent search, verified institutions can find your profile.</li>
        <li>Service providers who process data for us: our hosting provider (GoDaddy), our email delivery provider, our SMS provider, Razorpay for payments, and Google or Microsoft if you choose to sign in with them.</li>
        <li>We do not sell personal data.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Change which emails you receive on your <Link href="/account/notifications">notification settings</Link> page. Every optional email has an unsubscribe link. Security emails (for example password changes) are always sent.</li>
        <li>Access, correct or erase your data, or withdraw consent, from your account or by writing to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You may also complain to the Data Protection Board of India.</li>
      </ul>

      <h2>Security and retention</h2>
      <p>Data is sent over HTTPS and stored in a managed database. Passwords, one-time codes and reset links are stored only as one-way hashes. We keep account data while your account exists and delete or anonymise it when you ask us to erase it, except where the law requires us to keep records (for example invoices).</p>

      <h2>Cookies</h2>
      <p>We use one essential cookie to keep you signed in, and a short-lived cookie during Google or Microsoft sign-in. Analytics cookies are used only if analytics is switched on for the site.</p>

      <h2>Contact</h2>
      <p>Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
