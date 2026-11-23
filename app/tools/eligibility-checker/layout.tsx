import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Am I Eligible? Assistant, Associate & Professor Eligibility Checker (UGC)',
  description: 'Check your eligibility for Assistant Professor, Associate Professor and Professor posts under the UGC Regulations 2018 and the 2023 NET/SET/SLET rule, then see matching vacancies.',
  alternates: { canonical: '/tools/eligibility-checker' },
  openGraph: { url: '/tools/eligibility-checker' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
