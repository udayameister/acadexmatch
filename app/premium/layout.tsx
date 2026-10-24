import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plans & Pricing for Candidates and Institutions',
  description: 'AcadeXMatch plans: free job search for candidates, Premium for one-click applications and match scores, and Institution Premium for end-to-end faculty recruitment.',
  alternates: { canonical: '/premium' },
  openGraph: { url: '/premium' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
