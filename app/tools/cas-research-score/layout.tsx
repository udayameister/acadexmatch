import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CAS Research Score Calculator — UGC 2018 Table 2 (Associate Professor, Professor)',
  description: 'Calculate your academic/research score under UGC Regulations 2018 Appendix II Table 2 for CAS promotion and direct recruitment: papers by impact factor, books, MOOCs, Ph.D. guidance, projects, patents and invited talks.',
  alternates: { canonical: '/tools/cas-research-score' },
  openGraph: { url: '/tools/cas-research-score' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
